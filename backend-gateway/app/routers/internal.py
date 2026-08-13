"""
/internal/* — called by n8n workflow nodes only, never by end users.

Implements the flow ARCHITECTURE_AND_ROADMAP.md section 5 (A.2, A.3, A.5)
specifies:
  1. First node of every workflow: POST /internal/execution-started, so we
     can pair n8n's execution_id with our own run_id (n8n's webhook
     response doesn't reliably carry it).
  2. Before calling a tool: POST /internal/tes-lease — resolves the logical
     tool_name to a real TES address + token via tes_registry (the
     Gateway is the source of truth here, not the workflow definition, so
     rotating/redeploying a TES never requires a workflow-JSON change).
  3. After a tool finishes: POST /internal/tes-callback — persists the
     result (Postgres is written before touching n8n, so a crash right
     after resuming the workflow never loses data already reported).
  4. Last node of the workflow (and its Error Workflow, for the unhappy
     path): POST /internal/n8n-callback — reconciles Run status against
     whatever ToolExecutionJobs actually completed.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import httpx
from app.db import get_db
from app.http_client import get_http_client
from app.internal_auth import require_internal_token
from app.models import Asset, Run, Target, TesRegistry, ToolExecutionJob, WorkflowDefinition
from app.schema import (
    ExecutionStartedRequest,
    N8nCallbackRequest,
    TesLeaseRequest,
    TesLeaseResponse,
    ToolExecutionEnvelope,
)
from app.scope import allowed_domains_snapshot, value_in_target_scope

router = APIRouter(prefix="/internal", tags=["internal"], dependencies=[Depends(require_internal_token)])


async def _load_run_or_404(db: AsyncSession, run_id) -> Run:
    result = await db.execute(select(Run).where(Run.id == run_id))
    run = result.scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail="run_not_found")
    return run


@router.post("/execution-started")
async def execution_started(payload: ExecutionStartedRequest, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(select(Run).where(Run.id == payload.run_id))
    run = result.scalar_one_or_none()
    if run is None:
        # Create run dynamically if triggered directly via Webhook or direct trigger
        wf_res = await db.execute(select(WorkflowDefinition).limit(1))
        wf = wf_res.scalar_one_or_none()
        target_res = await db.execute(select(Target).limit(1))
        tgt = target_res.scalar_one_or_none()

        if wf and tgt:
            run = Run(
                id=payload.run_id,
                workflow_definition_id=wf.id,
                target_id=tgt.id,
                program_id=tgt.program_id,
                triggered_by=tgt.created_by,
                n8n_execution_id=payload.execution_id,
                status="running",
                params={"workflow": wf.name, "target_name": tgt.name},
            )
            db.add(run)
    else:
        run.n8n_execution_id = payload.execution_id
        run.status = "running"

    await db.commit()
    return {}


@router.post("/tes-lease", response_model=TesLeaseResponse)
async def tes_lease(payload: TesLeaseRequest, db: AsyncSession = Depends(get_db)) -> TesLeaseResponse:
    run = await _load_run_or_404(db, payload.run_id)

    registry_result = await db.execute(select(TesRegistry).where(TesRegistry.tool_name == payload.tool_name))
    registry_entry = registry_result.scalar_one_or_none()
    if registry_entry is None:
        raise HTTPException(status_code=404, detail="tool_not_registered")

    target_result = await db.execute(
        select(Target).where(Target.id == run.target_id, Target.deleted_at.is_(None))
    )
    target = target_result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="target_not_found")

    # Fail closed on an unscoped Target. The platform ships no default scope
    # and no scope file by design — the operating team's governance is the
    # only source, so "no scope configured" is a misconfiguration to surface
    # loudly, never something to paper over with a fallback allow-list.
    if not target.root_domains and not target.cidrs:
        raise HTTPException(status_code=422, detail="scope_not_configured")

    # Defense in depth: the TES runs its own scope check against the
    # allowed_domains we hand it, but the Gateway must not issue a lease for a
    # value it can already tell is out of scope (ARCHITECTURE_AND_ROADMAP.md,
    # section 5, A.3). out_of_scope vetoes are applied here too, which a bare
    # allowed_domains list cannot express on its own.
    if payload.target_value is not None and not value_in_target_scope(target, payload.target_value):
        raise HTTPException(status_code=403, detail="domain_out_of_scope")

    job = ToolExecutionJob(
        run_id=run.id,
        tool_name=payload.tool_name,
        tes_base_url=registry_entry.base_url,
        status="leased",
        resume_url=payload.resume_url,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    return TesLeaseResponse(
        tool_execution_job_id=job.id,
        tes_base_url=registry_entry.base_url,
        internal_token=registry_entry.static_token,
        # Subset of scope relevant to this one Target, never the whole
        # platform's scope — see roadmap section 5, A.3.
        allowed_domains=allowed_domains_snapshot([target]),
    )


@router.post("/tes-callback")
async def tes_callback(
    payload: ToolExecutionEnvelope,
    db: AsyncSession = Depends(get_db),
    http_client: httpx.AsyncClient = Depends(get_http_client),
) -> dict:
    job_result = await db.execute(
        select(ToolExecutionJob).where(ToolExecutionJob.id == payload.tool_execution_job_id)
    )
    job = job_result.scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=404, detail="tool_execution_job_not_found")

    run = await _load_run_or_404(db, payload.run_id)

    job.status = payload.status
    job.finished_at = datetime.now(timezone.utc)
    job.error = payload.error

    # Normalization already happened in the TES's own adapter (roadmap
    # section 5, A.3: "normalização continua no adapter de cada TES") — the
    # Gateway only upserts what it's handed, never parses tool-specific
    # raw_output itself.
    indexer_url = os.getenv("DATA_INDEXER_URL", "http://data-indexer:8000")
    # data-indexer authenticates the same way every other internal hop does
    # (shared header secret). Sent unconditionally: if it is unset the indexer
    # rejects the call, which is the correct outcome — indexing is best-effort
    # here, but it should fail loudly-in-the-log rather than run unauthenticated.
    indexer_headers = {"X-Internal-Token": os.getenv("DATA_INDEXER_TOKEN", "")}
    for raw_asset in payload.assets:
        asset_obj = Asset(
            program_id=run.program_id,
            target_id=run.target_id,
            run_id=run.id,
            type=raw_asset.get("type", "unknown"),
            value=raw_asset["value"],
            source_tool=job.tool_name,
            asset_metadata=raw_asset.get("metadata", {}),
        )
        db.add(asset_obj)
        await db.flush()

        try:
            await http_client.post(
                f"{indexer_url}/index/asset",
                json={
                    "id": str(asset_obj.id),
                    "program_id": str(run.program_id),
                    "target_id": str(run.target_id),
                    "run_id": str(run.id),
                    "type": asset_obj.type,
                    "value": asset_obj.value,
                    "source_tool": asset_obj.source_tool,
                    "asset_metadata": asset_obj.asset_metadata,
                },
                headers=indexer_headers,
                timeout=3.0,
            )
        except Exception:
            pass

    await db.commit()

    # Trigger n8n Wait node resume if a resume_url was provided
    resume_target_url = payload.resume_url or job.resume_url
    if resume_target_url:
        try:
            await http_client.post(
                resume_target_url,
                json={
                    "tool_execution_job_id": str(job.id),
                    "run_id": str(run.id),
                    "status": payload.status,
                },
                timeout=10.0,
            )
        except Exception:
            # Resume call failure shouldn't rollback DB persistence
            pass

    return {}



@router.post("/n8n-callback")
async def n8n_callback(payload: N8nCallbackRequest, db: AsyncSession = Depends(get_db)) -> dict:
    run = await _load_run_or_404(db, payload.run_id)

    jobs_result = await db.execute(select(ToolExecutionJob).where(ToolExecutionJob.run_id == run.id))
    jobs = jobs_result.scalars().all()
    non_terminal = [j for j in jobs if j.status not in ("done", "error")]

    # Last chance to pair our Run with n8n's execution. Normally
    # /internal/execution-started does it, but when that first node is missing
    # or never ran, this callback carries the only execution_id we will ever
    # see — and without it nobody can find the execution in the n8n editor.
    if payload.execution_id and not run.n8n_execution_id:
        run.n8n_execution_id = payload.execution_id

    if payload.failed:
        run.status = "failed"
        run.error = payload.error
        run.error_node = payload.error_node
    elif non_terminal:
        # n8n reported success but some ToolExecutionJob never called back —
        # exactly the "callback perdido" case the roadmap flags (section
        # 10): surface it instead of silently marking the Run green.
        run.status = "completed_with_warnings"
        run.error = None
        run.error_node = None
    else:
        run.status = "success"
        # A retried execution that now succeeds must not keep showing the
        # previous attempt's error on the debug screen.
        run.error = None
        run.error_node = None

    run.finished_at = datetime.now(timezone.utc)
    await db.commit()
    return {}
