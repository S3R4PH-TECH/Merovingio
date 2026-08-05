# backend-gateway

The platform's Backend Gateway (see [`../ARCHITECTURE_AND_ROADMAP.md`](../ARCHITECTURE_AND_ROADMAP.md), section 5). This is the "fundação crítica" slice of the MVP: auth, Workspace → Program tenancy, and Target/Scope CRUD. Workflow trigger, TES lease/callback and Run reconciliation are **not** implemented yet — they land once n8n and a second Tool Execution Service are actually stood up (Fase v1 of the roadmap).

## What this evolves

`Pentesters-Team/mcp_servers/scope_guard.py`'s `scope.json` is a single global allow-list — one flat list of domains, no CIDRs, no per-program scoping. Three teams independently flagged this as the platform's most critical blocking dependency (see the roadmap's section 10). This service is that evolution: scope now lives in Postgres as multi-tenant `Target` rows (root domains + CIDRs + explicit exclusions, scoped to a `Program`), **not** a rewrite of `scope_guard.py` itself. `app/scope.py` imports and reuses `scope_guard.is_in_scope()` verbatim — same bridging pattern `services/recon-runner/app/scope.py` already uses — so the Gateway and every future Tool Execution Service can never diverge on what "in scope" means. CIDR matching is genuinely new logic (`scope_guard.py` has no CIDR concept), and lives entirely in this service.

## Stack

FastAPI + SQLAlchemy 2.0 (async, `asyncpg`) + Alembic, matching `recon-runner`'s FastAPI/Pydantic conventions where they apply, plus a real relational schema this service needs and `recon-runner` doesn't.

## What's implemented

- `POST /auth/login`, `GET /me` — JWT auth. No signup endpoint (same convention as `Workspace/Trinity`) — seed a user with `scripts/seed_user.py`.
- `POST /workspaces` — creates a Workspace, caller becomes `owner`.
- `POST /workspaces/{id}/programs` — creates a Program (the real multi-tenant isolation boundary — see `app/rbac.py`), caller gets an explicit `admin` ProgramMembership.
- `POST /programs/{id}/members` — grants/updates a user's role on a Program.
- `POST|GET /programs/{id}/targets`, `GET|PATCH|DELETE /targets/{id}` — Target/scope CRUD. Every write is recorded in `audit_log`. Delete is soft (Runs/Assets/Findings will reference targets by id once those land).
- `POST /targets/{id}/scope-check` — lets a caller verify whether a value would pass the same scope check a future `/internal/tes-lease` will apply, without creating a Run.

The full platform schema (`workflow_definitions`, `runs`, `tool_execution_jobs`, `assets`, `findings`, `tes_registry`, `program_workflow_enablement`) exists in the initial migration — schema only, no endpoints yet, so the next slice (n8n/TES integration) doesn't need another schema migration to get started.

## Running locally

```bash
# 1. Platform Postgres (separate from n8n's own Postgres — see roadmap, section 5, A.1)
docker run -d --name merovingio-gateway-devdb \
  -e POSTGRES_USER=gateway -e POSTGRES_PASSWORD=gateway -e POSTGRES_DB=gateway_dev \
  -p 15432:5432 postgres:16-alpine

# 2. Env
export PLATFORM_DATABASE_URL="postgresql+asyncpg://gateway:gateway@localhost:15432/gateway_dev"
export GATEWAY_JWT_SECRET="dev-secret"   # use a real secret outside local dev

# 3. Install + migrate
uv venv .venv --python 3.13
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/python -m alembic upgrade head

# 4. Seed a user (no signup endpoint in this slice)
.venv/bin/python scripts/seed_user.py --email dev@example.com --password 'Password123!'

# 5. Run
.venv/bin/uvicorn app.main:app --reload --port 18000
```

## Tests

Run against a **real** Postgres, never mocked — same convention `Workspace/Trinity`'s backend already follows.

```bash
docker run -d --name merovingio-gateway-testdb \
  -e POSTGRES_USER=gateway -e POSTGRES_PASSWORD=gateway -e POSTGRES_DB=gateway_test \
  -p 15433:5432 postgres:16-alpine

export PLATFORM_TEST_DATABASE_URL="postgresql+asyncpg://gateway:gateway@localhost:15433/gateway_test"
export GATEWAY_JWT_SECRET="test-secret"

uv pip install --python .venv/bin/python -r requirements-dev.txt
.venv/bin/python -m pytest tests/ -v
```

28 tests, all passing: auth (login/`/me`), scope logic (domain suffix-match via the real `scope_guard` import, CIDR matching, `out_of_scope` veto), and the full Workspace → Program → Target HTTP flow including RBAC denial cases (stranger can't see another program's targets, viewer role can't write) and the audit trail.

## Docker

`docker build` from the **repo root** (not this directory) — the Dockerfile needs to `COPY` `Pentesters-Team/mcp_servers/scope_guard.py`, the same custody-owned file `services/recon-runner/Dockerfile` copies in:

```bash
docker build -f Workspace/Merovingio/backend-gateway/Dockerfile -t backend-gateway .
```

## Deliberately not in this slice

- Workflow registration/trigger, `/internal/tes-lease`, `/internal/tes-callback`, Run reconciliation — need n8n and a second Tool Execution Service actually running first (see roadmap section 9, Fase v1).
- Vault-backed secrets — `GATEWAY_JWT_SECRET`/`PLATFORM_DATABASE_URL` are plain env vars for now, matching the roadmap's own recommendation to defer Vault until there's a concrete graduation trigger (multi-node, dozens of keys, rotation/audit requirements — see roadmap section 7, A.3).
- A signup endpoint — seed users via `scripts/seed_user.py`, consistent with `Workspace/Trinity`.
