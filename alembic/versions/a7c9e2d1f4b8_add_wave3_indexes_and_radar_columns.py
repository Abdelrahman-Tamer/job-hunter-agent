"""add_wave3_indexes_and_radar_columns

Revision ID: a7c9e2d1f4b8
Revises: f4a819b2c3d4
Create Date: 2026-11-25 08:55:00.000000

"""
import json
from typing import Any, Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "a7c9e2d1f4b8"
down_revision: Union[str, Sequence[str], None] = "f4a819b2c3d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _backfill_radar_columns(bind: sa.Connection) -> None:
    """Safely populate opportunity_segment and is_social_post for existing rows on SQLite and PostgreSQL."""
    rows = bind.execute(
        sa.text(
            "SELECT id, source_name, job_track, workplace_type, eligibility, raw_location, raw_payload "
            "FROM jobs"
        )
    ).fetchall()

    for row in rows:
        payload: dict[str, Any] = {}
        raw_p = row.raw_payload
        if isinstance(raw_p, dict):
            payload = raw_p
        elif isinstance(raw_p, str) and raw_p.strip():
            try:
                parsed = json.loads(raw_p)
                if isinstance(parsed, dict):
                    payload = parsed
            except (ValueError, TypeError):
                payload = {}

        s_name = (row.source_name or "").lower()
        raw_soc = payload.get("is_social_post")
        if isinstance(raw_soc, bool):
            is_social = raw_soc
        elif isinstance(raw_soc, str):
            is_social = raw_soc.strip().lower() in ("true", "1", "yes")
        else:
            is_social = ("linkedin_social" in s_name) or ("social" in s_name)

        seg = payload.get("opportunity_segment")
        if not seg:
            j_track = str(row.job_track or "")
            loc = (row.raw_location or "").lower()
            elig = str(row.eligibility or "")
            wp = str(row.workplace_type or "")
            if j_track == "FRONTEND_EGYPT" or any(k in loc for k in ("egypt", "cairo", "giza", "alexandria")):
                seg = "EGYPT"
            elif j_track == "FRONTEND_REMOTE_GCC" or (
                wp == "REMOTE" and elig in ("REMOTE_WORLDWIDE", "REMOTE_REGION_POSSIBLE")
            ):
                seg = "REMOTE_GCC_ABROAD"
            else:
                seg = "OTHER"

        bind.execute(
            sa.text(
                "UPDATE jobs SET opportunity_segment = :seg, is_social_post = :soc WHERE id = :id"
            ),
            {"seg": str(seg)[:32], "soc": bool(is_social), "id": row.id},
        )


def upgrade() -> None:
    """Add first-class radar columns, backfill rows, and create composite/partial performance indexes."""
    bind = op.get_bind()
    inspector = inspect(bind)

    job_cols = {c["name"] for c in inspector.get_columns("jobs")}
    if "opportunity_segment" not in job_cols:
        op.add_column(
            "jobs",
            sa.Column(
                "opportunity_segment",
                sa.String(length=32),
                nullable=False,
                server_default="OTHER",
            ),
        )
    if "is_social_post" not in job_cols:
        op.add_column(
            "jobs",
            sa.Column(
                "is_social_post",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
        )

    _backfill_radar_columns(bind)

    # Single-column indexes for radar columns and missing earlier-migration indexes
    op.create_index("ix_jobs_opportunity_segment", "jobs", ["opportunity_segment"], unique=False, if_not_exists=True)
    op.create_index("ix_jobs_is_social_post", "jobs", ["is_social_post"], unique=False, if_not_exists=True)
    op.create_index("ix_jobs_is_expired", "jobs", ["is_expired"], unique=False, if_not_exists=True)
    op.create_index(
        "ix_job_status_trackers_follow_up_at",
        "job_status_trackers",
        ["follow_up_at"],
        unique=False,
        if_not_exists=True,
    )

    # Composite / partial indexes (PostgreSQL uses partial predicates; SQLite creates standard composite indexes)
    op.create_index(
        "ix_jobs_active_score_seen",
        "jobs",
        ["match_score", "first_seen_at", "id"],
        unique=False,
        if_not_exists=True,
        postgresql_where=sa.text("is_active = true"),
    )
    op.create_index(
        "ix_jobs_active_track_score",
        "jobs",
        ["job_track", "match_score", "first_seen_at", "id"],
        unique=False,
        if_not_exists=True,
        postgresql_where=sa.text("is_active = true"),
    )
    op.create_index(
        "ix_jobs_segment_social_score",
        "jobs",
        ["opportunity_segment", "is_social_post", "match_score"],
        unique=False,
        if_not_exists=True,
        postgresql_where=sa.text("is_active = true"),
    )
    op.create_index(
        "ix_jobs_expiry_scan",
        "jobs",
        ["last_verified_at", "first_seen_at"],
        unique=False,
        if_not_exists=True,
        postgresql_where=sa.text("is_active = true AND is_expired = false"),
    )
    op.create_index(
        "ix_trackers_status_updated",
        "job_status_trackers",
        ["status", "updated_at"],
        unique=False,
        if_not_exists=True,
    )
    op.create_index(
        "ix_daily_runs_started_at",
        "daily_runs",
        ["started_at"],
        unique=False,
        if_not_exists=True,
    )


def downgrade() -> None:
    """Drop Wave 3 indexes and columns cleanly."""
    op.drop_index("ix_daily_runs_started_at", table_name="daily_runs", if_exists=True)
    op.drop_index("ix_trackers_status_updated", table_name="job_status_trackers", if_exists=True)
    op.drop_index("ix_jobs_expiry_scan", table_name="jobs", if_exists=True)
    op.drop_index("ix_jobs_segment_social_score", table_name="jobs", if_exists=True)
    op.drop_index("ix_jobs_active_track_score", table_name="jobs", if_exists=True)
    op.drop_index("ix_jobs_active_score_seen", table_name="jobs", if_exists=True)
    op.drop_index("ix_job_status_trackers_follow_up_at", table_name="job_status_trackers", if_exists=True)
    op.drop_index("ix_jobs_is_expired", table_name="jobs", if_exists=True)
    op.drop_index("ix_jobs_is_social_post", table_name="jobs", if_exists=True)
    op.drop_index("ix_jobs_opportunity_segment", table_name="jobs", if_exists=True)

    bind = op.get_bind()
    inspector = inspect(bind)
    job_cols = {c["name"] for c in inspector.get_columns("jobs")}
    if "is_social_post" in job_cols:
        op.drop_column("jobs", "is_social_post")
    if "opportunity_segment" in job_cols:
        op.drop_column("jobs", "opportunity_segment")
