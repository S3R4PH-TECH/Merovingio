# backend-gateway
#
# NOTE: this Dockerfile expects the build context to be the repo root
# ("S3R4PH TECH", not backend-gateway/), because it needs to COPY
# Pentesters-Team/mcp_servers/scope_guard.py — the same custody-owned
# module services/recon-runner/Dockerfile copies in, for the same reason
# (app/scope.py imports it rather than reimplementing the match algorithm;
# see app/scope.py's docstring). Mirrors recon-runner/Dockerfile's
# conventions (digest-pinned base, non-root user, uv-based install) for
# consistency across the platform's services.
FROM python:3.13-slim-trixie@sha256:bf503bb2243c5aad0aa951544dd60d165f992646441d35dea90893703fc26251

LABEL maintainer="Merovíngio / Dev-Team"

RUN useradd -m -u 1000 -s /bin/bash gateway

RUN apt-get update && apt-get upgrade -yqq && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY Workspace/Merovingio/backend-gateway/requirements.txt /app/requirements.txt
RUN --mount=from=ghcr.io/astral-sh/uv,source=/uv,target=/bin/uv \
    uv pip install --system --no-cache -r /app/requirements.txt

COPY Workspace/Merovingio/backend-gateway/app /app/app
COPY Workspace/Merovingio/backend-gateway/alembic /app/alembic
COPY Workspace/Merovingio/backend-gateway/alembic.ini /app/alembic.ini
COPY Workspace/Merovingio/backend-gateway/scripts /app/scripts

# scope_guard.py — never vendored/copied by value, always the real module
# (see app/scope.py: "scope_guard.py itself is not modified by this change").
COPY Pentesters-Team/mcp_servers/scope_guard.py /app/mcp_servers/scope_guard.py
ENV MCP_SERVERS_DIR=/app/mcp_servers

RUN chown -R gateway:gateway /app

USER gateway

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
