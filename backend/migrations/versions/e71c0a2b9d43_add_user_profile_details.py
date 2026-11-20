"""Add user profile details.

Revision ID: e71c0a2b9d43
Revises: a1b2c3d4e5f6
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e71c0a2b9d43"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    existing_columns = {
        column["name"] for column in sa.inspect(op.get_bind()).get_columns("users")
    }
    profile_columns = (
        sa.Column("gender", sa.String(length=20), nullable=True),
        sa.Column("qualification", sa.String(length=255), nullable=True),
        sa.Column("specialization", sa.String(length=255), nullable=True),
        sa.Column("experience_years", sa.Float(), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
    )
    for column in profile_columns:
        if column.name not in existing_columns:
            op.add_column("users", column)


def downgrade() -> None:
    op.drop_column("users", "address")
    op.drop_column("users", "experience_years")
    op.drop_column("users", "specialization")
    op.drop_column("users", "qualification")
    op.drop_column("users", "gender")
