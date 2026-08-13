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
from app.schema import (
    LoginRequest,
    MeResponse,
    PasswordChangeRequest,
    ProfileUpdateRequest,
    RegisterRequest,
    TokenResponse,
)

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


def _me(user: User) -> MeResponse:
    return MeResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        avatar_url=user.avatar_url,
    )


@router.get("/me", response_model=MeResponse)
async def me(current_user: User = Depends(get_current_user)) -> MeResponse:
    return _me(current_user)


@router.patch("/me", response_model=MeResponse)
async def update_me(
    payload: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MeResponse:
    """Edit the caller's own profile — never anyone else's.

    There is no user id in the path for that reason: the only account this
    endpoint can reach is the one the presented token belongs to, so no amount
    of parameter tampering turns it into an admin tool.
    """
    if payload.name is not None:
        current_user.name = payload.name
    if payload.avatar_url is not None:
        # "" is the UI's way of clearing the photo; the column stores that
        # absence as NULL, which is what the initials fallback keys off.
        current_user.avatar_url = payload.avatar_url or None

    await audit_record(
        db,
        actor_user_id=current_user.id,
        action="user.profile_update",
        resource_type="user",
        resource_id=current_user.id,
        # The avatar itself is never logged — a data URI would put an entire
        # image in the audit trail. Only whether one is now set.
        payload={
            "name_changed": payload.name is not None,
            "avatar_set": bool(current_user.avatar_url),
        },
    )
    await db.commit()
    await db.refresh(current_user)

    return _me(current_user)


# response_model=None is load-bearing, not decoration: this module runs under
# `from __future__ import annotations`, so FastAPI reads the `-> None` return
# annotation back as the NoneType *class* and treats it as a response model —
# which a 204 is forbidden to have, and the app refuses to import.
@router.post("/me/password", status_code=204, response_model=None)
async def change_password(
    payload: PasswordChangeRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Change the caller's own password.

    Rate limited on the same bucket as login: it verifies a password, so
    leaving it open would hand an attacker with a leaked token an unmetered
    oracle for the real one.
    """
    client_ip = request.client.host if request.client else "unknown"
    if not rate_limit.check_and_record(client_ip, f"password-change:{current_user.email}"):
        raise HTTPException(status_code=429, detail="too_many_attempts")

    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=401, detail="invalid_credentials")

    rate_limit.clear(client_ip, f"password-change:{current_user.email}")

    current_user.password_hash = hash_password(payload.new_password)

    await audit_record(
        db,
        actor_user_id=current_user.id,
        action="user.password_change",
        resource_type="user",
        resource_id=current_user.id,
        payload={},
    )
    await db.commit()

    # Existing tokens stay valid: they carry a user id and an expiry, nothing
    # derived from the password, and this slice has no revocation list to add
    # them to. Worth knowing before treating a password change as a way to
    # evict a session.
    return None
