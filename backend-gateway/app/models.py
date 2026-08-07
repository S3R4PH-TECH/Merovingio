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

Indexing policy
---------------
The initial migration (001eb5d2ef0b) created no index at all beyond the ones
Postgres derives implicitly from PRIMARY KEY and UNIQUE, which left every
single foreign-key column unindexed. The indexes declared below were added
deliberately, and each one belongs to exactly one of two classes — nothing
here is indexed merely *because* it is a foreign key:

  1. **A query the Gateway issues today filters on it.** Each such index
     carries an inline comment naming the router function that issues the
     query, so a future reader can delete the index the day the query goes
     away instead of guessing.
  2. **Postgres has to scan the column to enforce referential integrity
     when a parent row is deleted, and the child table grows without
     bound.** Deleting a single Program cascades through
     targets -> runs -> {tool_execution_jobs, assets, findings} and is
     checked against audit_log; every one of those steps is a sequential
     scan without an index. The PoC already writes ~83 asset rows per Run
     (see README.md), so `assets` is the table where this stops being
     theoretical first.

Columns deliberately left unindexed, so the omission reads as a decision
rather than an oversight:

  * FKs pointing at `users`, `workflow_definitions` and `tes_registry` —
    no code path ever deletes rows from those tables and no query filters
    by them, so an index would only cost write throughput on the hot
    /internal/tes-callback insert path (targets.created_by, runs.triggered_by,
    runs.workflow_definition_id, findings.triaged_by, audit_log.actor_user_id).
  * `workspace_memberships` / `program_memberships` / program_workflow_enablement
    lookups (see rbac.py) — already served by the leftmost prefix of the
    existing uq_workspace_membership / uq_program_membership / uq_program_workflow
    unique constraints. That includes require_platform_admin(), which adds a
    `role IN (...)` on top of `user_id`: the role filter stays a heap recheck
    on purpose, since a user belongs to a handful of workspaces and the index
    scan has already reduced the candidate set to those rows.
  * FKs on tables that stay small by construction (programs.workspace_id,
    workflow_definitions.workspace_id) — a sequential scan over a few dozen
    rows beats an index lookup and costs nothing to maintain.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Index,
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
    __table_args__ = (
        # Composite, not two single-column indexes: a Target is never read
        # by program alone. Both read paths in routers/targets.py —
        # list_targets() and _load_target_or_404() — pair the tenancy filter
        # with `deleted_at IS NULL`, because delete_target() soft-deletes so
        # that Runs/Assets/Findings keep resolving their target_id. Postgres
        # indexes NULLs in a btree, so `deleted_at IS NULL` is an index
        # condition here rather than a heap recheck.
        #
        # Kept as a plain composite instead of a partial index
        # (`WHERE deleted_at IS NULL`) on purpose: the leftmost prefix
        # program_id then *also* serves the referential-integrity scan
        # Postgres runs when a Program is deleted and the CASCADE reaches
        # this table, which a partial index could not — it excludes exactly
        # the soft-deleted rows that cascade still has to find.
        Index("ix_targets_program_id_deleted_at", "program_id", "deleted_at"),
    )

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
    # Class-2 index: `runs` grows one row per scan forever, and deleting a
    # Program CASCADEs into it. Without this, dropping one tenant means a
    # sequential scan of every Run the platform ever executed.
    target_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("targets.id"), index=True)
    program_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("programs.id", ondelete="CASCADE"), index=True
    )
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
    # Class-1 index, three callers deep: routers/internal.py n8n_callback()
    # scans every job of a Run to decide success vs. completed_with_warnings,
    # routers/workflows.py get_run() pulls the same set through
    # selectinload(Run.tool_execution_jobs), and the ondelete=CASCADE above
    # makes Postgres repeat the lookup on every Run deletion.
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), index=True)
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
    """The one table in this schema whose row count is unbounded in practice:
    routers/internal.py tes_callback() appends every asset a TES reports, with
    no dedup, and the PoC already produced ~83 rows from a single Run. All
    three foreign keys are indexed here — unlike anywhere else in this file —
    precisely because this is where a missing index turns from a slow query
    into an outage.
    """

    __tablename__ = "assets"

    id: Mapped[uuid.UUID] = _uuid_pk()
    # Class-2: tenancy column, and the CASCADE entry point when a Program is
    # deleted. Also the column every program-scoped read of the roadmap's
    # "API de leitura runs/findings/assets" (section 5, item 11) will filter on.
    program_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("programs.id", ondelete="CASCADE"), index=True
    )
    # Class-2: no ondelete here, which is worse rather than better — deleting a
    # Program cascades into `targets`, and Postgres then runs a NO ACTION
    # integrity check (`SELECT 1 FROM assets WHERE target_id = $1`) once per
    # deleted Target row against the largest table in the database.
    target_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("targets.id"), index=True)
    # Class-1: routers/workflows.py get_run() eager-loads a Run's assets via
    # selectinload(Run.assets), i.e. `WHERE assets.run_id IN (...)`. This is
    # the dashboard's hot read and today it is a full sequential scan.
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("runs.id"), index=True)
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
    # All four indexes below are class-2 (integrity scans on a table that
    # grows with every Run), since no endpoint reads findings yet — the
    # roadmap's read API is item 11 of section 5. They are cheap to carry now
    # and expensive to add later, once the table is loaded.
    program_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("programs.id", ondelete="CASCADE"), index=True
    )
    target_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("targets.id"), index=True)
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("runs.id"), index=True)
    # The nastiest of the four: assets are CASCADE-deleted with their Program,
    # so Postgres runs `SELECT 1 FROM findings WHERE asset_id = $1` once per
    # deleted asset — millions of sequential scans for a single DELETE.
    asset_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("assets.id"), nullable=True, index=True
    )
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
    # Class-2. audit.py appends a row for every scope-affecting write, so this
    # table outgrows the entities it points at. Neither FK declares an
    # ondelete, which means deleting a Workspace or Program has to scan the
    # whole audit log just to discover it must be refused — an unindexed
    # sequential scan whose only outcome is an error.
    workspace_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("workspaces.id"), nullable=True, index=True
    )
    program_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("programs.id"), nullable=True, index=True
    )
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(default=_now)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
