"""Add biometric history and attendance request guards.

Revision ID: c4218e6ab9d1
Revises: 9b1226d99005
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4218e6ab9d1"
down_revision: Union[str, None] = "9b1226d99005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("shift_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_users_shift_id_working_shifts",
            "working_shifts",
            ["shift_id"],
            ["id"],
            ondelete="SET NULL",
        )
    with op.batch_alter_table("attendance_events") as batch_op:
        batch_op.add_column(sa.Column("idempotency_key", sa.String(length=80), nullable=True))
        batch_op.create_unique_constraint(
            "uq_attendance_event_idempotency",
            ["user_id", "idempotency_key"],
        )
    op.create_table(
        "biometric_enrollments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("college_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.Enum("NOT_ENROLLED", "PENDING_APPROVAL", "APPROVED", "REJECTED", "REVOKED", name="biometricstatus"), nullable=False),
        sa.Column("consented_at", sa.DateTime(), nullable=False),
        sa.Column("reviewed_by", sa.Integer(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("review_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["college_id"], ["colleges.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_biometric_enrollments_id"), "biometric_enrollments", ["id"], unique=False)
    op.create_table(
        "liveness_challenges",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("college_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("action", sa.String(length=30), nullable=False),
        sa.Column("instruction", sa.String(length=30), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("is_used", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["college_id"], ["colleges.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index(op.f("ix_liveness_challenges_id"), "liveness_challenges", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_liveness_challenges_id"), table_name="liveness_challenges")
    op.drop_table("liveness_challenges")
    op.drop_index(op.f("ix_biometric_enrollments_id"), table_name="biometric_enrollments")
    op.drop_table("biometric_enrollments")
    with op.batch_alter_table("attendance_events") as batch_op:
        batch_op.drop_constraint("uq_attendance_event_idempotency", type_="unique")
        batch_op.drop_column("idempotency_key")
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_constraint("fk_users_shift_id_working_shifts", type_="foreignkey")
        batch_op.drop_column("shift_id")
