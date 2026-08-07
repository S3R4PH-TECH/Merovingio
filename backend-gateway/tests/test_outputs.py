"""
Tests for outputs API (GET /runs/{id}/hosts, GET /runs/{id}/hosts/{host}/text, GET /runs/{id}/download-zip).
"""
import io
import zipfile
from uuid import uuid4
import pytest
import pytest_asyncio

from app.auth import hash_password
from app.models import Asset, Run, User
from app.main import app


async def _create_user(db_session, email: str, password: str = "Password123!") -> User:
    user = User(email=email, name=email.split("@")[0], password_hash=hash_password(password))
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def _auth_headers(client, email: str, password: str = "Password123!") -> dict:
    resp = await client.post("/auth/login", json={"email": email, "password": password})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _setup_run_with_assets(client, db_session, headers) -> tuple[str, str]:
    ws_resp = await client.post("/workspaces", json={"name": "Acme", "slug": "acme"}, headers=headers)
    workspace_id = ws_resp.json()["id"]

    prog_resp = await client.post(f"/workspaces/{workspace_id}/programs", json={"name": "Acme BB"}, headers=headers)
    program_id = prog_resp.json()["id"]

    target_resp = await client.post(
        f"/programs/{program_id}/targets",
        json={"name": "Primary", "root_domains": ["example.com"]},
        headers=headers,
    )
    target_id = target_resp.json()["id"]

    wf_resp = await client.post(
        f"/workspaces/{workspace_id}/workflows",
        json={
            "name": "recon-full-chain",
            "git_path": "n/a",
            "current_version": "1",
            "production_webhook_url": "http://n8n-main:5678/webhook/abc123",
        },
        headers=headers,
    )
    workflow_id = wf_resp.json()["id"]

    user_res = await db_session.execute(User.__table__.select())
    user_id = user_res.first()[0]

    run = Run(
        workflow_definition_id=workflow_id,
        target_id=target_id,
        program_id=program_id,
        triggered_by=user_id,
        status="success",
    )
    db_session.add(run)
    await db_session.commit()
    await db_session.refresh(run)

    # Add assets for two different hosts
    asset1 = Asset(
        program_id=program_id,
        target_id=target_id,
        run_id=run.id,
        type="domain",
        value="example.com",
        source_tool="pd-recon",
    )
    asset2 = Asset(
        program_id=program_id,
        target_id=target_id,
        run_id=run.id,
        type="url",
        value="http://example.com:80",
        source_tool="net-scan",
        asset_metadata={"port": 80, "protocol": "tcp"},
    )
    asset3 = Asset(
        program_id=program_id,
        target_id=target_id,
        run_id=run.id,
        type="url",
        value="https://api.example.com:443",
        source_tool="pd-scan",
        asset_metadata={"status": 200},
    )
    db_session.add_all([asset1, asset2, asset3])
    await db_session.commit()

    return str(run.id), program_id


async def test_get_run_hosts(client, db_session):
    await _create_user(db_session, "owner@example.com")
    headers = await _auth_headers(client, "owner@example.com")
    run_id, _ = await _setup_run_with_assets(client, db_session, headers)

    resp = await client.get(f"/runs/{run_id}/hosts", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["run_id"] == run_id
    assert data["total_hosts"] == 2
    host_names = [h["host"] for h in data["hosts"]]
    assert "example.com" in host_names
    assert "api.example.com" in host_names


async def test_get_host_output_text(client, db_session):
    await _create_user(db_session, "owner@example.com")
    headers = await _auth_headers(client, "owner@example.com")
    run_id, _ = await _setup_run_with_assets(client, db_session, headers)

    resp = await client.get(f"/runs/{run_id}/hosts/example.com/text", headers=headers)
    assert resp.status_code == 200, resp.text
    assert "text/plain" in resp.headers["content-type"]
    text = resp.text
    assert "MEROVINGIO SECURITY TEST REPORT" in text
    assert "Host / Target: example.com" in text
    assert "pd-recon" in text
    assert "net-scan" in text


async def test_download_run_zip(client, db_session):
    await _create_user(db_session, "owner@example.com")
    headers = await _auth_headers(client, "owner@example.com")
    run_id, _ = await _setup_run_with_assets(client, db_session, headers)

    resp = await client.get(f"/runs/{run_id}/download-zip", headers=headers)
    assert resp.status_code == 200, resp.text
    assert "application/zip" in resp.headers["content-type"]

    # Verify zip content
    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    file_list = zf.namelist()
    assert "00_RUN_SUMMARY.txt" in file_list
    assert "example.com_output.txt" in file_list
    assert "api.example.com_output.txt" in file_list

    example_txt = zf.read("example.com_output.txt").decode("utf-8")
    assert "Host / Target: example.com" in example_txt


async def test_outputs_unauthorized_user(client, db_session):
    await _create_user(db_session, "owner@example.com")
    owner_headers = await _auth_headers(client, "owner@example.com")
    run_id, _ = await _setup_run_with_assets(client, db_session, owner_headers)

    await _create_user(db_session, "stranger@example.com")
    stranger_headers = await _auth_headers(client, "stranger@example.com")

    resp1 = await client.get(f"/runs/{run_id}/hosts", headers=stranger_headers)
    assert resp1.status_code == 403

    resp2 = await client.get(f"/runs/{run_id}/hosts/example.com/text", headers=stranger_headers)
    assert resp2.status_code == 403

    resp3 = await client.get(f"/runs/{run_id}/download-zip", headers=stranger_headers)
    assert resp3.status_code == 403
