"""
SQLAlchemy models for the platform's Postgres schema.

Mirrors the schema-level design in ARCHITECTURE_AND_ROADMAP.md (section 2
and section 5/C). This migration creates the full table set the Backend
plan calls for (workflow/run/tool_execution_job/asset/finding/tes_registry
included), but this slice ("fundação crítica") only wires up API endpoints
for auth, workspaces, programs and targets — the rest exist as schema only
until the n8n/TES integration slice lands.

Tenancy: Program, not Workspace, is the real isolation boundary — Target and
enabled Workflows belong to a Program. See A.4 of the Backend section.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    # Every `datetime` column is TIMESTAMP WITH TIME ZONE by default. We
    # always write timezone-aware UTC values (see _now() below); without
    # this, asyncpg rejects them against Postgres's plain TIMESTAMP columns
    # ("can't subtract offset-naive and offset-aware datetimes").
    type_annotation_map = {datetime: DateTime(timezone=True)}


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = _uuid_pk()
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=_now)

    workspace_memberships: Mapped[list["WorkspaceMembership"]] = relationship(back_populates="user")
    program_memberships: Mapped[list["ProgramMembership"]] = relationship(back_populates="user")


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[uuid.UUID] = _uuid_pk()
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=_now)

    programs: Mapped[list["Program"]] = relationship(back_populates="workspace")


class WorkspaceMembership(Base):
    __tablename__ = "workspace_memberships"
    __table_args__ = (UniqueConstraint("user_id", "workspace_id", name="uq_workspace_membership"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"))
    # "owner" | "admin" | "billing" — enforced at the Pydantic/API layer, not the DB,
    # to keep migrations simple (see ARCHITECTURE_AND_ROADMAP.md decisions on scope).
    role: Mapped[str] = mapped_column(String(20), nullable=False)

    user: Mapped["User"] = relationship(back_populates="workspace_memberships")


class Program(Base):
    """A bug-bounty/pentest engagement — the real multi-tenant isolation boundary."""

    __tablename__ = "programs"

    id: Mapped[uuid.UUID] = _uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=_now)

    workspace: Mapped["Workspace"] = relationship(back_populates="programs")
    targets: Mapped[list["Target"]] = relationship(back_populates="program")


class ProgramMembership(Base):
    __tablename__ = "program_memberships"
    __table_args__ = (UniqueConstraint("user_id", "program_id", name="uq_program_membership"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    program_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("programs.id", ondelete="CASCADE"))
    # "admin" | "operator" | "viewer"
    role: Mapped[str] = mapped_column(String(20), nullable=False)

    user: Mapped["User"] = relationship(back_populates="program_memberships")


class Target(Base):
    """Scope for a Program — extension of Pentesters-Team's scope_guard.

    root_domains/cidrs/out_of_scope are JSON arrays of strings. Domain
    matching reuses scope_guard.is_in_scope() verbatim (see app/scope.py);
    CIDR matching is new code specific to this table (scope_guard has no
    CIDR concept today).
    """

    __tablename__ = "targets"

    id: Mapped[uuid.UUID] = _uuid_pk()
    program_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("programs.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    root_domains: Mapped[list] = mapped_column(JSON, default=list)
    cidrs: Mapped[list] = mapped_column(JSON, default=list)
    out_of_scope: Mapped[list] = mapped_column(JSON, default=list)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(default=_now)
    updated_at: Mapped[datetime] = mapped_column(default=_now, onupdate=_now)
    deleted_at: Mapped[datetime | None] = mapped_column(nullable=True)

    program: Mapped["Program"] = relationship(back_populates="targets")


class WorkflowDefinition(Base):
    __tablename__ = "workflow_definitions"

    id: Mapped[uuid.UUID] = _uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    git_path: Mapped[str] = mapped_column(String(500), nullable=False)
    current_version: Mapped[str] = mapped_column(String(50), nullable=False)
    n8n_workflow_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    production_webhook_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=_now)


class ProgramWorkflowEnablement(Base):
    __tablename__ = "program_workflow_enablement"
    __table_args__ = (UniqueConstraint("program_id", "workflow_definition_id", name="uq_program_workflow"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    program_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("programs.id", ondelete="CASCADE"))
    workflow_definition_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workflow_definitions.id", ondelete="CASCADE")
    )
    enabled_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    enabled_at: Mapped[datetime] = mapped_column(default=_now)


class Run(Base):
    """Fonte de verdade de status de uma execução — não o ToolExecutionJob."""

    __tablename__ = "runs"

    id: Mapped[uuid.UUID] = _uuid_pk()
    workflow_definition_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workflow_definitions.id"))
    target_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("targets.id"))
    program_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("programs.id", ondelete="CASCADE"))
    triggered_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    n8n_execution_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # "queued" | "running" | "success" | "failed" | "completed_with_warnings"
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="queued")
    started_at: Mapped[datetime] = mapped_column(default=_now)
    finished_at: Mapped[datetime | None] = mapped_column(nullable=True)
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    data_versions: Mapped[dict] = mapped_column(JSON, default=dict)

    tool_execution_jobs: Mapped[list["ToolExecutionJob"]] = relationship(back_populates="run")
    assets: Mapped[list["Asset"]] = relationship(back_populates="run")


class ToolExecutionJob(Base):
    """Efêmero por design — não é a fonte de verdade (ver jobs.py do recon-runner)."""

    __tablename__ = "tool_execution_jobs"

    id: Mapped[uuid.UUID] = _uuid_pk()
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"))
    tool_name: Mapped[str] = mapped_column(String(100), nullable=False)
    tes_base_url: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="leased")
    resume_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    leased_at: Mapped[datetime] = mapped_column(default=_now)
    finished_at: Mapped[datetime | None] = mapped_column(nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    envelope_ref: Mapped[str | None] = mapped_column(String(500), nullable=True)

    run: Mapped["Run"] = relationship(back_populates="tool_execution_jobs")


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[uuid.UUID] = _uuid_pk()
    program_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("programs.id", ondelete="CASCADE"))
    target_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("targets.id"))
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("runs.id"))
    # "domain" | "subdomain" | "ip" | "url" | "cidr" | "cloud_range" | "repo"
    type: Mapped[str] = mapped_column(String(30), nullable=False)
    value: Mapped[str] = mapped_column(String(1000), nullable=False)
    source_tool: Mapped[str] = mapped_column(String(100), nullable=False)
    first_seen_at: Mapped[datetime] = mapped_column(default=_now)
    last_seen_at: Mapped[datetime] = mapped_column(default=_now, onupdate=_now)
    asset_metadata: Mapped[dict] = mapped_column(JSON, default=dict)

    run: Mapped["Run"] = relationship(back_populates="assets")


class Finding(Base):
    __tablename__ = "findings"

    id: Mapped[uuid.UUID] = _uuid_pk()
    program_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("programs.id", ondelete="CASCADE"))
    target_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("targets.id"))
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("runs.id"))
    asset_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("assets.id"), nullable=True)
    # "info" | "low" | "medium" | "high" | "critical"
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence: Mapped[dict] = mapped_column(JSON, default=dict)
    # "open" | "confirmed" | "false_positive" | "fixed" | "accepted_risk"
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="open")
    cve_refs: Mapped[list] = mapped_column(JSON, default=list)
    triaged_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=_now)
    updated_at: Mapped[datetime] = mapped_column(default=_now, onupdate=_now)


class TesRegistry(Base):
    """Fonte de verdade tool_name -> TES; workflows n8n só carregam o nome lógico."""

    __tablename__ = "tes_registry"

    id: Mapped[uuid.UUID] = _uuid_pk()
    tool_name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    base_url: Mapped[str] = mapped_column(String(500), nullable=False)
    health_status: Mapped[str] = mapped_column(String(20), nullable=False, default="unknown")
    vault_secret_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # PoC-only stand-in for the Vault-issued short-lived lease token the
    # roadmap's target design calls for (ARCHITECTURE_AND_ROADMAP.md,
    # section 10: "Vault: MVP vs. gatilho de graduação"). recon-runner today
    # only understands one static shared token (RECON_RUNNER_TOKEN), so the
    # lease response has to hand back literally that value until Vault
    # lands and TES's can validate short-lived per-lease tokens instead.
    static_token: Mapped[str | None] = mapped_column(String(500), nullable=True)
    max_concurrency: Mapped[int] = mapped_column(default=3)
    timeout_seconds: Mapped[int] = mapped_column(default=200)
    updated_at: Mapped[datetime] = mapped_column(default=_now, onupdate=_now)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[uuid.UUID] = _uuid_pk()
    actor_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    workspace_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("workspaces.id"), nullable=True)
    program_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("programs.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(default=_now)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
