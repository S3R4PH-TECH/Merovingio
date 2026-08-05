"""
Seeds a single test user — no signup endpoint exists in this slice (see
app/auth.py docstring). Mirrors Workspace/Trinity's seed approach.

Usage:
    PLATFORM_DATABASE_URL=postgresql+asyncpg://... python3 scripts/seed_user.py \
        --email test@example.com --password 'Password123!' --name 'Test User'
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select  # noqa: E402

from app.auth import hash_password  # noqa: E402
from app.db import get_session_factory  # noqa: E402
from app.models import User  # noqa: E402


async def seed(email: str, password: str, name: str) -> None:
    async with get_session_factory()() as db:
        result = await db.execute(select(User).where(User.email == email))
        existing = result.scalar_one_or_none()
        if existing is not None:
            print(f"user {email} already exists (id={existing.id})")
            return

        user = User(email=email, name=name, password_hash=hash_password(password))
        db.add(user)
        await db.commit()
        await db.refresh(user)
        print(f"created user {email} (id={user.id})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--name", default="Test User")
    args = parser.parse_args()

    asyncio.run(seed(args.email, args.password, args.name))
