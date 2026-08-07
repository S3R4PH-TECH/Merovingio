"""
JWT authentication for the Backend Gateway.

No signup endpoint in this slice — matches the existing convention in this
monorepo (Workspace/Trinity's README: "não há tela de registro no MVP"),
users are seeded via scripts/seed_user.py.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

import bcrypt
import jwt
from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import User

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 8

# bcrypt silently truncates/ignores bytes past 72 — reject longer passwords
# up front instead of accepting them and getting inconsistent verify results.
_MAX_PASSWORD_BYTES = 72


def _jwt_secret() -> str:
    # Read fresh on every call (not cached at import time), same rationale
    # as recon-runner's _expected_token(): lets tests set/change the secret
    # via monkeypatch/env without needing to reload the module.
    return os.environ["GATEWAY_JWT_SECRET"]


def hash_password(password: str) -> str:
    password_bytes = password.encode("utf-8")
    if len(password_bytes) > _MAX_PASSWORD_BYTES:
        raise ValueError("password exceeds 72 bytes")
    return bcrypt.hashpw(password_bytes, bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    password_bytes = password.encode("utf-8")
    if len(password_bytes) > _MAX_PASSWORD_BYTES:
        return False
    try:
        return bcrypt.checkpw(password_bytes, password_hash.encode("utf-8"))
    except ValueError:
        # Malformed stored hash — treat as a failed verification, not a 500.
        return False


def verify_dummy_password(password: str) -> None:
    """Burns the same bcrypt work a real verification would, for the
    unknown-email path of login.

    Without this, `POST /auth/login` returns measurably faster for an address
    with no account (no hash to check) than for one with a wrong password —
    a timing oracle that turns the endpoint into an account-existence check.
    The hash is computed once at import rather than per call so the cost paid
    at request time matches a genuine verify.
    """
    verify_password(password, _DUMMY_HASH)


_DUMMY_HASH = hash_password("unused-constant-time-login-placeholder")


def create_access_token(user_id: UUID) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, _jwt_secret(), algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[UUID]:
    try:
        payload = jwt.decode(token, _jwt_secret(), algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    sub = payload.get("sub")
    if not sub:
        return None
    try:
        return UUID(sub)
    except ValueError:
        return None


async def get_current_user(
    authorization: Optional[str] = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="unauthorized")

    token = authorization.split(" ", 1)[1].strip()
    user_id = decode_access_token(token)
    if user_id is None:
        raise HTTPException(status_code=401, detail="unauthorized")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=401, detail="unauthorized")
    return user
