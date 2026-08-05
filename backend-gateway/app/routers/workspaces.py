from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import record as audit_record
from app.auth import get_current_user
from app.db import get_db
from app.models import User, Workspace, WorkspaceMembership
from app.schema import WorkspaceCreate, WorkspaceResponse

router = APIRouter(tags=["workspaces"])


@router.post("/workspaces", response_model=WorkspaceResponse, status_code=201)
async def create_workspace(
    payload: WorkspaceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Workspace:
    workspace = Workspace(name=payload.name, slug=payload.slug)
    db.add(workspace)
    await db.flush()

    db.add(WorkspaceMembership(user_id=current_user.id, workspace_id=workspace.id, role="owner"))
    await audit_record(
        db,
        actor_user_id=current_user.id,
        action="workspace.create",
        resource_type="workspace",
        resource_id=workspace.id,
        workspace_id=workspace.id,
        payload={"name": workspace.name, "slug": workspace.slug},
    )
    await db.commit()
    await db.refresh(workspace)
    return workspace
