"""Add password authentication.

Revision ID: ef58a6d8b012
Revises: c4218e6ab9d1
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "ef58a6d8b012"
down_revision: Union[str, None] = "c4218e6ab9d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_hash", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "password_hash")
