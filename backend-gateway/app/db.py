"""
Async SQLAlchemy engine/session setup for the platform's own Postgres.

Deliberately separate from n8n's internal Postgres (see
ARCHITECTURE_AND_ROADMAP.md, section 5, A.1) — this database only ever
holds platform metadata (users/workspaces/programs/targets/runs/findings),
never n8n execution state.
"""
from __future__ import annotations

import os
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


def _database_url() -> str:
    # Read on every call (not cached at import time) so tests can point this
    # at a throwaway database via env var before the engine is created.
    return os.environ["PLATFORM_DATABASE_URL"]


_engine = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_engine():
    global _engine
    if _engine is None:
        _engine = create_async_engine(_database_url(), pool_pre_ping=True)
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(get_engine(), expire_on_commit=False)
    return _session_factory


async def get_db() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency — yields a session scoped to a single request."""
    async with get_session_factory()() as session:
        yield session


def reset_engine_cache() -> None:
    """Test-only: forces get_engine()/get_session_factory() to rebuild against
    whatever PLATFORM_DATABASE_URL is set to at call time."""
    global _engine, _session_factory
    _engine = None
    _session_factory = None
