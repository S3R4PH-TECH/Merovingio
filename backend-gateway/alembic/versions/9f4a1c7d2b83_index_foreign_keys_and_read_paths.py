"""index foreign keys and program-scoped read paths

Revision ID: 9f4a1c7d2b83
Revises: 52bfe257d3f4
Create Date: 2026-08-07 00:00:00.000000

Why this migration exists
-------------------------
001eb5d2ef0b created all 14 tables and not a single `create_index`. The only
indexes in the database today are the ones Postgres derives implicitly from
PRIMARY KEY and UNIQUE constraints, which means **every foreign-key column in
the schema is unindexed**. That is fine at PoC scale and stops being fine the
moment `assets` grows: the PoC persisted ~83 asset rows from one Run, and a
real engagement multiplies that by every Run of every Target of every Program.

Written by hand rather than left to autogenerate, so that every index below
can name the query that pays for it.

Class 1 — an index a query issued today needs
---------------------------------------------
ix_assets_run_id
    routers/workflows.py :: get_run() eager-loads a Run's assets with
    `selectinload(Run.assets)`, which SQLAlchemy emits as
    `SELECT ... FROM assets WHERE assets.run_id IN (...)`. This is the
    dashboard's hot read and is a full sequential scan of `assets` today.

ix_tool_execution_jobs_run_id
    routers/internal.py :: n8n_callback() runs
    `SELECT ... FROM tool_execution_jobs WHERE run_id = :run_id` to reconcile
    Run status (success vs. completed_with_warnings) on every workflow
    completion. routers/workflows.py :: get_run() loads the same rows through
    `selectinload(Run.tool_execution_jobs)`. The ondelete=CASCADE on this FK
    makes Postgres repeat the same lookup whenever a Run is deleted.

ix_targets_program_id_deleted_at  (composite)
    routers/targets.py :: list_targets() filters
    `program_id = :id AND deleted_at IS NULL`, and _load_target_or_404()
    (used by get_target, update_target, delete_target and check_scope) carries
    the same `deleted_at IS NULL` half. delete_target() soft-deletes so that
    Runs/Assets/Findings never end up with a dangling target_id, so the
    tombstones accumulate in the table forever and the `deleted_at` predicate
    is never absent. Postgres stores NULLs in a btree, so `IS NULL` is an
    index condition here and not a heap recheck.

    Deliberately a plain composite and not a partial index
    (`... WHERE deleted_at IS NULL`): the leftmost prefix `program_id` then
    also serves the referential-integrity lookup Postgres performs when a
    Program is deleted and the CASCADE reaches `targets`. A partial index
    would exclude exactly the soft-deleted rows that cascade still has to find.

Class 2 — an index referential integrity needs on an unbounded table
--------------------------------------------------------------------
Deleting one Program fans out through
`targets -> runs -> {tool_execution_jobs, assets, findings}` and is checked
against `audit_log`. Each FK without `ondelete` additionally triggers a NO
ACTION verification query (`SELECT 1 FROM child WHERE fk = $1`) per deleted
parent row. Unindexed, each of those is a sequential scan, and they are
executed in a loop — deleting a tenant would take time proportional to
(rows deleted x table size).

  ix_runs_program_id, ix_runs_target_id
  ix_assets_program_id, ix_assets_target_id
  ix_findings_program_id, ix_findings_target_id, ix_findings_run_id,
  ix_findings_asset_id
  ix_audit_log_program_id, ix_audit_log_workspace_id

ix_findings_asset_id is the worst case of the group: `assets` is CASCADE-
deleted with its Program, so Postgres runs `SELECT 1 FROM findings WHERE
asset_id = $1` once per deleted asset — potentially millions of sequential
scans behind a single DELETE statement.

Not indexed, on purpose
-----------------------
* FK columns pointing at `users`, `workflow_definitions` and `tes_registry`
  (targets.created_by, runs.triggered_by, runs.workflow_definition_id,
  program_workflow_enablement.enabled_by, findings.triaged_by,
  audit_log.actor_user_id). No code path deletes rows from those tables — there
  is no user-delete or workflow-delete endpoint — and no query filters by
  them. An index there would buy nothing and would slow down the
  /internal/tes-callback insert loop, which is the highest-write path in the
  system.
* Membership lookups in app/rbac.py (`user_id AND workspace_id`,
  `user_id AND program_id`) and program_workflow_enablement — already served
  by the leftmost prefix of the existing uq_workspace_membership /
  uq_program_membership / uq_program_workflow unique constraints.
* FKs on tables that are small by construction (programs.workspace_id,
  workflow_definitions.workspace_id). A sequential scan over a few dozen rows
  is faster than an index descent and costs nothing to keep current.

Plain CREATE INDEX, not CONCURRENTLY: these tables are still small and running
inside Alembic's transaction keeps the migration atomic. Applying this against
an already-loaded production database should instead be done with
`CREATE INDEX CONCURRENTLY` outside a transaction, which Alembic cannot do
without `autocommit_block()`.

Schema drift repaired here
--------------------------
`tool_execution_jobs.resume_url` exists in app/models.py and is read and
written by routers/internal.py (tes_lease persists it, tes_callback falls back
to it to resume the n8n Wait node), but no migration ever created the column:
001eb5d2ef0b predates it and 52bfe257d3f4 only touched tes_registry. Any
database built by `alembic upgrade head` — as opposed to the test suite's
`Base.metadata.create_all` — is therefore missing it and would fail on the
first /internal/tes-lease call. tests/test_migrations.py now asserts that
migrations and models agree, so this had to be repaired for the chain to be
truthful. The add_column is guarded by an inspector check because databases
bootstrapped via create_all already have the column and must stay upgradable.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "9f4a1c7d2b83"
down_revision: Union[str, None] = "52bfe257d3f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (index_name, table_name, [columns]) — single source of truth for both
# directions, so upgrade() and downgrade() can never drift apart. Kept in
# creation order; downgrade() walks it backwards.
INDEXES: tuple[tuple[str, str, list[str]], ...] = (
    ("ix_targets_program_id_deleted_at", "targets", ["program_id", "deleted_at"]),
    ("ix_runs_program_id", "runs", ["program_id"]),
    ("ix_runs_target_id", "runs", ["target_id"]),
    ("ix_tool_execution_jobs_run_id", "tool_execution_jobs", ["run_id"]),
    ("ix_assets_program_id", "assets", ["program_id"]),
    ("ix_assets_target_id", "assets", ["target_id"]),
    ("ix_assets_run_id", "assets", ["run_id"]),
    ("ix_findings_program_id", "findings", ["program_id"]),
    ("ix_findings_target_id", "findings", ["target_id"]),
    ("ix_findings_run_id", "findings", ["run_id"]),
    ("ix_findings_asset_id", "findings", ["asset_id"]),
    ("ix_audit_log_workspace_id", "audit_log", ["workspace_id"]),
    ("ix_audit_log_program_id", "audit_log", ["program_id"]),
)


def _has_column(table: str, column: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return column in {col["name"] for col in inspector.get_columns(table)}


def upgrade() -> None:
    # Drift repair first: the column has to exist before anything downstream
    # assumes model/migration parity (see the module docstring).
    if not _has_column("tool_execution_jobs", "resume_url"):
        op.add_column(
            "tool_execution_jobs",
            sa.Column("resume_url", sa.String(length=500), nullable=True),
        )

    for name, table, columns in INDEXES:
        op.create_index(name, table, columns)


def downgrade() -> None:
    for name, table, _columns in reversed(INDEXES):
        op.drop_index(name, table_name=table)

    # Unconditional, unlike the guarded add in upgrade(): downgrading to
    # 52bfe257d3f4 means reaching the schema *that* revision describes, and it
    # has no resume_url. The guard above exists only so an already-drifted
    # database can move forward, not to make this revision's post-state
    # ambiguous.
    op.drop_column("tool_execution_jobs", "resume_url")
