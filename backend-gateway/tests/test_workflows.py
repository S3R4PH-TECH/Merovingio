"""
Tests for workflow registration and POST /workflows/{id}/run. The workflow
trigger's outbound webhook POST is mocked here via a dependency override on
get_http_client (this suite needs neither a real n8n nor network access) —
deliberately NOT via `patch("httpx.AsyncClient.post")`, since the test
client itself is also an httpx.AsyncClient (see conftest.py); patching the
class globally would mock the test client's own in-process calls into the
app too. The actual webhook call against a real n8n instance is exercised
by the docker-compose PoC, not by this unit suite.
"""
import pytest_asyncio
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx

from app.auth import hash_password
from app.http_client import get_http_client
from app.main import app
from app.models import User


@pytest_asyncio.fixture
async def mock_http_client():
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    app.dependency_overrides[get_http_client] = lambda: mock_client
    yield mock_client
    app.dependency_overrides.pop(get_http_client, None)


async def _create_user(db_session, email: str, password: str = "Password123!") -> User:
    user = User(email=email, name=email.split("@")[0], password_hash=hash_password(password))
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def _auth_headers(client, email: str, password: str = "Password123!") -> dict:
    resp = await client.post("/auth/login", json={"email": email, "password": password})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _setup_workspace_program_target(client, headers) -> tuple[str, str, str]:
    ws_resp = await client.post("/workspaces", json={"name": "Acme", "slug": "acme"}, headers=headers)
    workspace_id = ws_resp.json()["id"]

    prog_resp = await client.post(
        f"/workspaces/{workspace_id}/programs", json={"name": "Acme BB"}, headers=headers
    )
    program_id = prog_resp.json()["id"]

    target_resp = await client.post(
        f"/programs/{program_id}/targets",
        json={"name": "Primary", "root_domains": ["hackthissite.org"]},
        headers=headers,
    )
    target_id = target_resp.json()["id"]
    return workspace_id, program_id, target_id


async def test_create_workflow(client, db_session):
    await _create_user(db_session, "owner@example.com")
    headers = await _auth_headers(client, "owner@example.com")
    ws_resp = await client.post("/workspaces", json={"name": "Acme", "slug": "acme"}, headers=headers)
    workspace_id = ws_resp.json()["id"]

    resp = await client.post(
        f"/workspaces/{workspace_id}/workflows",
        json={
            "name": "recon-baseline",
            "git_path": "workflows/recon-baseline.json",
            "current_version": "1",
            "production_webhook_url": "http://n8n-main:5678/webhook/abc123",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["production_webhook_url"] == "http://n8n-main:5678/webhook/abc123"


async def test_trigger_run_posts_to_webhook_and_returns_202(client, db_session, mock_http_client):
    await _create_user(db_session, "owner@example.com")
    headers = await _auth_headers(client, "owner@example.com")
    workspace_id, program_id, target_id = await _setup_workspace_program_target(client, headers)

    wf_resp = await client.post(
        f"/workspaces/{workspace_id}/workflows",
        json={
            "name": "recon-baseline",
            "git_path": "n/a",
            "current_version": "1",
            "production_webhook_url": "http://n8n-main:5678/webhook/abc123",
        },
        headers=headers,
    )
    workflow_id = wf_resp.json()["id"]

    resp = await client.post(
        f"/workflows/{workflow_id}/run", json={"target_id": target_id, "params": {}}, headers=headers
    )

    assert resp.status_code == 202, resp.text
    body = resp.json()
    assert body["status"] == "queued"
    mock_http_client.post.assert_awaited_once()
    call_args = mock_http_client.post.await_args
    assert call_args.args[0] == "http://n8n-main:5678/webhook/abc123"
    assert call_args.kwargs["json"]["target_id"] == target_id


async def test_trigger_run_marks_failed_when_webhook_unreachable(client, db_session, mock_http_client):
    await _create_user(db_session, "owner@example.com")
    headers = await _auth_headers(client, "owner@example.com")
    workspace_id, program_id, target_id = await _setup_workspace_program_target(client, headers)

    wf_resp = await client.post(
        f"/workspaces/{workspace_id}/workflows",
        json={
            "name": "recon-baseline",
            "git_path": "n/a",
            "current_version": "1",
            "production_webhook_url": "http://n8n-main:5678/webhook/does-not-exist",
        },
        headers=headers,
    )
    workflow_id = wf_resp.json()["id"]

    mock_http_client.post.side_effect = httpx.ConnectError("connection refused")
    resp = await client.post(
        f"/workflows/{workflow_id}/run", json={"target_id": target_id, "params": {}}, headers=headers
    )

    assert resp.status_code == 502


async def test_trigger_run_requires_program_access(client, db_session):
    await _create_user(db_session, "owner@example.com")
    owner_headers = await _auth_headers(client, "owner@example.com")
    workspace_id, program_id, target_id = await _setup_workspace_program_target(client, owner_headers)

    wf_resp = await client.post(
        f"/workspaces/{workspace_id}/workflows",
        json={
            "name": "recon-baseline",
            "git_path": "n/a",
            "current_version": "1",
            "production_webhook_url": "http://n8n-main:5678/webhook/abc123",
        },
        headers=owner_headers,
    )
    workflow_id = wf_resp.json()["id"]

    await _create_user(db_session, "stranger@example.com")
    stranger_headers = await _auth_headers(client, "stranger@example.com")

    resp = await client.post(
        f"/workflows/{workflow_id}/run",
        json={"target_id": target_id, "params": {}},
        headers=stranger_headers,
    )
    assert resp.status_code == 403


async def test_get_run_not_found(client, db_session):
    await _create_user(db_session, "owner@example.com")
    headers = await _auth_headers(client, "owner@example.com")
    resp = await client.get(f"/runs/{uuid4()}", headers=headers)
    assert resp.status_code == 404
