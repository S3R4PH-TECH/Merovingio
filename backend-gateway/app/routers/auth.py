from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import rate_limit
from app.audit import record as audit_record
from app.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_dummy_password,
    verify_password,
)
from app.db import get_db
from app.models import User
from app.schema import LoginRequest, MeResponse, RegisterRequest, TokenResponse

router = APIRouter(tags=["auth"])

_TRUTHY = {"1", "true", "yes", "on"}


def registration_enabled() -> bool:
    """Self-registration is a deliberate reversal of this platform's original
    posture (see scripts/seed_user.py: "no signup endpoint exists in this
    slice"). A registered account starts with zero memberships, but it can
    create its own Workspace and Program and from there dispatch offensive
    tooling — so whether it is open at all stays an explicit deployment
    decision, not a default baked into the code.
    """
    return os.environ.get("GATEWAY_ALLOW_REGISTRATION", "false").strip().lower() in _TRUTHY


@router.post("/auth/register", response_model=TokenResponse, status_code=201)
async def register(
    payload: RegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    if not registration_enabled():
        raise HTTPException(status_code=403, detail="registration_disabled")

    client_ip = request.client.host if request.client else "unknown"
    # Unauthenticated and it writes a row, so it shares the login limiter —
    # otherwise it is a free way to fill the users table.
    if not rate_limit.check_and_record(client_ip, "register"):
        raise HTTPException(status_code=429, detail="too_many_attempts")

    # Normalised on the way in: Postgres compares strings exactly, so without
    # this the same human could hold two accounts differing only in case, and
    # only one of them would ever authenticate.
    email = payload.email.strip().lower()

    result = await db.execute(select(User).where(func.lower(User.email) == email))
    if result.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="email_already_registered")

    user = User(email=email, name=payload.name, password_hash=hash_password(payload.password))
    db.add(user)
    await db.flush()

    await audit_record(
        db,
        actor_user_id=user.id,
        action="user.register",
        resource_type="user",
        resource_id=user.id,
        payload={"email": email},
    )
    await db.commit()
    await db.refresh(user)

    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/auth/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    client_ip = request.client.host if request.client else "unknown"
    if not rate_limit.check_and_record(client_ip, payload.email):
        raise HTTPException(status_code=429, detail="too_many_attempts")

    email = payload.email.strip().lower()
    result = await db.execute(select(User).where(func.lower(User.email) == email))
    user = result.scalar_one_or_none()

    if user is None:
        # Same bcrypt cost as the real path — see verify_dummy_password.
        verify_dummy_password(payload.password)
        raise HTTPException(status_code=401, detail="invalid_credentials")

    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="invalid_credentials")

    rate_limit.clear(client_ip, payload.email)
    return TokenResponse(access_token=create_access_token(user.id))


@router.get("/me", response_model=MeResponse)
async def me(current_user: User = Depends(get_current_user)) -> MeResponse:
    return MeResponse(id=current_user.id, email=current_user.email, name=current_user.name)
