"""add_job_track_column

Revision ID: f4a819b2c3d4
Revises: e3b79102c89f
Create Date: 2026-11-17 09:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f4a819b2c3d4'
down_revision: Union[str, Sequence[str], None] = 'e3b79102c89f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema safely checking if column already exists."""
    from sqlalchemy import inspect
    bind = op.get_bind()
    inspector = inspect(bind)

    job_cols = [c["name"] for c in inspector.get_columns("jobs")]
    if "job_track" not in job_cols:
        op.add_column(
            'jobs',
            sa.Column(
                'job_track',
                sa.String(length=50),
                nullable=False,
                server_default='OTHER',
            ),
        )
        try:
            op.create_index(op.f('ix_jobs_job_track'), 'jobs', ['job_track'], unique=False)
        except Exception:
            pass


def downgrade() -> None:
    """Downgrade schema."""
    try:
        op.drop_index(op.f('ix_jobs_job_track'), table_name='jobs')
    except Exception:
        pass
    op.drop_column('jobs', 'job_track')
