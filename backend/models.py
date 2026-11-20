"""
AttendEase - Complete Database Models
All tables for College Faculty & Staff Attendance Management System
"""
import enum
from datetime import datetime, date, timezone
from sqlalchemy import (
    Column, Integer, String, Text, Boolean, Float, DateTime, Date,
    Time, Enum, ForeignKey, JSON, BigInteger, UniqueConstraint, Index, CheckConstraint, true
)
from sqlalchemy.orm import relationship
from database import Base


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ===========================================================================
# ENUMS
# ===========================================================================

class UserRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    COLLEGE_ADMIN = "college_admin"
    HOD = "hod"
    ATTENDANCE_MANAGER = "attendance_manager"
    READ_ONLY_ADMIN = "read_only_admin"
    FACULTY = "faculty"
    STAFF = "staff"


class AttendanceStatus(str, enum.Enum):
    ABSENT = "absent"
    PRESENT = "present"
    ON_BREAK = "on_break"
    PUNCHED_OUT = "punched_out"
    ON_LEAVE = "on_leave"
    HOLIDAY = "holiday"
    HALF_DAY = "half_day"


class LeaveStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class BiometricStatus(str, enum.Enum):
    NOT_ENROLLED = "not_enrolled"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    REVOKED = "revoked"
    RE_ENROLLMENT_REQUIRED = "re_enrollment_required"


class VerificationResult(str, enum.Enum):
    PASS = "pass"
    FAIL = "fail"
    ERROR = "error"


# ===========================================================================
# COLLEGE
# ===========================================================================

class College(Base):
    __tablename__ = "colleges"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    code = Column(String(50), unique=True, nullable=False)
    address = Column(Text)
    phone = Column(String(20))
    email = Column(String(255))
    website = Column(String(255))
    logo_url = Column(String(500))
    is_active = Column(Boolean, default=True)
    subscription_plan = Column(String(50), default="basic")
    subscription_expires = Column(Date)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    # Relationships
    departments = relationship("Department", back_populates="college")
    users = relationship("User", back_populates="college")
    college_location = relationship("CollegeLocation", back_populates="college", uselist=False)
    attendance_policies = relationship("AttendancePolicy", back_populates="college")
    working_shifts = relationship("WorkingShift", back_populates="college")
    holidays = relationship("Holiday", back_populates="college")


# ===========================================================================
# COLLEGE LOCATION & GEOFENCE
# ===========================================================================

class CollegeLocation(Base):
    __tablename__ = "college_locations"

    id = Column(Integer, primary_key=True, index=True)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    geofence_radius = Column(Float, default=100.0)  # meters
    min_gps_accuracy = Column(Float, default=50.0)  # meters
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    college = relationship("College", back_populates="college_location")


# ===========================================================================
# DEPARTMENTS
# ===========================================================================

class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    code = Column(String(50))
    description = Column(Text)
    is_active = Column(Boolean, default=True)
    hod_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    college = relationship("College", back_populates="departments")
    users = relationship("User", back_populates="department", foreign_keys="[User.department_id]")
    head_of_department = relationship("User", foreign_keys=[hod_id])

    __table_args__ = (
        UniqueConstraint("college_id", "code", name="uq_dept_code"),
    )


