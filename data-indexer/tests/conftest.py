"""
Fixtures for data-indexer tests.
"""
import os

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

TEST_TOKEN = "test-indexer-token"
AUTH_HEADERS = {"X-Internal-Token": TEST_TOKEN}


@pytest_asyncio.fixture(autouse=True)
def _token(monkeypatch):
    # require_internal_token reads the env var per call rather than caching it
    # at import time, so monkeypatch alone is enough — no module reload needed.
    monkeypatch.setenv("DATA_INDEXER_TOKEN", TEST_TOKEN)


@pytest_asyncio.fixture
async def client():
    from app.main import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver", headers=AUTH_HEADERS) as ac:
        yield ac


@pytest_asyncio.fixture
async def anon_client():
    """No auth header — for asserting the boundary itself."""
    from app.main import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac
