"""
Tests for the /internal/* surface (n8n workflow nodes -> Gateway): auth,
tes-lease, tes-callback asset persistence, and n8n-callback reconciliation —
including the "lost callback" case the roadmap explicitly calls out
(ARCHITECTURE_AND_ROADMAP.md section 10).
"""
import os
from uuid import uuid4

from sqlalchemy import select

from app.auth import hash_password
from app.models import Asset, Program, Run, Target, TesRegistry, User, Workspace, WorkspaceMembership

os.environ.setdefault("GATEWAY_INTERNAL_TOKEN", "test-internal-token")
INTERNAL_HEADERS = {"X-Internal-Token": "test-internal-token"}


async def _seed_run(db_session) -> tuple[Run, Target]:
    user = User(email="owner@example.com", name="Owner", password_hash=hash_password("x"))
    db_session.add(user)
    await db_session.flush()

    workspace = Workspace(name="Acme", slug="acme")
    db_session.add(workspace)
    await db_session.flush()
    db_session.add(WorkspaceMembership(user_id=user.id, workspace_id=workspace.id, role="owner"))

    program = Program(workspace_id=workspace.id, name="Acme BB")
    db_session.add(program)
    await db_session.flush()

    target = Target(
        program_id=program.id,
        name="Primary",
        root_domains=["hackthissite.org"],
        created_by=user.id,
    )
    db_session.add(target)
    await db_session.flush()

    from app.models import WorkflowDefinition

    workflow = WorkflowDefinition(
        workspace_id=workspace.id,
        name="wf",
        git_path="n/a",
        current_version="1",
    )
    db_session.add(workflow)
    await db_session.flush()

    run = Run(
        workflow_definition_id=workflow.id,
        target_id=target.id,
        program_id=program.id,
        triggered_by=user.id,
        status="queued",
    )
    db_session.add(run)
    await db_session.commit()
    await db_session.refresh(run)
    return run, target


async def test_internal_routes_require_token(client):
    resp = await client.post("/internal/execution-started", json={"run_id": str(uuid4()), "execution_id": "1"})
    assert resp.status_code == 401


async def test_internal_routes_reject_wrong_token(client):
    resp = await client.post(
        "/internal/execution-started",
        json={"run_id": str(uuid4()), "execution_id": "1"},
        headers={"X-Internal-Token": "wrong"},
    )
    assert resp.status_code == 401


async def test_execution_started_updates_run(client, db_session):
    run, _ = await _seed_run(db_session)

    resp = await client.post(
        "/internal/execution-started",
        json={"run_id": str(run.id), "execution_id": "n8n-exec-123"},
        headers=INTERNAL_HEADERS,
    )
    assert resp.status_code == 200

    # The HTTP call updated the row through a *different* session (the
    # app's own, via get_db). db_session still holds the pre-update Run
    # object in its identity map from _seed_run, so re-fetch it explicitly
    # via refresh() rather than a plain re-query, which would just hand
    # back the stale cached instance (or, if expired first, trips a
    # separate SQLAlchemy-async "MissingGreenlet" pitfall on the identity-map
    # get-by-PK shortcut).
    await db_session.refresh(run)
    assert run.n8n_execution_id == "n8n-exec-123"
    assert run.status == "running"


