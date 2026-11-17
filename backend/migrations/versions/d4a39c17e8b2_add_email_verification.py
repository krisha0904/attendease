"""Add verified email state to user accounts."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d4a39c17e8b2"
down_revision: Union[str, None] = "72f9ce10d43a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("email_verified", sa.Boolean(), server_default=sa.true(), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("users", "email_verified")
