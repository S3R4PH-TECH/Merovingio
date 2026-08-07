"""
Outputs router — Host-based results visualization and download (.txt and .zip).

Allows operators to:
1. List tested hosts for a given execution run (GET /runs/{run_id}/hosts)
2. View/download individual text output for a specific host (GET /runs/{run_id}/hosts/{host_name}/text)
3. Download a consolidated ZIP archive containing all host text outputs (GET /runs/{run_id}/download-zip)

Enforces program access control (require_program_access) and audit logging (audit_record).
"""
from __future__ import annotations

import io
import re
import zipfile
from datetime import datetime, timezone
from typing import Dict, List, Set
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.audit import record as audit_record
from app.auth import get_current_user
from app.db import get_db
from app.models import Asset, Run, Target, User
from app.rbac import require_program_access
from app.schema import HostItemResponse, RunHostsResponse

router = APIRouter(tags=["outputs"])


def _extract_host_from_value(value: str) -> str:
    """Extract clean hostname or IP from asset value (URL, FQDN, or IP:port)."""
    raw = value.strip()
    # Strip protocol prefix if present
    raw = re.sub(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", "", raw)
    # Strip path or trailing slashes
    raw = raw.split("/")[0]
    # Strip port if present
    raw = raw.split(":")[0]
    return raw.lower() if raw else value.strip()


def _format_host_txt(host: str, run: Run, assets: List[Asset], tool_filter: str | None = None) -> str:
    """Return raw tool terminal output if available, or structured fallback text."""
    filtered_assets = assets
    if tool_filter:
        filtered_assets = [a for a in assets if a.source_tool.lower() == tool_filter.lower()]

    # Collect raw stdout strings from asset metadata
    raw_blocks: List[str] = []
    seen = set()
    for a in filtered_assets:
        if a.asset_metadata and "raw_stdout" in a.asset_metadata:
            raw = str(a.asset_metadata["raw_stdout"]).strip()
            if raw and raw not in seen:
                seen.add(raw)
                raw_blocks.append(raw)

    if raw_blocks:
        return "\n\n".join(raw_blocks)

    # Fallback if no raw_stdout exists
    lines = [f"=== Output for {host} ({tool_filter or 'All Tools'}) ==="]
    for a in filtered_assets:
        meta_str = ""
        if a.asset_metadata:
            meta_items = [f"{k}={v}" for k, v in a.asset_metadata.items()]
            if meta_items:
                meta_str = f" [{', '.join(meta_items)}]"
        lines.append(f"• [{a.type.upper()}] {a.value}{meta_str}")
    return "\n".join(lines)


@router.get("/runs/{run_id}/hosts", response_model=RunHostsResponse)
async def get_run_hosts(
    run_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RunHostsResponse:
    """Returns list of all hosts tested during a run and asset metrics."""
    result = await db.execute(
        select(Run).where(Run.id == run_id).options(selectinload(Run.assets))
    )
    run = result.scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail="run_not_found")

    await require_program_access(db, current_user.id, run.program_id)

    # Group assets by host
    hosts_dict: Dict[str, Dict] = {}
    for asset in run.assets:
        host = _extract_host_from_value(asset.value)
        if host not in hosts_dict:
            hosts_dict[host] = {"asset_count": 0, "tools": set()}
        hosts_dict[host]["asset_count"] += 1
        hosts_dict[host]["tools"].add(asset.source_tool)

    # If no assets yet, fallback to target's root_domains/cidrs
    if not hosts_dict:
        target_res = await db.execute(
            select(Target).where(Target.id == run.target_id)
        )
        target = target_res.scalar_one_or_none()
        if target:
            for d in target.root_domains:
                hosts_dict[d.lower()] = {"asset_count": 0, "tools": set()}
            for c in target.cidrs:
                hosts_dict[c] = {"asset_count": 0, "tools": set()}

    host_items = [
        HostItemResponse(
            host=h,
            asset_count=data["asset_count"],
            tools=sorted(list(data["tools"])),
        )
        for h, data in sorted(hosts_dict.items())
    ]

    return RunHostsResponse(
        run_id=run.id,
        total_hosts=len(host_items),
        hosts=host_items,
    )


@router.get("/runs/{run_id}/hosts/{host_name}/text")
async def get_host_output_text(
    run_id: UUID,
    host_name: str,
    tool_name: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Returns individual plain text formatted output (.txt) for a host, optionally filtered by tool."""
    result = await db.execute(
        select(Run).where(Run.id == run_id).options(selectinload(Run.assets))
    )
    run = result.scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail="run_not_found")

    await require_program_access(db, current_user.id, run.program_id)

    target_host = host_name.strip().lower()

    # Filter assets for this host
    host_assets = [
        a for a in run.assets
        if _extract_host_from_value(a.value) == target_host or target_host in a.value.lower()
    ]

    txt_content = _format_host_txt(target_host, run, host_assets, tool_filter=tool_name)

    await audit_record(
        db,
        actor_user_id=current_user.id,
        action="output.download_host_txt",
        resource_type="run",
        resource_id=run.id,
        program_id=run.program_id,
        payload={"host": target_host, "asset_count": len(host_assets), "tool_filter": tool_name},
    )
    await db.commit()

    safe_filename = re.sub(r"[^a-zA-Z0-9_.-]", "_", target_host)
    if tool_name:
        safe_tool = re.sub(r"[^a-zA-Z0-9_.-]", "_", tool_name)
        file_label = f"{safe_filename}_{safe_tool}_output.txt"
    else:
        file_label = f"{safe_filename}_consolidated_output.txt"

    return Response(
        content=txt_content,
        media_type="text/plain; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{file_label}"'
        },
    )


@router.get("/runs/{run_id}/download-zip")
async def download_run_zip(
    run_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Generates and streams a ZIP file containing text outputs (consolidated and per tool) for all hosts."""
    result = await db.execute(
        select(Run).where(Run.id == run_id).options(selectinload(Run.assets))
    )
    run = result.scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail="run_not_found")

    await require_program_access(db, current_user.id, run.program_id)

    # Group assets by host
    hosts_map: Dict[str, List[Asset]] = {}
    for a in run.assets:
        h = _extract_host_from_value(a.value)
        hosts_map.setdefault(h, []).append(a)

    # Fallback to target scope if empty
    if not hosts_map:
        target_res = await db.execute(select(Target).where(Target.id == run.target_id))
        target = target_res.scalar_one_or_none()
        if target:
            for d in target.root_domains:
                hosts_map[d.lower()] = []

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        # Add summary file
        summary_lines = [
            "=" * 80,
            "MEROVINGIO TEST RUN SUMMARY",
            "=" * 80,
            f"Run ID:        {run.id}",
            f"Status:        {run.status.upper()}",
            f"Total Hosts:   {len(hosts_map)}",
            f"Total Assets:  {len(run.assets)}",
            f"Generated:     {datetime.now(timezone.utc).isoformat()}",
            "=" * 80,
            "",
            "Included Host Files (Consolidated & Per Tool):",
        ]
        for host in sorted(hosts_map.keys()):
            summary_lines.append(f"  - {host}_consolidated.txt ({len(hosts_map[host])} assets)")
            tools_set = set(a.source_tool for a in hosts_map[host])
            for t in sorted(tools_set):
                summary_lines.append(f"    └─ {host}_{t}.txt")
        zf.writestr("00_RUN_SUMMARY.txt", "\n".join(summary_lines))

        # Add individual host txt files (both consolidated and isolated per tool)
        for host, assets in hosts_map.items():
            safe_filename = re.sub(r"[^a-zA-Z0-9_.-]", "_", host)
            # 1. Consolidated file
            txt_data = _format_host_txt(host, run, assets)
            zf.writestr(f"{safe_filename}_consolidated.txt", txt_data)

            # 2. Isolated file per tool
            tools_set = set(a.source_tool for a in assets)
            for tool in sorted(tools_set):
                safe_tool = re.sub(r"[^a-zA-Z0-9_.-]", "_", tool)
                tool_txt = _format_host_txt(host, run, assets, tool_filter=tool)
                zf.writestr(f"{safe_filename}_{safe_tool}.txt", tool_txt)

    zip_buffer.seek(0)

    await audit_record(
        db,
        actor_user_id=current_user.id,
        action="output.download_zip",
        resource_type="run",
        resource_id=run.id,
        program_id=run.program_id,
        payload={"total_hosts": len(hosts_map), "total_assets": len(run.assets)},
    )
    await db.commit()

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="run_{run.id}_outputs.zip"'
        },
    )
