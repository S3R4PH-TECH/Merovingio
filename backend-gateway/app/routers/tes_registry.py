"""
/admin/tes — Administrative endpoints for managing Tool Execution Services (tes_registry).

Two things make this surface more sensitive than it looks, and both are
enforced below rather than left to convention:

1. **Authorization.** The registry is what resolves a logical `tool_name` to
   a physical TES address plus the token that TES accepts. Anyone who can
   PATCH `base_url` can repoint a tool at a host they control and receive the
   next lease's token and in-scope domains. `require_platform_admin` gates
   every route (see app/rbac.py for why that check is coarse today).
2. **Secret exposure.** `static_token` is write-only over this API: settable
   via POST/PATCH, never returned on a read. See TesRegistryResponse.
"""
from __future__ import annotations

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.models import TesRegistry, User
from app.rbac import require_platform_admin
from app.schema import TesRegistryCreate, TesRegistryResponse, TesRegistryUpdate


async def _platform_admin(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    await require_platform_admin(db, current_user.id)
    return current_user


router = APIRouter(prefix="/admin/tes", tags=["tes-admin"], dependencies=[Depends(_platform_admin)])


def _to_response(entry: TesRegistry) -> TesRegistryResponse:
    """Builds the read shape explicitly instead of model_validate(entry), so
    adding a column to the model can never silently start leaking it here."""
    return TesRegistryResponse(
        id=entry.id,
        tool_name=entry.tool_name,
        base_url=entry.base_url,
        health_status=entry.health_status,
        vault_secret_path=entry.vault_secret_path,
        has_static_token=bool(entry.static_token),
        max_concurrency=entry.max_concurrency,
        timeout_seconds=entry.timeout_seconds,
        updated_at=entry.updated_at,
    )


async def _load_entry_or_404(db: AsyncSession, tes_id: UUID) -> TesRegistry:
    result = await db.execute(select(TesRegistry).where(TesRegistry.id == tes_id))
    entry = result.scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=404, detail="tes_entry_not_found")
    return entry


@router.post("", response_model=TesRegistryResponse, status_code=201)
async def create_tes_entry(
    payload: TesRegistryCreate,
    db: AsyncSession = Depends(get_db),
) -> TesRegistryResponse:
    existing = await db.execute(select(TesRegistry).where(TesRegistry.tool_name == payload.tool_name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="tool_already_registered")

    entry = TesRegistry(
        tool_name=payload.tool_name,
        base_url=payload.base_url,
        vault_secret_path=payload.vault_secret_path,
        static_token=payload.static_token,
        max_concurrency=payload.max_concurrency,
        timeout_seconds=payload.timeout_seconds,
        health_status="unknown",
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return _to_response(entry)


@router.get("", response_model=List[TesRegistryResponse])
async def list_tes_entries(db: AsyncSession = Depends(get_db)) -> List[TesRegistryResponse]:
    result = await db.execute(select(TesRegistry).order_by(TesRegistry.tool_name))
    return [_to_response(e) for e in result.scalars().all()]


@router.get("/{tes_id}", response_model=TesRegistryResponse)
async def get_tes_entry(tes_id: UUID, db: AsyncSession = Depends(get_db)) -> TesRegistryResponse:
    return _to_response(await _load_entry_or_404(db, tes_id))


@router.patch("/{tes_id}", response_model=TesRegistryResponse)
async def update_tes_entry(
    tes_id: UUID,
    payload: TesRegistryUpdate,
    db: AsyncSession = Depends(get_db),
) -> TesRegistryResponse:
    entry = await _load_entry_or_404(db, tes_id)

    for field in (
        "base_url",
        "health_status",
        "vault_secret_path",
        "static_token",
        "max_concurrency",
        "timeout_seconds",
    ):
        value = getattr(payload, field)
        if value is not None:
            setattr(entry, field, value)

    await db.commit()
    await db.refresh(entry)
    return _to_response(entry)


@router.delete("/{tes_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tes_entry(tes_id: UUID, db: AsyncSession = Depends(get_db)) -> Response:
    entry = await _load_entry_or_404(db, tes_id)
    await db.delete(entry)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
