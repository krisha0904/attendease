"""Add per-lecture attendance records and events."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "c93f1a7d6e20"
down_revision: Union[str, None] = "b17d4a9e2c31"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "lecture_attendance_records",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("college_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("weekly_lecture_id", sa.Integer(), nullable=True),
        sa.Column("additional_lecture_request_id", sa.Integer(), nullable=True),
        sa.Column("lecture_date", sa.Date(), nullable=False),
        sa.Column("punch_in_time", sa.DateTime(), nullable=True),
        sa.Column("punch_out_time", sa.DateTime(), nullable=True),
        sa.Column("punch_in_face_verified", sa.Boolean(), nullable=False),
        sa.Column("punch_out_face_verified", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "(weekly_lecture_id IS NOT NULL AND additional_lecture_request_id IS NULL) OR "
            "(weekly_lecture_id IS NULL AND additional_lecture_request_id IS NOT NULL)",
            name="ck_lecture_attendance_one_schedule",
        ),
        sa.ForeignKeyConstraint(["college_id"], ["colleges.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["weekly_lecture_id"], ["weekly_lectures.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["additional_lecture_request_id"],
            ["additional_lecture_requests.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "weekly_lecture_id",
            "lecture_date",
            name="uq_weekly_lecture_attendance_date",
        ),
        sa.UniqueConstraint(
            "additional_lecture_request_id",
            "lecture_date",
            name="uq_additional_lecture_attendance_date",
        ),
    )
    op.create_index(
        "ix_lecture_attendance_user_date",
        "lecture_attendance_records",
        ["user_id", "lecture_date"],
    )
    op.create_index(
        op.f("ix_lecture_attendance_records_id"),
        "lecture_attendance_records",
        ["id"],
        unique=False,
    )

    op.create_table(
        "lecture_attendance_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("attendance_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=20), nullable=False),
        sa.Column("event_time", sa.DateTime(), nullable=False),
        sa.Column("face_verified", sa.Boolean(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=80), nullable=False),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["attendance_id"],
            ["lecture_attendance_records.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "idempotency_key",
            name="uq_lecture_attendance_event_idempotency",
        ),
    )
    op.create_index(
        op.f("ix_lecture_attendance_events_id"),
        "lecture_attendance_events",
        ["id"],
        unique=False,
    )
    op.create_index(
        "ix_lecture_attendance_events_record",
        "lecture_attendance_events",
        ["attendance_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_lecture_attendance_events_record", table_name="lecture_attendance_events")
    op.drop_index(op.f("ix_lecture_attendance_events_id"), table_name="lecture_attendance_events")
    op.drop_table("lecture_attendance_events")
    op.drop_index(op.f("ix_lecture_attendance_records_id"), table_name="lecture_attendance_records")
    op.drop_index("ix_lecture_attendance_user_date", table_name="lecture_attendance_records")
    op.drop_table("lecture_attendance_records")
