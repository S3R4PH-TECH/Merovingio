"""add runs.error and runs.error_node

Revision ID: b7e21a4c9d15
Revises: 9f4a1c7d2b83
Create Date: 2026-08-10 16:40:00.000000

Until now the platform could record *that* a Run failed but never *why*,
unless the failure happened inside a TES (tool_execution_jobs.error). The two
failure modes that never reach a TES had nowhere to go:

  * n8n aborts mid-workflow — /internal/n8n-callback accepted only a
    `status`, so the message n8n's Error Workflow already has in hand was
    discarded on arrival.
  * the Gateway cannot reach production_webhook_url at all — trigger_run()
    flipped the Run to "failed" and raised a 502, and the exception text died
    with the request.

Both are nullable and both are additive, so this is a safe online migration:
every existing row keeps a NULL error, which reads as "failed for a reason we
did not capture" — exactly what was true before.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7e21a4c9d15"
down_revision: Union[str, None] = "9f4a1c7d2b83"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("runs", sa.Column("error", sa.Text(), nullable=True))
    op.add_column("runs", sa.Column("error_node", sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column("runs", "error_node")
    op.drop_column("runs", "error")
