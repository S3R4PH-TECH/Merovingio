"""
Unit tests for data-sync-svc endpoints.
"""
import pytest


@pytest.mark.asyncio
async def test_healthz(client):
    resp = await client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_sync_wordlists(client):
    resp = await client.post("/sync/wordlists")
    assert resp.status_code == 200
    data = resp.json()
    assert data["dataset"] == "wordlists"
    assert data["status"] == "synced"
    assert data["count"] > 0


@pytest.mark.asyncio
async def test_sync_resolvers(client):
    resp = await client.post("/sync/resolvers")
    assert resp.status_code == 200
    data = resp.json()
    assert data["dataset"] == "resolvers"
    assert data["status"] == "synced"
    assert data["count"] > 0


@pytest.mark.asyncio
async def test_sync_cve(client):
    resp = await client.post("/sync/cve")
    assert resp.status_code == 200
    data = resp.json()
    assert data["dataset"] == "cve"
    assert data["status"] == "synced"
    assert data["count"] == 2


@pytest.mark.asyncio
async def test_sync_seclists(client):
    resp = await client.post("/sync/seclists")
    assert resp.status_code == 200
    data = resp.json()
    assert data["dataset"] == "seclists"
    assert data["status"] == "synced"


@pytest.mark.asyncio
async def test_sync_trickest_cve(client):
    resp = await client.post("/sync/trickest-cve")
    assert resp.status_code == 200
    data = resp.json()
    assert data["dataset"] == "trickest-cve"
    assert data["status"] == "synced"

