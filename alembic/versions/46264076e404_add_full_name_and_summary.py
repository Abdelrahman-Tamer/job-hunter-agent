"""add_full_name_and_summary

Revision ID: 46264076e404
Revises: bbf8a4508bc8
Create Date: 2026-11-14 04:39:28.462718

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '46264076e404'
down_revision: Union[str, Sequence[str], None] = 'bbf8a4508bc8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema safely checking if columns already exist."""
    from sqlalchemy import inspect
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_cols = [c["name"] for c in inspector.get_columns("candidate_profiles")]

    if "full_name" not in existing_cols:
        op.add_column('candidate_profiles', sa.Column('full_name', sa.String(length=255), nullable=True))
    if "professional_summary" not in existing_cols:
        op.add_column('candidate_profiles', sa.Column('professional_summary', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('candidate_profiles', 'professional_summary')
    op.drop_column('candidate_profiles', 'full_name')
