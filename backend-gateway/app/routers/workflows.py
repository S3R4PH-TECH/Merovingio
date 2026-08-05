"""
Workflow registration and trigger.

Verified against real n8n behavior while building this PoC (see
ARCHITECTURE_AND_ROADMAP.md, section 5, A.2): n8n's versioned REST API
(`X-N8N-API-KEY`) has no documented "execute this workflow with this
payload" endpoint — only the production Webhook URL of an *active* workflow
accepts a triggering payload. So `production_webhook_url` here is exactly
that: a workflow must be built with a Webhook trigger node and activated in
n8n first (out of band — via the n8n CLI/editor), and its production
webhook URL is what gets registered via POST /workflows.
"""
from __future__ import annotations

from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.audit import record as audit_record
from app.auth import get_current_user
from app.db import get_db
from app.http_client import get_http_client
from app.models import Run, Target, User, WorkflowDefinition
from app.rbac import require_program_access, require_workspace_member
from app.schema import RunAccepted, RunResponse, RunTriggerRequest, WorkflowCreate, WorkflowResponse

router = APIRouter(tags=["workflows"])


@router.post("/workspaces/{workspace_id}/workflows", response_model=WorkflowResponse, status_code=201)
async def create_workflow(
    workspace_id: UUID,
    payload: WorkflowCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorkflowDefinition:
    membership = await require_workspace_member(db, current_user.id, workspace_id)
    if membership.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="insufficient_workspace_role")

    workflow = WorkflowDefinition(
        workspace_id=workspace_id,
        name=payload.name,
        git_path=payload.git_path,
        current_version=payload.current_version,
        production_webhook_url=payload.production_webhook_url,
    )
    db.add(workflow)
    await db.flush()

    await audit_record(
        db,
        actor_user_id=current_user.id,
        action="workflow.create",
        resource_type="workflow_definition",
        resource_id=workflow.id,
        workspace_id=workspace_id,
        payload={"name": workflow.name, "production_webhook_url": workflow.production_webhook_url},
    )
    await db.commit()
    await db.refresh(workflow)
    return workflow


@router.post("/workflows/{workflow_id}/run", response_model=RunAccepted, status_code=202)
async def trigger_run(
    workflow_id: UUID,
    payload: RunTriggerRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    http_client: httpx.AsyncClient = Depends(get_http_client),
) -> RunAccepted:
    wf_result = await db.execute(select(WorkflowDefinition).where(WorkflowDefinition.id == workflow_id))
    workflow = wf_result.scalar_one_or_none()
    if workflow is None:
        raise HTTPException(status_code=404, detail="workflow_not_found")

    target_result = await db.execute(
        select(Target).where(Target.id == payload.target_id, Target.deleted_at.is_(None))
    )
    target = target_result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="target_not_found")

    # Program access, not just "workflow exists" — a workflow belongs to a
    # Workspace, but a Run always happens against a specific Program's
    # Target (roadmap section 5, A.4: Program is the real tenancy boundary).
    await require_program_access(db, current_user.id, target.program_id, min_role="operator")

    run = Run(
        workflow_definition_id=workflow.id,
        target_id=target.id,
        program_id=target.program_id,
        triggered_by=current_user.id,
        status="queued",
        params=payload.params,
    )
    db.add(run)
    await db.flush()
    await db.commit()
    await db.refresh(run)

    if workflow.production_webhook_url:
        # 202 must not block on the workflow's real duration (recon scans
        # can take minutes) — fire the trigger and return immediately.
        # n8n's own webhook call returns fast regardless; the workflow
        # reports back to us asynchronously via /internal/*.
        try:
            await http_client.post(
                workflow.production_webhook_url,
                json={"run_id": str(run.id), "target_id": str(target.id), "params": payload.params},
            )
        except httpx.HTTPError as exc:
            run.status = "failed"
            await db.commit()
            raise HTTPException(status_code=502, detail=f"failed_to_trigger_workflow: {exc}") from exc

    return RunAccepted(run_id=run.id, status=run.status)


@router.get("/runs/{run_id}", response_model=RunResponse)
async def get_run(
    run_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Run:
    result = await db.execute(
        select(Run)
        .where(Run.id == run_id)
        .options(selectinload(Run.tool_execution_jobs), selectinload(Run.assets))
    )
    run = result.scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail="run_not_found")

    await require_program_access(db, current_user.id, run.program_id)
    return run
