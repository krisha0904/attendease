"""Link separate admin credentials to admin users.

Revision ID: c62d8a4f0e71
Revises: e71c0a2b9d43
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c62d8a4f0e71"
down_revision: Union[str, None] = "e71c0a2b9d43"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ADMIN_ROLES = ("super_admin", "college_admin", "hod", "attendance_manager", "read_only_admin")


def _inspector():
    return sa.inspect(op.get_bind())


def _has_unique_index(table_name: str, column_name: str) -> bool:
    inspector = _inspector()
    return any(
        index.get("unique") and index.get("column_names") == [column_name]
        for index in inspector.get_indexes(table_name)
    ) or any(
        constraint.get("column_names") == [column_name]
        for constraint in inspector.get_unique_constraints(table_name)
    )


def upgrade() -> None:
    connection = op.get_bind()
    columns = {column["name"] for column in _inspector().get_columns("admin_users")}
    if "user_id" not in columns:
        op.add_column("admin_users", sa.Column("user_id", sa.Integer(), nullable=True))

    has_non_unique_college_index = any(
        not index.get("unique") and index.get("column_names") == ["college_id"]
        for index in _inspector().get_indexes("admin_users")
    )
    if not has_non_unique_college_index:
        op.create_index("ix_admin_users_college_id", "admin_users", ["college_id"])

    college_unique_constraints = [
        constraint
        for constraint in _inspector().get_unique_constraints("admin_users")
        if constraint.get("column_names") == ["college_id"]
    ]
    for constraint in college_unique_constraints:
        if constraint.get("name"):
            with op.batch_alter_table("admin_users") as batch:
                batch.drop_constraint(constraint["name"], type_="unique")
        else:
            with op.batch_alter_table(
                "admin_users",
                naming_convention={"uq": "uq_%(table_name)s_%(column_0_name)s"},
            ) as batch:
                batch.drop_constraint("uq_admin_users_college_id", type_="unique")

    college_unique_indexes = [
        index
        for index in _inspector().get_indexes("admin_users")
        if index.get("unique")
        and index.get("column_names") == ["college_id"]
        and not index.get("duplicates_constraint")
    ]
    for index in college_unique_indexes:
        if not index.get("name"):
            raise RuntimeError("Cannot safely remove the unnamed admin_users.college_id unique index.")
        op.drop_index(index["name"], table_name="admin_users")

    admin_accounts = connection.execute(
        sa.text("SELECT id, college_id, username, user_id FROM admin_users ORDER BY id")
    ).mappings().all()
    for account in admin_accounts:
        if account["user_id"] is not None:
            continue
        candidates = connection.execute(
            sa.text(
                """
                SELECT id, username, role
                FROM users
                WHERE college_id = :college_id
                  AND lower(role) IN :roles
                ORDER BY id
                """
            ).bindparams(sa.bindparam("roles", expanding=True)),
            {"college_id": account["college_id"], "roles": ADMIN_ROLES},
        ).mappings().all()
        username_matches = [
            user for user in candidates
            if user["username"] and user["username"].lower() == account["username"].lower()
        ]
        super_admins = [user for user in candidates if user["role"].lower() == "super_admin"]
        selected = (
            username_matches[0] if len(username_matches) == 1
            else super_admins[0] if len(super_admins) == 1
            else candidates[0] if len(candidates) == 1
            else None
        )
        if selected is None:
            raise RuntimeError(
                f"Cannot link admin_users.id={account['id']} to exactly one administrator in its college."
            )
        connection.execute(
            sa.text("UPDATE admin_users SET user_id = :user_id WHERE id = :admin_id"),
            {"user_id": selected["id"], "admin_id": account["id"]},
        )

    existing_accounts = connection.execute(
        sa.text("SELECT user_id, username FROM admin_users")
    ).mappings().all()
    linked_user_ids = {account["user_id"] for account in existing_accounts if account["user_id"] is not None}
    usernames = {
        account["username"].lower(): account["user_id"]
        for account in existing_accounts
    }
    users = connection.execute(
        sa.text(
            """
            SELECT id, college_id, full_name, username, password_hash, is_active
            FROM users
            WHERE lower(role) IN :roles
              AND username IS NOT NULL AND username <> ''
              AND password_hash IS NOT NULL AND password_hash <> ''
            ORDER BY id
            """
        ).bindparams(sa.bindparam("roles", expanding=True)),
        {"roles": ADMIN_ROLES},
    ).mappings().all()
    for user in users:
        if user["id"] in linked_user_ids:
            continue
        normalized_username = user["username"].lower()
        if normalized_username in usernames:
            raise RuntimeError(
                f"Admin username '{user['username']}' is already assigned to a different admin account."
            )
        connection.execute(
            sa.text(
                """
                INSERT INTO admin_users
                    (college_id, user_id, username, password_hash, full_name, is_active, created_at, updated_at)
                VALUES
                    (:college_id, :user_id, :username, :password_hash, :full_name, :is_active, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """
            ),
            {
                "college_id": user["college_id"],
                "user_id": user["id"],
                "username": user["username"],
                "password_hash": user["password_hash"],
                "full_name": user["full_name"],
                "is_active": user["is_active"],
            },
        )
        linked_user_ids.add(user["id"])
        usernames[normalized_username] = user["id"]

    if connection.execute(
        sa.text("SELECT id FROM admin_users WHERE user_id IS NULL LIMIT 1")
    ).first():
        raise RuntimeError("Every admin_users credential must be linked to an admin in users.")

    foreign_keys = _inspector().get_foreign_keys("admin_users")
    if not any(fk.get("constrained_columns") == ["user_id"] for fk in foreign_keys):
        with op.batch_alter_table("admin_users") as batch:
            batch.create_foreign_key(
                "fk_admin_users_user_id_users",
                "users",
                ["user_id"],
                ["id"],
                ondelete="CASCADE",
            )
    if not _has_unique_index("admin_users", "user_id"):
        op.create_index("uq_admin_users_user_id", "admin_users", ["user_id"], unique=True)
    if _inspector().get_columns("admin_users"):
        with op.batch_alter_table("admin_users") as batch:
            batch.alter_column("user_id", existing_type=sa.Integer(), nullable=False)


def downgrade() -> None:
    raise RuntimeError(
        "This migration may add multiple admin credentials per college and cannot be downgraded losslessly."
    )
