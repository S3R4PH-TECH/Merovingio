"""
Exercises the Alembic migration chain end-to-end against a real Postgres.

conftest.py has always claimed this file existed ("Alembic itself is
exercised separately (see tests/test_migrations.py)") while it did not, so
the migrations were the one part of the schema nothing tested. That gap is
not academic: the rest of the suite builds its schema with
`Base.metadata.create_all`, which means the models are exercised on every
run and the migrations are exercised on none. A column added to models.py
without a matching revision produces a green suite and a broken deploy —
exactly what happened to `tool_execution_jobs.resume_url`, which
routers/internal.py reads and writes but which no revision ever created
(repaired in 9f4a1c7d2b83).

The load-bearing test here is therefore not "does upgrade run" but "does the
schema it produces equal Base.metadata": it is the only thing standing
between the two schema definitions this project maintains in parallel.

Runs against PLATFORM_TEST_DATABASE_URL, same throwaway database as the rest
of the suite. WARNING: these tests DROP SCHEMA public CASCADE — a migration
test needs a genuinely empty database, including no alembic_version table.
Never point PLATFORM_TEST_DATABASE_URL at a database you care about (the
autouse drop_all/create_all in conftest.py already carries that caveat; this
file only widens it from "every table" to "the whole schema").
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import AsyncIterator

import pytest
import pytest_asyncio
from alembic.config import Config
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import create_async_engine

from app.models import Base

# backend-gateway/ — alembic.ini lives here and its script_location is
# relative to it, so every alembic invocation below runs with this as cwd.
BACKEND_DIR = Path(__file__).resolve().parents[1]

# Deliberately spelled out rather than derived from Base.metadata or imported
# from the revision module. Both of those would make the test tautological:
# dropping an index from the model would silently drop it from the
# expectation too. This literal is an independent statement of "the database
# must be able to answer these lookups without a sequential scan", and the
# comment on each entry is the query that pays for it (see the docstring of
# alembic/versions/9f4a1c7d2b83_index_foreign_keys_and_read_paths.py).
EXPECTED_INDEXES: dict[str, tuple[str, tuple[str, ...]]] = {
    # routers/targets.py :: list_targets() / _load_target_or_404()
    "ix_targets_program_id_deleted_at": ("targets", ("program_id", "deleted_at")),
    # tenancy CASCADE fan-out when a Program is deleted
    "ix_runs_program_id": ("runs", ("program_id",)),
    "ix_runs_target_id": ("runs", ("target_id",)),
    # routers/internal.py :: n8n_callback(); routers/workflows.py :: get_run()
    "ix_tool_execution_jobs_run_id": ("tool_execution_jobs", ("run_id",)),
    # routers/workflows.py :: get_run() -> selectinload(Run.assets)
    "ix_assets_run_id": ("assets", ("run_id",)),
    "ix_assets_program_id": ("assets", ("program_id",)),
    "ix_assets_target_id": ("assets", ("target_id",)),
    "ix_findings_program_id": ("findings", ("program_id",)),
    "ix_findings_target_id": ("findings", ("target_id",)),
    "ix_findings_run_id": ("findings", ("run_id",)),
    "ix_findings_asset_id": ("findings", ("asset_id",)),
    "ix_audit_log_workspace_id": ("audit_log", ("workspace_id",)),
    "ix_audit_log_program_id": ("audit_log", ("program_id",)),
}


def _test_database_url() -> str:
    try:
        return os.environ["PLATFORM_TEST_DATABASE_URL"]
    except KeyError as exc:  # pragma: no cover - same contract as conftest.py
        raise RuntimeError(
            "PLATFORM_TEST_DATABASE_URL is not set — point it at a real "
            "throwaway Postgres before running this suite (see conftest.py "
            "docstring for a docker run one-liner)."
        ) from exc


def _run_alembic(*args: str) -> subprocess.CompletedProcess:
    """Invokes the real `alembic` CLI in a subprocess rather than calling
    alembic.command in-process.

    Not a stylistic choice: alembic/env.py drives migrations through
    `asyncio.run(run_migrations_online())` at module scope, and asyncio.run()
    raises when a loop is already running — which it always is inside a
    pytest-asyncio test. A subprocess is also what an operator actually runs,
    so this exercises env.py's PLATFORM_DATABASE_URL handling for real.
    """
    env = {**os.environ, "PLATFORM_DATABASE_URL": _test_database_url()}
    proc = subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0, (
        f"`alembic {' '.join(args)}` failed with exit code {proc.returncode}\n"
        f"--- stdout ---\n{proc.stdout}\n--- stderr ---\n{proc.stderr}"
    )
    return proc


@pytest_asyncio.fixture
async def empty_database() -> AsyncIterator[None]:
    """Hands each test a database with no tables at all — not even
    alembic_version.

    conftest.py's autouse _clean_schema fixture has already run create_all by
    this point, so a migration test would otherwise start against a schema
    that is fully populated and unversioned; `alembic upgrade head` would
    fail on the first CREATE TABLE. Dropping and recreating the schema is
    also the only way to clear alembic_version, which is invisible to
    Base.metadata.drop_all.

    Repeated on teardown so the next test in the session does not inherit a
    stale alembic_version row.
    """

    async def _reset() -> None:
        engine = create_async_engine(_test_database_url(), isolation_level="AUTOCOMMIT")
        async with engine.connect() as conn:
            await conn.execute(text("DROP SCHEMA public CASCADE"))
            await conn.execute(text("CREATE SCHEMA public"))
        await engine.dispose()

    await _reset()
    yield
    await _reset()


async def _autogenerate_diff() -> list:
    """What `alembic revision --autogenerate` would emit right now. An empty
    list means the migrated database and Base.metadata are the same schema."""
    engine = create_async_engine(_test_database_url())
    async with engine.connect() as conn:
        diff = await conn.run_sync(
            lambda sync_conn: compare_metadata(
                MigrationContext.configure(sync_conn), Base.metadata
            )
        )
    await engine.dispose()
    return diff


async def _reflect() -> dict:
    """Table names, and per-table index name -> ordered column list, as they
    exist in the live database."""
    engine = create_async_engine(_test_database_url())
    async with engine.connect() as conn:
        result = await conn.run_sync(
            lambda sync_conn: {
                "tables": set(inspect(sync_conn).get_table_names()),
                "indexes": {
                    table: {
                        ix["name"]: tuple(ix["column_names"])
                        for ix in inspect(sync_conn).get_indexes(table)
                    }
                    for table in inspect(sync_conn).get_table_names()
                },
            }
        )
    await engine.dispose()
    return result


def test_migration_chain_has_a_single_head() -> None:
    """Guards against two revisions claiming the same down_revision, which
    Alembic only complains about at `upgrade head` time — by which point the
    conflicting revisions are usually already merged and deployed. No
    database needed."""
    script = ScriptDirectory.from_config(Config(str(BACKEND_DIR / "alembic.ini")))
    heads = script.get_heads()
    assert len(heads) == 1, f"migration history has branched: heads={heads}"


async def test_upgrade_head_reproduces_the_models(empty_database: None) -> None:
    """The point of this whole file.

    Two definitions of the schema exist — app/models.py and the revision
    chain — and only models.py is exercised by the rest of the suite. This
    asserts they agree, by asking Alembic's own autogenerate comparator
    whether it would still have anything to write after `upgrade head`.
    Anything it reports is real drift: a column, table, constraint or index
    that exists on one side only.
    """
    _run_alembic("upgrade", "head")

    diff = await _autogenerate_diff()
    assert diff == [], (
        "schema produced by `alembic upgrade head` does not match "
        "Base.metadata; alembic autogenerate would still emit:\n  "
        + "\n  ".join(repr(entry) for entry in diff)
    )


async def test_upgrade_head_creates_the_expected_indexes(empty_database: None) -> None:
    """Every index the read paths and the CASCADE fan-out depend on must be
    present after a migration-only bootstrap, with the exact columns and in
    the exact order declared — a composite index's column order decides which
    queries it can serve at all."""
    _run_alembic("upgrade", "head")

    reflected = await _reflect()

    missing = []
    wrong_columns = []
    for name, (table, columns) in EXPECTED_INDEXES.items():
        assert table in reflected["tables"], f"table {table} missing after upgrade"
        actual = reflected["indexes"][table].get(name)
        if actual is None:
            missing.append(f"{name} on {table}({', '.join(columns)})")
        elif actual != columns:
            wrong_columns.append(f"{name}: expected {columns}, got {actual}")

    assert not missing, "indexes missing after `alembic upgrade head`:\n  " + "\n  ".join(missing)
    assert not wrong_columns, "indexes with wrong columns:\n  " + "\n  ".join(wrong_columns)


async def test_indexes_are_absent_before_the_indexing_revision(empty_database: None) -> None:
    """Pins what 9f4a1c7d2b83 is actually responsible for.

    Without this, `upgrade head` passing the index assertions above proves
    nothing about *which* revision created them — a later squash that folded
    the indexes into 001eb5d2ef0b would look identical. Stopping one revision
    short must leave every one of them absent.
    """
    _run_alembic("upgrade", "52bfe257d3f4")

    reflected = await _reflect()
    present = [
        name
        for name, (table, _cols) in EXPECTED_INDEXES.items()
        if name in reflected["indexes"].get(table, {})
    ]
    assert present == [], f"indexes exist before 9f4a1c7d2b83 ran: {present}"


async def test_downgrade_is_reversible(empty_database: None) -> None:
    """A downgrade() nobody runs rots silently. This walks the chain all the
    way down to an empty schema and back up, which catches both a downgrade
    that forgets to drop something (the second upgrade then fails on an
    'already exists' error) and one that drops something it never created."""
    _run_alembic("upgrade", "head")
    _run_alembic("downgrade", "base")

    reflected = await _reflect()
    # alembic_version survives `downgrade base` by design — it is Alembic's
    # own bookkeeping and not part of any revision.
    leftovers = reflected["tables"] - {"alembic_version"}
    assert leftovers == set(), f"`downgrade base` left tables behind: {sorted(leftovers)}"

    _run_alembic("upgrade", "head")

    diff = await _autogenerate_diff()
    assert diff == [], (
        "schema after downgrade->upgrade round trip differs from "
        "Base.metadata:\n  " + "\n  ".join(repr(entry) for entry in diff)
    )


@pytest.mark.parametrize(
    "table,column",
    [
        # Regression pin for the drift 9f4a1c7d2b83 repaired: routers/internal.py
        # tes_lease() writes this column and tes_callback() reads it to resume
        # the n8n Wait node, but no revision created it until then. A
        # migration-built database was missing it while every test passed.
        ("tool_execution_jobs", "resume_url"),
        # Same class of drift, one revision earlier (52bfe257d3f4) — included so
        # the pin covers more than a single incident.
        ("tes_registry", "static_token"),
        # b7e21a4c9d15. routers/internal.py n8n_callback() and
        # routers/workflows.py trigger_run() both write these, and the Debug
        # n8n screen renders nothing useful without them.
        ("runs", "error"),
        ("runs", "error_node"),
    ],
)
async def test_columns_the_app_reads_survive_a_migration_only_bootstrap(
    empty_database: None, table: str, column: str
) -> None:
    _run_alembic("upgrade", "head")

    engine = create_async_engine(_test_database_url())
    async with engine.connect() as conn:
        columns = await conn.run_sync(
            lambda sync_conn: {c["name"] for c in inspect(sync_conn).get_columns(table)}
        )
    await engine.dispose()

    assert column in columns, (
        f"{table}.{column} is used by the application but does not exist in a "
        "database built from migrations alone"
    )
