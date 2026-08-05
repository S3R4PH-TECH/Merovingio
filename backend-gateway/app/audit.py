"""Audit trail helper — every scope-affecting write goes through this."""
from __future__ import annotations

from typing import Any, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog


async def record(
    db: AsyncSession,
    *,
    actor_user_id: UUID,
    action: str,
    resource_type: str,
    resource_id: UUID,
    workspace_id: Optional[UUID] = None,
    program_id: Optional[UUID] = None,
    payload: Optional[dict[str, Any]] = None,
    ip: Optional[str] = None,
) -> None:
    db.add(
        AuditLog(
            actor_user_id=actor_user_id,
            workspace_id=workspace_id,
            program_id=program_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            payload=payload or {},
            ip=ip,
        )
    )
