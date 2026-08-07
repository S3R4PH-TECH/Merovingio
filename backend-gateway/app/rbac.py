"""
Membership checks for the Workspace -> Program tenancy model
(ARCHITECTURE_AND_ROADMAP.md, section 5, A.4).

Effective permission = high workspace role (owner/admin sees every Program
in that workspace) OR an explicit ProgramMembership row for that specific
Program. This is deliberately a function, not a decorator, so every route
that touches a program-scoped resource calls it explicitly instead of
relying on route metadata that's easy to forget on a new endpoint.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Program, ProgramMembership, WorkspaceMembership

_WORKSPACE_ADMIN_ROLES = {"owner", "admin"}


async def require_platform_admin(db: AsyncSession, user_id: UUID) -> None:
    """Guards platform-wide resources that aren't owned by any single tenant.

    `tes_registry` is the only such table today: it maps a logical tool_name
    to a physical TES address for the whole platform, so there is no
    workspace_id to scope a check against. Holding owner/admin on at least
    one Workspace is used as the "platform admin" proxy.

    This is deliberately coarse, and it is the weakest link in the tenancy
    model: an owner of any workspace can read and repoint every registered
    TES. Tightening it needs a workspace_id (or an explicit platform_admins
    table) on tes_registry — a schema change, tracked in PLANO_DE_ACAO.md.
    Until then, coarse-but-enforced beats the previous state, which was any
    authenticated user at all.
    """
    result = await db.execute(
        select(WorkspaceMembership.id)
        .where(
            WorkspaceMembership.user_id == user_id,
            WorkspaceMembership.role.in_(_WORKSPACE_ADMIN_ROLES),
        )
        .limit(1)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=403, detail="not_a_platform_admin")


async def require_workspace_member(db: AsyncSession, user_id: UUID, workspace_id: UUID) -> WorkspaceMembership:
    result = await db.execute(
        select(WorkspaceMembership).where(
            WorkspaceMembership.user_id == user_id,
            WorkspaceMembership.workspace_id == workspace_id,
        )
    )
    membership = result.scalar_one_or_none()
    if membership is None:
        raise HTTPException(status_code=403, detail="not_a_workspace_member")
    return membership


async def require_program_access(
    db: AsyncSession, user_id: UUID, program_id: UUID, *, min_role: str | None = None
) -> Program:
    """Loads the Program (404 if it doesn't exist) and checks the caller has
    access to it: workspace admin/owner of its Workspace, OR an explicit
    ProgramMembership (optionally requiring `min_role` for that membership).
    """
    result = await db.execute(select(Program).where(Program.id == program_id))
    program = result.scalar_one_or_none()
    if program is None:
        raise HTTPException(status_code=404, detail="program_not_found")

    ws_result = await db.execute(
        select(WorkspaceMembership).where(
            WorkspaceMembership.user_id == user_id,
            WorkspaceMembership.workspace_id == program.workspace_id,
        )
    )
    ws_membership = ws_result.scalar_one_or_none()
    if ws_membership is not None and ws_membership.role in _WORKSPACE_ADMIN_ROLES:
        return program

    prog_result = await db.execute(
        select(ProgramMembership).where(
            ProgramMembership.user_id == user_id,
            ProgramMembership.program_id == program_id,
        )
    )
    prog_membership = prog_result.scalar_one_or_none()
    if prog_membership is None:
        raise HTTPException(status_code=403, detail="not_a_program_member")

    if min_role is not None:
        _ROLE_RANK = {"viewer": 0, "operator": 1, "admin": 2}
        if _ROLE_RANK.get(prog_membership.role, -1) < _ROLE_RANK.get(min_role, 99):
            raise HTTPException(status_code=403, detail="insufficient_program_role")

    return program


async def accessible_workspace_ids(db: AsyncSession, user_id: UUID) -> list[UUID]:
    """Every Workspace the caller belongs to, in any role.

    Companion to require_workspace_member for list endpoints: the singular
    check answers "may I touch this one?", this answers "which ones may I
    see?" — and a list endpoint that forgets to ask leaks other tenants.
    """
    result = await db.execute(
        select(WorkspaceMembership.workspace_id).where(WorkspaceMembership.user_id == user_id)
    )
    return list(result.scalars().all())


async def accessible_program_ids(db: AsyncSession, user_id: UUID) -> list[UUID]:
    """Every Program the caller can reach, by either route that grants access:
    owner/admin on the Program's Workspace, or an explicit ProgramMembership.

    Mirrors require_program_access exactly. If that function's rules change,
    this one has to change with it or a list endpoint starts disagreeing with
    the detail endpoint beside it.
    """
    admin_ws = await db.execute(
        select(WorkspaceMembership.workspace_id).where(
            WorkspaceMembership.user_id == user_id,
            WorkspaceMembership.role.in_(_WORKSPACE_ADMIN_ROLES),
        )
    )
    workspace_ids = list(admin_ws.scalars().all())

    program_ids: set[UUID] = set()
    if workspace_ids:
        by_workspace = await db.execute(
            select(Program.id).where(Program.workspace_id.in_(workspace_ids))
        )
        program_ids.update(by_workspace.scalars().all())

    direct = await db.execute(
        select(ProgramMembership.program_id).where(ProgramMembership.user_id == user_id)
    )
    program_ids.update(direct.scalars().all())

    return list(program_ids)
