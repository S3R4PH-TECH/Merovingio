# Merovíngio

Local, self-hosted equivalent of Trickest (offensive-security automation/recon platform). Full analysis, architecture decisions, and roadmap: [`ARCHITECTURE_AND_ROADMAP.md`](ARCHITECTURE_AND_ROADMAP.md).

## Escopo de uso (decisão do dono do projeto, 2026-08-05)

- **Ferramenta interna, não SaaS**: disponibilizada em `localhost` para a equipe de **purple team**, não exposta a terceiros. Isso resolve a ressalva de licenciamento do n8n (Sustainable Use License) levantada no roadmap — só se torna relevante se algum dia isso mudar para revenda/hospedagem multi-tenant externa.
- **Segredos via `.env`/Docker Compose `secrets`**, não Vault — decisão explícita de não graduar para Vault por enquanto (revisitar só se surgir um gatilho concreto: multi-nó, dezenas de chaves, necessidade de rotação/auditoria — ver `ARCHITECTURE_AND_ROADMAP.md` seção 7).
- **Nome do projeto**: Merovíngio.

## Status

- **"Fundação crítica" (Backend Gateway core)** — done. See [`backend-gateway/`](backend-gateway/): scope evolution (multi-Target/CIDR reusing `scope_guard.is_in_scope()`), full platform Postgres schema, JWT auth, Workspace→Program→Target CRUD with RBAC and audit log. 42 tests passing against real Postgres.
- **Vertical PoC (n8n ↔ Gateway ↔ TES lease/callback pattern)** — done, proven end-to-end against the real stack (see below).
- **Not yet built**: additional Tool Execution Services beyond `recon-runner`, the Frontend, Data pipelines (wordlists/resolvers/CVE), Vault, Kubernetes. See the roadmap's Fase v1/v2.

## The vertical PoC

Validates the core architectural decision (`ARCHITECTURE_AND_ROADMAP.md`, section 3): n8n never executes offensive tools directly; every tool sits behind a Tool Execution Service (TES) that n8n calls over HTTP after leasing it from the Gateway, and the Gateway is the source of truth for Run/Asset state — not n8n, not the TES.

**Proven for real**, not simulated: a live theHarvester scan against `hackthissite.org`, run through the actual `recon-runner` service (already existing in `Pentesters-Team/services/recon-runner/`, unmodified) via a real n8n workflow, ending in **83 discovered subdomains persisted as `Asset` rows** and the `Run` reconciled to `status: success`.

Flow: `POST /workflows/{id}/run` (Gateway) → n8n production webhook → `Execution Started` → `TES Lease` (Gateway resolves `theharvester` → `recon-runner`'s address + token) → `Call recon-runner` (n8n calls the TES directly, per the custody rule) → `Wait` + `Poll Job` → branch on done/error → `TES Callback` (persists assets in Postgres) → `N8n Callback` (reconciles `Run` status). The full node graph is in [`workflows/recon-baseline.json`](workflows/recon-baseline.json) (exported from the running n8n instance).

### Two real things this PoC surfaced (both already fixed in the code, not just noted)

1. **n8n's HTTP Request node fails to parse empty `204` response bodies as JSON** — a real interoperability gotcha, not a hypothetical. Fixed by having the fire-and-forget `/internal/*` endpoints (`execution-started`, `tes-callback`, `n8n-callback`) return `200 {}` instead of `204`, which is friendlier to any HTTP client, not just n8n's default node config.
2. **A fixed 30-second wait before polling the TES was too tight** — the first real run timed out (`recon-runner` was still mid-scan against slow OSINT sources) and the `Run` correctly reconciled to `completed_with_warnings`/`failed` rather than silently reporting success — exactly the "lost callback" guard the architecture doc calls for. This is precisely why DevOps's plan (roadmap section 7, item #7) calls for migrating from fixed-wait polling to an async webhook callback from the TES before v1 — this PoC's 60-second fixed wait is a deliberate, documented simplification for proving the pattern, not the production design.

`Pentesters-Team/tools/theHarvester/` had to be vendored in during this PoC (it was an empty placeholder in this checkout — `recon-runner`'s Docker build had never actually succeeded here before). It's now a real git clone of `laramies/theHarvester`.

## Running it

```bash
# One-time: the external network Pentesters-Team's recon-runner and this
# stack both join (create once, never recreate — see docker-compose.yml).
docker network create recon_net

# Bring up recon-runner (Pentesters-Team owns this compose file/service)
cd "../../Pentesters-Team" && docker compose up -d --build recon-runner

# Bring up n8n (queue mode) + the platform Postgres + the Gateway
cd "../Workspace/Merovingio" && docker compose up -d --build

# Run the Gateway's DB migrations (one-off, against platform-postgres)
docker exec -e PLATFORM_DATABASE_URL="postgresql+asyncpg://gateway:gateway_dev_password@platform-postgres:5432/gateway" \
  merovingio-backend-gateway python -m alembic upgrade head

# Seed a user (no signup endpoint — see backend-gateway/README.md)
docker exec -e PLATFORM_DATABASE_URL="postgresql+asyncpg://gateway:gateway_dev_password@platform-postgres:5432/gateway" \
  -e GATEWAY_JWT_SECRET="dev-only-jwt-secret-change-me" \
  merovingio-backend-gateway python scripts/seed_user.py --email dev@example.com --password 'Password123!'
```

Import and activate `workflows/recon-baseline.json` in n8n (`http://localhost:15678`, or via `n8n import:workflow`/`n8n update:workflow --active=true` in the `merovingio-n8n-main` container — restart the container after activating, that's an n8n quirk, not ours), register a `TesRegistry` row pointing `theharvester` at `http://recon-runner:8000` with the same token as `Pentesters-Team/.env`'s `RECON_RUNNER_TOKEN`, create a Workspace/Program/Target via the Gateway API, register the workflow (`POST /workspaces/{id}/workflows` with the webhook's production URL), then `POST /workflows/{id}/run`.

**Ports exposed to the host are a PoC convenience only** (`15678` n8n editor, `18000` Gateway) — production puts both behind the Gateway/reverse-proxy only, per the roadmap's custody rule (n8n's editor/API is never exposed directly).

## Layout

- [`ARCHITECTURE_AND_ROADMAP.md`](ARCHITECTURE_AND_ROADMAP.md) — the full multi-team analysis and MVP→v1→v2 roadmap.
- [`backend-gateway/`](backend-gateway/) — the platform's Backend Gateway (FastAPI + SQLAlchemy/Alembic).
- [`workflows/`](workflows/) — n8n workflow definitions, versioned as exported JSON (per the roadmap's recommendation to treat them as code).
- [`docker-compose.yml`](docker-compose.yml) — the vertical-PoC stack (n8n queue mode, platform Postgres, Gateway). Not yet the hardened 3-network production skeleton from the roadmap's DevOps section — that's Fase v1.