async def test_tes_lease_returns_registered_tes_and_target_domains(client, db_session):
    run, target = await _seed_run(db_session)
    db_session.add(
        TesRegistry(tool_name="theharvester", base_url="http://recon-runner:8000", static_token="secret-tok")
    )
    await db_session.commit()

    resp = await client.post(
        "/internal/tes-lease",
        json={"tool_name": "theharvester", "run_id": str(run.id), "params": {}},
        headers=INTERNAL_HEADERS,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["tes_base_url"] == "http://recon-runner:8000"
    assert body["internal_token"] == "secret-tok"
    assert body["allowed_domains"] == ["hackthissite.org"]
    assert body["tool_execution_job_id"]


async def test_tes_lease_unknown_tool_returns_404(client, db_session):
    run, _ = await _seed_run(db_session)
    resp = await client.post(
        "/internal/tes-lease",
        json={"tool_name": "does-not-exist", "run_id": str(run.id), "params": {}},
        headers=INTERNAL_HEADERS,
    )
    assert resp.status_code == 404


async def test_tes_callback_persists_assets(client, db_session):
    run, _ = await _seed_run(db_session)
    db_session.add(TesRegistry(tool_name="theharvester", base_url="http://recon-runner:8000"))
    await db_session.commit()

    lease_resp = await client.post(
        "/internal/tes-lease",
        json={"tool_name": "theharvester", "run_id": str(run.id), "params": {}},
        headers=INTERNAL_HEADERS,
    )
    job_id = lease_resp.json()["tool_execution_job_id"]

    callback_resp = await client.post(
        "/internal/tes-callback",
        json={
            "tool_execution_job_id": job_id,
            "run_id": str(run.id),
            "status": "done",
            "assets": [{"type": "subdomain", "value": "www.hackthissite.org", "metadata": {}}],
            "raw_output": {"sources_used": ["crtsh"]},
        },
        headers=INTERNAL_HEADERS,
    )
    assert callback_resp.status_code == 200

    result = await db_session.execute(select(Asset).where(Asset.run_id == run.id))
    assets = result.scalars().all()
    assert len(assets) == 1
    assert assets[0].value == "www.hackthissite.org"
    assert assets[0].source_tool == "theharvester"


async def test_n8n_callback_marks_run_success_when_all_jobs_done(client, db_session):
    run, _ = await _seed_run(db_session)
    db_session.add(TesRegistry(tool_name="theharvester", base_url="http://recon-runner:8000"))
    await db_session.commit()

    lease_resp = await client.post(
        "/internal/tes-lease",
        json={"tool_name": "theharvester", "run_id": str(run.id), "params": {}},
        headers=INTERNAL_HEADERS,
    )
    job_id = lease_resp.json()["tool_execution_job_id"]
    await client.post(
        "/internal/tes-callback",
        json={"tool_execution_job_id": job_id, "run_id": str(run.id), "status": "done", "assets": []},
        headers=INTERNAL_HEADERS,
    )

    resp = await client.post(
        "/internal/n8n-callback",
        json={"run_id": str(run.id), "execution_id": "n8n-exec-123", "status": "success"},
        headers=INTERNAL_HEADERS,
    )
    assert resp.status_code == 200

    await db_session.refresh(run)
    assert run.status == "success"
    assert run.finished_at is not None


async def test_n8n_callback_flags_lost_tes_callback_as_completed_with_warnings(client, db_session):
    """The core reconciliation guarantee from ARCHITECTURE_AND_ROADMAP.md
    section 5, A.5: n8n reporting success does NOT get taken at face value
    if a leased ToolExecutionJob never actually reported back."""
    run, _ = await _seed_run(db_session)
    db_session.add(TesRegistry(tool_name="theharvester", base_url="http://recon-runner:8000"))
    await db_session.commit()

    # Lease a job but never call /internal/tes-callback for it.
    await client.post(
        "/internal/tes-lease",
        json={"tool_name": "theharvester", "run_id": str(run.id), "params": {}},
        headers=INTERNAL_HEADERS,
    )

    resp = await client.post(
        "/internal/n8n-callback",
        json={"run_id": str(run.id), "execution_id": "n8n-exec-123", "status": "success"},
        headers=INTERNAL_HEADERS,
    )
    assert resp.status_code == 200

    await db_session.refresh(run)
    assert run.status == "completed_with_warnings"


async def test_n8n_callback_error_marks_run_failed_but_keeps_partial_assets(client, db_session):
    run, _ = await _seed_run(db_session)
    db_session.add(TesRegistry(tool_name="theharvester", base_url="http://recon-runner:8000"))
    await db_session.commit()

    lease_resp = await client.post(
        "/internal/tes-lease",
        json={"tool_name": "theharvester", "run_id": str(run.id), "params": {}},
        headers=INTERNAL_HEADERS,
    )
    job_id = lease_resp.json()["tool_execution_job_id"]
    await client.post(
        "/internal/tes-callback",
        json={
            "tool_execution_job_id": job_id,
            "run_id": str(run.id),
            "status": "done",
            "assets": [{"type": "subdomain", "value": "www.hackthissite.org"}],
        },
        headers=INTERNAL_HEADERS,
    )

    await client.post(
        "/internal/n8n-callback",
        json={"run_id": str(run.id), "status": "error"},
        headers=INTERNAL_HEADERS,
    )

    await db_session.refresh(run)
    assert run.status == "failed"

    asset_result = await db_session.execute(select(Asset).where(Asset.run_id == run.id))
    assert len(asset_result.scalars().all()) == 1


# --- What n8n actually sends -------------------------------------------------
#
# The status vocabulary here is not hypothetical: it is what the three exports
# in workflows/ post today. `status` was Literal["success", "error"], so every
# one of the spellings below was rejected with a 422 — and the failure was
# silent in the worst direction, because the Run then simply never left
# "running" and the message n8n had already put in the request body was
# discarded by the validator before any handler saw it.


async def test_n8n_callback_accepts_the_failed_spelling_the_error_workflow_sends(
    client, db_session
):
    """Both Error Workflow nodes in workflows/ post status="failed".

    Until this was accepted, an execution could abort inside n8n and the
    platform would show the Run as still running, forever, with no reason
    recorded anywhere.
    """
    run, _ = await _seed_run(db_session)

    resp = await client.post(
        "/internal/n8n-callback",
        json={
            "run_id": str(run.id),
            "execution_id": "n8n-exec-9",
            "status": "failed",
            "error": "Cannot read properties of undefined (reading 'hosts')",
            "error_node": "Split subdomains",
        },
        headers=INTERNAL_HEADERS,
    )
    assert resp.status_code == 200

    await db_session.refresh(run)
    assert run.status == "failed"
    assert run.error == "Cannot read properties of undefined (reading 'hosts')"
    assert run.error_node == "Split subdomains"


async def test_n8n_callback_accepts_the_completed_spelling(client, db_session):
    """nmap-ffuf-theharvester's success node posts status="completed"."""
    run, _ = await _seed_run(db_session)

    resp = await client.post(
        "/internal/n8n-callback",
        json={"run_id": str(run.id), "execution_id": "n8n-exec-10", "status": "completed"},
        headers=INTERNAL_HEADERS,
    )
    assert resp.status_code == 200

    await db_session.refresh(run)
    assert run.status == "success"


async def test_n8n_callback_records_a_failure_with_no_message(client, db_session):
    """A workflow that reports only a status is still a failure worth
    recording — the debug screen tells the operator to add `error` to the
    callback, which it can only do if the Run is marked failed at all."""
    run, _ = await _seed_run(db_session)

    await client.post(
        "/internal/n8n-callback",
        json={"run_id": str(run.id), "status": "error"},
        headers=INTERNAL_HEADERS,
    )

    await db_session.refresh(run)
    assert run.status == "failed"
    assert run.error is None


async def test_n8n_callback_clears_a_previous_error_on_success(client, db_session):
    """A retried execution that now succeeds must not keep showing the
    previous attempt's error on the debug screen."""
    run, _ = await _seed_run(db_session)

    await client.post(
        "/internal/n8n-callback",
        json={"run_id": str(run.id), "status": "error", "error": "first attempt blew up"},
        headers=INTERNAL_HEADERS,
    )
    await client.post(
        "/internal/n8n-callback",
        json={"run_id": str(run.id), "status": "success"},
        headers=INTERNAL_HEADERS,
    )

    await db_session.refresh(run)
    assert run.status == "success"
    assert run.error is None
    assert run.error_node is None


async def test_n8n_callback_pairs_the_execution_id_when_the_first_node_never_did(
    client, db_session
):
    """/internal/execution-started is the normal pairing point, but a workflow
    missing that node still reports an execution_id here — and without it
    nobody can open the failing execution in the n8n editor."""
    run, _ = await _seed_run(db_session)
    assert run.n8n_execution_id is None

    await client.post(
        "/internal/n8n-callback",
        json={"run_id": str(run.id), "execution_id": "n8n-exec-11", "status": "error"},
        headers=INTERNAL_HEADERS,
    )

    await db_session.refresh(run)
    assert run.n8n_execution_id == "n8n-exec-11"


# --- Scope enforcement at lease time -----------------------------------------
#
# The Gateway used to hand out a lease without ever checking scope, leaving
# enforcement entirely to the TES. These cover the Gateway half of that
# defense in depth (ARCHITECTURE_AND_ROADMAP.md, section 5, A.3).


async def _register_tes(db_session) -> None:
    db_session.add(TesRegistry(tool_name="theharvester", base_url="http://recon-runner:8000"))
    await db_session.commit()


async def _lease(client, run, **extra) -> object:
    return await client.post(
        "/internal/tes-lease",
        json={"tool_name": "theharvester", "run_id": str(run.id), "params": {}, **extra},
        headers=INTERNAL_HEADERS,
    )


async def test_tes_lease_accepts_in_scope_target_value(client, db_session):
    run, _ = await _seed_run(db_session)
    await _register_tes(db_session)

    resp = await _lease(client, run, target_value="www.hackthissite.org")
    assert resp.status_code == 200, resp.text


async def test_tes_lease_rejects_out_of_scope_target_value(client, db_session):
    run, _ = await _seed_run(db_session)
    await _register_tes(db_session)

    resp = await _lease(client, run, target_value="google.com")
    assert resp.status_code == 403
    assert resp.json()["detail"] == "domain_out_of_scope"


async def test_tes_lease_honors_out_of_scope_veto(client, db_session):
    """A subdomain of an in-scope root that the Target explicitly excludes must
    be refused. A bare allowed_domains list cannot express this, which is why
    the veto has to be applied here and not only inside the TES."""
    run, target = await _seed_run(db_session)
    target.out_of_scope = ["admin.hackthissite.org"]
    await _register_tes(db_session)

    resp = await _lease(client, run, target_value="admin.hackthissite.org")
    assert resp.status_code == 403
    assert resp.json()["detail"] == "domain_out_of_scope"


async def test_tes_lease_fails_closed_on_unscoped_target(client, db_session):
    """The platform ships no default scope and no scope file — an empty Target
    is a misconfiguration to surface, never something to fall back from."""
    run, target = await _seed_run(db_session)
    target.root_domains = []
    target.cidrs = []
    await _register_tes(db_session)

    resp = await _lease(client, run)
    assert resp.status_code == 422
    assert resp.json()["detail"] == "scope_not_configured"
