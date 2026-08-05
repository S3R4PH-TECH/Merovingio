"""
Unit tests for data-indexer search & fallback handlers.
"""
import pytest


@pytest.mark.asyncio
async def test_search_assets_fallback_when_opensearch_offline(client):
    resp = await client.post("/search/assets", json={"query": "hackthissite.org"})
    assert resp.status_code == 200
    data = resp.json()
    assert "total" in data
    assert "hits" in data


@pytest.mark.asyncio
async def test_search_findings_fallback_when_opensearch_offline(client):
    resp = await client.post("/search/findings", json={"severity": "high"})
    assert resp.status_code == 200
    data = resp.json()
    assert "total" in data
    assert "hits" in data
