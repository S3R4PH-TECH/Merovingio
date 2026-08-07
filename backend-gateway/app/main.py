"""
backend-gateway — the platform's Backend Gateway (ARCHITECTURE_AND_ROADMAP.md,
section 5). Implements auth, Workspace/Program tenancy, Target/Scope CRUD,
and the n8n workflow trigger / TES lease-callback / Run reconciliation flow
proven by the vertical PoC (roadmap "Próximos Passos Imediatos" #3).
"""
from __future__ import annotations

from fastapi import FastAPI
import os

from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.routers import (
    auth,
    internal,
    listing,
    outputs,
    programs,
    targets,
    tes_registry,
    workflows,
    workspaces,
)

# Origins the dashboard is served from: :15173 is the frontend container,
# :5173 is `npm run dev`. Both are cross-origin relative to the gateway on
# :18000, so without this every browser call is blocked before it is sent —
# which is exactly how this platform behaved until now (curl and n8n never
# noticed, because neither enforces CORS).
_DEFAULT_CORS_ORIGINS = (
    "http://localhost:15173",
    "http://127.0.0.1:15173",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)


def build_cors_origins() -> list[str]:
    """Allowlist for browser access, extendable through GATEWAY_CORS_ORIGINS
    (comma separated).

    A wildcard is dropped rather than honoured: the dashboard sends an
    Authorization header on almost every request, and `allow_credentials`
    with "*" is rejected by browsers anyway. More importantly, an env typo
    must not be able to silently open every origin on a platform that can
    launch offensive tooling.
    """
    extra = os.environ.get("GATEWAY_CORS_ORIGINS", "")
    parsed = [origin.strip() for origin in extra.split(",") if origin.strip()]
    return [*_DEFAULT_CORS_ORIGINS, *(o for o in parsed if o != "*")]


app = FastAPI(title="backend-gateway")

app.add_middleware(
    CORSMiddleware,
    allow_origins=build_cors_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    # The ZIP download reads this to name the file it saves.
    expose_headers=["Content-Disposition"],
)

app.include_router(auth.router)
app.include_router(workspaces.router)
app.include_router(programs.router)
app.include_router(targets.router)
app.include_router(workflows.router)
app.include_router(outputs.router)
app.include_router(internal.router)
app.include_router(tes_registry.router)
app.include_router(listing.router)


@app.get("/healthz")
async def healthz() -> JSONResponse:
    """No auth required — used by Docker's healthcheck."""
    return JSONResponse(status_code=200, content={"status": "ok"})
