from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import record as audit_record
from app.auth import get_current_user
from app.db import get_db
from app.models import Program, ProgramMembership, User
from app.rbac import require_program_access, require_workspace_member
from app.schema import ProgramCreate, ProgramMemberCreate, ProgramResponse

router = APIRouter(tags=["programs"])


@router.post("/workspaces/{workspace_id}/programs", response_model=ProgramResponse, status_code=201)
async def create_program(
    workspace_id: UUID,
    payload: ProgramCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Program:
    membership = await require_workspace_member(db, current_user.id, workspace_id)
    if membership.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="insufficient_workspace_role")

    program = Program(workspace_id=workspace_id, name=payload.name, description=payload.description)
    db.add(program)
    await db.flush()

    # Creator gets explicit Program admin membership too — Program, not
    # Workspace, is the real isolation boundary (see app/rbac.py docstring),
    # so relying on the workspace role alone would be surprising for anyone
    # reading /programs/{id}/members later and not seeing the creator listed.
    db.add(ProgramMembership(user_id=current_user.id, program_id=program.id, role="admin"))

    await audit_record(
        db,
        actor_user_id=current_user.id,
        action="program.create",
        resource_type="program",
        resource_id=program.id,
        workspace_id=workspace_id,
        program_id=program.id,
        payload={"name": program.name},
    )
    await db.commit()
    await db.refresh(program)
    return program


@router.post("/programs/{program_id}/members", status_code=201)
async def add_program_member(
    program_id: UUID,
    payload: ProgramMemberCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await require_program_access(db, current_user.id, program_id, min_role="admin")

    result = await db.execute(
        select(ProgramMembership).where(
            ProgramMembership.user_id == payload.user_id,
            ProgramMembership.program_id == program_id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        existing.role = payload.role
    else:
        db.add(ProgramMembership(user_id=payload.user_id, program_id=program_id, role=payload.role))

    await audit_record(
        db,
        actor_user_id=current_user.id,
        action="program.member.add",
        resource_type="program_membership",
        resource_id=program_id,
        program_id=program_id,
        payload={"user_id": str(payload.user_id), "role": payload.role},
    )
    await db.commit()
    return {"user_id": str(payload.user_id), "program_id": str(program_id), "role": payload.role}