# ===========================================================================
# USERS
# ===========================================================================

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True)
    shift_id = Column(Integer, ForeignKey("working_shifts.id", ondelete="SET NULL"), nullable=True)
    employee_id = Column(String(50), nullable=False)
    full_name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False)
    username = Column(String(150), nullable=True)
    password_hash = Column(String(255))
    email_verified = Column(Boolean, default=True, server_default=true(), nullable=False)
    phone = Column(String(20))
    designation = Column(String(100))
    role = Column(Enum(UserRole), default=UserRole.FACULTY)
    is_active = Column(Boolean, default=True)
    account_status = Column(String(20), default="active") # active, inactive, suspended
    face_enrolled = Column(Boolean, default=False)
    face_enrollment_status = Column(Enum(BiometricStatus), default=BiometricStatus.NOT_ENROLLED)
    profile_photo = Column(String(500))
    date_of_joining = Column(Date)
    gender = Column(String(20), nullable=True)
    qualification = Column(String(255), nullable=True)
    specialization = Column(String(255), nullable=True)
    experience_years = Column(Float, nullable=True)
    address = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    college = relationship("College", back_populates="users")
    department = relationship("Department", back_populates="users", foreign_keys=[department_id])
    working_shift = relationship("WorkingShift", back_populates="assigned_users", foreign_keys=[shift_id])
    otp_records = relationship("OTPVerification", back_populates="user")
    biometric_template = relationship(
        "BiometricTemplate",
        back_populates="user",
        foreign_keys="BiometricTemplate.user_id",
        uselist=False,
    )
    biometric_logs = relationship("BiometricVerificationLog", back_populates="user")
    biometric_enrollments = relationship(
        "BiometricEnrollment",
        back_populates="user",
        foreign_keys="BiometricEnrollment.user_id",
    )
    attendance_records = relationship("AttendanceRecord", back_populates="user")
    leave_applications = relationship(
        "LeaveApplication",
        back_populates="user",
        foreign_keys="LeaveApplication.user_id",
    )
    sessions = relationship("UserSession", back_populates="user")
    notifications = relationship("Notification", back_populates="user")

    __table_args__ = (
        UniqueConstraint("college_id", "email", name="uq_user_email"),
        UniqueConstraint("college_id", "employee_id", name="uq_employee_id"),
        Index("uq_user_username", "username", unique=True),
    )


# ===========================================================================
# OTP VERIFICATION
# ===========================================================================

