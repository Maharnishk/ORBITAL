"""Enforce one event per (source, source_reference).

Revision ID: 20261027_0002
Revises: 20261019_0001
Create Date: 2026-10-27

The partial unique index applies only when `source_reference` is present.
References from different sources may collide; references from the same source
must identify a single record. The migration refuses to run if existing rows
already violate that rule so an operator can resolve them explicitly instead of
losing provenance silently.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261027_0002"
down_revision: Union[str, None] = "20261019_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDEX_NAME = "uq_threat_events_source_reference"


def upgrade() -> None:
    bind = op.get_bind()
    duplicates = bind.execute(
        sa.text(
            "SELECT source_id, source_reference, COUNT(*) AS duplicate_count "
            "FROM threat_events "
            "WHERE source_reference IS NOT NULL "
            "GROUP BY source_id, source_reference "
            "HAVING COUNT(*) > 1 "
            "LIMIT 10"
        )
    ).fetchall()
    if duplicates:
        sample = ", ".join(
            f"{row[0]}/{row[1]} ({row[2]}x)" for row in duplicates
        )
        raise RuntimeError(
            "Cannot add unique source-reference index: duplicate rows exist "
            f"for {sample}. Resolve duplicates, then rerun the migration."
        )

    op.create_index(
        INDEX_NAME,
        "threat_events",
        ["source_id", "source_reference"],
        unique=True,
        postgresql_where=sa.text("source_reference IS NOT NULL"),
        sqlite_where=sa.text("source_reference IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index(INDEX_NAME, table_name="threat_events")
