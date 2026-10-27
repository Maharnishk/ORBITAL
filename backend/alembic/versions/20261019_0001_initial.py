"""Initial normalized ORBITAL schema.

Revision ID: 20261019_0001
Revises:
Create Date: 2026-10-19
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20261019_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _json_type():
    return sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def _source_kind():
    return sa.Enum(
        "honeypot",
        "netflow",
        "osint",
        "sandbox",
        "community",
        name="source_kind",
        native_enum=False,
        create_constraint=True,
        length=16,
    )


def _severity():
    return sa.Enum(
        "info",
        "low",
        "medium",
        "high",
        "critical",
        name="event_severity",
        native_enum=False,
        create_constraint=True,
        length=16,
    )


def _category():
    return sa.Enum(
        "malware-c2",
        "phishing",
        "scanning",
        "brute-force",
        "data-exfil",
        "dns-tunneling",
        "botnet",
        "vulnerability",
        name="event_category",
        native_enum=False,
        create_constraint=True,
        length=24,
    )


def _indicator_type():
    return sa.Enum(
        "ipv4",
        "domain",
        "url",
        "hash",
        "asn",
        name="event_indicator_type",
        native_enum=False,
        create_constraint=True,
        length=16,
    )


def _location_source(name: str):
    return sa.Enum(
        "resolved",
        "reported",
        "inferred",
        "unknown",
        name=name,
        native_enum=False,
        create_constraint=True,
        length=16,
    )


def _data_origin():
    return sa.Enum(
        "simulation",
        "public-intel",
        "observed",
        name="event_data_origin",
        native_enum=False,
        create_constraint=True,
        length=16,
    )


def _verification_status():
    return sa.Enum(
        "unverified",
        "under-review",
        "verified",
        "false-positive",
        name="event_verification_status",
        native_enum=False,
        create_constraint=True,
        length=24,
    )


def upgrade() -> None:
    op.create_table(
        "sources",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("kind", _source_kind(), nullable=False),
        sa.Column("reliability", sa.String(length=16), nullable=True),
        sa.Column("trust_score", sa.SmallInteger(), nullable=True),
        sa.Column("url", sa.String(length=2048), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "trust_score IS NULL OR (trust_score >= 0 AND trust_score <= 100)",
            name="ck_sources_trust_score_range",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_sources"),
        sa.UniqueConstraint("name", name="uq_sources_name"),
    )

    op.create_table(
        "threat_events",
        sa.Column("event_id", sa.String(length=64), nullable=False),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("indicator", sa.String(length=2048), nullable=False),
        sa.Column("indicator_type", _indicator_type(), nullable=False),
        sa.Column("category", _category(), nullable=False),
        sa.Column("severity", _severity(), nullable=False),
        sa.Column("source_id", sa.String(length=64), nullable=False),
        sa.Column("source_reference", sa.String(length=512), nullable=True),
        sa.Column("source_url", sa.String(length=2048), nullable=True),
        sa.Column(
            "event_timestamp", sa.DateTime(timezone=True), nullable=False
        ),
        sa.Column(
            "ingested_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("first_seen", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confidence", sa.SmallInteger(), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("location_label", sa.String(length=300), nullable=True),
        sa.Column("location_country_code", sa.String(length=2), nullable=True),
        sa.Column(
            "location_source",
            _location_source("event_location_source"),
            nullable=False,
        ),
        sa.Column("src_latitude", sa.Float(), nullable=True),
        sa.Column("src_longitude", sa.Float(), nullable=True),
        sa.Column("src_location_label", sa.String(length=300), nullable=True),
        sa.Column("src_country_code", sa.String(length=2), nullable=True),
        sa.Column(
            "src_location_source",
            _location_source("event_src_location_source"),
            nullable=True,
        ),
        sa.Column("dst_latitude", sa.Float(), nullable=True),
        sa.Column("dst_longitude", sa.Float(), nullable=True),
        sa.Column("dst_location_label", sa.String(length=300), nullable=True),
        sa.Column("dst_country_code", sa.String(length=2), nullable=True),
        sa.Column(
            "dst_location_source",
            _location_source("event_dst_location_source"),
            nullable=True,
        ),
        sa.Column("asn", sa.String(length=32), nullable=True),
        sa.Column("port", sa.Integer(), nullable=True),
        sa.Column("protocol", sa.String(length=32), nullable=True),
        sa.Column("tags", _json_type(), nullable=False),
        sa.Column("data_origin", _data_origin(), nullable=False),
        sa.Column(
            "verification_status", _verification_status(), nullable=False
        ),
        sa.Column("reporter", sa.String(length=200), nullable=True),
        sa.Column("collection_method", sa.String(length=200), nullable=True),
        sa.Column("source_metadata", _json_type(), nullable=False),
        sa.CheckConstraint(
            "confidence IS NULL OR (confidence >= 0 AND confidence <= 100)",
            name="ck_threat_events_confidence_range",
        ),
        sa.CheckConstraint(
            "port IS NULL OR (port >= 0 AND port <= 65535)",
            name="ck_threat_events_port_range",
        ),
        sa.CheckConstraint(
            "first_seen IS NULL OR last_seen IS NULL OR first_seen <= last_seen",
            name="ck_threat_events_seen_order",
        ),
        sa.CheckConstraint(
            "(latitude IS NULL AND longitude IS NULL) OR "
            "(latitude IS NOT NULL AND longitude IS NOT NULL)",
            name="ck_threat_events_primary_geo_pair",
        ),
        sa.CheckConstraint(
            "(latitude IS NULL OR (latitude >= -90 AND latitude <= 90)) AND "
            "(longitude IS NULL OR (longitude >= -180 AND longitude <= 180))",
            name="ck_threat_events_primary_geo_range",
        ),
        sa.CheckConstraint(
            "(src_latitude IS NULL AND src_longitude IS NULL) OR "
            "(src_latitude IS NOT NULL AND src_longitude IS NOT NULL)",
            name="ck_threat_events_src_geo_pair",
        ),
        sa.CheckConstraint(
            "(src_latitude IS NULL OR (src_latitude >= -90 AND src_latitude <= 90)) AND "
            "(src_longitude IS NULL OR (src_longitude >= -180 AND src_longitude <= 180))",
            name="ck_threat_events_src_geo_range",
        ),
        sa.CheckConstraint(
            "(dst_latitude IS NULL AND dst_longitude IS NULL) OR "
            "(dst_latitude IS NOT NULL AND dst_longitude IS NOT NULL)",
            name="ck_threat_events_dst_geo_pair",
        ),
        sa.CheckConstraint(
            "(dst_latitude IS NULL OR (dst_latitude >= -90 AND dst_latitude <= 90)) AND "
            "(dst_longitude IS NULL OR (dst_longitude >= -180 AND dst_longitude <= 180))",
            name="ck_threat_events_dst_geo_range",
        ),
        sa.CheckConstraint(
            "NOT (data_origin = 'simulation' AND verification_status = 'verified')",
            name="ck_threat_events_simulation_unverified",
        ),
        sa.ForeignKeyConstraint(
            ["source_id"],
            ["sources.id"],
            name="fk_threat_events_source_id_sources",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("event_id", name="pk_threat_events"),
        sa.UniqueConstraint("fingerprint", name="uq_threat_events_fingerprint"),
    )

    op.create_index(
        "ix_threat_events_event_timestamp",
        "threat_events",
        ["event_timestamp"],
    )
    op.create_index(
        "ix_threat_events_severity_timestamp",
        "threat_events",
        ["severity", "event_timestamp"],
    )
    op.create_index(
        "ix_threat_events_category_timestamp",
        "threat_events",
        ["category", "event_timestamp"],
    )
    op.create_index(
        "ix_threat_events_source_timestamp",
        "threat_events",
        ["source_id", "event_timestamp"],
    )
    op.create_index(
        "ix_threat_events_origin_timestamp",
        "threat_events",
        ["data_origin", "event_timestamp"],
    )
    op.create_index(
        "ix_threat_events_indicator",
        "threat_events",
        ["indicator_type", "indicator"],
    )


def downgrade() -> None:
    op.drop_index("ix_threat_events_indicator", table_name="threat_events")
    op.drop_index("ix_threat_events_origin_timestamp", table_name="threat_events")
    op.drop_index("ix_threat_events_source_timestamp", table_name="threat_events")
    op.drop_index("ix_threat_events_category_timestamp", table_name="threat_events")
    op.drop_index("ix_threat_events_severity_timestamp", table_name="threat_events")
    op.drop_index("ix_threat_events_event_timestamp", table_name="threat_events")
    op.drop_table("threat_events")
    op.drop_table("sources")
