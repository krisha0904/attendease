"""Add weekly timetable and additional lecture requests."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b17d4a9e2c31"
down_revision: Union[str, None] = "ab12cd34ef56"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "weekly_lectures",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("college_id", sa.Integer(), nullable=False),
        sa.Column("department_id", sa.Integer(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("subject", sa.String(length=200), nullable=False),
        sa.Column("course_name", sa.String(length=200), nullable=True),
        sa.Column("day_of_week", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("room", sa.String(length=100), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["college_id"], ["colleges.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_weekly_lectures_college_day", "weekly_lectures", ["college_id", "day_of_week", "is_active"])
    op.create_index("ix_weekly_lectures_user_day", "weekly_lectures", ["user_id", "day_of_week", "is_active"])
    op.create_index(op.f("ix_weekly_lectures_id"), "weekly_lectures", ["id"], unique=False)

    op.create_table(
        "additional_lecture_requests",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("college_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("lecture_date", sa.Date(), nullable=False),
        sa.Column("subject", sa.String(length=200), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("room", sa.String(length=100), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("reviewed_by", sa.Integer(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("review_remarks", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["college_id"], ["colleges.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_additional_lecture_college_status",
        "additional_lecture_requests",
        ["college_id", "status"],
    )
    op.create_index(
        "ix_additional_lecture_user_created",
        "additional_lecture_requests",
        ["user_id", "created_at"],
    )
    op.create_index(op.f("ix_additional_lecture_requests_id"), "additional_lecture_requests", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_additional_lecture_requests_id"), table_name="additional_lecture_requests")
    op.drop_index("ix_additional_lecture_user_created", table_name="additional_lecture_requests")
    op.drop_index("ix_additional_lecture_college_status", table_name="additional_lecture_requests")
    op.drop_table("additional_lecture_requests")
    op.drop_index(op.f("ix_weekly_lectures_id"), table_name="weekly_lectures")
    op.drop_index("ix_weekly_lectures_user_day", table_name="weekly_lectures")
    op.drop_index("ix_weekly_lectures_college_day", table_name="weekly_lectures")
    op.drop_table("weekly_lectures")
