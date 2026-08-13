"""add users.avatar_url

Revision ID: c4d80f31ae67
Revises: b7e21a4c9d15
Create Date: 2026-08-13 11:20:00.000000

The profile screen shows a photo, and there was nowhere to keep one: `users`
held an email, a name and a hash and nothing else about the person.

A URL rather than bytes. The gateway serves no user uploads and the platform
has no object store — outputs.py streams files the TES wrote to a mounted
volume, which is a different thing entirely — so a BYTEA column would oblige
this service to grow an upload endpoint, a MIME allowlist and a static route
before a single avatar could be displayed. Text rather than String(n) because
the column also holds `data:image/…;base64,…` URIs, which is how picking a
file from disk works without that upload endpoint. A NULL means "no photo",
which the frontend renders as the user's initials.

Additive and nullable, so it is safe online: every existing row keeps NULL.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4d80f31ae67"
down_revision: Union[str, None] = "b7e21a4c9d15"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar_url", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "avatar_url")
