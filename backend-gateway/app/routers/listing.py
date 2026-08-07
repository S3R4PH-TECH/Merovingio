"""
Read/list endpoints for the dashboard.

The gateway could already create a workspace, a program, a workflow
definition, an asset and a finding — but could never list any of them back.
`workflow_definitions` and `findings` were write-only tables, which made a
"pick a workflow to run" screen impossible to build.

Every endpoint here is scoped through app.rbac's accessible_* helpers. A list
endpoint that forgets that check is the easiest way to turn a multi-tenant
platform into a single-tenant one by accident.
"""
from __future__ import annotations

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.models import (
    Asset,
    Finding,
    Program,
    User,
    WorkflowDefinition,
    Workspace,
    WorkspaceMembership,
)
from app.rbac import accessible_program_ids, accessible_workspace_ids
from app.schema import (
    AssetListItem,
    FindingResponse,
    ProgramResponse,
    WorkflowResponse,
    WorkspaceResponse,
)

router = APIRouter(tags=["listing"])


@router.get("/workspaces", response_model=List[WorkspaceResponse])
async def list_workspaces(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[Workspace]:
    result = await db.execute(
        select(Workspace)
        .join(WorkspaceMembership, WorkspaceMembership.workspace_id == Workspace.id)
        .where(WorkspaceMembership.user_id == current_user.id)
        .order_by(Workspace.name)
    )
    return list(result.scalars().all())


@router.get("/programs", response_model=List[ProgramResponse])
async def list_programs(
    workspace_id: Optional[UUID] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[Program]:
    program_ids = await accessible_program_ids(db, current_user.id)
    if not program_ids:
        return []

    stmt = select(Program).where(Program.id.in_(program_ids))
    if workspace_id is not None:
        stmt = stmt.where(Program.workspace_id == workspace_id)

    result = await db.execute(stmt.order_by(Program.name))
    return list(result.scalars().all())


@router.get("/workflows", response_model=List[WorkflowResponse])
async def list_workflows(
    workspace_id: Optional[UUID] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[WorkflowDefinition]:
    """Workflow definitions the caller can see.

    Scoped by workspace membership rather than by program access: a workflow
    belongs to a Workspace, and enabling it per Program is a separate concern
    (see the program_workflow_enablement table).
    """
    workspace_ids = await accessible_workspace_ids(db, current_user.id)
    if not workspace_ids:
        return []

    stmt = select(WorkflowDefinition).where(
        WorkflowDefinition.workspace_id.in_(workspace_ids)
    )
    if workspace_id is not None:
        stmt = stmt.where(WorkflowDefinition.workspace_id == workspace_id)

    result = await db.execute(stmt.order_by(WorkflowDefinition.name))
    return list(result.scalars().all())


@router.get("/findings", response_model=List[FindingResponse])
async def list_findings(
    program_id: Optional[UUID] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[Finding]:
    """A finding is the most sensitive row in the platform — it names a live
    weakness on a real host. Program scoping here is not optional.
    """
    program_ids = await accessible_program_ids(db, current_user.id)
    if not program_ids:
        return []

    stmt = select(Finding).where(Finding.program_id.in_(program_ids))
    if program_id is not None:
        stmt = stmt.where(Finding.program_id == program_id)
    if severity is not None:
        stmt = stmt.where(Finding.severity == severity)
    if status is not None:
        stmt = stmt.where(Finding.status == status)

    result = await db.execute(stmt.order_by(Finding.created_at.desc()).limit(limit))
    return list(result.scalars().all())


@router.get("/assets", response_model=List[AssetListItem])
async def list_assets(
    program_id: Optional[UUID] = Query(default=None),
    target_id: Optional[UUID] = Query(default=None),
    run_id: Optional[UUID] = Query(default=None),
    limit: int = Query(default=500, ge=1, le=5000),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[Asset]:
    """`assets` is the one unbounded table in this schema — a single Run in the
    PoC produced 83 rows and nothing dedups. The limit is capped rather than
    optional so a UI cannot accidentally ask for the whole table.
    """
    program_ids = await accessible_program_ids(db, current_user.id)
    if not program_ids:
        return []

    stmt = select(Asset).where(Asset.program_id.in_(program_ids))
    if program_id is not None:
        stmt = stmt.where(Asset.program_id == program_id)
    if target_id is not None:
        stmt = stmt.where(Asset.target_id == target_id)
    if run_id is not None:
        stmt = stmt.where(Asset.run_id == run_id)

    result = await db.execute(stmt.order_by(Asset.first_seen_at.desc()).limit(limit))
    return list(result.scalars().all())