class PendingRegistration(Base):
    __tablename__ = "pending_registrations"

    id = Column(Integer, primary_key=True, index=True)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    employee_id = Column(String(50), nullable=False)
    full_name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False)
    phone = Column(String(20))
    password_hash = Column(String(255), nullable=False)
    otp_hash = Column(String(255), nullable=False)
    attempts = Column(Integer, default=0, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    otp_created_at = Column(DateTime, default=utcnow, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    ip_address = Column(String(45))

    __table_args__ = (
        UniqueConstraint("college_id", "email", name="uq_pending_registration_email"),
        UniqueConstraint("college_id", "employee_id", name="uq_pending_registration_employee"),
        Index("ix_pending_registrations_ip_created_at", "ip_address", "created_at"),
    )


class OTPVerification(Base):
    __tablename__ = "otp_verifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    otp_hash = Column(String(255), nullable=False)
    purpose = Column(String(50), default="login")  # login, enrollment, etc.
    attempts = Column(Integer, default=0)
    is_used = Column(Boolean, default=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=utcnow)
    ip_address = Column(String(45))

    user = relationship("User", back_populates="otp_records")


# ===========================================================================
# USER SESSIONS (JWT token tracking)
# ===========================================================================

class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    refresh_token_hash = Column(String(255), unique=True)
    device_info = Column(String(500))
    ip_address = Column(String(45))
    is_active = Column(Boolean, default=True)
    expires_at = Column(DateTime)
    created_at = Column(DateTime, default=utcnow)
    last_used = Column(DateTime, default=utcnow)

    user = relationship("User", back_populates="sessions")


# ===========================================================================
# BIOMETRIC
# ===========================================================================

class BiometricTemplate(Base):
    __tablename__ = "biometric_templates"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    face_embedding = Column(Text)
    enrollment_status = Column(Enum(BiometricStatus), default=BiometricStatus.PENDING_APPROVAL)
    enrolled_at = Column(DateTime)
    approved_at = Column(DateTime)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    revoked_at = Column(DateTime)
    revoked_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    revoke_reason = Column(Text)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    user = relationship("User", back_populates="biometric_template", foreign_keys=[user_id])


class BiometricEnrollment(Base):
    __tablename__ = "biometric_enrollments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    status = Column(Enum(BiometricStatus), nullable=False)
    consented_at = Column(DateTime, nullable=False)
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime)
    review_reason = Column(Text)
    created_at = Column(DateTime, default=utcnow)

    user = relationship("User", back_populates="biometric_enrollments", foreign_keys=[user_id])


class LivenessChallenge(Base):
    __tablename__ = "liveness_challenges"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    token_hash = Column(String(64), unique=True, nullable=False)
    action = Column(String(30), nullable=False)
    instruction = Column(String(30), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    is_used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)


class BiometricVerificationLog(Base):
    __tablename__ = "biometric_verification_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    action = Column(String(50))  # punch_in, punch_out, enrollment, etc.
    result = Column(Enum(VerificationResult))
    similarity_score = Column(Float)
    liveness_score = Column(Float)
    liveness_passed = Column(Boolean)
    failure_reason = Column(String(255))
    ip_address = Column(String(45))
    created_at = Column(DateTime, default=utcnow)

    user = relationship("User", back_populates="biometric_logs")


# ===========================================================================
# ATTENDANCE
# ===========================================================================

class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    status = Column(Enum(AttendanceStatus), default=AttendanceStatus.ABSENT)
    punch_in_time = Column(DateTime)
    punch_out_time = Column(DateTime)
    total_working_minutes = Column(Integer, default=0)
    total_break_minutes = Column(Integer, default=0)
    net_working_minutes = Column(Integer, default=0)
    is_late = Column(Boolean, default=False)
    late_by_minutes = Column(Integer, default=0)
    is_early_departure = Column(Boolean, default=False)
    overtime_minutes = Column(Integer, default=0)
    shift_id = Column(Integer, ForeignKey("working_shifts.id"), nullable=True)

    # Face verification
    punch_in_face_verified = Column(Boolean, default=False)
    punch_out_face_verified = Column(Boolean, default=False)

    # GPS verification
    punch_in_latitude = Column(Float)
    punch_in_longitude = Column(Float)
    punch_in_distance_m = Column(Float)
    punch_in_gps_verified = Column(Boolean, default=False)
    punch_out_latitude = Column(Float)
    punch_out_longitude = Column(Float)
    punch_out_distance_m = Column(Float)
    punch_out_gps_verified = Column(Boolean, default=False)

    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    user = relationship("User", back_populates="attendance_records")
    breaks = relationship("BreakRecord", back_populates="attendance")
    events = relationship("AttendanceEvent", back_populates="attendance")
    location_logs = relationship("LocationVerificationLog", back_populates="attendance")

    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uq_user_date_attendance"),
    )


