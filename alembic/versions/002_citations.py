"""Citations — verified evidence replaces the sources_cited count

Revision ID: 002_citations
Revises: 001_initial
Create Date: 2026-08-03 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "002_citations"
down_revision: str | None = "001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "citations",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("message_id", sa.String(), nullable=False),
        sa.Column("document_id", sa.String(), nullable=True),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("quote", sa.Text(), nullable=False),
        sa.Column("page", sa.Integer(), nullable=True),
        sa.Column("verified", sa.Boolean(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["message_id"], ["messages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_citations_message_id", "citations", ["message_id"])

    # The count it replaces was derived from a regex over the model's own reply, so there is
    # nothing here worth migrating forward.
    op.drop_column("messages", "sources_cited")


def downgrade() -> None:
    op.add_column(
        "messages",
        sa.Column("sources_cited", sa.Integer(), server_default="0", nullable=False),
    )
    op.drop_index("ix_citations_message_id", table_name="citations")
    op.drop_table("citations")
