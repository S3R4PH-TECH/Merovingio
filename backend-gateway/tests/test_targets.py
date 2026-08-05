"""
End-to-end tests for Workspace -> Program -> Target, RBAC and the audit
trail, driven entirely through the HTTP API (not by poking the ORM
directly), mirroring the real client flow described in
ARCHITECTURE_AND_ROADMAP.md section 5, A.2-A.5.
"""
from uuid import uuid4

from sqlalchemy import select

from app.auth import hash_password
from app.models import AuditLog, User


async def _create_user(db_session, email: str, password: str = "Password123!") -> User:
    user = User(email=email, name=email.split("@")[0], password_hash=hash_password(password))
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def _auth_headers(client, email: str, password: str = "Password123!") -> dict:
    resp = await client.post("/auth/login", json={"email": email, "password": password})
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _create_workspace_and_program(client, headers, ws_slug="acme") -> tuple[str, str]:
    ws_resp = await client.post("/workspaces", json={"name": "Acme", "slug": ws_slug}, headers=headers)
    assert ws_resp.status_code == 201, ws_resp.text
    workspace_id = ws_resp.json()["id"]

    prog_resp = await client.post(
        f"/workspaces/{workspace_id}/programs",
        json={"name": "Acme Bug Bounty", "description": "Q3 program"},
        headers=headers,
    )
    assert prog_resp.status_code == 201, prog_resp.text
    return workspace_id, prog_resp.json()["id"]


async def test_create_target_end_to_end(client, db_session):
    await _create_user(db_session, "owner@example.com")
    headers = await _auth_headers(client, "owner@example.com")
    _, program_id = await _create_workspace_and_program(client, headers)

    resp = await client.post(
        f"/programs/{program_id}/targets",
        json={
            "name": "Primary scope",
            "root_domains": ["example.com"],
            "cidrs": ["10.0.0.0/24"],
            "out_of_scope": ["internal.example.com"],
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "Primary scope"
    assert body["root_domains"] == ["example.com"]
    assert body["program_id"] == program_id


async def test_list_targets_scoped_to_program(client, db_session):
    await _create_user(db_session, "owner@example.com")
    headers = await _auth_headers(client, "owner@example.com")
    _, program_id = await _create_workspace_and_program(client, headers)

    await client.post(
        f"/programs/{program_id}/targets",
        json={"name": "T1", "root_domains": ["a.com"]},
        headers=headers,
    )
    await client.post(
        f"/programs/{program_id}/targets",
        json={"name": "T2", "root_domains": ["b.com"]},
        headers=headers,
    )

    resp = await client.get(f"/programs/{program_id}/targets", headers=headers)
    assert resp.status_code == 200
    names = {t["name"] for t in resp.json()}
    assert names == {"T1", "T2"}


async def test_patch_target_updates_scope_and_writes_audit_log(client, db_session):
    await _create_user(db_session, "owner@example.com")
    headers = await _auth_headers(client, "owner@example.com")
    _, program_id = await _create_workspace_and_program(client, headers)

    create_resp = await client.post(
        f"/programs/{program_id}/targets",
        json={"name": "T1", "root_domains": ["a.com"]},
        headers=headers,
    )
    target_id = create_resp.json()["id"]

    patch_resp = await client.patch(
        f"/targets/{target_id}",
        json={"root_domains": ["a.com", "b.com"]},
        headers=headers,
    )
    assert patch_resp.status_code == 200
    assert set(patch_resp.json()["root_domains"]) == {"a.com", "b.com"}

    result = await db_session.execute(
        select(AuditLog).where(AuditLog.resource_type == "target", AuditLog.action == "target.update")
    )
    entries = result.scalars().all()
    assert len(entries) == 1
    assert entries[0].payload["root_domains"] == ["a.com", "b.com"]


async def test_delete_target_is_soft_delete(client, db_session):
    await _create_user(db_session, "owner@example.com")
    headers = await _auth_headers(client, "owner@example.com")
    _, program_id = await _create_workspace_and_program(client, headers)

    create_resp = await client.post(
        f"/programs/{program_id}/targets",
        json={"name": "T1", "root_domains": ["a.com"]},
        headers=headers,
    )
    target_id = create_resp.json()["id"]

    del_resp = await client.delete(f"/targets/{target_id}", headers=headers)
    assert del_resp.status_code == 204

    get_resp = await client.get(f"/targets/{target_id}", headers=headers)
    assert get_resp.status_code == 404

    list_resp = await client.get(f"/programs/{program_id}/targets", headers=headers)
    assert list_resp.json() == []


async def test_scope_check_endpoint(client, db_session):
    await _create_user(db_session, "owner@example.com")
    headers = await _auth_headers(client, "owner@example.com")
    _, program_id = await _create_workspace_and_program(client, headers)

    create_resp = await client.post(
        f"/programs/{program_id}/targets",
        json={"name": "T1", "root_domains": ["example.com"], "out_of_scope": ["internal.example.com"]},
        headers=headers,
    )
    target_id = create_resp.json()["id"]

    in_scope = await client.post(
        f"/targets/{target_id}/scope-check", json={"value": "api.example.com"}, headers=headers
    )
    assert in_scope.json() == {"value": "api.example.com", "in_scope": True}

    excluded = await client.post(
        f"/targets/{target_id}/scope-check", json={"value": "internal.example.com"}, headers=headers
    )
    assert excluded.json() == {"value": "internal.example.com", "in_scope": False}

    unrelated = await client.post(
        f"/targets/{target_id}/scope-check", json={"value": "evil.com"}, headers=headers
    )
    assert unrelated.json() == {"value": "evil.com", "in_scope": False}


async def test_stranger_cannot_see_program_targets(client, db_session):
    """The core multi-tenant isolation guarantee (ARCHITECTURE_AND_ROADMAP.md
    section 5, A.4): a user with no Workspace/Program membership must not be
    able to read another program's targets, even if they know the program id."""
    await _create_user(db_session, "owner@example.com")
    owner_headers = await _auth_headers(client, "owner@example.com")
    _, program_id = await _create_workspace_and_program(client, owner_headers)

    await _create_user(db_session, "stranger@example.com")
    stranger_headers = await _auth_headers(client, "stranger@example.com")

    resp = await client.get(f"/programs/{program_id}/targets", headers=stranger_headers)
    assert resp.status_code == 403


async def test_program_viewer_cannot_create_targets(client, db_session):
    """A viewer-role member can read but not write — matches the
    operator/admin `min_role` gate on target-creating endpoints."""
    await _create_user(db_session, "owner@example.com")
    owner_headers = await _auth_headers(client, "owner@example.com")
    _, program_id = await _create_workspace_and_program(client, owner_headers)

    viewer = await _create_user(db_session, "viewer@example.com")
    add_member_resp = await client.post(
        f"/programs/{program_id}/members",
        json={"user_id": str(viewer.id), "role": "viewer"},
        headers=owner_headers,
    )
    assert add_member_resp.status_code == 201

    viewer_headers = await _auth_headers(client, "viewer@example.com")
    create_resp = await client.post(
        f"/programs/{program_id}/targets",
        json={"name": "T1", "root_domains": ["a.com"]},
        headers=viewer_headers,
    )
    assert create_resp.status_code == 403

    read_resp = await client.get(f"/programs/{program_id}/targets", headers=viewer_headers)
    assert read_resp.status_code == 200


async def test_target_not_found_returns_404(client, db_session):
    await _create_user(db_session, "owner@example.com")
    headers = await _auth_headers(client, "owner@example.com")
    resp = await client.get(f"/targets/{uuid4()}", headers=headers)
    assert resp.status_code == 404