class AttendanceEvent(Base):
    """Immutable log of every attendance action"""
    __tablename__ = "attendance_events"

    id = Column(Integer, primary_key=True, index=True)
    attendance_id = Column(Integer, ForeignKey("attendance_records.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    event_type = Column(String(50))  # punch_in, punch_out, break_start, break_end
    event_time = Column(DateTime, nullable=False)
    face_verified = Column(Boolean, default=False)
    gps_verified = Column(Boolean, default=False)
    latitude = Column(Float)
    longitude = Column(Float)
    distance_m = Column(Float)
    idempotency_key = Column(String(80))
    ip_address = Column(String(45))
    created_at = Column(DateTime, default=utcnow)

    attendance = relationship("AttendanceRecord", back_populates="events")

    __table_args__ = (
        UniqueConstraint("user_id", "idempotency_key", name="uq_attendance_event_idempotency"),
    )


class BreakRecord(Base):
    __tablename__ = "break_records"

    id = Column(Integer, primary_key=True, index=True)
    attendance_id = Column(Integer, ForeignKey("attendance_records.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    break_start = Column(DateTime, nullable=False)
    break_end = Column(DateTime)
    duration_minutes = Column(Integer)
    created_at = Column(DateTime, default=utcnow)

    attendance = relationship("AttendanceRecord", back_populates="breaks")


class LocationVerificationLog(Base):
    __tablename__ = "location_verification_logs"

    id = Column(Integer, primary_key=True, index=True)
    attendance_id = Column(Integer, ForeignKey("attendance_records.id", ondelete="CASCADE"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    action = Column(String(50))
    latitude = Column(Float)
    longitude = Column(Float)
    accuracy = Column(Float)
    distance_m = Column(Float)
    geofence_radius = Column(Float)
    result = Column(Enum(VerificationResult))
    failure_reason = Column(String(255))
    created_at = Column(DateTime, default=utcnow)

    attendance = relationship("AttendanceRecord", back_populates="location_logs")


# ===========================================================================
# WORKING SHIFTS
# ===========================================================================

class WorkingShift(Base):
    __tablename__ = "working_shifts"

    id = Column(Integer, primary_key=True, index=True)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    grace_period_minutes = Column(Integer, default=15)
    half_day_minutes = Column(Integer, default=240)
    full_day_minutes = Column(Integer, default=360)
    max_break_minutes = Column(Integer, default=60)
    is_overnight = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)

    college = relationship("College", back_populates="working_shifts")
    assigned_users = relationship("User", back_populates="working_shift", foreign_keys="User.shift_id")


# ===========================================================================
# ATTENDANCE POLICY
# ===========================================================================

class AttendancePolicy(Base):
    __tablename__ = "attendance_policies"

    id = Column(Integer, primary_key=True, index=True)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    require_face_for_punch_in = Column(Boolean, default=True)
    require_face_for_punch_out = Column(Boolean, default=True)
    require_face_for_breaks = Column(Boolean, default=False)
    require_gps_for_punch_in = Column(Boolean, default=True)
    require_gps_for_punch_out = Column(Boolean, default=True)
    require_gps_for_breaks = Column(Boolean, default=False)
    max_otp_attempts = Column(Integer, default=3)
    otp_validity_minutes = Column(Integer, default=5)
    otp_resend_cooldown_seconds = Column(Integer, default=60)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    college = relationship("College", back_populates="attendance_policies")


# ===========================================================================
# LEAVE MANAGEMENT
# ===========================================================================

class LeaveType(Base):
    __tablename__ = "leave_types"

    id = Column(Integer, primary_key=True, index=True)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    code = Column(String(20), nullable=False)
    max_days_per_year = Column(Integer, default=12)
    is_paid = Column(Boolean, default=True)
    requires_document = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)


class LeaveBalance(Base):
    __tablename__ = "leave_balances"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    leave_type_id = Column(Integer, ForeignKey("leave_types.id", ondelete="CASCADE"), nullable=False)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    year = Column(Integer, nullable=False)
    total_days = Column(Integer, default=0)
    used_days = Column(Integer, default=0)
    remaining_days = Column(Integer, default=0)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class LeaveApplication(Base):
    __tablename__ = "leave_applications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    leave_type_id = Column(Integer, ForeignKey("leave_types.id"), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    total_days = Column(Integer)
    reason = Column(Text, nullable=False)
    document_url = Column(String(500))
    status = Column(Enum(LeaveStatus), default=LeaveStatus.PENDING)
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime)
    review_remarks = Column(Text)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    user = relationship("User", back_populates="leave_applications", foreign_keys=[user_id])


# ===========================================================================
# HOLIDAYS
# ===========================================================================

class Holiday(Base):
    __tablename__ = "holidays"

    id = Column(Integer, primary_key=True, index=True)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    date = Column(Date, nullable=False)
    description = Column(Text)
    is_optional = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)

    college = relationship("College", back_populates="holidays")


# ===========================================================================
# NOTIFICATIONS
# ===========================================================================

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    type = Column(String(50), default="info")  # info, warning, success, error
    is_read = Column(Boolean, default=False)
    action_url = Column(String(500))
    created_at = Column(DateTime, default=utcnow)

    user = relationship("User", back_populates="notifications")


class WeeklyLecture(Base):
    __tablename__ = "weekly_lectures"

    id = Column(Integer, primary_key=True, index=True)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    subject = Column(String(200), nullable=False)
    course_name = Column(String(200))
    day_of_week = Column(Integer, nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    room = Column(String(100))
    is_active = Column(Boolean, default=True, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    user = relationship("User", foreign_keys=[user_id])
    department = relationship("Department")

    __table_args__ = (
        Index("ix_weekly_lectures_college_day", "college_id", "day_of_week", "is_active"),
        Index("ix_weekly_lectures_user_day", "user_id", "day_of_week", "is_active"),
    )


class AdditionalLectureRequest(Base):
    __tablename__ = "additional_lecture_requests"

    id = Column(Integer, primary_key=True, index=True)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    lecture_date = Column(Date, nullable=False)
    subject = Column(String(200), nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    room = Column(String(100))
    reason = Column(Text, nullable=False)
    status = Column(String(20), default="pending", nullable=False)
    reviewed_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at = Column(DateTime)
    review_remarks = Column(Text)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    user = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        Index("ix_additional_lecture_college_status", "college_id", "status"),
        Index("ix_additional_lecture_user_created", "user_id", "created_at"),
    )


class LectureAttendanceRecord(Base):
    __tablename__ = "lecture_attendance_records"

    id = Column(Integer, primary_key=True, index=True)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    weekly_lecture_id = Column(Integer, ForeignKey("weekly_lectures.id", ondelete="CASCADE"), nullable=True)
    additional_lecture_request_id = Column(
        Integer, ForeignKey("additional_lecture_requests.id", ondelete="CASCADE"), nullable=True
    )
    lecture_date = Column(Date, nullable=False)
    punch_in_time = Column(DateTime)
    punch_out_time = Column(DateTime)
    punch_in_face_verified = Column(Boolean, default=False, nullable=False)
    punch_out_face_verified = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    weekly_lecture = relationship("WeeklyLecture")
    additional_lecture_request = relationship("AdditionalLectureRequest")
    events = relationship("LectureAttendanceEvent", back_populates="attendance", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint(
            "(weekly_lecture_id IS NOT NULL AND additional_lecture_request_id IS NULL) OR "
            "(weekly_lecture_id IS NULL AND additional_lecture_request_id IS NOT NULL)",
            name="ck_lecture_attendance_one_schedule",
        ),
        UniqueConstraint("weekly_lecture_id", "lecture_date", name="uq_weekly_lecture_attendance_date"),
        UniqueConstraint(
            "additional_lecture_request_id",
            "lecture_date",
            name="uq_additional_lecture_attendance_date",
        ),
        Index("ix_lecture_attendance_user_date", "user_id", "lecture_date"),
    )


class LectureAttendanceEvent(Base):
    __tablename__ = "lecture_attendance_events"

    id = Column(Integer, primary_key=True, index=True)
    attendance_id = Column(
        Integer, ForeignKey("lecture_attendance_records.id", ondelete="CASCADE"), nullable=False
    )
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    event_type = Column(String(20), nullable=False)
    event_time = Column(DateTime, nullable=False)
    face_verified = Column(Boolean, default=False, nullable=False)
    idempotency_key = Column(String(80), nullable=False)
    ip_address = Column(String(45))
    created_at = Column(DateTime, default=utcnow, nullable=False)

    attendance = relationship("LectureAttendanceRecord", back_populates="events")

    __table_args__ = (
        UniqueConstraint("user_id", "idempotency_key", name="uq_lecture_attendance_event_idempotency"),
        Index("ix_lecture_attendance_events_record", "attendance_id"),
    )


# ===========================================================================
# SECURITY / AUDIT
# ===========================================================================

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String(100), nullable=False)
    resource_type = Column(String(100))
    resource_id = Column(Integer)
    old_value = Column(JSON)
    new_value = Column(JSON)
    ip_address = Column(String(45))
    user_agent = Column(String(500))
    created_at = Column(DateTime, default=utcnow)

    __table_args__ = (
        Index("idx_audit_college_created", "college_id", "created_at"),
    )


class SecurityEvent(Base):
    __tablename__ = "security_events"

    id = Column(Integer, primary_key=True, index=True)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    event_type = Column(String(100), nullable=False)
    severity = Column(String(20), default="medium")  # low, medium, high, critical
    description = Column(Text)
    ip_address = Column(String(45))
    resolved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)

    __table_args__ = (
        Index("idx_sec_college_created", "college_id", "created_at"),
    )


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="SET NULL"))
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    name = Column(String(200), nullable=False)
    description = Column(Text)
    status = Column(String(20), nullable=False, default="active")
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    department = relationship("Department")
    owner = relationship("User", foreign_keys=[owner_id])

    __table_args__ = (
        Index("idx_projects_college_department", "college_id", "department_id"),
    )


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="SET NULL"))
    assignee_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    assigned_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    title = Column(String(255), nullable=False)
    description = Column(Text)
    due_date = Column(Date)
    status = Column(String(20), nullable=False, default="todo")
    progress = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    project = relationship("Project", foreign_keys=[project_id])
    assignee = relationship("User", foreign_keys=[assignee_id])
    assigned_by = relationship("User", foreign_keys=[assigned_by_id])

    __table_args__ = (
        Index("idx_tasks_college_assignee", "college_id", "assignee_id"),
        Index("idx_tasks_project", "project_id"),
    )


