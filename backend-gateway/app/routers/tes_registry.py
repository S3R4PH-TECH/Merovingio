"""
/admin/tes — Administrative endpoints for managing Tool Execution Services (tes_registry).
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
from app.schema import TesRegistryCreate, TesRegistryResponse, TesRegistryUpdate

router = APIRouter(prefix="/admin/tes", tags=["tes-admin"], dependencies=[Depends(get_current_user)])


@router.post("", response_model=TesRegistryResponse, status_code=201)
async def create_tes_entry(
    payload: TesRegistryCreate,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
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
    return TesRegistryResponse.model_validate(entry)


@router.get("", response_model=List[TesRegistryResponse])
async def list_tes_entries(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> List[TesRegistryResponse]:
    result = await db.execute(select(TesRegistry).order_by(TesRegistry.tool_name))
    entries = result.scalars().all()
    return [TesRegistryResponse.model_validate(e) for e in entries]


@router.get("/{tes_id}", response_model=TesRegistryResponse)
async def get_tes_entry(
    tes_id: UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> TesRegistryResponse:
    result = await db.execute(select(TesRegistry).where(TesRegistry.id == tes_id))
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="tes_entry_not_found")
    return TesRegistryResponse.model_validate(entry)


@router.patch("/{tes_id}", response_model=TesRegistryResponse)
async def update_tes_entry(
    tes_id: UUID,
    payload: TesRegistryUpdate,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> TesRegistryResponse:
    result = await db.execute(select(TesRegistry).where(TesRegistry.id == tes_id))
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="tes_entry_not_found")

    if payload.base_url is not None:
        entry.base_url = payload.base_url
    if payload.health_status is not None:
        entry.health_status = payload.health_status
    if payload.vault_secret_path is not None:
        entry.vault_secret_path = payload.vault_secret_path
    if payload.static_token is not None:
        entry.static_token = payload.static_token
    if payload.max_concurrency is not None:
        entry.max_concurrency = payload.max_concurrency
    if payload.timeout_seconds is not None:
        entry.timeout_seconds = payload.timeout_seconds

    await db.commit()
    await db.refresh(entry)
    return TesRegistryResponse.model_validate(entry)


@router.delete("/{tes_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tes_entry(
    tes_id: UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> Response:
    result = await db.execute(select(TesRegistry).where(TesRegistry.id == tes_id))
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="tes_entry_not_found")

    await db.delete(entry)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
