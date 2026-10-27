"""Normalized threat-intelligence sources."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, SmallInteger, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import UTCDateTime
from app.models.enums import SourceKind


def enum_column(enum_class: type, name: str, length: int = 32):  # type: ignore[no-untyped-def]
    """Portable enum column: VARCHAR + CHECK, never a PostgreSQL-only type."""
    from sqlalchemy import Enum

    return Enum(
        enum_class,
        name=name,
        native_enum=False,
        create_constraint=True,
        validate_strings=True,
        values_callable=lambda cls: [member.value for member in cls],
        length=length,
    )


if TYPE_CHECKING:
    from app.models.event import ThreatEvent


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    kind: Mapped[SourceKind] = mapped_column(
        enum_column(SourceKind, "source_kind", 16), nullable=False
    )
    reliability: Mapped[str | None] = mapped_column(String(16), nullable=True)
    trust_score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    events: Mapped[list["ThreatEvent"]] = relationship(
        back_populates="source", passive_deletes=True
    )

    __table_args__ = (
        CheckConstraint(
            "trust_score IS NULL OR (trust_score >= 0 AND trust_score <= 100)",
            name="ck_sources_trust_score_range",
        ),
        UniqueConstraint("name", name="uq_sources_name"),
    )