class Course(Base):
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True, index=True)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(200), nullable=False)
    code = Column(String(50), nullable=False)
    duration_years = Column(Integer, default=3)
    total_semesters = Column(Integer, default=6)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    college = relationship("College")
    department = relationship("Department")

    __table_args__ = (
        UniqueConstraint("college_id", "code", name="uq_course_college_code"),
        Index("idx_courses_college_dept", "college_id", "department_id"),
    )


class Subject(Base):
    __tablename__ = "subjects"

    id = Column(Integer, primary_key=True, index=True)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="SET NULL"), nullable=True)
    semester = Column(Integer, default=1)
    name = Column(String(200), nullable=False)
    code = Column(String(50), nullable=False)
    credits = Column(Integer, default=4)
    subject_type = Column(String(50), default="Theory")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    college = relationship("College")
    department = relationship("Department")
    course = relationship("Course")

    __table_args__ = (
        UniqueConstraint("college_id", "code", name="uq_subject_college_code"),
        Index("idx_subjects_college_dept", "college_id", "department_id"),
    )


class FacultySubjectAssignment(Base):
    __tablename__ = "faculty_subject_assignments"

    id = Column(Integer, primary_key=True, index=True)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    faculty_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    academic_year_id = Column(Integer, nullable=True)
    assigned_at = Column(DateTime, default=utcnow)

    faculty = relationship("User", foreign_keys=[faculty_id])
    subject = relationship("Subject", foreign_keys=[subject_id])

    __table_args__ = (
        UniqueConstraint("college_id", "faculty_id", "subject_id", name="uq_faculty_subject_assignment"),
    )


