"""
Tests for the read/list endpoints the dashboard needs.

Before these existed the gateway could create a workspace, a program, a
workflow definition and a finding, but could never list any of them back —
`workflow_definitions` and `findings` were written and never read. A UI
cannot offer "pick a workflow" against a write-only table.

Same convention as the rest of the suite: real Postgres, never mocked.
"""
from app.auth import hash_password
from app.models import Asset, Finding, Run, Target, User


async def _create_user(db_session, email: str, password: str = "Password123!") -> User:
    user = User(email=email, name=email.split("@")[0], password_hash=hash_password(password))
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def _auth_headers(client, email: str, password: str = "Password123!") -> dict:
    resp = await client.post("/auth/login", json={"email": email, "password": password})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _workspace(client, headers, name: str = "Acme", slug: str = "acme") -> str:
    resp = await client.post("/workspaces", json={"name": name, "slug": slug}, headers=headers)
    return resp.json()["id"]


async def _program(client, headers, workspace_id: str, name: str = "Acme BB") -> str:
    resp = await client.post(
        f"/workspaces/{workspace_id}/programs", json={"name": name}, headers=headers
    )
    return resp.json()["id"]


async def _workflow(client, headers, workspace_id: str, name: str) -> str:
    resp = await client.post(
        f"/workspaces/{workspace_id}/workflows",
        json={
            "name": name,
            "git_path": f"workflows/{name}.json",
            "current_version": "1",
            "production_webhook_url": f"http://n8n-main:5678/webhook/{name}",
        },
        headers=headers,
    )
    return resp.json()["id"]


# --------------------------------------------------------------- workspaces


async def test_list_workspaces_requires_auth(client, db_session):
    resp = await client.get("/workspaces")
    assert resp.status_code == 401


async def test_list_workspaces_returns_only_the_members_workspaces(client, db_session):
    await _create_user(db_session, "owner@example.com")
    await _create_user(db_session, "stranger@example.com")

    owner_headers = await _auth_headers(client, "owner@example.com")
    await _workspace(client, owner_headers, "Acme", "acme")

    stranger_headers = await _auth_headers(client, "stranger@example.com")
    resp = await client.get("/workspaces", headers=stranger_headers)

    assert resp.status_code == 200
    # A workspace the caller does not belong to must not leak through a list
    # endpoint just because the endpoint is new.
    assert resp.json() == []


async def test_list_workspaces_returns_the_callers_workspace(client, db_session):
    await _create_user(db_session, "owner@example.com")
    headers = await _auth_headers(client, "owner@example.com")
    await _workspace(client, headers, "Acme", "acme")

    resp = await client.get("/workspaces", headers=headers)

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["name"] == "Acme"
    assert body[0]["slug"] == "acme"


# ----------------------------------------------------------------- programs


async def test_list_programs_requires_auth(client, db_session):
    resp = await client.get("/programs")
    assert resp.status_code == 401


async def test_list_programs_returns_programs_the_caller_can_reach(client, db_session):
    await _create_user(db_session, "owner@example.com")
    headers = await _auth_headers(client, "owner@example.com")
    workspace_id = await _workspace(client, headers)
    await _program(client, headers, workspace_id, "Acme BB")

    resp = await client.get("/programs", headers=headers)

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["name"] == "Acme BB"
    assert body[0]["workspace_id"] == workspace_id


async def test_list_programs_hides_other_peoples_programs(client, db_session):
    await _create_user(db_session, "owner@example.com")
    await _create_user(db_session, "stranger@example.com")

    owner_headers = await _auth_headers(client, "owner@example.com")
    workspace_id = await _workspace(client, owner_headers)
    await _program(client, owner_headers, workspace_id, "Acme BB")

    stranger_headers = await _auth_headers(client, "stranger@example.com")
    resp = await client.get("/programs", headers=stranger_headers)

    assert resp.status_code == 200
    assert resp.json() == []


async def test_list_programs_can_be_filtered_by_workspace(client, db_session):
    await _create_user(db_session, "owner@example.com")
    headers = await _auth_headers(client, "owner@example.com")

    first = await _workspace(client, headers, "Acme", "acme")
    second = await _workspace(client, headers, "Globex", "globex")
    await _program(client, headers, first, "Acme BB")
    await _program(client, headers, second, "Globex BB")

    resp = await client.get(f"/programs?workspace_id={first}", headers=headers)

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["name"] == "Acme BB"


# ---------------------------------------------------------------- workflows


async def test_list_workflows_requires_auth(client, db_session):
    resp = await client.get("/workflows")
    assert resp.status_code == 401


async def test_list_workflows_returns_registered_definitions(client, db_session):
    await _create_user(db_session, "owner@example.com")
    headers = await _auth_headers(client, "owner@example.com")
    workspace_id = await _workspace(client, headers)
    await _workflow(client, headers, workspace_id, "recon-baseline")
    await _workflow(client, headers, workspace_id, "recon-full-chain")

    resp = await client.get("/workflows", headers=headers)

    assert resp.status_code == 200
    names = sorted(item["name"] for item in resp.json())
    assert names == ["recon-baseline", "recon-full-chain"]


async def test_list_workflows_exposes_what_the_launcher_needs(client, db_session):
    await _create_user(db_session, "owner@example.com")
    headers = await _auth_headers(client, "owner@example.com")
    workspace_id = await _workspace(client, headers)
    await _workflow(client, headers, workspace_id, "recon-baseline")

    body = (await client.get("/workflows", headers=headers)).json()[0]

    assert body["workspace_id"] == workspace_id
    assert body["git_path"] == "workflows/recon-baseline.json"
    assert body["current_version"] == "1"
    assert "id" in body


