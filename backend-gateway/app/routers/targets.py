from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import record as audit_record
from app.auth import get_current_user
from app.db import get_db
from app.models import Target, User
from app.rbac import require_program_access
from app.schema import (
    ScopeCheckRequest,
    ScopeCheckResponse,
    TargetCreate,
    TargetResponse,
    TargetUpdate,
)
from app.scope import value_in_target_scope

router = APIRouter(tags=["targets"])


@router.post("/programs/{program_id}/targets", response_model=TargetResponse, status_code=201)
async def create_target(
    program_id: UUID,
    payload: TargetCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Target:
    program = await require_program_access(db, current_user.id, program_id, min_role="operator")

    target = Target(
        program_id=program.id,
        name=payload.name,
        root_domains=payload.root_domains,
        cidrs=payload.cidrs,
        out_of_scope=payload.out_of_scope,
        created_by=current_user.id,
    )
    db.add(target)
    await db.flush()

    await audit_record(
        db,
        actor_user_id=current_user.id,
        action="target.create",
        resource_type="target",
        resource_id=target.id,
        workspace_id=program.workspace_id,
        program_id=program.id,
        payload={
            "name": target.name,
            "root_domains": target.root_domains,
            "cidrs": target.cidrs,
            "out_of_scope": target.out_of_scope,
        },
    )
    await db.commit()
    await db.refresh(target)
    return target


@router.get("/programs/{program_id}/targets", response_model=list[TargetResponse])
async def list_targets(
    program_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Target]:
    await require_program_access(db, current_user.id, program_id)
    result = await db.execute(
        select(Target).where(Target.program_id == program_id, Target.deleted_at.is_(None))
    )
    return list(result.scalars().all())


async def _load_target_or_404(db: AsyncSession, target_id: UUID) -> Target:
    result = await db.execute(select(Target).where(Target.id == target_id, Target.deleted_at.is_(None)))
    target = result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="target_not_found")
    return target


@router.get("/targets/{target_id}", response_model=TargetResponse)
async def get_target(
    target_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Target:
    target = await _load_target_or_404(db, target_id)
    await require_program_access(db, current_user.id, target.program_id)
    return target


@router.patch("/targets/{target_id}", response_model=TargetResponse)
async def update_target(
    target_id: UUID,
    payload: TargetUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Target:
    target = await _load_target_or_404(db, target_id)
    program = await require_program_access(db, current_user.id, target.program_id, min_role="operator")

    changes: dict[str, object] = {}
    for field in ("name", "root_domains", "cidrs", "out_of_scope"):
        value = getattr(payload, field)
        if value is not None:
            setattr(target, field, value)
            changes[field] = value

    if changes:
        await audit_record(
            db,
            actor_user_id=current_user.id,
            action="target.update",
            resource_type="target",
            resource_id=target.id,
            workspace_id=program.workspace_id,
            program_id=program.id,
            payload=changes,
        )
    await db.commit()
    await db.refresh(target)
    return target


@router.delete("/targets/{target_id}", status_code=204, response_model=None)
async def delete_target(
    target_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    target = await _load_target_or_404(db, target_id)
    program = await require_program_access(db, current_user.id, target.program_id, min_role="admin")

    # Soft-delete: Runs/Assets/Findings reference targets by id (see
    # ARCHITECTURE_AND_ROADMAP.md section 2) and must not be orphaned by a
    # hard delete.
    target.deleted_at = datetime.now(timezone.utc)

    await audit_record(
        db,
        actor_user_id=current_user.id,
        action="target.delete",
        resource_type="target",
        resource_id=target.id,
        workspace_id=program.workspace_id,
        program_id=program.id,
    )
    await db.commit()


@router.post("/targets/{target_id}/scope-check", response_model=ScopeCheckResponse)
async def check_scope(
    target_id: UUID,
    payload: ScopeCheckRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScopeCheckResponse:
    """Lets a caller (Gateway internals, or a human via the UI) verify
    whether a value would be accepted by /internal/tes-lease's scope check
    for this Target, without needing to actually create a Run."""
    target = await _load_target_or_404(db, target_id)
    await require_program_access(db, current_user.id, target.program_id)
    return ScopeCheckResponse(value=payload.value, in_scope=value_in_target_scope(target, payload.value))
