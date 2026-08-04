"""Claims — bind each cited passage to the proposition it was offered for

Revision ID: 003_claims
Revises: 002_citations
Create Date: 2026-08-04 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "003_claims"
down_revision: str | None = "002_citations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "claims",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("message_id", sa.String(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["message_id"], ["messages.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_claims_message_id", "claims", ["message_id"])

    # Many-to-many: a passage can support several propositions, and a proposition usually
    # rests on several passages.
    op.create_table(
        "claim_citations",
        sa.Column("claim_id", sa.String(), nullable=False),
        sa.Column("citation_id", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("claim_id", "citation_id"),
        sa.ForeignKeyConstraint(["claim_id"], ["claims.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["citation_id"], ["citations.id"], ondelete="CASCADE"),
    )


def downgrade() -> None:
    op.drop_table("claim_citations")
    op.drop_index("ix_claims_message_id", table_name="claims")
    op.drop_table("claims")
