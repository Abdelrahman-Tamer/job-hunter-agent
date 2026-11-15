"""add_followup_and_expiry_fields

Revision ID: e3b79102c89f
Revises: 46264076e404
Create Date: 2026-11-15 05:42:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e3b79102c89f'
down_revision: Union[str, Sequence[str], None] = '46264076e404'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema safely checking if columns already exist."""
    from sqlalchemy import inspect
    bind = op.get_bind()
    inspector = inspect(bind)

    # 1. Update job_status_trackers table
    tracker_cols = [c["name"] for c in inspector.get_columns("job_status_trackers")]
    if "follow_up_at" not in tracker_cols:
        op.add_column('job_status_trackers', sa.Column('follow_up_at', sa.DateTime(timezone=True), nullable=True))
    if "follow_up_sent" not in tracker_cols:
        op.add_column('job_status_trackers', sa.Column('follow_up_sent', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    if "follow_up_note" not in tracker_cols:
        op.add_column('job_status_trackers', sa.Column('follow_up_note', sa.Text(), nullable=True))

    # 2. Update jobs table
    job_cols = [c["name"] for c in inspector.get_columns("jobs")]
    if "is_expired" not in job_cols:
        op.add_column('jobs', sa.Column('is_expired', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    if "last_verified_at" not in job_cols:
        op.add_column('jobs', sa.Column('last_verified_at', sa.DateTime(timezone=True), nullable=True))
    if "expiry_reason" not in job_cols:
        op.add_column('jobs', sa.Column('expiry_reason', sa.String(length=255), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('jobs', 'expiry_reason')
    op.drop_column('jobs', 'last_verified_at')
    op.drop_column('jobs', 'is_expired')
    op.drop_column('job_status_trackers', 'follow_up_note')
    op.drop_column('job_status_trackers', 'follow_up_sent')
    op.drop_column('job_status_trackers', 'follow_up_at')
