"""Add usernames for college administrators."""

from typing import Sequence, Union
import re

from alembic import op
import sqlalchemy as sa


revision: str = "f26a91c4d8e7"
down_revision: Union[str, None] = "c93f1a7d6e20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("username", sa.String(length=150), nullable=True))

    connection = op.get_bind()
    administrators = connection.execute(
        sa.text(
            """
            SELECT users.id AS user_id, colleges.code AS college_code, users.employee_id
            FROM users
            JOIN colleges ON colleges.id = users.college_id
            WHERE lower(users.role) IN ('super_admin', 'hod')
            ORDER BY users.id
            """
        )
    ).mappings().all()
    used_usernames: set[str] = set()
    for administrator in administrators:
        base_username = re.sub(
            r"[^a-z0-9._-]+",
            "-",
            f"{administrator['college_code']}.{administrator['employee_id']}".strip().lower(),
        )
        base_username = base_username.strip("._-") or f"admin.{administrator['user_id']}"
        username = base_username
        suffix_number = 0
        while username in used_usernames:
            suffix_number += 1
            suffix = f".{administrator['user_id']}.{suffix_number}"
            username = f"{base_username[:150 - len(suffix)]}{suffix}"
        used_usernames.add(username)
        connection.execute(
            sa.text("UPDATE users SET username = :username WHERE id = :user_id"),
            {"username": username, "user_id": administrator["user_id"]},
        )

    op.create_index("uq_user_username", "users", ["username"], unique=True)


def downgrade() -> None:
    op.drop_index("uq_user_username", table_name="users")
    op.drop_column("users", "username")