async def test_list_workflows_hides_other_workspaces(client, db_session):
    await _create_user(db_session, "owner@example.com")
    await _create_user(db_session, "stranger@example.com")

    owner_headers = await _auth_headers(client, "owner@example.com")
    workspace_id = await _workspace(client, owner_headers)
    await _workflow(client, owner_headers, workspace_id, "recon-baseline")

    stranger_headers = await _auth_headers(client, "stranger@example.com")
    resp = await client.get("/workflows", headers=stranger_headers)

    assert resp.status_code == 200
    assert resp.json() == []


async def test_list_workflows_can_be_filtered_by_workspace(client, db_session):
    await _create_user(db_session, "owner@example.com")
    headers = await _auth_headers(client, "owner@example.com")

    first = await _workspace(client, headers, "Acme", "acme")
    second = await _workspace(client, headers, "Globex", "globex")
    await _workflow(client, headers, first, "recon-baseline")
    await _workflow(client, headers, second, "content-discovery")

    body = (await client.get(f"/workflows?workspace_id={second}", headers=headers)).json()

    assert len(body) == 1
    assert body[0]["name"] == "content-discovery"


# ----------------------------------------------------------------- findings


async def _seed_finding(
    db_session, program_id, target_id, user_id, workflow_id, severity: str, title: str
) -> None:
    run = Run(
        workflow_definition_id=workflow_id,
        target_id=target_id,
        program_id=program_id,
        triggered_by=user_id,
        status="success",
        params={},
    )
    db_session.add(run)
    await db_session.flush()

    db_session.add(
        Finding(
            run_id=run.id,
            program_id=program_id,
            target_id=target_id,
            severity=severity,
            title=title,
        )
    )
    await db_session.commit()


async def test_list_findings_requires_auth(client, db_session):
    resp = await client.get("/findings")
    assert resp.status_code == 401


async def test_list_findings_returns_nothing_when_none_exist(client, db_session):
    await _create_user(db_session, "owner@example.com")
    headers = await _auth_headers(client, "owner@example.com")

    resp = await client.get("/findings", headers=headers)

    assert resp.status_code == 200
    assert resp.json() == []


async def test_list_findings_returns_severity_and_title(client, db_session):
    user = await _create_user(db_session, "owner@example.com")
    headers = await _auth_headers(client, "owner@example.com")
    workspace_id = await _workspace(client, headers)
    program_id = await _program(client, headers, workspace_id)
    workflow_id = await _workflow(client, headers, workspace_id, "recon-baseline")

    target = Target(
        program_id=program_id,
        name="Primary",
        root_domains=["example.org"],
        cidrs=[],
        out_of_scope=[],
        created_by=user.id,
    )
    db_session.add(target)
    await db_session.commit()
    await db_session.refresh(target)

    await _seed_finding(
        db_session, program_id, target.id, user.id, workflow_id, "high", "Exposed .git directory"
    )

    resp = await client.get("/findings", headers=headers)

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["severity"] == "high"
    assert body[0]["title"] == "Exposed .git directory"
    assert body[0]["status"] == "open"


async def test_list_findings_hides_other_peoples_programs(client, db_session):
    user = await _create_user(db_session, "owner@example.com")
    await _create_user(db_session, "stranger@example.com")

    owner_headers = await _auth_headers(client, "owner@example.com")
    workspace_id = await _workspace(client, owner_headers)
    program_id = await _program(client, owner_headers, workspace_id)
    workflow_id = await _workflow(client, owner_headers, workspace_id, "recon-baseline")

    target = Target(
        program_id=program_id,
        name="Primary",
        root_domains=["example.org"],
        cidrs=[],
        out_of_scope=[],
        created_by=user.id,
    )
    db_session.add(target)
    await db_session.commit()
    await db_session.refresh(target)

    await _seed_finding(
        db_session, program_id, target.id, user.id, workflow_id, "critical", "RCE"
    )

    stranger_headers = await _auth_headers(client, "stranger@example.com")
    resp = await client.get("/findings", headers=stranger_headers)

    assert resp.status_code == 200
    # A finding is the most sensitive row in the platform. It must never leak
    # to someone without access to its program.
    assert resp.json() == []


# ------------------------------------------------------- assets convenience


async def test_list_assets_requires_auth(client, db_session):
    resp = await client.get("/assets")
    assert resp.status_code == 401


async def test_list_assets_returns_discovered_surface(client, db_session):
    user = await _create_user(db_session, "owner@example.com")
    headers = await _auth_headers(client, "owner@example.com")
    workspace_id = await _workspace(client, headers)
    program_id = await _program(client, headers, workspace_id)
    workflow_id = await _workflow(client, headers, workspace_id, "recon-baseline")

    target = Target(
        program_id=program_id,
        name="Primary",
        root_domains=["example.org"],
        cidrs=[],
        out_of_scope=[],
        created_by=user.id,
    )
    db_session.add(target)
    await db_session.flush()

    run = Run(
        workflow_definition_id=workflow_id,
        target_id=target.id,
        program_id=program_id,
        triggered_by=user.id,
        status="success",
        params={},
    )
    db_session.add(run)
    await db_session.flush()

    db_session.add(
        Asset(
            run_id=run.id,
            program_id=program_id,
            target_id=target.id,
            type="subdomain",
            value="www.example.org",
            source_tool="theharvester",
        )
    )
    await db_session.commit()

    resp = await client.get("/assets", headers=headers)

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["value"] == "www.example.org"
    assert body[0]["type"] == "subdomain"
