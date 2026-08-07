"""
Tests for /admin/tes CRUD, its authorization boundary, and the guarantee that
static_token is write-only over this API.
"""
from uuid import uuid4

from app.auth import create_access_token, hash_password
from app.models import User, Workspace, WorkspaceMembership


async def _user_with_workspace_role(db_session, email: str, role: str | None) -> dict:
    """Creates a user and, when `role` is given, a Workspace membership with
    that role. `role=None` means "authenticated but no membership anywhere" —
    the case that used to be enough to read every TES token."""
    user = User(email=email, name=email.split("@")[0], password_hash=hash_password("password"))
    db_session.add(user)
    await db_session.flush()

    if role is not None:
        workspace = Workspace(name=f"ws-{email}", slug=f"ws-{uuid4().hex[:8]}")
        db_session.add(workspace)
        await db_session.flush()
        db_session.add(WorkspaceMembership(user_id=user.id, workspace_id=workspace.id, role=role))

    await db_session.commit()
    await db_session.refresh(user)
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


async def test_crud_lifecycle_as_platform_admin(client, db_session):
    headers = await _user_with_workspace_role(db_session, "admin@example.com", "owner")

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
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["tool_name"] == "subfinder"
    assert data["health_status"] == "unknown"
    tes_id = data["id"]

    dup = await client.post(
        "/admin/tes",
        json={"tool_name": "subfinder", "base_url": "http://pd-recon:8000"},
        headers=headers,
    )
    assert dup.status_code == 409

    listing = await client.get("/admin/tes", headers=headers)
    assert listing.status_code == 200
    assert [e["id"] for e in listing.json()] == [tes_id]

    patched = await client.patch(
        f"/admin/tes/{tes_id}",
        json={"health_status": "healthy", "max_concurrency": 10},
        headers=headers,
    )
    assert patched.status_code == 200
    assert patched.json()["health_status"] == "healthy"
    assert patched.json()["max_concurrency"] == 10

    assert (await client.delete(f"/admin/tes/{tes_id}", headers=headers)).status_code == 204
    assert (await client.get(f"/admin/tes/{tes_id}", headers=headers)).status_code == 404


async def test_static_token_is_never_returned_on_read(client, db_session):
    """A caller allowed to list the registry must not thereby learn the secret
    each TES accepts — that would let them impersonate the n8n workers against
    every registered tool."""
    headers = await _user_with_workspace_role(db_session, "admin@example.com", "admin")

    created = await client.post(
        "/admin/tes",
        json={"tool_name": "theharvester", "base_url": "http://recon-runner:8000", "static_token": "s3cr3t"},
        headers=headers,
    )
    assert created.status_code == 201
    tes_id = created.json()["id"]

    for body in (
        created.json(),
        (await client.get(f"/admin/tes/{tes_id}", headers=headers)).json(),
        (await client.get("/admin/tes", headers=headers)).json()[0],
    ):
        assert "static_token" not in body
        assert "s3cr3t" not in str(body)
        assert body["has_static_token"] is True


async def test_authenticated_user_without_membership_is_denied(client, db_session):
    """The regression this suite previously encoded as *expected* behavior:
    any authenticated user could create/read/patch/delete registry entries."""
    headers = await _user_with_workspace_role(db_session, "nobody@example.com", None)

    assert (
        await client.post(
            "/admin/tes", json={"tool_name": "x", "base_url": "http://x:8000"}, headers=headers
        )
    ).status_code == 403
    assert (await client.get("/admin/tes", headers=headers)).status_code == 403
    assert (await client.get(f"/admin/tes/{uuid4()}", headers=headers)).status_code == 403
    assert (await client.delete(f"/admin/tes/{uuid4()}", headers=headers)).status_code == 403


async def test_non_admin_workspace_role_is_denied(client, db_session):
    """`billing` is a Workspace role, but not an administrative one."""
    headers = await _user_with_workspace_role(db_session, "billing@example.com", "billing")
    assert (await client.get("/admin/tes", headers=headers)).status_code == 403


async def test_unauthenticated_is_denied(client):
    assert (await client.get("/admin/tes")).status_code == 401
