"""
Shared fixtures for backend-gateway's test suite.

Runs against a REAL Postgres, not a mock — same convention already used
elsewhere in this monorepo (Workspace/Trinity's README: "Testes de backend
usam Prisma contra um Postgres real (não mockado)"). Each test function
gets a schema-fresh database created from the SQLAlchemy models directly
(create_all/drop_all) rather than by replaying Alembic migrations, which
keeps the test suite fast and independent of migration history — Alembic
itself is exercised separately (see tests/test_migrations.py).

Requires PLATFORM_TEST_DATABASE_URL to point at a reachable Postgres, e.g.:
    docker run -d --name gateway-testdb -e POSTGRES_USER=gateway \
        -e POSTGRES_PASSWORD=gateway -e POSTGRES_DB=gateway_test \
        -p 15433:5432 postgres:16-alpine
    PLATFORM_TEST_DATABASE_URL=postgresql+asyncpg://gateway:gateway@localhost:15433/gateway_test \
        pytest
"""
import os

os.environ.setdefault("GATEWAY_JWT_SECRET", "test-secret")

from typing import AsyncIterator  # noqa: E402

import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine  # noqa: E402

from app import db as app_db  # noqa: E402
from app.models import Base  # noqa: E402


def _test_database_url() -> str:
    try:
        return os.environ["PLATFORM_TEST_DATABASE_URL"]
    except KeyError as exc:
        raise RuntimeError(
            "PLATFORM_TEST_DATABASE_URL is not set — point it at a real "
            "throwaway Postgres before running this suite (see conftest.py "
            "docstring for a docker run one-liner)."
        ) from exc


@pytest_asyncio.fixture(autouse=True)
async def _clean_rate_limiter() -> AsyncIterator[None]:
    """The login limiter keeps process-global counters, so failed-login tests
    would otherwise leak attempts into later tests in the same run (the DB is
    recreated per test, but a module-level dict is not)."""
    from app import rate_limit

    rate_limit.reset_all()
    yield
    rate_limit.reset_all()


@pytest_asyncio.fixture(autouse=True)
async def _clean_schema() -> AsyncIterator[None]:
    """Drops and recreates every table before each test — real Postgres,
    fully isolated test-to-test state, no leftover rows between tests."""
    engine = create_async_engine(_test_database_url())
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()
    yield


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(_test_database_url())
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session
    await engine.dispose()


@pytest_asyncio.fixture
async def client(monkeypatch) -> AsyncIterator[AsyncClient]:
    """An httpx AsyncClient wired directly to the FastAPI app (ASGI
    transport, no real network/socket), with app.db's dependency pointed at
    the throwaway test database."""
    monkeypatch.setenv("PLATFORM_DATABASE_URL", _test_database_url())
    app_db.reset_engine_cache()

    from app.main import app  # imported after env is set

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac

    app_db.reset_engine_cache()
