"""
Tests for /admin/tes CRUD endpoints and tes-callback resume_url webhook trigger.
"""
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.auth import create_access_token, hash_password
from app.models import TesRegistry, User


async def _auth_headers(db_session) -> dict:
    user = User(email="admin@example.com", name="Admin", password_hash=hash_password("password"))
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    token = create_access_token(user.id)
    return {"Authorization": f"Bearer {token}"}


async def test_create_and_list_tes_entries(client, db_session):
    headers = await _auth_headers(db_session)

    # Create TES
    resp = await client.post(
        "/admin/tes",
        json={
            "tool_name": "subfinder",
            "base_url": "http://pd-recon:8000",
            "static_token": "subfinder-token-123",
            "max_concurrency": 5,
            "timeout_seconds": 300,
        },
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["tool_name"] == "subfinder"
    assert data["base_url"] == "http://pd-recon:8000"
    assert data["health_status"] == "unknown"
    tes_id = data["id"]

    # Duplicate creation returns 409
    dup_resp = await client.post(
        "/admin/tes",
        json={"tool_name": "subfinder", "base_url": "http://pd-recon:8000"},
        headers=headers,
    )
    assert dup_resp.status_code == 409

    # List TES
    list_resp = await client.get("/admin/tes", headers=headers)
    assert list_resp.status_code == 200
    entries = list_resp.json()
    assert len(entries) == 1
    assert entries[0]["id"] == tes_id

    # Get single TES
    get_resp = await client.get(f"/admin/tes/{tes_id}", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["tool_name"] == "subfinder"

    # Patch TES
    patch_resp = await client.patch(
        f"/admin/tes/{tes_id}",
        json={"health_status": "healthy", "max_concurrency": 10},
        headers=headers,
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["health_status"] == "healthy"
    assert patch_resp.json()["max_concurrency"] == 10

    # Delete TES
    del_resp = await client.delete(f"/admin/tes/{tes_id}", headers=headers)
    assert del_resp.status_code == 204

    # Confirm deleted
    get_after_del = await client.get(f"/admin/tes/{tes_id}", headers=headers)
    assert get_after_del.status_code == 404
