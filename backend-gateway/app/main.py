"""
backend-gateway — the platform's Backend Gateway (ARCHITECTURE_AND_ROADMAP.md,
section 5). Implements auth, Workspace/Program tenancy, Target/Scope CRUD,
and the n8n workflow trigger / TES lease-callback / Run reconciliation flow
proven by the vertical PoC (roadmap "Próximos Passos Imediatos" #3).
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.routers import (
    auth,
    internal,
    programs,
    targets,
    tes_registry,
    workflows,
    workspaces,
)

app = FastAPI(title="backend-gateway")

app.include_router(auth.router)
app.include_router(workspaces.router)
app.include_router(programs.router)
app.include_router(targets.router)
app.include_router(workflows.router)
app.include_router(internal.router)
app.include_router(tes_registry.router)


@app.get("/healthz")
async def healthz() -> JSONResponse:
    """No auth required — used by Docker's healthcheck."""
    return JSONResponse(status_code=200, content={"status": "ok"})