class AcademicYear(Base):
    __tablename__ = "academic_years"

    id = Column(Integer, primary_key=True, index=True)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    is_current = Column(Boolean, default=False)
    is_archived = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)

    college = relationship("College")

    __table_args__ = (
        UniqueConstraint("college_id", "name", name="uq_academic_year_name"),
    )


class Classroom(Base):
    __tablename__ = "classrooms"

    id = Column(Integer, primary_key=True, index=True)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    room_number = Column(String(50), nullable=False)
    building = Column(String(100), nullable=True)
    floor = Column(String(50), nullable=True)
    capacity = Column(Integer, default=60)
    room_type = Column(String(50), default="Lecture Hall")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)

    college = relationship("College")

    __table_args__ = (
        UniqueConstraint("college_id", "room_number", name="uq_classroom_room_number"),
    )


class AttendanceCorrection(Base):
    __tablename__ = "attendance_corrections"

    id = Column(Integer, primary_key=True, index=True)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    faculty_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    attendance_record_id = Column(Integer, ForeignKey("attendance_records.id", ondelete="SET NULL"), nullable=True)
    lecture_record_id = Column(Integer, ForeignKey("lecture_attendance_records.id", ondelete="SET NULL"), nullable=True)
    target_date = Column(Date, nullable=False)
    original_punch_in = Column(DateTime, nullable=True)
    original_punch_out = Column(DateTime, nullable=True)
    requested_punch_in = Column(DateTime, nullable=True)
    requested_punch_out = Column(DateTime, nullable=True)
    reason = Column(Text, nullable=False)
    status = Column(String(20), default="pending")
    admin_remarks = Column(Text, nullable=True)
    reviewed_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)

    faculty = relationship("User", foreign_keys=[faculty_id])
    reviewer = relationship("User", foreign_keys=[reviewed_by_id])

    __table_args__ = (
        Index("idx_corrections_college_faculty", "college_id", "faculty_id"),
    )


