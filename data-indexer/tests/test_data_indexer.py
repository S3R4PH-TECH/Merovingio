"""
Unit tests for data-indexer: the auth boundary, and the search fallback path.
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


# --- Auth boundary -----------------------------------------------------------
#
# This service holds every asset and finding for every Program, and sits on the
# same network as the n8n workers, which run user-authored node graphs. It was
# previously fully unauthenticated, making the Gateway's Program-level tenancy
# boundary bypassable by anything that could reach the port.


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "path,body",
    [
        ("/index/asset", {"id": "a", "program_id": "p", "target_id": "t", "run_id": "r",
                          "type": "subdomain", "value": "x.example.com", "source_tool": "theharvester"}),
        ("/index/finding", {"id": "f", "program_id": "p", "target_id": "t", "run_id": "r",
                            "severity": "high", "title": "t"}),
        ("/search/assets", {"query": "example.com"}),
        ("/search/findings", {"query": "rce"}),
    ],
)
async def test_routes_require_internal_token(anon_client, path, body):
    assert (await anon_client.post(path, json=body)).status_code == 401


@pytest.mark.asyncio
async def test_wrong_token_is_rejected(anon_client):
    resp = await anon_client.post(
        "/search/assets", json={"query": "x"}, headers={"X-Internal-Token": "wrong"}
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_healthz_stays_open(anon_client):
    """Docker's healthcheck calls it with no credentials (docker-compose.yml)."""
    resp = await anon_client.get("/healthz")
    assert resp.status_code in (200, 503)
