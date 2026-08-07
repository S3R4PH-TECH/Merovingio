"""
Tests for browser access to the gateway.

The gateway shipped with no CORS configuration at all: the API worked from
curl and from n8n (neither enforces CORS) but every request from a browser
page served on a different port was blocked before it left the tab. The
dashboard runs on :15173 in the container and :5173 under `npm run dev`,
so every one of its calls to :18000 is cross-origin.

The allowlist is explicit rather than "*" — the browser sends an
Authorization header on almost every call, and a wildcard origin is both
disallowed with credentials and wrong for a platform that can launch
offensive tooling.
"""
import pytest

LOCAL_ORIGIN = "http://localhost:15173"
DEV_ORIGIN = "http://localhost:5173"


async def test_preflight_is_answered_for_the_container_origin(client):
    resp = await client.options(
        "/auth/register",
        headers={
            "Origin": LOCAL_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    # Without CORS middleware this route answers 405: it declares POST only,
    # and nothing handles the browser's OPTIONS probe.
    assert resp.status_code == 200
    assert resp.headers["access-control-allow-origin"] == LOCAL_ORIGIN


async def test_preflight_is_answered_for_the_vite_dev_origin(client):
    resp = await client.options(
        "/auth/login",
        headers={
            "Origin": DEV_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert resp.status_code == 200
    assert resp.headers["access-control-allow-origin"] == DEV_ORIGIN


async def test_preflight_allows_the_authorization_header(client):
    resp = await client.options(
        "/runs",
        headers={
            "Origin": LOCAL_ORIGIN,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )

    assert resp.status_code == 200
    allowed = resp.headers["access-control-allow-headers"].lower()
    # 18 of 25 endpoints need a Bearer token; without this header on the
    # preflight the browser refuses to send it.
    assert "authorization" in allowed


async def test_actual_response_carries_the_origin_header(client):
    resp = await client.get("/runs", headers={"Origin": LOCAL_ORIGIN})

    assert resp.status_code == 200
    assert resp.headers["access-control-allow-origin"] == LOCAL_ORIGIN


async def test_an_unlisted_origin_is_not_granted_access(client):
    resp = await client.get("/runs", headers={"Origin": "http://evil.example.com"})

    # The request still executes — CORS is enforced by the browser, not the
    # server — but without the header the page cannot read the response.
    assert "access-control-allow-origin" not in resp.headers


async def test_the_allowlist_can_be_extended_by_environment(monkeypatch):
    """A deployment that serves the UI from another host must be able to add it
    without editing code."""
    monkeypatch.setenv("GATEWAY_CORS_ORIGINS", "https://recon.internal")

    from app.main import build_cors_origins

    origins = build_cors_origins()

    assert "https://recon.internal" in origins
    assert LOCAL_ORIGIN in origins


async def test_the_allowlist_never_becomes_a_wildcard(monkeypatch):
    monkeypatch.setenv("GATEWAY_CORS_ORIGINS", "*")

    from app.main import build_cors_origins

    # allow_credentials plus "*" is rejected by browsers anyway, and silently
    # opening every origin on this platform is not a thing an env typo should
    # be able to do.
    assert "*" not in build_cors_origins()