class FacultyAvailability(Base):
    __tablename__ = "faculty_availabilities"

    id = Column(Integer, primary_key=True, index=True)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    faculty_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    day_of_week = Column(Integer, nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    is_available = Column(Boolean, default=True)
    status = Column(String(20), default="approved")
    notes = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=utcnow)

    faculty = relationship("User", foreign_keys=[faculty_id])

    __table_args__ = (
        Index("idx_availability_faculty_day", "college_id", "faculty_id", "day_of_week"),
    )


class SubstituteAssignment(Base):
    __tablename__ = "substitute_assignments"

    id = Column(Integer, primary_key=True, index=True)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    lecture_id = Column(Integer, ForeignKey("weekly_lectures.id", ondelete="CASCADE"), nullable=False)
    lecture_date = Column(Date, nullable=False)
    original_faculty_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    substitute_faculty_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(20), default="pending")
    remarks = Column(Text, nullable=True)
    assigned_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=utcnow)

    lecture = relationship("WeeklyLecture")
    original_faculty = relationship("User", foreign_keys=[original_faculty_id])
    substitute_faculty = relationship("User", foreign_keys=[substitute_faculty_id])

    __table_args__ = (
        Index("idx_substitute_date_lecture", "college_id", "lecture_date", "lecture_id"),
    )


class FacultyPaymentRate(Base):
    __tablename__ = "faculty_payment_rates"

    id = Column(Integer, primary_key=True, index=True)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    faculty_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=True)
    rate_per_lecture = Column(Float, default=0.0)
    rate_per_hour = Column(Float, default=0.0)
    effective_from = Column(Date, default=utcnow)
    created_at = Column(DateTime, default=utcnow)

    faculty = relationship("User", foreign_keys=[faculty_id])
    subject = relationship("Subject", foreign_keys=[subject_id])


class BackupRecord(Base):
    __tablename__ = "backup_records"

    id = Column(Integer, primary_key=True, index=True)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(255), nullable=False)
    file_size_bytes = Column(BigInteger, default=0)
    backup_type = Column(String(50), default="database")
    status = Column(String(20), default="completed")
    notes = Column(Text, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=utcnow)


# ===========================================================================
# ADMIN USERS  (dedicated admin portal accounts — one per college)
# ===========================================================================

class AdminUser(Base):
    """
    Standalone admin accounts for the Admin Portal.
    Admin credentials are stored separately and linked to an application user.
    """
    __tablename__ = "admin_users"

    id = Column(Integer, primary_key=True, index=True)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    username = Column(String(150), nullable=False, unique=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    college = relationship("College")
    user = relationship("User")

