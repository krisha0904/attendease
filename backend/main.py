import hashlib
import hmac
import math
import os
import secrets
import smtplib
from datetime import date, datetime, time as time_type, timedelta, timezone
from email.message import EmailMessage
from typing import Callable, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models
import face_service
import liveness_service
from password_service import hash_password, verify_password
from database import Base, engine, get_db

load_dotenv()

JWT_ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
bearer_scheme = HTTPBearer(auto_error=False)

if JWT_ALGORITHM.upper() != "HS256":
    raise RuntimeError("ALGORITHM must be HS256.")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class OTPRequest(BaseModel):
    email: EmailStr


class OTPVerification(BaseModel):
    email: EmailStr
    otp: str = Field(pattern=r"^\d{6}$")
    portal: Literal["admin", "user"] | None = None
    device_info: str | None = Field(default=None, max_length=500)


class PasswordLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
    device_info: str | None = Field(default=None, max_length=500)


class AdminUsernameLogin(BaseModel):
    username: str = Field(min_length=1, max_length=150)
    password: str = Field(min_length=1, max_length=128)


class RegistrationRequest(BaseModel):
    college_id: int = Field(gt=0)
    college_code: str = Field(min_length=3, max_length=50, pattern=r"^[A-Za-z0-9_-]+$")
    employee_id: str = Field(min_length=1, max_length=50)
    full_name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=20)
    password: str = Field(min_length=12, max_length=128)

class RegistrationOtpRequest(BaseModel):
    college_id: int = Field(gt=0)
    email: EmailStr


class RegistrationOtpVerification(RegistrationOtpRequest):
    otp: str = Field(pattern=r"^\d{6}$")


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)


class PasswordSet(BaseModel):
    password: str = Field(min_length=12, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=32, max_length=200)


class EmployeeCreate(BaseModel):
    employee_id: str = Field(min_length=1, max_length=50)
    full_name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    username: str | None = Field(default=None, min_length=3, max_length=150, pattern=r"^[A-Za-z0-9._-]+$")
    phone: str | None = Field(default=None, max_length=20)
    password: str = Field(min_length=12, max_length=128)
    department_id: int | None = None
    shift_id: int | None = None
    designation: str | None = Field(default=None, max_length=100)
    role: models.UserRole = models.UserRole.FACULTY

    @model_validator(mode="after")
    def require_username_for_admin(self):
        admin_roles = (
            models.UserRole.COLLEGE_ADMIN,
            models.UserRole.HOD,
            models.UserRole.ATTENDANCE_MANAGER,
            models.UserRole.READ_ONLY_ADMIN,
        )
        if self.role in admin_roles and not self.username:
            raise ValueError("An admin username is required for administrator accounts.")
        if self.role not in admin_roles and self.username:
            raise ValueError("Only administrator accounts can have an admin username.")
        if self.username:
            self.username = self.username.strip().lower()
        return self


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    department_id: int | None = None


class ProjectUpdate(BaseModel):
    status: Literal["active", "on_hold", "completed"]


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=4000)
    project_id: int | None = None
    assignee_id: int
    due_date: date | None = None


class TaskUpdate(BaseModel):
    status: Literal["todo", "in_progress", "completed"] | None = None
    progress: int | None = Field(default=None, ge=0, le=100)

    @model_validator(mode="after")
    def require_update(self):
        if self.status is None and self.progress is None:
            raise ValueError("Provide a task status or progress update.")
        return self


class WeeklyLectureCreate(BaseModel):
    user_id: int = Field(gt=0)
    department_id: int | None = Field(default=None, gt=0)
    subject: str | None = Field(default=None, max_length=200)
    subject_id: int | None = Field(default=None, gt=0)
    course_name: str | None = Field(default=None, max_length=200)
    course_id: int | None = Field(default=None, gt=0)
    academic_year_id: int | None = Field(default=None, gt=0)
    classroom_id: int | None = Field(default=None, gt=0)
    semester: int | None = Field(default=None, ge=1, le=12)
    lecture_type: str = Field(default="Theory", max_length=30)
    day_of_week: int = Field(ge=0, le=6)
    start_time: time_type
    end_time: time_type
    room: str | None = Field(default=None, max_length=100)
    substitute_faculty_id: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def valid_times(self):
        if self.end_time <= self.start_time:
            raise ValueError("Lecture end time must be after its start time.")
        if not self.subject and not self.subject_id:
            raise ValueError("Subject name or subject ID must be provided.")
        return self


class WeeklyLectureUpdate(BaseModel):
    user_id: int | None = Field(default=None, gt=0)
    department_id: int | None = Field(default=None, gt=0)
    subject: str | None = Field(default=None, max_length=200)
    subject_id: int | None = Field(default=None, gt=0)
    course_name: str | None = Field(default=None, max_length=200)
    course_id: int | None = Field(default=None, gt=0)
    academic_year_id: int | None = Field(default=None, gt=0)
    classroom_id: int | None = Field(default=None, gt=0)
    semester: int | None = Field(default=None, ge=1, le=12)
    lecture_type: str | None = Field(default=None, max_length=30)
    day_of_week: int | None = Field(default=None, ge=0, le=6)
    start_time: time_type | None = None
    end_time: time_type | None = None
    room: str | None = Field(default=None, max_length=100)
    substitute_faculty_id: int | None = Field(default=None, gt=0)


class WeeklyLectureStatusUpdate(BaseModel):
    status: str = Field(pattern="^(scheduled|in_progress|completed|cancelled|rescheduled)$")
    cancellation_reason: str | None = None


class WeeklyLectureSubstituteUpdate(BaseModel):
    substitute_faculty_id: int | None = None


class WeeklyLectureConflictCheck(BaseModel):
    user_id: int = Field(gt=0)
    classroom_id: int | None = None
    room: str | None = None
    day_of_week: int = Field(ge=0, le=6)
    start_time: time_type
    end_time: time_type
    exclude_id: int | None = None


class AdditionalLectureCreate(BaseModel):
    lecture_date: date
    subject: str = Field(min_length=1, max_length=200)
    start_time: time_type
    end_time: time_type
    room: str | None = Field(default=None, max_length=100)
    reason: str = Field(min_length=1, max_length=2000)

    @model_validator(mode="after")
    def valid_times(self):
        if self.end_time <= self.start_time:
            raise ValueError("Lecture end time must be after its start time.")
        return self


class AdditionalLectureReview(BaseModel):
    approved: bool
    remarks: str | None = Field(default=None, max_length=2000)


class DepartmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    code: str | None = Field(default=None, max_length=50)
    description: str | None = Field(default=None, max_length=2000)
    hod_id: int | None = None
    is_active: bool = True


class DepartmentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    code: str | None = Field(default=None, max_length=50)
    description: str | None = Field(default=None, max_length=2000)
    hod_id: int | None = None
    is_active: bool | None = None


class DepartmentAssignFaculty(BaseModel):
    faculty_ids: list[int]


class CourseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    code: str = Field(min_length=1, max_length=50)
    department_id: int | None = None
    duration_years: int = 3
    total_semesters: int = 6
    description: str | None = None
    is_active: bool = True


class CourseUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    department_id: int | None = None
    duration_years: int | None = None
    total_semesters: int | None = None
    description: str | None = None
    is_active: bool | None = None


class SubjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    code: str = Field(min_length=1, max_length=50)
    department_id: int | None = None
    course_id: int | None = None
    semester: int = 1
    credits: int = 4
    subject_type: str = "Theory"
    is_active: bool = True


class SubjectUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    department_id: int | None = None
    course_id: int | None = None
    semester: int | None = None
    credits: int | None = None
    subject_type: str | None = None
    is_active: bool | None = None


class SubjectAssignFaculty(BaseModel):
    faculty_ids: list[int]


class AcademicYearCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    start_date: str
    end_date: str
    is_current: bool = False


class AcademicYearUpdate(BaseModel):
    name: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    is_current: bool | None = None
    is_archived: bool | None = None


class ClassroomCreate(BaseModel):
    room_number: str = Field(min_length=1, max_length=50)
    building: str | None = None
    floor: str | None = None
    capacity: int = 60
    room_type: str = "Lecture Hall"
    is_active: bool = True


class ClassroomUpdate(BaseModel):
    room_number: str | None = None
    building: str | None = None
    floor: str | None = None
    capacity: int | None = None
    room_type: str | None = None
    is_active: bool | None = None


class HolidayCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    date: str
    description: str | None = None


class HolidayUpdate(BaseModel):
    name: str | None = None
    date: str | None = None
    description: str | None = None



AttendanceAction = Literal["punch_in", "punch_out", "break_start", "break_end"]
ChallengeAction = Literal["enrollment", "punch_in", "punch_out", "break_start", "break_end"]


class ChallengeRequest(BaseModel):
    action: ChallengeAction


class BiometricEnrollmentRequest(BaseModel):
    challenge_token: str = Field(min_length=32, max_length=100)
    frames: list[str] = Field(min_length=4, max_length=12)
    face_image_base64: str = Field(min_length=100, max_length=7_000_000)
    consent: bool

    @model_validator(mode="after")
    def face_image_in_liveness_sequence(self):
        _validate_capture_frames(self.frames)
        if self.face_image_base64 not in self.frames:
            raise ValueError("The face image must be one of the liveness frames.")
        return self


class AttendanceActionRequest(BaseModel):
    challenge_token: str | None = Field(default=None, min_length=32, max_length=100)
    frames: list[str] | None = Field(default=None, min_length=4, max_length=12)
    face_image_base64: str | None = Field(default=None, min_length=100, max_length=7_000_000)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    accuracy: float | None = Field(default=None, gt=0, le=5000)
    idempotency_key: str = Field(min_length=16, max_length=80)

    @model_validator(mode="after")
    def require_face_image_in_liveness_sequence(self):
        if self.frames is not None:
            _validate_capture_frames(self.frames)
        supplied = (self.challenge_token, self.frames, self.face_image_base64)
        if any(value is not None for value in supplied):
            if not all(value is not None for value in supplied):
                raise ValueError("A challenge token, liveness frames, and face image are required together.")
            if self.face_image_base64 not in self.frames:
                raise ValueError("The face image must be one of the liveness frames.")
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Latitude and longitude must be supplied together.")
        return self


class LectureAttendanceActionRequest(BaseModel):
    source_type: Literal["weekly", "additional"]
    schedule_id: int = Field(gt=0)
    lecture_date: date
    challenge_token: str = Field(min_length=32, max_length=100)
    frames: list[str] = Field(min_length=4, max_length=12)
    face_image_base64: str = Field(min_length=100, max_length=7_000_000)
    idempotency_key: str = Field(min_length=16, max_length=80)

    @model_validator(mode="after")
    def face_image_in_liveness_sequence(self):
        _validate_capture_frames(self.frames)
        if self.face_image_base64 not in self.frames:
            raise ValueError("The face image must be one of the liveness frames.")
        return self


class LocationUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    geofence_radius: float = Field(gt=0, le=5000)
    min_gps_accuracy: float = Field(gt=0, le=1000)


class ShiftCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    start_time: time_type
    end_time: time_type
    grace_period_minutes: int = Field(default=15, ge=0, le=240)
    half_day_minutes: int = Field(default=240, ge=1, le=1440)
    full_day_minutes: int = Field(default=360, ge=1, le=1440)
    max_break_minutes: int = Field(default=60, ge=0, le=600)
    is_overnight: bool = False


class AssignShift(BaseModel):
    shift_id: int | None


class LeaveApplicationCreate(BaseModel):
    leave_type_id: int
    start_date: date
    end_date: date
    reason: str = Field(min_length=1, max_length=4000)

    @model_validator(mode="after")
    def valid_range(self):
        if self.end_date < self.start_date:
            raise ValueError("Leave end date must be on or after the start date.")
        if (self.end_date - self.start_date).days > 365:
            raise ValueError("A leave request cannot exceed one year.")
        return self


class LeaveTypeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    code: str = Field(min_length=1, max_length=20)
    max_days_per_year: int = Field(ge=0, le=366)
    is_paid: bool = True
    requires_document: bool = False


class LeaveReview(BaseModel):
    approved: bool
    remarks: str | None = Field(default=None, max_length=2000)


class BiometricRejection(BaseModel):
    reason: str = Field(min_length=2, max_length=1000)


class BiometricReEnrollment(BaseModel):
    reason: str | None = Field(default=None, max_length=1000)


class AttendancePolicyUpdate(BaseModel):
    require_face_for_breaks: bool | None = None
    require_gps_for_breaks: bool | None = None
    max_otp_attempts: int | None = Field(default=None, ge=1, le=10)
    otp_validity_minutes: int | None = Field(default=None, ge=2, le=5)
    otp_resend_cooldown_seconds: int | None = Field(default=None, ge=60, le=60)


class UserSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: str
    full_name: str
    email: str
    username: str | None = None
    college_id: int
    department_id: int | None = None
    shift_id: int | None = None
    designation: str | None = None
    role: models.UserRole
    is_active: bool
    account_status: str | None = "active"
    face_enrollment_status: models.BiometricStatus
    face_enrolled: bool = False
    phone: str | None = None
    gender: str | None = None
    qualification: str | None = None
    specialization: str | None = None
    experience_years: float | None = None
    address: str | None = None
    date_of_joining: date | None = None
    profile_photo: str | None = None
    college_name: str | None = None
    college_code: str | None = None
    department_name: str | None = None


class FacultyCreate(BaseModel):
    employee_id: str | None = Field(default=None, max_length=50)
    full_name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=20)
    gender: str | None = Field(default=None, max_length=20)
    department_id: int | None = None
    qualification: str | None = Field(default=None, max_length=255)
    specialization: str | None = Field(default=None, max_length=255)
    experience_years: float | None = Field(default=None, ge=0)
    date_of_joining: date | None = None
    address: str | None = Field(default=None, max_length=1000)
    designation: str | None = Field(default="Visiting Faculty", max_length=100)
    password: str | None = Field(default=None, min_length=8, max_length=128)
    auto_generate_id: bool = True


class FacultyUpdate(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=20)
    gender: str | None = Field(default=None, max_length=20)
    department_id: int | None = None
    qualification: str | None = Field(default=None, max_length=255)
    specialization: str | None = Field(default=None, max_length=255)
    experience_years: float | None = Field(default=None, ge=0)
    date_of_joining: date | None = None
    address: str | None = Field(default=None, max_length=1000)
    designation: str | None = Field(default=None, max_length=100)


def _secret_key() -> str:
    key = os.getenv("SECRET_KEY", "")
    if len(key) < 32 or key.lower().startswith(("your-super-secret", "replace-with-")):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication is not configured. Set a random SECRET_KEY of at least 32 characters.",
        )
    return key


def _hash_otp(email: str, otp: str) -> str:
    message = f"{email}:{otp}".encode("utf-8")
    return hmac.new(_secret_key().encode("utf-8"), message, hashlib.sha256).hexdigest()


def _hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _send_otp_email(recipient: str, otp: str, validity_minutes: int = 5) -> None:
    host = os.getenv("SMTP_HOST")
    username = os.getenv("SMTP_USERNAME")
    password = os.getenv("SMTP_PASSWORD")
    sender = os.getenv("SMTP_FROM") or username
    port = int(os.getenv("SMTP_PORT", "587"))
    if not host or not username or not password or not sender:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email delivery is not configured.",
        )

    message = EmailMessage()
    message["Subject"] = "Your AttendEase verification code"
    message["From"] = sender
    message["To"] = recipient
    message.set_content(f"Your verification code is {otp}. It expires in {validity_minutes} minutes.")

    try:
        with smtplib.SMTP(host, port, timeout=15) as server:
            server.starttls()
            server.login(username, password)
            server.send_message(message)
    except (OSError, smtplib.SMTPException) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not deliver the sign-in code. Please try again later.",
        ) from exc


def _make_access_token(user: models.User, session_id: int) -> str:
    now = _utcnow()
    claims = {
        "sub": str(user.id),
        "sid": session_id,
        "college_id": user.college_id,
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        "type": "access",
    }
    return jwt.encode(claims, _secret_key(), algorithm=JWT_ALGORITHM)


def create_access_token(user_or_id, session_id=1, college_id=1) -> str:
    if hasattr(user_or_id, "id") and hasattr(user_or_id, "college_id"):
        return _make_access_token(user_or_id, session_id)
    now = _utcnow()
    claims = {
        "sub": str(user_or_id),
        "sid": session_id,
        "college_id": college_id,
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        "type": "access",
    }
    return jwt.encode(claims, _secret_key(), algorithm=JWT_ALGORITHM)


def _user_payload(user: models.User) -> dict:
    return {
        "id": user.id,
        "employee_id": user.employee_id,
        "full_name": user.full_name,
        "email": user.email,
        "username": user.username,
        "college_id": user.college_id,
        "department_id": user.department_id,
        "shift_id": user.shift_id,
        "designation": user.designation,
        "role": user.role.value,
        "face_enrollment_status": user.face_enrollment_status.value,
    }


def _validate_capture_frames(frames: list[str]) -> None:
    if any(len(frame.encode("utf-8")) > 7_000_000 for frame in frames):
        raise ValueError("An individual capture frame exceeds the 5 MB image limit.")
    if sum(len(frame.encode("utf-8")) for frame in frames) > 12_000_000:
        raise ValueError("The complete liveness capture exceeds the 12 MB request limit.")


def _issue_session(user: models.User, request: Request, db: Session, device_info: str | None) -> dict:
    refresh_token = secrets.token_urlsafe(48)
    now = _utcnow()
    session = models.UserSession(
        user_id=user.id,
        refresh_token_hash=_hash_refresh_token(refresh_token),
        device_info=device_info,
        ip_address=request.client.host if request.client else None,
        is_active=True,
        expires_at=now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        last_used=now,
    )
    db.add(session)
    db.flush()
    access_token = _make_access_token(user, session.id)
    db.commit()
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": _user_payload(user),
    }


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorized

    try:
        claims = jwt.decode(credentials.credentials, _secret_key(), algorithms=[JWT_ALGORITHM])
        if claims.get("type") != "access":
            raise unauthorized
        user_id = int(claims["sub"])
        session_id = int(claims["sid"])
        college_id = int(claims["college_id"])
    except (JWTError, KeyError, TypeError, ValueError):
        raise unauthorized

    session = (
        db.query(models.UserSession)
        .filter(
            models.UserSession.id == session_id,
            models.UserSession.user_id == user_id,
            models.UserSession.is_active.is_(True),
            models.UserSession.expires_at > _utcnow(),
        )
        .first()
    )
    user = (
        db.query(models.User)
        .join(models.College, models.College.id == models.User.college_id)
        .filter(
            models.User.id == user_id,
            models.User.college_id == college_id,
            models.User.is_active.is_(True),
            models.College.is_active.is_(True),
        )
        .first()
    )
    if session is None or user is None:
        raise unauthorized
    return user


ADMIN_ROLES = (
    models.UserRole.SUPER_ADMIN,
    models.UserRole.COLLEGE_ADMIN,
    models.UserRole.HOD,
    models.UserRole.ATTENDANCE_MANAGER,
    models.UserRole.READ_ONLY_ADMIN,
)


def require_roles(*roles: models.UserRole) -> Callable:
    def role_dependency(user: models.User = Depends(get_current_user)) -> models.User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions.")
        return user

    return role_dependency


def _attendance_now() -> datetime:
    zone_name = os.getenv("ATTENDANCE_TIMEZONE", "Asia/Kolkata")
    try:
        return datetime.now(ZoneInfo(zone_name)).replace(tzinfo=None)
    except ZoneInfoNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ATTENDANCE_TIMEZONE is not a valid IANA timezone.",
        ) from exc


def _active_policy(db: Session, college_id: int) -> models.AttendancePolicy | None:
    return (
        db.query(models.AttendancePolicy)
        .filter(
            models.AttendancePolicy.college_id == college_id,
            models.AttendancePolicy.is_active.is_(True),
        )
        .first()
    )


def _otp_validity_minutes(policy: models.AttendancePolicy | None) -> int:
    configured_minutes = policy.otp_validity_minutes if policy and policy.otp_validity_minutes is not None else 5
    return min(5, max(2, configured_minutes))


def _policy_requires(policy: models.AttendancePolicy | None, action: str, kind: str) -> bool:
    if action in ("punch_in", "punch_out"):
        return True
    return bool(getattr(policy, f"require_{kind}_for_breaks", False)) if policy else False


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_radius_m = 6_371_000
    lat1_rad, lat2_rad = math.radians(lat1), math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    haversine = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
    )
    return 2 * earth_radius_m * math.asin(min(1.0, math.sqrt(haversine)))


def _log_biometric(
    db: Session,
    user: models.User,
    action: str,
    result: models.VerificationResult,
    request: Request,
    *,
    similarity_score: float | None = None,
    liveness_score: float | None = None,
    liveness_passed: bool | None = None,
    failure_reason: str | None = None,
) -> None:
    db.add(
        models.BiometricVerificationLog(
            user_id=user.id,
            college_id=user.college_id,
            action=action,
            result=result,
            similarity_score=similarity_score,
            liveness_score=liveness_score,
            liveness_passed=liveness_passed,
            failure_reason=failure_reason,
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()


def _verify_liveness(
    db: Session,
    user: models.User,
    action: str,
    token: str,
    frames: list[str],
    request: Request,
) -> float | None:
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    challenge = (
        db.query(models.LivenessChallenge)
        .filter(
            models.LivenessChallenge.token_hash == token_hash,
            models.LivenessChallenge.user_id == user.id,
            models.LivenessChallenge.college_id == user.college_id,
            models.LivenessChallenge.action == action,
            models.LivenessChallenge.is_used.is_(False),
            models.LivenessChallenge.expires_at > _utcnow(),
        )
        .with_for_update()
        .first()
    )
    if challenge is None:
        _log_biometric(
            db, user, action, models.VerificationResult.FAIL, request,
            liveness_passed=False, failure_reason="invalid_or_expired_challenge",
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired liveness challenge.")

    challenge.is_used = True
    instruction = challenge.instruction
    db.commit()
    try:
        is_live, score = liveness_service.verify_sequence(instruction, frames)
    except liveness_service.LivenessUnavailable as exc:
        _log_biometric(
            db, user, action, models.VerificationResult.ERROR, request,
            liveness_passed=False, failure_reason="liveness_provider_unavailable",
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Liveness verification is unavailable; face enrollment was not completed."
                if action == "enrollment"
                else "Liveness verification is unavailable; attendance was not recorded."
            ),
        ) from exc

    if not is_live:
        _log_biometric(
            db, user, action, models.VerificationResult.FAIL, request,
            liveness_score=score, liveness_passed=False, failure_reason="liveness_check_failed",
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Liveness verification failed.")
    return score


def _verify_face(
    db: Session,
    user: models.User,
    action: str,
    token: str,
    frames: list[str],
    face_image: str,
    request: Request,
    *,
    enrollment: bool = False,
) -> tuple[bool, float, float | None, object]:
    liveness_score = _verify_liveness(db, user, action, token, frames, request)
    template = None
    if not enrollment:
        template = (
            db.query(models.BiometricTemplate)
            .filter(
                models.BiometricTemplate.user_id == user.id,
                models.BiometricTemplate.college_id == user.college_id,
                models.BiometricTemplate.enrollment_status == models.BiometricStatus.APPROVED,
                models.BiometricTemplate.face_embedding.isnot(None),
            )
            .first()
        )
        if template is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Approved biometric enrollment is required before attendance.",
            )

    try:
        current_embedding = face_service.embedding_from_base64(face_image)
        if enrollment:
            return True, 1.0, liveness_score, current_embedding
        stored_embedding = face_service.decrypt_embedding(template.face_embedding)
        matched, score = face_service.compare_embeddings(stored_embedding, current_embedding)
    except face_service.FaceCaptureError as exc:
        _log_biometric(
            db, user, action, models.VerificationResult.FAIL, request,
            liveness_score=liveness_score, liveness_passed=True,
            failure_reason=str(exc)[:255],
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except face_service.FaceServiceUnavailable as exc:
        _log_biometric(
            db, user, action, models.VerificationResult.ERROR, request,
            liveness_score=liveness_score, liveness_passed=True,
            failure_reason="face_service_unavailable",
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Face verification is unavailable; attendance was not recorded.",
        ) from exc

    _log_biometric(
        db, user, action,
        models.VerificationResult.PASS if matched else models.VerificationResult.FAIL,
        request,
        similarity_score=score,
        liveness_score=liveness_score,
        liveness_passed=True,
        failure_reason=None if matched else "face_match_failed",
    )
    if not matched:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Face verification failed.")
    return True, score, liveness_score, current_embedding


def _verify_location(
    db: Session,
    user: models.User,
    action: str,
    payload: AttendanceActionRequest,
) -> tuple[float, models.CollegeLocation]:
    location = (
        db.query(models.CollegeLocation)
        .filter(
            models.CollegeLocation.college_id == user.college_id,
            models.CollegeLocation.is_active.is_(True),
        )
        .first()
    )
    if location is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The college attendance location has not been configured.",
        )

    failure = None
    distance = None
    if payload.latitude is None or payload.longitude is None or payload.accuracy is None:
        failure = "location_required"
    elif payload.accuracy > location.min_gps_accuracy:
        failure = "gps_accuracy_too_low"
    else:
        distance = _haversine_m(
            payload.latitude,
            payload.longitude,
            location.latitude,
            location.longitude,
        )
        if distance + payload.accuracy > location.geofence_radius:
            failure = "outside_geofence"
    db.add(
        models.LocationVerificationLog(
            user_id=user.id,
            college_id=user.college_id,
            action=action,
            latitude=payload.latitude,
            longitude=payload.longitude,
            accuracy=payload.accuracy,
            distance_m=distance,
            geofence_radius=location.geofence_radius,
            result=models.VerificationResult.FAIL if failure else models.VerificationResult.PASS,
            failure_reason=failure,
        )
    )
    db.commit()
    if failure:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Location verification failed.",
        )
    return distance, location


def _working_minutes(started: datetime, ended: datetime) -> int:
    return max(0, int((ended - started).total_seconds() // 60))


def _attendance_payload(record: models.AttendanceRecord) -> dict:
    active_break = next((item for item in record.breaks if item.break_end is None), None)
    return {
        "id": record.id,
        "date": record.date,
        "status": record.status.value,
        "punch_in_time": record.punch_in_time,
        "punch_out_time": record.punch_out_time,
        "total_working_minutes": record.total_working_minutes or 0,
        "total_break_minutes": record.total_break_minutes or 0,
        "net_working_minutes": record.net_working_minutes or 0,
        "is_late": bool(record.is_late),
        "late_by_minutes": record.late_by_minutes or 0,
        "is_early_departure": bool(record.is_early_departure),
        "overtime_minutes": record.overtime_minutes or 0,
        "active_break_started_at": active_break.break_start if active_break else None,
    }


WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

def _weekly_lecture_payload(lecture: models.WeeklyLecture) -> dict:
    sub_name = None
    sub_emp_id = None
    if lecture.substitute_faculty:
        sub_name = lecture.substitute_faculty.full_name
        sub_emp_id = lecture.substitute_faculty.employee_id

    room_display = lecture.room
    building = None
    floor = None
    if lecture.classroom:
        room_display = f"{lecture.classroom.building} - {lecture.classroom.room_number}" if lecture.classroom.building else lecture.classroom.room_number
        building = lecture.classroom.building
        floor = lecture.classroom.floor

    course_display = lecture.course_name
    course_code = None
    if lecture.course_rel:
        course_display = lecture.course_rel.name
        course_code = lecture.course_rel.code

    subject_display = lecture.subject
    subject_code = None
    if lecture.subject_rel:
        subject_display = lecture.subject_rel.name
        subject_code = lecture.subject_rel.code

    day_idx = lecture.day_of_week
    day_name = WEEKDAY_NAMES[day_idx] if 0 <= day_idx < len(WEEKDAY_NAMES) else f"Day {day_idx}"

    return {
        "id": lecture.id,
        "user_id": lecture.user_id,
        "faculty_name": lecture.user.full_name if lecture.user else "Unknown Faculty",
        "employee_id": lecture.user.employee_id if lecture.user else "",
        "faculty_email": lecture.user.email if lecture.user else "",
        "department_id": lecture.department_id,
        "department_name": lecture.department.name if lecture.department else None,
        "subject_id": lecture.subject_id,
        "subject": subject_display,
        "subject_code": subject_code,
        "course_id": lecture.course_id,
        "course_name": course_display,
        "course_code": course_code,
        "academic_year_id": lecture.academic_year_id,
        "academic_year_name": lecture.academic_year.name if lecture.academic_year else None,
        "classroom_id": lecture.classroom_id,
        "room": room_display,
        "room_number": lecture.classroom.room_number if lecture.classroom else (lecture.room or "TBA"),
        "building": building,
        "floor": floor,
        "semester": lecture.semester,
        "lecture_type": lecture.lecture_type or "Theory",
        "day_of_week": lecture.day_of_week,
        "day_name": day_name,
        "start_time": lecture.start_time.strftime("%H:%M") if hasattr(lecture.start_time, "strftime") else str(lecture.start_time)[:5],
        "end_time": lecture.end_time.strftime("%H:%M") if hasattr(lecture.end_time, "strftime") else str(lecture.end_time)[:5],
        "status": lecture.status or "scheduled",
        "cancellation_reason": lecture.cancellation_reason,
        "substitute_faculty_id": lecture.substitute_faculty_id,
        "substitute_faculty_name": sub_name,
        "substitute_employee_id": sub_emp_id,
        "is_active": lecture.is_active,
        "created_at": lecture.created_at.isoformat() if lecture.created_at else None,
        # backward compatibility keys:
        "user_name": lecture.user.full_name if lecture.user else "Unknown",
        "department": lecture.department.name if lecture.department else None,
    }


def _additional_lecture_payload(item: models.AdditionalLectureRequest) -> dict:
    return {
        "id": item.id,
        "user_id": item.user_id,
        "user_name": item.user.full_name,
        "employee_id": item.user.employee_id,
        "department_id": item.user.department_id,
        "department": item.user.department.name if item.user.department else None,
        "lecture_date": item.lecture_date,
        "subject": item.subject,
        "start_time": item.start_time.strftime("%H:%M"),
        "end_time": item.end_time.strftime("%H:%M"),
        "room": item.room,
        "reason": item.reason,
        "status": item.status,
        "reviewed_at": item.reviewed_at,
        "review_remarks": item.review_remarks,
        "created_at": item.created_at,
    }


def _lecture_attendance_payload(record: models.LectureAttendanceRecord) -> dict:
    return {
        "id": record.id,
        "source_type": "weekly" if record.weekly_lecture_id is not None else "additional",
        "schedule_id": record.weekly_lecture_id or record.additional_lecture_request_id,
        "lecture_date": record.lecture_date,
        "punch_in_time": record.punch_in_time,
        "punch_out_time": record.punch_out_time,
        "status": "completed" if record.punch_out_time else "in_progress",
        "punch_in_face_verified": bool(record.punch_in_face_verified),
        "punch_out_face_verified": bool(record.punch_out_face_verified),
    }


def _lecture_occurrence_payload(
    lecture_date: date,
    now: datetime,
    source_type: str,
    schedule_id: int,
    subject: str,
    course_name: str | None,
    department: str | None,
    room: str | None,
    start_time: time_type,
    end_time: time_type,
    record: models.LectureAttendanceRecord | None,
) -> dict:
    starts_at = datetime.combine(lecture_date, start_time)
    ends_at = datetime.combine(lecture_date, end_time)
    is_today = lecture_date == now.date()
    elapsed_end = min(ends_at, now) if lecture_date <= now.date() else starts_at
    scheduled_minutes = _working_minutes(starts_at, ends_at)
    elapsed_scheduled_minutes = _working_minutes(starts_at, max(starts_at, elapsed_end))
    actual_start = max(starts_at, record.punch_in_time) if record and record.punch_in_time else None
    actual_end = (
        min(elapsed_end, record.punch_out_time or now)
        if actual_start is not None
        else None
    )
    worked_minutes = (
        _working_minutes(actual_start, actual_end)
        if actual_start is not None and actual_end is not None and actual_end > actual_start
        else 0
    )
    can_punch_in = bool(
        is_today
        and (record is None or record.punch_in_time is None)
        and starts_at - timedelta(minutes=15) <= now <= ends_at
    )
    can_punch_out = bool(
        is_today
        and record is not None
        and record.punch_in_time is not None
        and record.punch_out_time is None
        and record.punch_in_time <= now <= ends_at + timedelta(minutes=15)
    )
    if record and record.punch_out_time:
        attendance_status = "completed"
    elif record and record.punch_in_time:
        attendance_status = "in_progress"
    elif starts_at > now:
        attendance_status = "upcoming"
    elif now > ends_at:
        attendance_status = "missed"
    else:
        attendance_status = "scheduled"
    return {
        "source_type": source_type,
        "schedule_id": schedule_id,
        "lecture_date": lecture_date,
        "subject": subject,
        "course_name": course_name,
        "department": department,
        "room": room,
        "start_time": start_time.strftime("%H:%M"),
        "end_time": end_time.strftime("%H:%M"),
        "status": attendance_status,
        "punch_in_time": record.punch_in_time if record else None,
        "punch_out_time": record.punch_out_time if record else None,
        "scheduled_minutes": scheduled_minutes,
        "worked_minutes": worked_minutes,
        "not_worked_minutes": max(0, elapsed_scheduled_minutes - worked_minutes),
        "can_punch_in": can_punch_in,
        "can_punch_out": can_punch_out,
        "punch_out_window_closed": bool(
            record
            and record.punch_in_time
            and record.punch_out_time is None
            and (
                lecture_date < now.date()
                or is_today and now > ends_at + timedelta(minutes=15)
            )
        ),
    }


def _lecture_calendar_payload(
    db: Session,
    user: models.User,
    start_date: date,
    end_date: date,
    now: datetime,
) -> list[dict]:
    weekly_lectures = (
        db.query(models.WeeklyLecture)
        .filter(
            models.WeeklyLecture.user_id == user.id,
            models.WeeklyLecture.college_id == user.college_id,
            models.WeeklyLecture.is_active.is_(True),
        )
        .all()
    )
    additional_lectures = (
        db.query(models.AdditionalLectureRequest)
        .filter(
            models.AdditionalLectureRequest.user_id == user.id,
            models.AdditionalLectureRequest.college_id == user.college_id,
            models.AdditionalLectureRequest.lecture_date >= start_date,
            models.AdditionalLectureRequest.lecture_date <= end_date,
            models.AdditionalLectureRequest.status == "approved",
        )
        .all()
    )
    records = (
        db.query(models.LectureAttendanceRecord)
        .filter(
            models.LectureAttendanceRecord.user_id == user.id,
            models.LectureAttendanceRecord.college_id == user.college_id,
            models.LectureAttendanceRecord.lecture_date >= start_date,
            models.LectureAttendanceRecord.lecture_date <= end_date,
        )
        .all()
    )
    weekly_records = {
        (item.lecture_date, item.weekly_lecture_id): item
        for item in records
        if item.weekly_lecture_id is not None
    }
    additional_records = {
        (item.lecture_date, item.additional_lecture_request_id): item
        for item in records
        if item.additional_lecture_request_id is not None
    }
    weekly_by_day = {
        weekday: [lecture for lecture in weekly_lectures if lecture.day_of_week == weekday]
        for weekday in range(7)
    }
    additional_by_date: dict[date, list[models.AdditionalLectureRequest]] = {}
    for lecture in additional_lectures:
        additional_by_date.setdefault(lecture.lecture_date, []).append(lecture)

    calendar = []
    current_date = start_date
    while current_date <= end_date:
        occurrences = [
            _lecture_occurrence_payload(
                current_date,
                now,
                "weekly",
                lecture.id,
                lecture.subject,
                lecture.course_name,
                lecture.department.name if lecture.department else None,
                lecture.room,
                lecture.start_time,
                lecture.end_time,
                weekly_records.get((current_date, lecture.id)),
            )
            for lecture in weekly_by_day[current_date.weekday()]
        ]
        occurrences.extend(
            _lecture_occurrence_payload(
                current_date,
                now,
                "additional",
                lecture.id,
                lecture.subject,
                None,
                user.department.name if user.department else None,
                lecture.room,
                lecture.start_time,
                lecture.end_time,
                additional_records.get((current_date, lecture.id)),
            )
            for lecture in additional_by_date.get(current_date, [])
        )
        occurrences.sort(key=lambda item: item["start_time"])
        attended_count = sum(bool(item["punch_in_time"]) for item in occurrences)
        missed_count = sum(item["status"] == "missed" for item in occurrences)
        if not occurrences:
            day_status = "no_lecture"
        elif missed_count:
            day_status = "missed"
        elif attended_count == len(occurrences):
            day_status = "attended"
        else:
            day_status = "scheduled"
        calendar.append({
            "date": current_date,
            "status": day_status,
            "scheduled_lectures": len(occurrences),
            "attended_lectures": attended_count,
            "missed_lectures": missed_count,
            "lectures": occurrences,
        })
        current_date += timedelta(days=1)
    return calendar


def _count_leave_days(
    db: Session,
    college_id: int,
    start_date: date,
    end_date: date,
) -> int:
    holiday_dates = {
        row[0]
        for row in db.query(models.Holiday.date)
        .filter(
            models.Holiday.college_id == college_id,
            models.Holiday.date >= start_date,
            models.Holiday.date <= end_date,
        )
        .all()
    }
    count = 0
    current = start_date
    while current <= end_date:
        if current.weekday() < 5 and current not in holiday_dates:
            count += 1
        current += timedelta(days=1)
    return count


def _user_can_review(admin: models.User, employee: models.User) -> bool:
    return admin.role == models.UserRole.SUPER_ADMIN or (
        admin.role == models.UserRole.HOD
        and employee.department_id is not None
        and employee.department_id == admin.department_id
    )


def _pending_leave_count(db: Session, admin: models.User) -> int:
    query = (
        db.query(models.LeaveApplication.id)
        .join(models.User, models.User.id == models.LeaveApplication.user_id)
        .filter(
            models.LeaveApplication.college_id == admin.college_id,
            models.LeaveApplication.status == models.LeaveStatus.PENDING,
        )
    )
    if admin.role == models.UserRole.HOD:
        query = query.filter(models.User.department_id == admin.department_id)
    return query.count()


def _pending_biometric_count(db: Session, admin: models.User) -> int:
    query = (
        db.query(models.BiometricEnrollment.id)
        .join(models.User, models.User.id == models.BiometricEnrollment.user_id)
        .filter(
            models.BiometricEnrollment.college_id == admin.college_id,
            models.BiometricEnrollment.status == models.BiometricStatus.PENDING_APPROVAL,
        )
    )
    if admin.role == models.UserRole.HOD:
        query = query.filter(models.User.department_id == admin.department_id)
    return query.count()


def _auto_sync_missing_columns(target_engine):
    """Automatically adds columns defined in models.py that do not yet exist in the DB."""
    if getattr(target_engine, "dialect", None) and target_engine.dialect.name == "sqlite":
        return
    from sqlalchemy import inspect, text
    try:
        inspector = inspect(target_engine)
        existing_tables = set(inspector.get_table_names())
        with target_engine.connect() as conn:
            for table_name, table in Base.metadata.tables.items():
                if table_name in existing_tables:
                    existing_cols = {c["name"] for c in inspector.get_columns(table_name)}
                    for col in table.columns:
                        if col.name not in existing_cols:
                            col_type = col.type.compile(target_engine.dialect)
                            nullable = "NULL" if col.nullable else "NOT NULL DEFAULT ''"
                            try:
                                conn.execute(text(f"ALTER TABLE `{table_name}` ADD COLUMN `{col.name}` {col_type} {nullable}"))
                                conn.commit()
                            except Exception:
                                pass
    except Exception:
        pass


def create_app() -> FastAPI:
    Base.metadata.create_all(bind=engine)
    _auto_sync_missing_columns(engine)
    app = FastAPI(title="AttendEase API", version="1.0.0")
    allowed_origins = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173",
        ).split(",")
        if origin.strip()
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.get("/auth/colleges")
    def list_registration_colleges(db: Session = Depends(get_db)):
        colleges = (
            db.query(models.College.id, models.College.name)
            .filter(models.College.is_active.is_(True))
            .order_by(func.lower(models.College.name), models.College.id)
            .all()
        )
        return [{"id": college.id, "name": college.name} for college in colleges]

    @app.post("/auth/register", status_code=status.HTTP_201_CREATED)
    def register(payload: RegistrationRequest, request: Request, db: Session = Depends(get_db)):
        now = _utcnow()
        ip_address = request.client.host if request.client else None
        if ip_address:
            recent_registrations = (
                db.query(models.SecurityEvent.id)
                .filter(
                    models.SecurityEvent.event_type == "auth.registration.created",
                    models.SecurityEvent.ip_address == ip_address,
                    models.SecurityEvent.created_at >= now - timedelta(hours=1),
                )
                .limit(10)
                .count()
            )
            recent_pending_registrations = (
                db.query(models.PendingRegistration.id)
                .filter(
                    models.PendingRegistration.ip_address == ip_address,
                    models.PendingRegistration.created_at >= now - timedelta(hours=1),
                )
                .limit(10)
                .count()
            )
            if recent_registrations + recent_pending_registrations >= 10:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many registrations from this connection. Try again later.",
                )

        college = (
            db.query(models.College)
            .filter(models.College.id == payload.college_id, models.College.is_active.is_(True))
            .first()
        )
        if college is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Selected college was not found or is inactive.")
        if not hmac.compare_digest(college.code.upper(), payload.college_code.strip().upper()):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The College ID does not match the selected college.")

        email = str(payload.email).strip().lower()
        duplicate = (
            db.query(models.User.id)
            .filter(
                models.User.college_id == college.id,
                func.lower(models.User.email) == email,
            )
            .first()
        )
        if duplicate:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That email is already registered with this college.")
        employee_id = payload.employee_id.strip()
        duplicate_employee_id = db.query(models.User.id).filter(
            models.User.college_id == college.id,
            models.User.employee_id == employee_id,
        ).first()
        if duplicate_employee_id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That employee ID is already registered with this college.")

        duplicate_pending_email = db.query(models.PendingRegistration.id).filter(
            models.PendingRegistration.college_id == college.id,
            func.lower(models.PendingRegistration.email) == email,
        ).first()
        if duplicate_pending_email:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A registration is already pending for this email. Verify it or request a new code.")
        duplicate_pending_employee = db.query(models.PendingRegistration.id).filter(
            models.PendingRegistration.college_id == college.id,
            models.PendingRegistration.employee_id == employee_id,
        ).first()
        if duplicate_pending_employee:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That employee ID is already used by a pending registration.")

        otp = f"{secrets.randbelow(900000) + 100000:06d}"
        pending = models.PendingRegistration(
            college_id=college.id,
            employee_id=employee_id,
            full_name=payload.full_name.strip(),
            email=email,
            phone=payload.phone.strip() if payload.phone else None,
            password_hash=hash_password(payload.password),
            otp_hash=_hash_otp(email, otp),
            attempts=0,
            expires_at=now + timedelta(minutes=5),
            otp_created_at=now,
            ip_address=ip_address,
        )
        db.add(pending)
        try:
            _send_otp_email(email, otp)
            db.commit()
        except HTTPException:
            db.rollback()
            raise
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The college code, email, or employee ID is already registered.") from exc

        return {
            "message": "We sent a six-digit verification code to your email address.",
            "email": email,
            "role": models.UserRole.FACULTY.value,
        }

    @app.post("/auth/register/resend", status_code=status.HTTP_202_ACCEPTED)
    def resend_registration_otp(
        payload: RegistrationOtpRequest,
        db: Session = Depends(get_db),
    ):
        email = str(payload.email).strip().lower()
        college = db.query(models.College).filter(
            models.College.id == payload.college_id,
            models.College.is_active.is_(True),
        ).first()
        if college is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No pending registration was found for that college and email.")
        pending = (
            db.query(models.PendingRegistration)
            .filter(
                models.PendingRegistration.college_id == college.id,
                func.lower(models.PendingRegistration.email) == email,
            )
            .first()
        )
        if pending is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No pending registration was found for that college and email.")
        now = _utcnow()
        if (now - pending.otp_created_at).total_seconds() < 60:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Wait one minute before requesting another verification code.")
        otp = f"{secrets.randbelow(900000) + 100000:06d}"
        pending.otp_hash = _hash_otp(email, otp)
        pending.attempts = 0
        pending.expires_at = now + timedelta(minutes=5)
        pending.otp_created_at = now
        try:
            _send_otp_email(email, otp)
            db.commit()
        except HTTPException:
            db.rollback()
            raise
        return {"message": "A new verification code was sent to your email address."}

    @app.post("/auth/register/verify")
    def verify_registration_otp(
        payload: RegistrationOtpVerification,
        db: Session = Depends(get_db),
    ):
        email = str(payload.email).strip().lower()
        college = db.query(models.College).filter(
            models.College.id == payload.college_id,
            models.College.is_active.is_(True),
        ).first()
        if college is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired verification code.")
        pending = (
            db.query(models.PendingRegistration)
            .filter(
                models.PendingRegistration.college_id == college.id,
                func.lower(models.PendingRegistration.email) == email,
            )
            .first()
        )
        if pending is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired verification code.")
        now = _utcnow()
        if pending.expires_at <= now:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired verification code.")
        if not hmac.compare_digest(pending.otp_hash, _hash_otp(email, payload.otp)):
            pending.attempts += 1
            if pending.attempts >= 3:
                pending.expires_at = now
            db.commit()
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired verification code.")

        existing_user = db.query(models.User.id).filter(
            models.User.college_id == college.id,
            func.lower(models.User.email) == email,
        ).first()
        if existing_user:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That email is already registered with this college.")
        existing_employee = db.query(models.User.id).filter(
            models.User.college_id == college.id,
            models.User.employee_id == pending.employee_id,
        ).first()
        if existing_employee:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That employee ID is already registered with this college.")

        try:
            user = models.User(
                college_id=college.id,
                employee_id=pending.employee_id,
                full_name=pending.full_name,
                email=email,
                phone=pending.phone,
                password_hash=pending.password_hash,
                role=models.UserRole.FACULTY,
                email_verified=True,
                is_active=True,
            )
            db.add(user)
            db.flush()
            db.add(
                models.SecurityEvent(
                    college_id=college.id,
                    user_id=user.id,
                    event_type="auth.registration.created",
                    severity="low",
                    description="User completed email-verified self-registration.",
                    ip_address=pending.ip_address,
                )
            )
            db.delete(pending)
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="That email or employee ID has already been registered with this college.",
            ) from exc
        return {"message": "Email verified. You can now sign in."}

    @app.post("/auth/login")
    def password_login(
        payload: PasswordLogin,
        request: Request,
        db: Session = Depends(get_db),
    ):
        now = _utcnow()
        ip_address = request.client.host if request.client else None
        if ip_address:
            recent_ip_failures = (
                db.query(models.SecurityEvent.id)
                .filter(
                    models.SecurityEvent.event_type == "auth.password.failed",
                    models.SecurityEvent.ip_address == ip_address,
                    models.SecurityEvent.created_at >= now - timedelta(minutes=15),
                )
                .limit(20)
                .count()
            )
            if recent_ip_failures >= 20:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many sign-in attempts. Wait 15 minutes before trying again.",
                )

        email = str(payload.email).strip().lower()
        user = (
            db.query(models.User)
            .join(models.College, models.College.id == models.User.college_id)
            .filter(
                func.lower(models.User.email) == email,
                models.User.is_active.is_(True),
                models.College.is_active.is_(True),
                models.User.role.in_((models.UserRole.FACULTY, models.UserRole.STAFF)),
            )
            .first()
        )
        recent_user_failures = 0
        if user is not None:
            recent_user_failures = (
                db.query(models.SecurityEvent.id)
                .filter(
                    models.SecurityEvent.event_type == "auth.password.failed",
                    models.SecurityEvent.user_id == user.id,
                    models.SecurityEvent.created_at >= now - timedelta(minutes=15),
                )
                .limit(5)
                .count()
            )

        password_matches = verify_password(
            payload.password,
            user.password_hash if user is not None and recent_user_failures < 5 else None,
        )
        if user is None or recent_user_failures >= 5 or not password_matches:
            db.add(
                models.SecurityEvent(
                    college_id=user.college_id if user is not None else None,
                    user_id=user.id if user is not None else None,
                    event_type="auth.password.failed",
                    severity="medium",
                    description="Password sign-in failed.",
                    ip_address=ip_address,
                )
            )
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Email or password is incorrect.",
            )

        return _issue_session(user, request, db, payload.device_info)

    @app.post("/auth/admin-login")
    def admin_username_login(
        payload: AdminUsernameLogin,
        request: Request,
        db: Session = Depends(get_db),
    ):
        now = _utcnow()
        ip_address = request.client.host if request.client else None

        # Rate-limit by IP (20 failures in 15 min)
        if ip_address:
            recent_ip_failures = (
                db.query(models.SecurityEvent.id)
                .filter(
                    models.SecurityEvent.event_type == "auth.admin.failed",
                    models.SecurityEvent.ip_address == ip_address,
                    models.SecurityEvent.created_at >= now - timedelta(minutes=15),
                )
                .limit(20)
                .count()
            )
            if recent_ip_failures >= 20:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many sign-in attempts. Wait 15 minutes before trying again.",
                )

        username = payload.username.strip().lower()
        admin_account = (
            db.query(models.AdminUser)
            .join(models.User, models.User.id == models.AdminUser.user_id)
            .join(models.College, models.College.id == models.AdminUser.college_id)
            .filter(
                func.lower(models.AdminUser.username) == username,
                models.AdminUser.is_active.is_(True),
                models.User.college_id == models.AdminUser.college_id,
                models.User.role.in_(ADMIN_ROLES),
                models.User.is_active.is_(True),
                models.College.is_active.is_(True),
            )
            .first()
        )

        password_ok = verify_password(
            payload.password,
            admin_account.password_hash if admin_account is not None else None,
        )

        if admin_account is None or not password_ok:
            admin = admin_account.user if admin_account is not None else None
            db.add(
                models.SecurityEvent(
                    college_id=admin.college_id if admin is not None else None,
                    user_id=admin.id if admin is not None else None,
                    event_type="auth.admin.failed",
                    severity="medium",
                    description="Admin portal sign-in failed.",
                    ip_address=ip_address,
                )
            )
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Username or password is incorrect.",
            )

        return _issue_session(admin_account.user, request, db, None)

    @app.post("/auth/password/change")
    def change_password(
        payload: PasswordChange,
        user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        admin_account = (
            db.query(models.AdminUser)
            .filter(
                models.AdminUser.user_id == user.id,
                models.AdminUser.is_active.is_(True),
            )
            .first()
        )
        current_password_hash = admin_account.password_hash if admin_account else user.password_hash
        if not verify_password(payload.current_password, current_password_hash):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect.")
        if hmac.compare_digest(payload.current_password, payload.new_password):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose a new password different from your current password.")
        new_password_hash = hash_password(payload.new_password)
        user.password_hash = new_password_hash
        if admin_account:
            admin_account.password_hash = new_password_hash
        db.query(models.UserSession).filter(
            models.UserSession.user_id == user.id,
            models.UserSession.is_active.is_(True),
        ).update({"is_active": False}, synchronize_session=False)
        db.commit()
        return {"message": "Password changed. Sign in again to continue."}

    @app.post("/auth/otp/request", status_code=status.HTTP_202_ACCEPTED)
    def request_otp(payload: OTPRequest, request: Request, db: Session = Depends(get_db)):
        email = str(payload.email).strip().lower()
        now = _utcnow()
        ip_address = request.client.host if request.client else None
        rate_limit = max(1, int(os.getenv("OTP_SENDS_PER_MINUTE", "5")))
        if ip_address:
            recent_requests = (
                db.query(models.OTPVerification.id)
                .filter(
                    models.OTPVerification.ip_address == ip_address,
                    models.OTPVerification.created_at >= now - timedelta(minutes=1),
                )
                .limit(rate_limit)
                .count()
            )
            if recent_requests >= rate_limit:
                return {"message": "If an active account exists, a sign-in code has been sent."}

        user = (
            db.query(models.User)
            .filter(func.lower(models.User.email) == email, models.User.is_active.is_(True))
            .first()
        )
        if user is None or user.role in (models.UserRole.SUPER_ADMIN, models.UserRole.HOD):
            return {"message": "If an active account exists, a sign-in code has been sent."}

        policy = (
            db.query(models.AttendancePolicy)
            .filter(
                models.AttendancePolicy.college_id == user.college_id,
                models.AttendancePolicy.is_active.is_(True),
            )
            .first()
        )
        cooldown = 60
        validity_minutes = _otp_validity_minutes(policy)
        latest = (
            db.query(models.OTPVerification)
            .filter(models.OTPVerification.user_id == user.id, models.OTPVerification.purpose == "login")
            .order_by(models.OTPVerification.created_at.desc())
            .first()
        )
        if latest and (now - latest.created_at).total_seconds() < cooldown:
            return {"message": "If an active account exists, a sign-in code has been sent."}

        otp = f"{secrets.randbelow(900000) + 100000:06d}"
        db.query(models.OTPVerification).filter(
            models.OTPVerification.user_id == user.id,
            models.OTPVerification.purpose == "login",
            models.OTPVerification.is_used.is_(False),
        ).update({"is_used": True}, synchronize_session=False)
        record = models.OTPVerification(
            user_id=user.id,
            otp_hash=_hash_otp(email, otp),
            purpose="login",
            attempts=0,
            is_used=False,
            expires_at=now + timedelta(minutes=validity_minutes),
            ip_address=ip_address,
        )
        db.add(record)
        db.commit()

        try:
            _send_otp_email(email, otp, validity_minutes)
        except HTTPException:
            record.is_used = True
            db.commit()
            raise
        return {"message": "If an active account exists, a sign-in code has been sent."}

    @app.post("/auth/otp/verify")
    def verify_otp(payload: OTPVerification, request: Request, db: Session = Depends(get_db)):
        email = str(payload.email).strip().lower()
        user = (
            db.query(models.User)
            .filter(func.lower(models.User.email) == email, models.User.is_active.is_(True))
            .first()
        )
        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired sign-in code.")
        if user.role in (models.UserRole.SUPER_ADMIN, models.UserRole.HOD):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin accounts must use username and password sign-in.",
            )

        policy = (
            db.query(models.AttendancePolicy)
            .filter(
                models.AttendancePolicy.college_id == user.college_id,
                models.AttendancePolicy.is_active.is_(True),
            )
            .first()
        )
        max_attempts = max(1, policy.max_otp_attempts if policy else 3)
        now = _utcnow()
        record = (
            db.query(models.OTPVerification)
            .filter(
                models.OTPVerification.user_id == user.id,
                models.OTPVerification.purpose == "login",
                models.OTPVerification.is_used.is_(False),
                models.OTPVerification.expires_at > now,
            )
            .order_by(models.OTPVerification.created_at.desc())
            .first()
        )
        if record is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired sign-in code.")

        if not hmac.compare_digest(record.otp_hash, _hash_otp(email, payload.otp)):
            record.attempts += 1
            if record.attempts >= max_attempts:
                record.is_used = True
            db.commit()
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired sign-in code.")

        if payload.portal == "admin" and user.role not in (models.UserRole.SUPER_ADMIN, models.UserRole.HOD):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This account must use the user sign-in portal.",
            )
        if payload.portal == "user" and user.role in (models.UserRole.SUPER_ADMIN, models.UserRole.HOD):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This account must use the admin sign-in portal.",
            )

        record.is_used = True
        tokens = _issue_session(user, request, db, payload.device_info)
        return tokens

    @app.post("/auth/refresh")
    def refresh_tokens(payload: RefreshRequest, db: Session = Depends(get_db)):
        old_hash = _hash_refresh_token(payload.refresh_token)
        session = (
            db.query(models.UserSession)
            .filter(
                models.UserSession.refresh_token_hash == old_hash,
                models.UserSession.is_active.is_(True),
                models.UserSession.expires_at > _utcnow(),
            )
            .with_for_update()
            .first()
        )
        if session is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token.")
        user = (
            db.query(models.User)
            .join(models.College, models.College.id == models.User.college_id)
            .filter(
                models.User.id == session.user_id,
                models.User.is_active.is_(True),
                models.College.is_active.is_(True),
            )
            .first()
        )
        if user is None:
            session.is_active = False
            db.commit()
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account is inactive.")

        now = _utcnow()
        refresh_token = secrets.token_urlsafe(48)
        updated = (
            db.query(models.UserSession)
            .filter(
                models.UserSession.id == session.id,
                models.UserSession.refresh_token_hash == old_hash,
                models.UserSession.is_active.is_(True),
                models.UserSession.expires_at > now,
            )
            .update(
                {
                    "refresh_token_hash": _hash_refresh_token(refresh_token),
                    "expires_at": now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
                    "last_used": now,
                },
                synchronize_session=False,
            )
        )
        if updated != 1:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token.")
        access_token = _make_access_token(user, session.id)
        db.commit()
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
        }

    @app.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
    def logout(user: models.User = Depends(get_current_user), credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme), db: Session = Depends(get_db)):
        try:
            claims = jwt.decode(credentials.credentials, _secret_key(), algorithms=[JWT_ALGORITHM])
            session_id = int(claims["sid"])
        except (JWTError, KeyError, TypeError, ValueError):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access token.")
        session = (
            db.query(models.UserSession)
            .filter(models.UserSession.id == session_id, models.UserSession.user_id == user.id)
            .first()
        )
        if session is not None:
            session.is_active = False
            db.commit()

    @app.get("/auth/me", response_model=UserSummary)
    def get_me(user: models.User = Depends(get_current_user)):
        summary = UserSummary.model_validate(user)
        if user.college:
            summary.college_name = user.college.name
            summary.college_code = user.college.code
        return summary

    @app.get("/admin/departments")
    def list_departments(
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN, models.UserRole.HOD)),
        db: Session = Depends(get_db),
    ):
        departments = (
            db.query(models.Department)
            .filter(
                models.Department.college_id == admin.college_id,
                models.Department.is_active.is_(True),
            )
            .order_by(models.Department.name)
            .all()
        )
        return [
            {"id": item.id, "name": item.name, "code": item.code}
            for item in departments
        ]

    @app.post("/admin/departments", status_code=status.HTTP_201_CREATED)
    def create_department(
        payload: DepartmentCreate,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        code = payload.code.strip().upper() if payload.code else None
        department = models.Department(
            college_id=admin.college_id,
            name=payload.name.strip(),
            code=code,
            description=payload.description.strip() if payload.description else None,
            is_active=True,
        )
        db.add(department)
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A department with this code already exists.") from exc
        db.refresh(department)
        return {"id": department.id, "name": department.name, "code": department.code}

    @app.get("/admin/users", response_model=list[UserSummary])
    def list_users(
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        return (
            db.query(models.User)
            .filter(models.User.college_id == admin.college_id)
            .order_by(models.User.full_name)
            .all()
        )

    @app.get("/directory")
    def faculty_directory(
        user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        colleagues = (
            db.query(models.User)
            .filter(
                models.User.college_id == user.college_id,
                models.User.is_active.is_(True),
            )
            .order_by(models.User.full_name)
            .all()
        )
        return [
            {
                "id": colleague.id,
                "employee_id": colleague.employee_id,
                "full_name": colleague.full_name,
                "email": colleague.email,
                "phone": colleague.phone,
                "designation": colleague.designation,
                "role": colleague.role.value,
                "department_id": colleague.department_id,
                "department": colleague.department.name if colleague.department else None,
            }
            for colleague in colleagues
        ]

    @app.get("/projects")
    def list_projects(
        user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        query = db.query(models.Project).filter(models.Project.college_id == user.college_id)
        if user.role == models.UserRole.HOD:
            query = query.filter(
                (models.Project.department_id == user.department_id)
                | (models.Project.department_id.is_(None))
            )
        projects = query.order_by(models.Project.updated_at.desc(), models.Project.name).all()
        return [
            {
                "id": project.id,
                "name": project.name,
                "description": project.description,
                "status": project.status,
                "department": project.department.name if project.department else None,
                "owner": project.owner.full_name if project.owner else None,
                "can_manage": user.role == models.UserRole.SUPER_ADMIN or (
                    user.role == models.UserRole.HOD
                    and project.department_id == user.department_id
                ),
                "created_at": project.created_at,
            }
            for project in projects
        ]

    @app.post("/projects", status_code=status.HTTP_201_CREATED)
    def create_project(
        payload: ProjectCreate,
        user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        if user.role not in (models.UserRole.SUPER_ADMIN, models.UserRole.HOD):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only administrators and HODs can create projects.")
        department_id = payload.department_id
        if user.role == models.UserRole.HOD:
            if department_id not in (None, user.department_id):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only create projects for your department.")
            department_id = user.department_id
        if department_id is not None:
            department = db.query(models.Department).filter(
                models.Department.id == department_id,
                models.Department.college_id == user.college_id,
                models.Department.is_active.is_(True),
            ).first()
            if department is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found.")
        project = models.Project(
            college_id=user.college_id,
            department_id=department_id,
            owner_id=user.id,
            name=payload.name.strip(),
            description=payload.description.strip() if payload.description else None,
            status="active",
        )
        db.add(project)
        db.commit()
        db.refresh(project)
        return {
            "id": project.id,
            "name": project.name,
            "description": project.description,
            "status": project.status,
            "department": project.department.name if project.department else None,
            "owner": user.full_name,
            "can_manage": True,
            "created_at": project.created_at,
        }

    @app.patch("/projects/{project_id}")
    def update_project(
        project_id: int,
        payload: ProjectUpdate,
        user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        project = db.query(models.Project).filter(
            models.Project.id == project_id,
            models.Project.college_id == user.college_id,
        ).first()
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
        can_manage = user.role == models.UserRole.SUPER_ADMIN or (
            user.role == models.UserRole.HOD
            and project.department_id == user.department_id
        )
        if not can_manage:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the project department manager can update its status.")
        project.status = payload.status
        db.commit()
        return {"id": project.id, "status": project.status}

    @app.get("/tasks")
    def list_tasks(
        scope: Literal["assigned_to_me", "assigned_by_me", "all"] = "assigned_to_me",
        project_id: int | None = None,
        user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        query = db.query(models.Task).filter(models.Task.college_id == user.college_id)
        if project_id is not None:
            query = query.filter(models.Task.project_id == project_id)
        if scope == "assigned_to_me":
            query = query.filter(models.Task.assignee_id == user.id)
        elif scope == "assigned_by_me":
            query = query.filter(models.Task.assigned_by_id == user.id)
        elif user.role not in (models.UserRole.SUPER_ADMIN, models.UserRole.HOD):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not allowed to view all college tasks.")
        if scope == "all" and user.role == models.UserRole.HOD:
            query = query.join(models.User, models.User.id == models.Task.assignee_id).filter(
                models.User.department_id == user.department_id
            )
        tasks = query.order_by(models.Task.due_date.is_(None), models.Task.due_date, models.Task.created_at.desc()).all()
        return [
            {
                "id": task.id,
                "title": task.title,
                "description": task.description,
                "project_id": task.project_id,
                "project_name": task.project.name if task.project else None,
                "assignee_id": task.assignee_id,
                "assignee_name": task.assignee.full_name,
                "assigned_by_name": task.assigned_by.full_name if task.assigned_by else None,
                "due_date": task.due_date,
                "status": task.status,
                "progress": task.progress,
                "created_at": task.created_at,
            }
            for task in tasks
        ]

    @app.post("/tasks", status_code=status.HTTP_201_CREATED)
    def create_task(
        payload: TaskCreate,
        user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        if user.role not in (models.UserRole.SUPER_ADMIN, models.UserRole.HOD):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only administrators and HODs can assign tasks.")
        assignee = db.query(models.User).filter(
            models.User.id == payload.assignee_id,
            models.User.college_id == user.college_id,
            models.User.is_active.is_(True),
        ).first()
        if assignee is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active college employee not found.")
        if user.role == models.UserRole.HOD and assignee.department_id != user.department_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only assign tasks within your department.")
        project = None
        if payload.project_id is not None:
            project = db.query(models.Project).filter(
                models.Project.id == payload.project_id,
                models.Project.college_id == user.college_id,
            ).first()
            if project is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
            if user.role == models.UserRole.HOD and project.department_id not in (None, user.department_id):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only assign tasks to projects in your department.")
        task = models.Task(
            college_id=user.college_id,
            project_id=project.id if project else None,
            assignee_id=assignee.id,
            assigned_by_id=user.id,
            title=payload.title.strip(),
            description=payload.description.strip() if payload.description else None,
            due_date=payload.due_date,
            status="todo",
            progress=0,
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        return {
            "id": task.id,
            "title": task.title,
            "description": task.description,
            "project_id": task.project_id,
            "project_name": project.name if project else None,
            "assignee_id": assignee.id,
            "assignee_name": assignee.full_name,
            "assigned_by_name": user.full_name,
            "due_date": task.due_date,
            "status": task.status,
            "progress": task.progress,
            "created_at": task.created_at,
        }

    @app.patch("/tasks/{task_id}")
    def update_task(
        task_id: int,
        payload: TaskUpdate,
        user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        task = db.query(models.Task).filter(
            models.Task.id == task_id,
            models.Task.college_id == user.college_id,
        ).first()
        if task is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")
        assignee = db.get(models.User, task.assignee_id)
        can_manage = user.role == models.UserRole.SUPER_ADMIN or (
            user.role == models.UserRole.HOD
            and assignee is not None
            and assignee.department_id == user.department_id
        )
        if user.id != task.assignee_id and not can_manage:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the assignee or their college manager can update this task.")
        previous_status = task.status
        if payload.status is not None:
            task.status = payload.status
            if payload.status == "completed":
                task.progress = 100
            elif previous_status == "completed" and payload.progress is None:
                task.progress = 0
        if payload.progress is not None:
            task.progress = payload.progress
            if payload.progress == 100:
                task.status = "completed"
            elif task.status == "completed":
                task.status = "in_progress" if payload.progress else "todo"
        db.commit()
        db.refresh(task)
        return {
            "id": task.id,
            "status": task.status,
            "progress": task.progress,
        }

    @app.post("/admin/users", response_model=UserSummary, status_code=status.HTTP_201_CREATED)
    def create_employee(
        payload: EmployeeCreate,
        request: Request,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        if payload.role == models.UserRole.SUPER_ADMIN:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Use the platform bootstrap process to add a super administrator.")
        email = str(payload.email).strip().lower()
        username = payload.username.strip().lower() if payload.username else None
        if username and db.query(models.User.id).filter(func.lower(models.User.username) == username).first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That admin username is already in use.")
        if username and db.query(models.AdminUser.id).filter(func.lower(models.AdminUser.username) == username).first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That admin username is already in use.")
        duplicate = (
            db.query(models.User.id)
            .filter(
                models.User.college_id == admin.college_id,
                func.lower(models.User.email) == email,
            )
            .first()
        )
        if duplicate:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered in this college.")
        employee_id = payload.employee_id.strip()
        duplicate_employee_id = (
            db.query(models.User.id)
            .filter(
                models.User.college_id == admin.college_id,
                models.User.employee_id == employee_id,
            )
            .first()
        )
        if duplicate_employee_id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Employee ID is already registered in this college.")
        if payload.department_id is not None:
            department = (
                db.query(models.Department.id)
                .filter(
                    models.Department.id == payload.department_id,
                    models.Department.college_id == admin.college_id,
                    models.Department.is_active.is_(True),
                )
                .first()
            )
            if department is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found in this college.")
        if payload.shift_id is not None:
            shift = (
                db.query(models.WorkingShift.id)
                .filter(
                    models.WorkingShift.id == payload.shift_id,
                    models.WorkingShift.college_id == admin.college_id,
                    models.WorkingShift.is_active.is_(True),
                )
                .first()
            )
            if shift is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shift not found in this college.")

        user = models.User(
            college_id=admin.college_id,
            department_id=payload.department_id,
            shift_id=payload.shift_id,
            employee_id=employee_id,
            full_name=payload.full_name.strip(),
            email=email,
            username=username,
            phone=payload.phone.strip() if payload.phone else None,
            password_hash=hash_password(payload.password),
            designation=payload.designation,
            role=payload.role,
            is_active=True,
        )
        db.add(user)
        db.flush()
        if user.role in ADMIN_ROLES:
            db.add(
                models.AdminUser(
                    college_id=user.college_id,
                    user_id=user.id,
                    username=username,
                    password_hash=user.password_hash,
                    full_name=user.full_name,
                    is_active=user.is_active,
                )
            )
        db.add(
            models.AuditLog(
                college_id=admin.college_id,
                user_id=admin.id,
                action="employee.created",
                resource_type="user",
                resource_id=user.id,
                ip_address=request.client.host if request.client else None,
            )
        )
        db.commit()
        db.refresh(user)
        return user

    @app.put("/admin/users/{user_id}/password")
    def reset_employee_password(
        user_id: int,
        payload: PasswordSet,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        employee = (
            db.query(models.User)
            .filter(
                models.User.id == user_id,
                models.User.college_id == admin.college_id,
            )
            .with_for_update()
            .first()
        )
        if employee is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found.")
        if employee.id == admin.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Use the password-change endpoint to change your own password.",
            )
        employee.password_hash = hash_password(payload.password)
        admin_account = (
            db.query(models.AdminUser)
            .filter(models.AdminUser.user_id == employee.id)
            .first()
        )
        if admin_account is not None:
            admin_account.password_hash = employee.password_hash
        db.query(models.UserSession).filter(
            models.UserSession.user_id == employee.id,
            models.UserSession.is_active.is_(True),
        ).update({"is_active": False}, synchronize_session=False)
        db.add(
            models.AuditLog(
                college_id=admin.college_id,
                user_id=admin.id,
                action="employee.password_reset",
                resource_type="user",
                resource_id=employee.id,
                ip_address=None,
            )
        )
        db.commit()
        return {"message": "Employee password reset. Share the temporary password securely."}

    @app.get("/biometrics/status")
    def biometric_status(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
        template = (
            db.query(models.BiometricTemplate)
            .filter(models.BiometricTemplate.user_id == user.id)
            .first()
        )
        history = (
            db.query(models.BiometricEnrollment)
            .filter(models.BiometricEnrollment.user_id == user.id)
            .order_by(models.BiometricEnrollment.created_at.desc())
            .limit(20)
            .all()
        )
        return {
            "status": template.enrollment_status.value if template else models.BiometricStatus.NOT_ENROLLED.value,
            "history": [
                {
                    "status": enrollment.status.value,
                    "created_at": enrollment.created_at,
                    "reviewed_at": enrollment.reviewed_at,
                    "review_reason": enrollment.review_reason,
                }
                for enrollment in history
            ],
        }

    @app.post("/biometrics/challenge")
    def create_liveness_challenge(
        payload: ChallengeRequest,
        user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        instruction = "passive" if payload.action == "enrollment" else secrets.choice(("blink", "turn_left", "turn_right", "smile"))
        raw_token = secrets.token_urlsafe(32)
        now = _utcnow()
        db.query(models.LivenessChallenge).filter(
            models.LivenessChallenge.user_id == user.id,
            models.LivenessChallenge.action == payload.action,
            models.LivenessChallenge.is_used.is_(False),
        ).update({"is_used": True}, synchronize_session=False)
        db.add(
            models.LivenessChallenge(
                user_id=user.id,
                college_id=user.college_id,
                token_hash=hashlib.sha256(raw_token.encode("utf-8")).hexdigest(),
                action=payload.action,
                instruction=instruction,
                expires_at=now + timedelta(minutes=2),
                is_used=False,
            )
        )
        db.commit()
        return {
            "challenge_token": raw_token,
            "instruction": instruction,
            "expires_at": now + timedelta(minutes=2),
            "frame_count": {"minimum": 4, "maximum": 12},
        }

    @app.post("/biometrics/enroll", status_code=status.HTTP_202_ACCEPTED)
    def submit_biometric_enrollment(
        payload: BiometricEnrollmentRequest,
        request: Request,
        user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        if not payload.consent:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Explicit biometric consent is required.")
        template = (
            db.query(models.BiometricTemplate)
            .filter(models.BiometricTemplate.user_id == user.id)
            .with_for_update()
            .first()
        )
        if template and template.enrollment_status in (
            models.BiometricStatus.APPROVED,
            models.BiometricStatus.PENDING_APPROVAL,
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An approved or pending biometric enrollment already exists.",
            )

        _, _, liveness_score, embedding = _verify_face(
            db,
            user,
            "enrollment",
            payload.challenge_token,
            payload.frames,
            payload.face_image_base64,
            request,
            enrollment=True,
        )
        try:
            existing_templates = (
                db.query(models.BiometricTemplate)
                .filter(
                    models.BiometricTemplate.college_id == user.college_id,
                    models.BiometricTemplate.user_id != user.id,
                    models.BiometricTemplate.enrollment_status.in_(
                        (models.BiometricStatus.APPROVED, models.BiometricStatus.PENDING_APPROVAL)
                    ),
                    models.BiometricTemplate.face_embedding.isnot(None),
                )
                .all()
            )
            for existing in existing_templates:
                other_embedding = face_service.decrypt_embedding(existing.face_embedding)
                duplicate, score = face_service.compare_embeddings(other_embedding, embedding)
                if duplicate:
                    _log_biometric(
                        db, user, "enrollment", models.VerificationResult.FAIL, request,
                        similarity_score=score, liveness_score=liveness_score,
                        liveness_passed=True, failure_reason="duplicate_enrollment",
                    )
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="This face is already enrolled in this college.",
                    )
            encrypted_embedding = face_service.encrypt_embedding(embedding)
        except face_service.FaceServiceUnavailable as exc:
            _log_biometric(
                db, user, "enrollment", models.VerificationResult.ERROR, request,
                liveness_score=liveness_score, liveness_passed=True,
                failure_reason="biometric_storage_or_matching_unavailable",
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Biometric enrollment is temporarily unavailable.",
            ) from exc

        now = _utcnow()
        if template is None:
            template = models.BiometricTemplate(
                user_id=user.id,
                college_id=user.college_id,
                face_embedding=encrypted_embedding,
                enrollment_status=models.BiometricStatus.PENDING_APPROVAL,
                enrolled_at=now,
            )
            db.add(template)
        else:
            template.face_embedding = encrypted_embedding
            template.enrollment_status = models.BiometricStatus.PENDING_APPROVAL
            template.enrolled_at = now
            template.approved_at = None
            template.approved_by = None
            template.revoked_at = None
            template.revoked_by = None
            template.revoke_reason = None
        user.face_enrolled = False
        user.face_enrollment_status = models.BiometricStatus.PENDING_APPROVAL
        db.add(
            models.BiometricEnrollment(
                user_id=user.id,
                college_id=user.college_id,
                status=models.BiometricStatus.PENDING_APPROVAL,
                consented_at=now,
            )
        )
        db.add(
            models.AuditLog(
                college_id=user.college_id,
                user_id=user.id,
                action="biometric.enrollment_submitted",
                resource_type="biometric_template",
                resource_id=template.id,
                ip_address=request.client.host if request.client else None,
            )
        )
        db.add(
            models.Notification(
                user_id=user.id,
                college_id=user.college_id,
                title="Biometric enrollment submitted",
                message="Your face enrollment is pending administrator approval.",
                type="info",
            )
        )
        db.add(
            models.BiometricVerificationLog(
                user_id=user.id,
                college_id=user.college_id,
                action="enrollment",
                result=models.VerificationResult.PASS,
                liveness_score=liveness_score,
                liveness_passed=True,
                ip_address=request.client.host if request.client else None,
            )
        )
        db.commit()
        return {"status": models.BiometricStatus.PENDING_APPROVAL.value}

    @app.delete("/biometrics/enrollment", status_code=status.HTTP_204_NO_CONTENT)
    def withdraw_biometric_consent(
        request: Request,
        user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        template = (
            db.query(models.BiometricTemplate)
            .filter(models.BiometricTemplate.user_id == user.id)
            .with_for_update()
            .first()
        )
        if template:
            template.face_embedding = None
            template.enrollment_status = models.BiometricStatus.REVOKED
            template.revoked_at = _utcnow()
            template.revoked_by = user.id
            template.revoke_reason = "User withdrew biometric consent."
            db.add(
                models.BiometricEnrollment(
                    user_id=user.id,
                    college_id=user.college_id,
                    status=models.BiometricStatus.REVOKED,
                    consented_at=template.enrolled_at or _utcnow(),
                    reviewed_by=user.id,
                    reviewed_at=_utcnow(),
                    review_reason="User withdrew biometric consent.",
                )
            )
        user.face_enrolled = False
        user.face_enrollment_status = models.BiometricStatus.REVOKED
        db.add(
            models.AuditLog(
                college_id=user.college_id,
                user_id=user.id,
                action="biometric.consent_withdrawn",
                resource_type="biometric_template",
                resource_id=template.id if template else None,
                ip_address=request.client.host if request.client else None,
            )
        )
        db.commit()

    @app.get("/admin/biometrics/pending")
    def pending_biometric_enrollments(
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN, models.UserRole.HOD)),
        db: Session = Depends(get_db),
    ):
        query = (
            db.query(models.BiometricEnrollment, models.User)
            .join(models.User, models.User.id == models.BiometricEnrollment.user_id)
            .filter(
                models.BiometricEnrollment.college_id == admin.college_id,
                models.BiometricEnrollment.status == models.BiometricStatus.PENDING_APPROVAL,
            )
        )
        if admin.role == models.UserRole.HOD:
            query = query.filter(models.User.department_id == admin.department_id)
        rows = query.order_by(models.BiometricEnrollment.created_at).all()
        return [
            {
                "enrollment_id": enrollment.id,
                "user": _user_payload(employee),
                "created_at": enrollment.created_at,
            }
            for enrollment, employee in rows
        ]

    @app.post("/admin/biometrics/{enrollment_id}/review")
    def review_biometric_enrollment(
        enrollment_id: int,
        payload: LeaveReview,
        request: Request,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN, models.UserRole.HOD)),
        db: Session = Depends(get_db),
    ):
        enrollment = (
            db.query(models.BiometricEnrollment)
            .filter(
                models.BiometricEnrollment.id == enrollment_id,
                models.BiometricEnrollment.college_id == admin.college_id,
                models.BiometricEnrollment.status == models.BiometricStatus.PENDING_APPROVAL,
            )
            .with_for_update()
            .first()
        )
        if enrollment is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pending enrollment not found.")
        employee = db.query(models.User).filter(models.User.id == enrollment.user_id).first()
        if employee is None or (
            admin.role == models.UserRole.HOD
            and employee.department_id != admin.department_id
        ):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pending enrollment not found.")
        if admin.id == employee.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot review your own enrollment.")

        template = (
            db.query(models.BiometricTemplate)
            .filter(models.BiometricTemplate.user_id == employee.id)
            .with_for_update()
            .first()
        )
        if template is None or not template.face_embedding:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Biometric template is unavailable.")
        now = _utcnow()
        new_status = models.BiometricStatus.APPROVED if payload.approved else models.BiometricStatus.REJECTED
        enrollment.status = new_status
        enrollment.reviewed_by = admin.id
        enrollment.reviewed_at = now
        enrollment.review_reason = (payload.remarks or "").strip() or None
        template.enrollment_status = new_status
        template.approved_by = admin.id if payload.approved else None
        template.approved_at = now if payload.approved else None
        employee.face_enrolled = payload.approved
        employee.face_enrollment_status = new_status
        db.add(
            models.AuditLog(
                college_id=admin.college_id,
                user_id=admin.id,
                action="biometric.enrollment_reviewed",
                resource_type="biometric_enrollment",
                resource_id=enrollment.id,
                new_value={"status": new_status.value, "remarks": enrollment.review_reason},
                ip_address=request.client.host if request.client else None,
            )
        )
        db.add(
            models.Notification(
                user_id=employee.id,
                college_id=admin.college_id,
                title="Biometric enrollment reviewed",
                message=(
                    "Your biometric enrollment was approved."
                    if payload.approved
                    else f"Your biometric enrollment was not approved. {enrollment.review_reason or ''}".strip()
                ),
                type="success" if payload.approved else "warning",
            )
        )
        db.commit()
        return {"status": new_status.value}

    @app.get("/admin/biometrics/enrollments")
    def list_biometric_enrollments(
        search: str | None = None,
        department_id: int | None = None,
        status_filter: str | None = Query(default=None, alias="status"),
        page: int = Query(default=1, ge=1),
        limit: int = Query(default=20, ge=1, le=100),
        admin: models.User = Depends(require_roles(*ADMIN_ROLES)),
        db: Session = Depends(get_db),
    ):
        base_query = db.query(models.User).filter(
            models.User.college_id == admin.college_id,
            models.User.role == models.UserRole.FACULTY,
        )
        if admin.role == models.UserRole.HOD:
            base_query = base_query.filter(models.User.department_id == admin.department_id)

        all_faculty = base_query.all()
        total_faculty = len(all_faculty)
        approved_count = sum(1 for u in all_faculty if u.face_enrollment_status == models.BiometricStatus.APPROVED)
        pending_count = sum(1 for u in all_faculty if u.face_enrollment_status == models.BiometricStatus.PENDING_APPROVAL)
        rejected_count = sum(1 for u in all_faculty if u.face_enrollment_status == models.BiometricStatus.REJECTED)
        re_enrollment_count = sum(1 for u in all_faculty if u.face_enrollment_status == models.BiometricStatus.RE_ENROLLMENT_REQUIRED)
        not_enrolled_count = sum(1 for u in all_faculty if u.face_enrollment_status in (models.BiometricStatus.NOT_ENROLLED, models.BiometricStatus.REVOKED) or u.face_enrollment_status is None)

        query = base_query
        if department_id:
            query = query.filter(models.User.department_id == department_id)
        if search:
            s = f"%{search.strip().lower()}%"
            query = query.filter(
                or_(
                    func.lower(models.User.full_name).like(s),
                    func.lower(models.User.employee_id).like(s),
                    func.lower(models.User.email).like(s),
                )
            )
        if status_filter:
            st = status_filter.strip().lower()
            if st in ("not_enrolled", "not_registered"):
                query = query.filter(
                    or_(
                        models.User.face_enrollment_status == models.BiometricStatus.NOT_ENROLLED,
                        models.User.face_enrollment_status == models.BiometricStatus.REVOKED,
                        models.User.face_enrollment_status.is_(None),
                    )
                )
            elif st == "pending_approval":
                query = query.filter(models.User.face_enrollment_status == models.BiometricStatus.PENDING_APPROVAL)
            elif st == "approved":
                query = query.filter(models.User.face_enrollment_status == models.BiometricStatus.APPROVED)
            elif st == "rejected":
                query = query.filter(models.User.face_enrollment_status == models.BiometricStatus.REJECTED)
            elif st == "re_enrollment_required":
                query = query.filter(models.User.face_enrollment_status == models.BiometricStatus.RE_ENROLLMENT_REQUIRED)

        total_filtered = query.count()
        faculty_page = (
            query.order_by(models.User.full_name.asc())
            .offset((page - 1) * limit)
            .limit(limit)
            .all()
        )

        items = []
        for u in faculty_page:
            template = db.query(models.BiometricTemplate).filter(models.BiometricTemplate.user_id == u.id).first()
            latest_enrollment = db.query(models.BiometricEnrollment).filter(models.BiometricEnrollment.user_id == u.id).order_by(models.BiometricEnrollment.created_at.desc()).first()
            last_log = db.query(models.BiometricVerificationLog).filter(models.BiometricVerificationLog.user_id == u.id).order_by(models.BiometricVerificationLog.created_at.desc()).first()

            reviewer_name = None
            if template and template.approved_by:
                rev = db.query(models.User.full_name).filter(models.User.id == template.approved_by).first()
                if rev:
                    reviewer_name = rev[0]
            elif latest_enrollment and latest_enrollment.reviewed_by:
                rev = db.query(models.User.full_name).filter(models.User.id == latest_enrollment.reviewed_by).first()
                if rev:
                    reviewer_name = rev[0]

            reg_date = None
            if template and template.enrolled_at:
                reg_date = template.enrolled_at.isoformat()
            elif latest_enrollment and latest_enrollment.consented_at:
                reg_date = latest_enrollment.consented_at.isoformat()
            elif u.created_at:
                reg_date = u.created_at.isoformat()

            st_val = u.face_enrollment_status.value if hasattr(u.face_enrollment_status, "value") else str(u.face_enrollment_status or "not_enrolled")

            items.append({
                "faculty_id": u.id,
                "faculty_name": u.full_name,
                "employee_id": u.employee_id,
                "department": u.department.name if u.department else "Unassigned",
                "department_id": u.department_id,
                "email": u.email,
                "phone": u.phone,
                "enrollment_status": st_val,
                "has_template": bool(template and template.face_embedding),
                "registration_date": reg_date,
                "approval_status": "approved" if st_val == "approved" else ("rejected" if st_val == "rejected" else ("re_enrollment_required" if st_val == "re_enrollment_required" else ("pending_approval" if st_val == "pending_approval" else "not_registered"))),
                "approved_by_name": reviewer_name,
                "review_reason": latest_enrollment.review_reason if latest_enrollment else (template.revoke_reason if template else None),
                "last_verification_date": last_log.created_at.isoformat() if last_log and last_log.created_at else None,
                "last_verification_result": last_log.result.value if last_log and hasattr(last_log.result, "value") else (str(last_log.result) if last_log else None),
                "last_liveness_score": last_log.liveness_score if last_log else None,
            })

        return {
            "summary": {
                "total_faculty": total_faculty,
                "approved_count": approved_count,
                "pending_count": pending_count,
                "rejected_count": rejected_count,
                "re_enrollment_count": re_enrollment_count,
                "not_enrolled_count": not_enrolled_count,
            },
            "total": total_filtered,
            "page": page,
            "limit": limit,
            "pages": math.ceil(total_filtered / limit) if limit > 0 else 1,
            "items": items,
        }

    @app.get("/admin/biometrics/enrollments/{faculty_id}")
    def get_faculty_biometric_details(
        faculty_id: int,
        admin: models.User = Depends(require_roles(*ADMIN_ROLES)),
        db: Session = Depends(get_db),
    ):
        faculty = db.query(models.User).filter(
            models.User.id == faculty_id,
            models.User.college_id == admin.college_id,
        ).first()
        if faculty is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Faculty member not found.")
        if admin.role == models.UserRole.HOD and faculty.department_id != admin.department_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied for another department.")

        template = db.query(models.BiometricTemplate).filter(models.BiometricTemplate.user_id == faculty.id).first()
        enrollments = db.query(models.BiometricEnrollment).filter(models.BiometricEnrollment.user_id == faculty.id).order_by(models.BiometricEnrollment.created_at.desc()).all()
        logs = db.query(models.BiometricVerificationLog).filter(
            models.BiometricVerificationLog.user_id == faculty.id,
            models.BiometricVerificationLog.college_id == admin.college_id,
        ).order_by(models.BiometricVerificationLog.created_at.desc()).limit(50).all()

        total_attempts = len(logs)
        pass_count = sum(1 for log in logs if log.result == models.VerificationResult.PASS)
        fail_count = sum(1 for log in logs if log.result == models.VerificationResult.FAIL)
        spoof_count = sum(1 for log in logs if log.liveness_passed is False or (log.failure_reason and "spoof" in log.failure_reason.lower()))
        pass_rate = round((pass_count / total_attempts * 100), 1) if total_attempts > 0 else 0.0

        reviewer_name = None
        if template and template.approved_by:
            rev = db.query(models.User.full_name).filter(models.User.id == template.approved_by).first()
            if rev:
                reviewer_name = rev[0]

        return {
            "faculty": {
                "id": faculty.id,
                "full_name": faculty.full_name,
                "employee_id": faculty.employee_id,
                "department": faculty.department.name if faculty.department else "Unassigned",
                "designation": faculty.designation or "Visiting Faculty",
                "email": faculty.email,
                "phone": faculty.phone,
                "face_enrollment_status": faculty.face_enrollment_status.value if hasattr(faculty.face_enrollment_status, "value") else str(faculty.face_enrollment_status),
                "face_enrolled": faculty.face_enrolled,
            },
            "template": {
                "id": template.id if template else None,
                "has_embedding": bool(template and template.face_embedding),
                "enrollment_status": template.enrollment_status.value if template and hasattr(template.enrollment_status, "value") else (str(template.enrollment_status) if template else "not_enrolled"),
                "enrolled_at": template.enrolled_at.isoformat() if template and template.enrolled_at else None,
                "approved_at": template.approved_at.isoformat() if template and template.approved_at else None,
                "approved_by_name": reviewer_name,
                "revoke_reason": template.revoke_reason if template else None,
            },
            "statistics": {
                "total_attempts": total_attempts,
                "pass_count": pass_count,
                "fail_count": fail_count,
                "spoof_failures": spoof_count,
                "pass_rate": pass_rate,
            },
            "verification_history": [
                {
                    "id": lg.id,
                    "action": lg.action,
                    "result": lg.result.value if hasattr(lg.result, "value") else str(lg.result),
                    "similarity_score": round(lg.similarity_score, 4) if lg.similarity_score is not None else None,
                    "liveness_score": round(lg.liveness_score, 4) if lg.liveness_score is not None else None,
                    "liveness_passed": lg.liveness_passed,
                    "failure_reason": lg.failure_reason,
                    "ip_address": lg.ip_address,
                    "created_at": lg.created_at.isoformat() if lg.created_at else None,
                }
                for lg in logs
            ],
            "enrollment_audit": [
                {
                    "id": en.id,
                    "status": en.status.value if hasattr(en.status, "value") else str(en.status),
                    "consented_at": en.consented_at.isoformat() if en.consented_at else None,
                    "reviewed_at": en.reviewed_at.isoformat() if en.reviewed_at else None,
                    "review_reason": en.review_reason,
                }
                for en in enrollments
            ],
        }

    @app.post("/admin/biometrics/enrollments/{faculty_id}/approve")
    def approve_biometric_enrollment(
        faculty_id: int,
        request: Request,
        admin: models.User = Depends(require_roles(*ADMIN_ROLES)),
        db: Session = Depends(get_db),
    ):
        faculty = db.query(models.User).filter(
            models.User.id == faculty_id,
            models.User.college_id == admin.college_id,
        ).with_for_update().first()
        if faculty is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Faculty member not found.")
        if admin.role == models.UserRole.HOD and faculty.department_id != admin.department_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied for another department.")

        template = db.query(models.BiometricTemplate).filter(models.BiometricTemplate.user_id == faculty.id).with_for_update().first()
        if template is None or not template.face_embedding:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No face template has been captured for this faculty.")

        now = _utcnow()
        template.enrollment_status = models.BiometricStatus.APPROVED
        template.approved_by = admin.id
        template.approved_at = now
        template.revoked_at = None
        template.revoked_by = None
        template.revoke_reason = None

        latest_enrollment = db.query(models.BiometricEnrollment).filter(
            models.BiometricEnrollment.user_id == faculty.id,
            models.BiometricEnrollment.status == models.BiometricStatus.PENDING_APPROVAL,
        ).order_by(models.BiometricEnrollment.created_at.desc()).first()
        if latest_enrollment:
            latest_enrollment.status = models.BiometricStatus.APPROVED
            latest_enrollment.reviewed_by = admin.id
            latest_enrollment.reviewed_at = now
            latest_enrollment.review_reason = None

        faculty.face_enrolled = True
        faculty.face_enrollment_status = models.BiometricStatus.APPROVED

        db.add(
            models.AuditLog(
                college_id=admin.college_id,
                user_id=admin.id,
                action="biometric.enrollment_approved",
                resource_type="biometric_template",
                resource_id=template.id,
                new_value={"status": "approved", "faculty_id": faculty.id, "faculty_name": faculty.full_name},
                ip_address=request.client.host if request.client else None,
            )
        )
        db.add(
            models.Notification(
                user_id=faculty.id,
                college_id=admin.college_id,
                title="Face Biometrics Approved",
                message="Your face biometric enrollment has been verified and approved by the administration. You can now use biometric attendance.",
                type="success",
            )
        )
        db.commit()
        return {"message": f"Biometric enrollment for {faculty.full_name} approved successfully.", "status": "approved"}

    @app.post("/admin/biometrics/enrollments/{faculty_id}/reject")
    def reject_biometric_enrollment(
        faculty_id: int,
        payload: BiometricRejection,
        request: Request,
        admin: models.User = Depends(require_roles(*ADMIN_ROLES)),
        db: Session = Depends(get_db),
    ):
        faculty = db.query(models.User).filter(
            models.User.id == faculty_id,
            models.User.college_id == admin.college_id,
        ).with_for_update().first()
        if faculty is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Faculty member not found.")
        if admin.role == models.UserRole.HOD and faculty.department_id != admin.department_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied for another department.")

        now = _utcnow()
        reason = payload.reason.strip()

        template = db.query(models.BiometricTemplate).filter(models.BiometricTemplate.user_id == faculty.id).with_for_update().first()
        if template:
            template.enrollment_status = models.BiometricStatus.REJECTED
            template.revoke_reason = reason

        latest_enrollment = db.query(models.BiometricEnrollment).filter(
            models.BiometricEnrollment.user_id == faculty.id,
        ).order_by(models.BiometricEnrollment.created_at.desc()).first()
        if latest_enrollment:
            latest_enrollment.status = models.BiometricStatus.REJECTED
            latest_enrollment.reviewed_by = admin.id
            latest_enrollment.reviewed_at = now
            latest_enrollment.review_reason = reason

        faculty.face_enrolled = False
        faculty.face_enrollment_status = models.BiometricStatus.REJECTED

        db.add(
            models.AuditLog(
                college_id=admin.college_id,
                user_id=admin.id,
                action="biometric.enrollment_rejected",
                resource_type="biometric_template",
                resource_id=template.id if template else None,
                new_value={"status": "rejected", "faculty_id": faculty.id, "reason": reason},
                ip_address=request.client.host if request.client else None,
            )
        )
        db.add(
            models.Notification(
                user_id=faculty.id,
                college_id=admin.college_id,
                title="Face Biometrics Rejected",
                message=f"Your biometric enrollment was rejected by administration. Reason: {reason}. Please re-submit your registration.",
                type="warning",
            )
        )
        db.commit()
        return {"message": f"Biometric enrollment for {faculty.full_name} rejected.", "status": "rejected", "reason": reason}

    @app.post("/admin/biometrics/enrollments/{faculty_id}/request-re-enrollment")
    def request_biometric_re_enrollment(
        faculty_id: int,
        payload: BiometricReEnrollment,
        request: Request,
        admin: models.User = Depends(require_roles(*ADMIN_ROLES)),
        db: Session = Depends(get_db),
    ):
        faculty = db.query(models.User).filter(
            models.User.id == faculty_id,
            models.User.college_id == admin.college_id,
        ).with_for_update().first()
        if faculty is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Faculty member not found.")
        if admin.role == models.UserRole.HOD and faculty.department_id != admin.department_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied for another department.")

        now = _utcnow()
        reason = (payload.reason or "").strip() or "The administration requires you to re-enroll your face biometric template."

        template = db.query(models.BiometricTemplate).filter(models.BiometricTemplate.user_id == faculty.id).with_for_update().first()
        if template:
            template.enrollment_status = models.BiometricStatus.RE_ENROLLMENT_REQUIRED
            template.face_embedding = None
            template.revoked_at = now
            template.revoked_by = admin.id
            template.revoke_reason = reason

        faculty.face_enrolled = False
        faculty.face_enrollment_status = models.BiometricStatus.RE_ENROLLMENT_REQUIRED

        db.add(
            models.AuditLog(
                college_id=admin.college_id,
                user_id=admin.id,
                action="biometric.re_enrollment_requested",
                resource_type="biometric_template",
                resource_id=template.id if template else None,
                new_value={"status": "re_enrollment_required", "faculty_id": faculty.id, "reason": reason},
                ip_address=request.client.host if request.client else None,
            )
        )
        db.add(
            models.Notification(
                user_id=faculty.id,
                college_id=admin.college_id,
                title="Face Re-Registration Required",
                message=f"Please re-register your face biometric template. Notice: {reason}",
                type="info",
            )
        )
        db.commit()
        return {"message": f"Re-enrollment requested for {faculty.full_name}.", "status": "re_enrollment_required"}

    @app.get("/admin/biometrics/verifications")
    def list_biometric_verifications(
        search: str | None = None,
        result_filter: str | None = Query(default=None, alias="result"),
        action_filter: str | None = Query(default=None, alias="action"),
        page: int = Query(default=1, ge=1),
        limit: int = Query(default=25, ge=1, le=100),
        admin: models.User = Depends(require_roles(*ADMIN_ROLES)),
        db: Session = Depends(get_db),
    ):
        query = (
            db.query(models.BiometricVerificationLog, models.User)
            .join(models.User, models.User.id == models.BiometricVerificationLog.user_id)
            .filter(models.BiometricVerificationLog.college_id == admin.college_id)
        )
        if admin.role == models.UserRole.HOD:
            query = query.filter(models.User.department_id == admin.department_id)

        if result_filter:
            rf = result_filter.strip().lower()
            if rf == "pass":
                query = query.filter(models.BiometricVerificationLog.result == models.VerificationResult.PASS)
            elif rf == "fail":
                query = query.filter(models.BiometricVerificationLog.result == models.VerificationResult.FAIL)
            elif rf == "error":
                query = query.filter(models.BiometricVerificationLog.result == models.VerificationResult.ERROR)

        if action_filter:
            query = query.filter(models.BiometricVerificationLog.action == action_filter.strip())

        if search:
            s = f"%{search.strip().lower()}%"
            query = query.filter(
                or_(
                    func.lower(models.User.full_name).like(s),
                    func.lower(models.User.employee_id).like(s),
                    func.lower(models.BiometricVerificationLog.failure_reason).like(s),
                )
            )

        total = query.count()
        logs_page = (
            query.order_by(models.BiometricVerificationLog.created_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
            .all()
        )

        items = []
        for log, user in logs_page:
            items.append({
                "id": log.id,
                "faculty_name": user.full_name,
                "employee_id": user.employee_id,
                "department": user.department.name if user.department else "Unassigned",
                "action": log.action,
                "result": log.result.value if hasattr(log.result, "value") else str(log.result),
                "similarity_score": round(log.similarity_score, 4) if log.similarity_score is not None else None,
                "liveness_score": round(log.liveness_score, 4) if log.liveness_score is not None else None,
                "liveness_passed": log.liveness_passed,
                "failure_reason": log.failure_reason,
                "ip_address": log.ip_address,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            })

        return {
            "total": total,
            "page": page,
            "limit": limit,
            "pages": math.ceil(total / limit) if limit > 0 else 1,
            "items": items,
        }

    @app.get("/admin/location")
    def get_college_location(
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        location = (
            db.query(models.CollegeLocation)
            .filter(
                models.CollegeLocation.college_id == admin.college_id,
                models.CollegeLocation.is_active.is_(True),
            )
            .first()
        )
        if location is None:
            return None
        return {
            "id": location.id,
            "name": location.name,
            "latitude": location.latitude,
            "longitude": location.longitude,
            "geofence_radius": location.geofence_radius,
            "min_gps_accuracy": location.min_gps_accuracy,
        }

    @app.put("/admin/location")
    def set_college_location(
        payload: LocationUpdate,
        request: Request,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        location = (
            db.query(models.CollegeLocation)
            .filter(models.CollegeLocation.college_id == admin.college_id)
            .with_for_update()
            .first()
        )
        if location is None:
            location = models.CollegeLocation(college_id=admin.college_id)
            db.add(location)
        location.name = payload.name.strip()
        location.latitude = payload.latitude
        location.longitude = payload.longitude
        location.geofence_radius = payload.geofence_radius
        location.min_gps_accuracy = payload.min_gps_accuracy
        location.is_active = True
        db.flush()
        db.add(
            models.AuditLog(
                college_id=admin.college_id,
                user_id=admin.id,
                action="college.location_updated",
                resource_type="college_location",
                resource_id=location.id,
                ip_address=request.client.host if request.client else None,
            )
        )
        db.commit()
        return {"message": "College attendance location saved."}

    @app.get("/admin/shifts")
    def list_shifts(
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        shifts = (
            db.query(models.WorkingShift)
            .filter(models.WorkingShift.college_id == admin.college_id)
            .order_by(models.WorkingShift.name)
            .all()
        )
        return [
            {
                "id": shift.id,
                "name": shift.name,
                "start_time": shift.start_time.isoformat(),
                "end_time": shift.end_time.isoformat(),
                "grace_period_minutes": shift.grace_period_minutes,
                "half_day_minutes": shift.half_day_minutes,
                "full_day_minutes": shift.full_day_minutes,
                "max_break_minutes": shift.max_break_minutes,
                "is_overnight": shift.is_overnight,
                "is_active": shift.is_active,
            }
            for shift in shifts
        ]

    @app.post("/admin/shifts", status_code=status.HTTP_201_CREATED)
    def create_shift(
        payload: ShiftCreate,
        request: Request,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        if payload.full_day_minutes < payload.half_day_minutes:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Full-day minutes must be at least half-day minutes.")
        shift = models.WorkingShift(
            college_id=admin.college_id,
            **payload.model_dump(),
        )
        db.add(shift)
        db.flush()
        db.add(
            models.AuditLog(
                college_id=admin.college_id,
                user_id=admin.id,
                action="working_shift.created",
                resource_type="working_shift",
                resource_id=shift.id,
                ip_address=request.client.host if request.client else None,
            )
        )
        db.commit()
        return {"id": shift.id, "name": shift.name}

    @app.put("/admin/users/{employee_id}/shift")
    def assign_employee_shift(
        employee_id: int,
        payload: AssignShift,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        employee = (
            db.query(models.User)
            .filter(
                models.User.id == employee_id,
                models.User.college_id == admin.college_id,
            )
            .with_for_update()
            .first()
        )
        if employee is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found.")
        if payload.shift_id is not None:
            shift_exists = (
                db.query(models.WorkingShift.id)
                .filter(
                    models.WorkingShift.id == payload.shift_id,
                    models.WorkingShift.college_id == admin.college_id,
                    models.WorkingShift.is_active.is_(True),
                )
                .first()
            )
            if shift_exists is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shift not found.")
        employee.shift_id = payload.shift_id
        db.commit()
        return {"employee_id": employee.id, "shift_id": employee.shift_id}

    @app.get("/admin/policy")
    def get_attendance_policy(
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        policy = _active_policy(db, admin.college_id)
        return {
            "require_face_for_punch_in": True,
            "require_face_for_punch_out": True,
            "require_face_for_breaks": policy.require_face_for_breaks if policy else False,
            "require_gps_for_punch_in": True,
            "require_gps_for_punch_out": True,
            "require_gps_for_breaks": policy.require_gps_for_breaks if policy else False,
            "max_otp_attempts": policy.max_otp_attempts if policy else 3,
            "otp_validity_minutes": _otp_validity_minutes(policy),
            "otp_resend_cooldown_seconds": 60,
        }

    @app.patch("/admin/policy")
    def update_attendance_policy(
        payload: AttendancePolicyUpdate,
        request: Request,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        policy = _active_policy(db, admin.college_id)
        if policy is None:
            policy = models.AttendancePolicy(college_id=admin.college_id, is_active=True)
            db.add(policy)
        for key, value in payload.model_dump(exclude_unset=True).items():
            setattr(policy, key, value)
        db.add(
            models.AuditLog(
                college_id=admin.college_id,
                user_id=admin.id,
                action="attendance_policy.updated",
                resource_type="attendance_policy",
                resource_id=policy.id,
                new_value=payload.model_dump(exclude_unset=True),
                ip_address=request.client.host if request.client else None,
            )
        )
        db.commit()
        return {"message": "Attendance policy updated."}

    @app.get("/attendance/policy")
    def attendance_policy_for_user(
        user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        policy = _active_policy(db, user.college_id)
        return {
            "require_face_for_punch_in": True,
            "require_face_for_punch_out": True,
            "require_face_for_breaks": policy.require_face_for_breaks if policy else False,
            "require_gps_for_punch_in": False,
            "require_gps_for_punch_out": False,
            "require_gps_for_breaks": policy.require_gps_for_breaks if policy else False,
        }

    @app.post("/attendance/{action}")
    def perform_attendance_action(
        action: AttendanceAction,
        payload: AttendanceActionRequest,
        request: Request,
        user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        existing_event = (
            db.query(models.AttendanceEvent)
            .filter(
                models.AttendanceEvent.user_id == user.id,
                models.AttendanceEvent.idempotency_key == payload.idempotency_key,
            )
            .first()
        )
        if existing_event is not None:
            if existing_event.event_type != action:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Idempotency key was already used for another action.")
            existing_record = (
                db.query(models.AttendanceRecord)
                .filter(models.AttendanceRecord.id == existing_event.attendance_id)
                .first()
            )
            return _attendance_payload(existing_record)

        face_verified = False
        gps_verified = False
        distance_m = None
        policy = _active_policy(db, user.college_id)
        face_required = action in ("punch_in", "punch_out") or (
            action in ("break_start", "break_end") and policy is not None and policy.require_face_for_breaks
        )
        face_provided = payload.challenge_token is not None
        if face_required and not face_provided:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A live face verification is required for this attendance action.",
            )
        if face_provided:
            if payload.frames is None or payload.face_image_base64 is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="A complete live face verification is required for this attendance action.",
                )
            face_verified, _, _, _ = _verify_face(
                db,
                user,
                action,
                payload.challenge_token,
                payload.frames,
                payload.face_image_base64,
                request,
            )

        now = _attendance_now()
        today = now.date()
        assigned_shift = (
            db.query(models.WorkingShift)
            .filter(
                models.WorkingShift.id == user.shift_id,
                models.WorkingShift.college_id == user.college_id,
                models.WorkingShift.is_active.is_(True),
            )
            .first()
        ) if user.shift_id else None
        work_date = today
        if assigned_shift and assigned_shift.is_overnight and now.time() < assigned_shift.end_time:
            work_date -= timedelta(days=1)
        record = (
            db.query(models.AttendanceRecord)
            .filter(
                models.AttendanceRecord.user_id == user.id,
                models.AttendanceRecord.college_id == user.college_id,
                models.AttendanceRecord.date == work_date,
            )
            .with_for_update()
            .first()
        )
        if action == "punch_in":
            prior_open_record = (
                db.query(models.AttendanceRecord.id)
                .filter(
                    models.AttendanceRecord.user_id == user.id,
                    models.AttendanceRecord.college_id == user.college_id,
                    models.AttendanceRecord.date < work_date,
                    models.AttendanceRecord.date >= work_date - timedelta(days=1),
                    models.AttendanceRecord.punch_in_time.isnot(None),
                    models.AttendanceRecord.punch_out_time.is_(None),
                )
                .first()
            )
            if prior_open_record:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A previous attendance record is still open; contact an administrator.",
                )
        elif record is None:
            record = (
                db.query(models.AttendanceRecord)
                .filter(
                    models.AttendanceRecord.user_id == user.id,
                    models.AttendanceRecord.college_id == user.college_id,
                    models.AttendanceRecord.date >= work_date - timedelta(days=1),
                    models.AttendanceRecord.date < work_date,
                    models.AttendanceRecord.punch_in_time.isnot(None),
                    models.AttendanceRecord.punch_out_time.is_(None),
                )
                .order_by(models.AttendanceRecord.date.desc())
                .with_for_update()
                .first()
            )
        if action == "punch_in":
            on_leave = (
                db.query(models.LeaveApplication.id)
                .filter(
                    models.LeaveApplication.user_id == user.id,
                    models.LeaveApplication.status == models.LeaveStatus.APPROVED,
                    models.LeaveApplication.start_date <= work_date,
                    models.LeaveApplication.end_date >= work_date,
                )
                .first()
            )
            if on_leave:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Approved leave prevents attendance punch-in.")
            if record and record.punch_in_time is not None:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You have already punched in today.")
            if record is None:
                record = models.AttendanceRecord(
                    user_id=user.id,
                    college_id=user.college_id,
                    date=work_date,
                    status=models.AttendanceStatus.ABSENT,
                    shift_id=user.shift_id,
                )
                db.add(record)
                db.flush()
            record.punch_in_time = now
            record.status = models.AttendanceStatus.PRESENT
            record.punch_in_face_verified = face_verified
            record.punch_in_latitude = payload.latitude
            record.punch_in_longitude = payload.longitude
            record.punch_in_distance_m = distance_m
            record.punch_in_gps_verified = gps_verified
            if assigned_shift:
                shift_start = datetime.combine(work_date, assigned_shift.start_time)
                late_by = _working_minutes(shift_start, now)
                if now > shift_start + timedelta(minutes=assigned_shift.grace_period_minutes):
                    record.is_late = True
                    record.late_by_minutes = max(0, late_by - assigned_shift.grace_period_minutes)
        elif action == "punch_out":
            if record is None or record.punch_in_time is None or record.punch_out_time is not None:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No open attendance record is available to punch out.")
            active_break = next((item for item in record.breaks if item.break_end is None), None)
            if active_break:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="End the active break before punching out.")
            record.punch_out_time = now
            record.status = models.AttendanceStatus.PUNCHED_OUT
            record.punch_out_face_verified = face_verified
            record.punch_out_latitude = payload.latitude
            record.punch_out_longitude = payload.longitude
            record.punch_out_distance_m = distance_m
            record.punch_out_gps_verified = gps_verified
            record.total_working_minutes = _working_minutes(record.punch_in_time, now)
            record.total_break_minutes = sum(item.duration_minutes or 0 for item in record.breaks)
            record.net_working_minutes = max(0, record.total_working_minutes - record.total_break_minutes)
            shift = (
                db.query(models.WorkingShift)
                .filter(models.WorkingShift.id == record.shift_id, models.WorkingShift.college_id == user.college_id)
                .first()
            ) if record.shift_id else None
            if shift:
                expected_end = datetime.combine(record.date, shift.end_time)
                if shift.is_overnight:
                    expected_end += timedelta(days=1)
                record.is_early_departure = now < expected_end
                record.overtime_minutes = max(0, record.net_working_minutes - shift.full_day_minutes)
                if record.net_working_minutes < shift.half_day_minutes:
                    record.status = models.AttendanceStatus.HALF_DAY
        elif action == "break_start":
            if record is None or record.punch_in_time is None or record.punch_out_time is not None:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Punch in before starting a break.")
            if any(item.break_end is None for item in record.breaks):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A break is already active.")
            db.add(
                models.BreakRecord(
                    attendance_id=record.id,
                    user_id=user.id,
                    break_start=now,
                )
            )
            record.status = models.AttendanceStatus.ON_BREAK
        else:
            if record is None or record.status != models.AttendanceStatus.ON_BREAK:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="There is no active break to end.")
            active_break = next((item for item in record.breaks if item.break_end is None), None)
            if active_break is None:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="There is no active break to end.")
            active_break.break_end = now
            active_break.duration_minutes = _working_minutes(active_break.break_start, now)
            record.total_break_minutes = sum(item.duration_minutes or 0 for item in record.breaks)
            record.status = models.AttendanceStatus.PRESENT

        db.add(
            models.AttendanceEvent(
                attendance_id=record.id,
                user_id=user.id,
                event_type=action,
                event_time=now,
                face_verified=face_verified,
                gps_verified=gps_verified,
                latitude=payload.latitude,
                longitude=payload.longitude,
                distance_m=distance_m,
                idempotency_key=payload.idempotency_key,
                ip_address=request.client.host if request.client else None,
            )
        )
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Attendance action conflicts with a concurrent request; refresh and try again.",
            ) from exc
        db.refresh(record)
        return _attendance_payload(record)

    @app.get("/attendance/mine")
    def my_attendance(
        start_date: date | None = None,
        end_date: date | None = None,
        user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        today = _attendance_now().date()
        start = start_date or (today - timedelta(days=30))
        end = end_date or today
        if end < start or (end - start).days > 366:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid attendance date range.")
        records = (
            db.query(models.AttendanceRecord)
            .filter(
                models.AttendanceRecord.user_id == user.id,
                models.AttendanceRecord.college_id == user.college_id,
                models.AttendanceRecord.date >= start,
                models.AttendanceRecord.date <= end,
            )
            .order_by(models.AttendanceRecord.date.desc())
            .all()
        )
        return [_attendance_payload(record) for record in records]

    @app.get("/dashboard/mine")
    def my_dashboard(
        user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        now = _attendance_now()
        today = now.date()
        record = (
            db.query(models.AttendanceRecord)
            .filter(
                models.AttendanceRecord.user_id == user.id,
                models.AttendanceRecord.date >= today - timedelta(days=1),
                models.AttendanceRecord.date <= today,
                models.AttendanceRecord.college_id == user.college_id,
                models.AttendanceRecord.punch_out_time.is_(None),
            )
            .order_by(models.AttendanceRecord.date.desc())
            .first()
        )
        if record is None:
            record = (
                db.query(models.AttendanceRecord)
                .filter(
                    models.AttendanceRecord.user_id == user.id,
                    models.AttendanceRecord.date == today,
                    models.AttendanceRecord.college_id == user.college_id,
                )
                .first()
            )
        recent = (
            db.query(models.AttendanceRecord)
            .filter(models.AttendanceRecord.user_id == user.id)
            .order_by(models.AttendanceRecord.date.desc())
            .limit(7)
            .all()
        )
        weekly_lectures = (
            db.query(models.WeeklyLecture)
            .filter(
                models.WeeklyLecture.user_id == user.id,
                models.WeeklyLecture.college_id == user.college_id,
                models.WeeklyLecture.is_active.is_(True),
            )
            .order_by(models.WeeklyLecture.day_of_week, models.WeeklyLecture.start_time)
            .all()
        )
        today_lectures = [item for item in weekly_lectures if item.day_of_week == today.weekday()]
        lectures_by_weekday = {
            weekday: sum(item.day_of_week == weekday for item in weekly_lectures)
            for weekday in range(7)
        }
        month_start = today.replace(day=1)
        month_records = (
            db.query(models.AttendanceRecord)
            .filter(
                models.AttendanceRecord.user_id == user.id,
                models.AttendanceRecord.college_id == user.college_id,
                models.AttendanceRecord.date >= month_start,
                models.AttendanceRecord.date <= today,
            )
            .all()
        )

        month_starts = []
        month_cursor = month_start
        for _ in range(6):
            month_starts.insert(0, month_cursor)
            month_cursor = (
                month_cursor.replace(year=month_cursor.year - 1, month=12)
                if month_cursor.month == 1
                else month_cursor.replace(month=month_cursor.month - 1)
            )
        six_month_records = (
            db.query(models.AttendanceRecord)
            .filter(
                models.AttendanceRecord.user_id == user.id,
                models.AttendanceRecord.college_id == user.college_id,
                models.AttendanceRecord.date >= month_starts[0],
                models.AttendanceRecord.date <= today,
            )
            .all()
        )
        attendance_minutes_by_month: dict[str, int] = {item.isoformat(): 0 for item in month_starts}
        for attendance in six_month_records:
            month_key = attendance.date.replace(day=1).isoformat()
            attendance_minutes_by_month[month_key] = (
                attendance_minutes_by_month.get(month_key, 0) + (attendance.net_working_minutes or 0)
            )
        scheduled_lectures_this_month = 0
        day_cursor = month_start
        while day_cursor.month == today.month and day_cursor.year == today.year:
            scheduled_lectures_this_month += lectures_by_weekday[day_cursor.weekday()]
            day_cursor += timedelta(days=1)
        unread_notifications = db.query(models.Notification).filter(
            models.Notification.user_id == user.id,
            models.Notification.college_id == user.college_id,
            models.Notification.is_read.is_(False),
        ).count()
        recent_notifications = (
            db.query(models.Notification)
            .filter(
                models.Notification.user_id == user.id,
                models.Notification.college_id == user.college_id,
            )
            .order_by(models.Notification.created_at.desc())
            .limit(3)
            .all()
        )
        pending_additional_lectures = db.query(models.AdditionalLectureRequest).filter(
            models.AdditionalLectureRequest.user_id == user.id,
            models.AdditionalLectureRequest.college_id == user.college_id,
            models.AdditionalLectureRequest.status == "pending",
        ).count()
        return {
            "user": _user_payload(user),
            "college": {
                "name": user.college.name,
                "code": user.college.code,
                "department": user.department.name if user.department else None,
            },
            "today": _attendance_payload(record) if record else None,
            "recent": [_attendance_payload(item) for item in recent],
            "today_schedule": [_weekly_lecture_payload(item) for item in today_lectures],
            "monthly": {
                "month": month_start.isoformat(),
                "hours_worked": round(
                    sum(item.net_working_minutes or 0 for item in month_records) / 60,
                    1,
                ),
                "completed_days": sum(item.punch_out_time is not None for item in month_records),
                "scheduled_lectures": scheduled_lectures_this_month,
                "hours_by_month": [
                    {
                        "month": item.isoformat(),
                        "hours": round(attendance_minutes_by_month[item.isoformat()] / 60, 1),
                    }
                    for item in month_starts
                ],
            },
            "unread_notifications": unread_notifications,
            "recent_notifications": [
                {
                    "id": item.id,
                    "title": item.title,
                    "message": item.message,
                    "type": item.type,
                    "is_read": item.is_read,
                    "created_at": item.created_at,
                }
                for item in recent_notifications
            ],
            "pending_additional_lectures": pending_additional_lectures,
        }

    @app.get("/timetable/mine")
    def my_timetable(
        user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        lectures = (
            db.query(models.WeeklyLecture)
            .filter(
                models.WeeklyLecture.user_id == user.id,
                models.WeeklyLecture.college_id == user.college_id,
                models.WeeklyLecture.is_active.is_(True),
            )
            .order_by(models.WeeklyLecture.day_of_week, models.WeeklyLecture.start_time)
            .all()
        )
        return [_weekly_lecture_payload(item) for item in lectures]

    @app.get("/lecture-attendance/mine")
    def my_lecture_attendance(
        lecture_date: date,
        user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        if user.role not in (models.UserRole.FACULTY, models.UserRole.STAFF):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only faculty and staff have lecture attendance.")

        weekly_lectures = (
            db.query(models.WeeklyLecture)
            .filter(
                models.WeeklyLecture.user_id == user.id,
                models.WeeklyLecture.college_id == user.college_id,
                models.WeeklyLecture.day_of_week == lecture_date.weekday(),
                models.WeeklyLecture.is_active.is_(True),
            )
            .all()
        )
        additional_lectures = (
            db.query(models.AdditionalLectureRequest)
            .filter(
                models.AdditionalLectureRequest.user_id == user.id,
                models.AdditionalLectureRequest.college_id == user.college_id,
                models.AdditionalLectureRequest.lecture_date == lecture_date,
                models.AdditionalLectureRequest.status == "approved",
            )
            .all()
        )
        records = (
            db.query(models.LectureAttendanceRecord)
            .filter(
                models.LectureAttendanceRecord.user_id == user.id,
                models.LectureAttendanceRecord.college_id == user.college_id,
                models.LectureAttendanceRecord.lecture_date == lecture_date,
            )
            .all()
        )
        weekly_records = {item.weekly_lecture_id: item for item in records if item.weekly_lecture_id is not None}
        additional_records = {
            item.additional_lecture_request_id: item
            for item in records
            if item.additional_lecture_request_id is not None
        }
        now = _attendance_now()

        occurrences = [
            _lecture_occurrence_payload(
                lecture_date,
                now,
                "weekly",
                lecture.id,
                lecture.subject,
                lecture.course_name,
                lecture.department.name if lecture.department else None,
                lecture.room,
                lecture.start_time,
                lecture.end_time,
                weekly_records.get(lecture.id),
            )
            for lecture in weekly_lectures
        ]
        occurrences.extend(
            _lecture_occurrence_payload(
                lecture_date,
                now,
                "additional",
                lecture.id,
                lecture.subject,
                None,
                user.department.name if user.department else None,
                lecture.room,
                lecture.start_time,
                lecture.end_time,
                additional_records.get(lecture.id),
            )
            for lecture in additional_lectures
        )
        return sorted(occurrences, key=lambda item: item["start_time"])

    @app.get("/lecture-attendance/calendar")
    def lecture_attendance_calendar(
        start_date: date,
        end_date: date,
        user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        if user.role not in (models.UserRole.FACULTY, models.UserRole.STAFF):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only faculty and staff have lecture attendance.")
        if end_date < start_date or (end_date - start_date).days > 366:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid lecture calendar date range.")

        calendar = _lecture_calendar_payload(db, user, start_date, end_date, _attendance_now())
        return [
            {
                "date": day["date"],
                "status": day["status"],
                "scheduled_lectures": day["scheduled_lectures"],
                "attended_lectures": day["attended_lectures"],
                "missed_lectures": day["missed_lectures"],
            }
            for day in calendar
        ]

    @app.get("/lecture-attendance/overview")
    def lecture_attendance_overview(
        user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        if user.role not in (models.UserRole.FACULTY, models.UserRole.STAFF):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only faculty and staff have lecture attendance.")

        now = _attendance_now()
        today = now.date()
        week_start = today - timedelta(days=today.weekday())
        week_dates = [week_start + timedelta(days=offset) for offset in range(7)]
        lectures_by_date = {
            day["date"]: day["lectures"]
            for day in _lecture_calendar_payload(db, user, week_start, week_dates[-1], now)
        }
        today_lectures = lectures_by_date[today]
        all_week_lectures = [
            lecture
            for lectures in lectures_by_date.values()
            for lecture in lectures
        ]
        upcoming_today = [
            lecture
            for lecture in today_lectures
            if lecture["status"] == "upcoming"
        ]
        next_candidates = [
            lecture
            for lecture in today_lectures
            if lecture["status"] in ("upcoming", "scheduled", "in_progress")
            and time_type.fromisoformat(lecture["end_time"]) > now.time()
        ]
        next_lecture = min(next_candidates, key=lambda item: item["start_time"]) if next_candidates else None
        return {
            "today": {
                "date": today,
                "assigned_lectures": len(today_lectures),
                "attended_lectures": sum(lecture["status"] == "completed" for lecture in today_lectures),
                "upcoming_lectures": len(upcoming_today),
                "lectures": today_lectures,
            },
            "week": {
                "scheduled_minutes": sum(lecture["scheduled_minutes"] for lecture in all_week_lectures),
                "worked_minutes": sum(lecture["worked_minutes"] for lecture in all_week_lectures),
                "not_worked_minutes": sum(lecture["not_worked_minutes"] for lecture in all_week_lectures),
            },
            "next_lecture": next_lecture,
        }

    @app.post("/lecture-attendance/{action}")
    def perform_lecture_attendance_action(
        action: Literal["punch_in", "punch_out"],
        payload: LectureAttendanceActionRequest,
        request: Request,
        user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        if user.role not in (models.UserRole.FACULTY, models.UserRole.STAFF):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only faculty and staff can record lecture attendance.")

        existing_event = (
            db.query(models.LectureAttendanceEvent)
            .filter(
                models.LectureAttendanceEvent.user_id == user.id,
                models.LectureAttendanceEvent.idempotency_key == payload.idempotency_key,
            )
            .first()
        )
        if existing_event is not None:
            existing_record = db.query(models.LectureAttendanceRecord).filter(
                models.LectureAttendanceRecord.id == existing_event.attendance_id
            ).first()
            record_matches_request = existing_record is not None and (
                existing_record.weekly_lecture_id == payload.schedule_id
                if payload.source_type == "weekly"
                else existing_record.additional_lecture_request_id == payload.schedule_id
            )
            if existing_event.event_type != action or not record_matches_request or existing_record.lecture_date != payload.lecture_date:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Idempotency key was already used for another lecture action.")
            return _lecture_attendance_payload(existing_record)

        if payload.source_type == "weekly":
            lecture = db.query(models.WeeklyLecture).filter(
                models.WeeklyLecture.id == payload.schedule_id,
                models.WeeklyLecture.user_id == user.id,
                models.WeeklyLecture.college_id == user.college_id,
                models.WeeklyLecture.day_of_week == payload.lecture_date.weekday(),
                models.WeeklyLecture.is_active.is_(True),
            ).first()
            if lecture is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scheduled lecture not found.")
            start_time = lecture.start_time
            end_time = lecture.end_time
            weekly_lecture_id = lecture.id
            additional_lecture_request_id = None
        else:
            lecture = db.query(models.AdditionalLectureRequest).filter(
                models.AdditionalLectureRequest.id == payload.schedule_id,
                models.AdditionalLectureRequest.user_id == user.id,
                models.AdditionalLectureRequest.college_id == user.college_id,
                models.AdditionalLectureRequest.lecture_date == payload.lecture_date,
                models.AdditionalLectureRequest.status == "approved",
            ).first()
            if lecture is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approved additional lecture not found.")
            start_time = lecture.start_time
            end_time = lecture.end_time
            weekly_lecture_id = None
            additional_lecture_request_id = lecture.id

        record_query = db.query(models.LectureAttendanceRecord).filter(
            models.LectureAttendanceRecord.user_id == user.id,
            models.LectureAttendanceRecord.college_id == user.college_id,
            models.LectureAttendanceRecord.lecture_date == payload.lecture_date,
        )
        if payload.source_type == "weekly":
            record_query = record_query.filter(
                models.LectureAttendanceRecord.weekly_lecture_id == payload.schedule_id
            )
        else:
            record_query = record_query.filter(
                models.LectureAttendanceRecord.additional_lecture_request_id == payload.schedule_id
            )

        start_at = datetime.combine(payload.lecture_date, start_time)
        end_at = datetime.combine(payload.lecture_date, end_time)

        def validate_action_window(
            now: datetime,
            record: models.LectureAttendanceRecord | None,
        ) -> None:
            if payload.lecture_date != now.date():
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Lecture punches are only allowed on the scheduled day.")
            if action == "punch_in":
                if record and record.punch_in_time is not None:
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You have already punched in to this lecture.")
                if now < start_at - timedelta(minutes=15):
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Lecture punch-in opens 15 minutes before the scheduled start.")
                if now > end_at:
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The lecture punch-in window has closed.")
            else:
                if record is None or record.punch_in_time is None or record.punch_out_time is not None:
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Punch in to this lecture before punching out.")
                if now < record.punch_in_time:
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Lecture punch-out must follow punch-in.")
                if now > end_at + timedelta(minutes=15):
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The lecture punch-out window closed 15 minutes after its scheduled end.")

        record = record_query.with_for_update().first()
        validate_action_window(_attendance_now(), record)
        face_verified, _, _, _ = _verify_face(
            db,
            user,
            action,
            payload.challenge_token,
            payload.frames,
            payload.face_image_base64,
            request,
        )

        now = _attendance_now()
        record = record_query.with_for_update().first()
        validate_action_window(now, record)
        if record is None:
            record = models.LectureAttendanceRecord(
                college_id=user.college_id,
                user_id=user.id,
                weekly_lecture_id=weekly_lecture_id,
                additional_lecture_request_id=additional_lecture_request_id,
                lecture_date=payload.lecture_date,
            )
            db.add(record)
            db.flush()
        if action == "punch_in":
            record.punch_in_time = now
            record.punch_in_face_verified = face_verified
        else:
            record.punch_out_time = now
            record.punch_out_face_verified = face_verified
        db.add(
            models.LectureAttendanceEvent(
                attendance_id=record.id,
                user_id=user.id,
                event_type=action,
                event_time=now,
                face_verified=face_verified,
                idempotency_key=payload.idempotency_key,
                ip_address=request.client.host if request.client else None,
            )
        )
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Lecture attendance conflicts with another request; refresh and try again.",
            ) from exc
        db.refresh(record)
        return _lecture_attendance_payload(record)

    @app.get("/admin/timetable")
    def list_timetable(
        department_id: int | None = None,
        course_id: int | None = None,
        semester: int | None = None,
        faculty_id: int | None = None,
        classroom_id: int | None = None,
        day_of_week: int | None = None,
        status_filter: str = "all",
        academic_year_id: int | None = None,
        search: str | None = None,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN, models.UserRole.HOD)),
        db: Session = Depends(get_db),
    ):
        query = db.query(models.WeeklyLecture).filter(
            models.WeeklyLecture.college_id == admin.college_id,
            models.WeeklyLecture.is_active.is_(True),
        )
        if admin.role == models.UserRole.HOD:
            query = query.filter(models.WeeklyLecture.department_id == admin.department_id)
        elif department_id is not None:
            query = query.filter(models.WeeklyLecture.department_id == department_id)

        if course_id is not None:
            query = query.filter(models.WeeklyLecture.course_id == course_id)
        if semester is not None:
            query = query.filter(models.WeeklyLecture.semester == semester)
        if faculty_id is not None:
            query = query.filter(
                or_(
                    models.WeeklyLecture.user_id == faculty_id,
                    models.WeeklyLecture.substitute_faculty_id == faculty_id,
                )
            )
        if classroom_id is not None:
            query = query.filter(models.WeeklyLecture.classroom_id == classroom_id)
        if day_of_week is not None:
            query = query.filter(models.WeeklyLecture.day_of_week == day_of_week)
        if status_filter != "all":
            query = query.filter(models.WeeklyLecture.status == status_filter)
        if academic_year_id is not None:
            query = query.filter(models.WeeklyLecture.academic_year_id == academic_year_id)
        if search and search.strip():
            term = f"%{search.strip()}%"
            query = query.filter(
                or_(
                    models.WeeklyLecture.subject.ilike(term),
                    models.WeeklyLecture.course_name.ilike(term),
                    models.WeeklyLecture.room.ilike(term),
                    models.WeeklyLecture.user.has(models.User.full_name.ilike(term)),
                )
            )

        lectures = query.order_by(
            models.WeeklyLecture.day_of_week,
            models.WeeklyLecture.start_time,
            models.WeeklyLecture.user_id,
        ).all()

        # Compute summary KPIs
        all_active_query = db.query(models.WeeklyLecture).filter(
            models.WeeklyLecture.college_id == admin.college_id,
            models.WeeklyLecture.is_active.is_(True),
        )
        if admin.role == models.UserRole.HOD:
            all_active_query = all_active_query.filter(models.WeeklyLecture.department_id == admin.department_id)
        all_lectures = all_active_query.all()

        today_weekday = _attendance_now().weekday()
        today_lectures = sum(1 for l in all_lectures if l.day_of_week == today_weekday and l.status != "cancelled")
        distinct_faculty = len({l.user_id for l in all_lectures if l.user_id})
        distinct_classrooms = len({l.classroom_id for l in all_lectures if l.classroom_id} | {l.room for l in all_lectures if l.room})
        substitute_count = sum(1 for l in all_lectures if l.substitute_faculty_id is not None)
        cancelled_count = sum(1 for l in all_lectures if l.status == "cancelled")

        return {
            "items": [_weekly_lecture_payload(item) for item in lectures],
            "summary": {
                "total_lectures": len(all_lectures),
                "today_lectures": today_lectures,
                "assigned_faculty_count": distinct_faculty,
                "classrooms_allocated": distinct_classrooms,
                "substitute_count": substitute_count,
                "cancelled_count": cancelled_count,
            },
        }

    @app.get("/admin/timetable/matrix")
    def get_timetable_matrix(
        department_id: int | None = None,
        academic_year_id: int | None = None,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN, models.UserRole.HOD)),
        db: Session = Depends(get_db),
    ):
        query = db.query(models.WeeklyLecture).filter(
            models.WeeklyLecture.college_id == admin.college_id,
            models.WeeklyLecture.is_active.is_(True),
        )
        if admin.role == models.UserRole.HOD:
            query = query.filter(models.WeeklyLecture.department_id == admin.department_id)
        elif department_id is not None:
            query = query.filter(models.WeeklyLecture.department_id == department_id)
        if academic_year_id is not None:
            query = query.filter(models.WeeklyLecture.academic_year_id == academic_year_id)

        lectures = query.order_by(
            models.WeeklyLecture.day_of_week,
            models.WeeklyLecture.start_time,
        ).all()

        days = {i: [] for i in range(7)}
        for item in lectures:
            days[item.day_of_week].append(_weekly_lecture_payload(item))

        return {
            "matrix": [
                {
                    "day_index": i,
                    "day_name": WEEKDAY_NAMES[i],
                    "lectures": days[i],
                    "total_sessions": len(days[i]),
                }
                for i in range(7)
            ]
        }

    @app.post("/admin/timetable/check-conflict")
    def check_timetable_conflict(
        payload: WeeklyLectureConflictCheck,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN, models.UserRole.HOD)),
        db: Session = Depends(get_db),
    ):
        # 1. Check faculty conflict
        faculty_coll_query = db.query(models.WeeklyLecture).filter(
            models.WeeklyLecture.college_id == admin.college_id,
            models.WeeklyLecture.is_active.is_(True),
            models.WeeklyLecture.status != "cancelled",
            models.WeeklyLecture.day_of_week == payload.day_of_week,
            models.WeeklyLecture.start_time < payload.end_time,
            models.WeeklyLecture.end_time > payload.start_time,
            or_(
                models.WeeklyLecture.user_id == payload.user_id,
                models.WeeklyLecture.substitute_faculty_id == payload.user_id,
            ),
        )
        if payload.exclude_id:
            faculty_coll_query = faculty_coll_query.filter(models.WeeklyLecture.id != payload.exclude_id)
        fac_coll = faculty_coll_query.first()
        if fac_coll:
            fac_user = db.query(models.User).filter(models.User.id == payload.user_id).first()
            f_name = fac_user.full_name if fac_user else "Faculty member"
            day_str = WEEKDAY_NAMES[payload.day_of_week] if 0 <= payload.day_of_week < len(WEEKDAY_NAMES) else f"Day {payload.day_of_week}"
            st_str = fac_coll.start_time.strftime("%H:%M") if hasattr(fac_coll.start_time, "strftime") else str(fac_coll.start_time)[:5]
            et_str = fac_coll.end_time.strftime("%H:%M") if hasattr(fac_coll.end_time, "strftime") else str(fac_coll.end_time)[:5]
            return {
                "has_conflict": True,
                "conflict_type": "faculty",
                "conflict_message": f"Faculty Conflict: {f_name} is already assigned to '{fac_coll.subject}' in {fac_coll.room or 'room'} from {st_str} to {et_str} on {day_str}.",
            }

        # 2. Check classroom conflict
        if payload.classroom_id or (payload.room and payload.room.strip()):
            room_conds = []
            if payload.classroom_id:
                room_conds.append(models.WeeklyLecture.classroom_id == payload.classroom_id)
            if payload.room and payload.room.strip():
                room_conds.append(models.WeeklyLecture.room == payload.room.strip())
            room_coll_query = db.query(models.WeeklyLecture).filter(
                models.WeeklyLecture.college_id == admin.college_id,
                models.WeeklyLecture.is_active.is_(True),
                models.WeeklyLecture.status != "cancelled",
                models.WeeklyLecture.day_of_week == payload.day_of_week,
                models.WeeklyLecture.start_time < payload.end_time,
                models.WeeklyLecture.end_time > payload.start_time,
                or_(*room_conds),
            )
            if payload.exclude_id:
                room_coll_query = room_coll_query.filter(models.WeeklyLecture.id != payload.exclude_id)
            room_coll = room_coll_query.first()
            if room_coll:
                r_name = room_coll.room or f"Classroom #{payload.classroom_id}"
                day_str = WEEKDAY_NAMES[payload.day_of_week] if 0 <= payload.day_of_week < len(WEEKDAY_NAMES) else f"Day {payload.day_of_week}"
                st_str = room_coll.start_time.strftime("%H:%M") if hasattr(room_coll.start_time, "strftime") else str(room_coll.start_time)[:5]
                et_str = room_coll.end_time.strftime("%H:%M") if hasattr(room_coll.end_time, "strftime") else str(room_coll.end_time)[:5]
                t_name = room_coll.user.full_name if room_coll.user else "another faculty"
                return {
                    "has_conflict": True,
                    "conflict_type": "classroom",
                    "conflict_message": f"Classroom Conflict: {r_name} is already occupied by {t_name} for '{room_coll.subject}' from {st_str} to {et_str} on {day_str}.",
                }

        return {
            "has_conflict": False,
            "conflict_type": None,
            "conflict_message": None,
        }

    @app.post("/admin/timetable", status_code=status.HTTP_201_CREATED)
    def create_timetable_entry(
        payload: WeeklyLectureCreate,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN, models.UserRole.HOD)),
        db: Session = Depends(get_db),
    ):
        teacher = db.query(models.User).filter(
            models.User.id == payload.user_id,
            models.User.college_id == admin.college_id,
            models.User.is_active.is_(True),
        ).first()
        if teacher is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active faculty member not found.")
        if admin.role == models.UserRole.HOD and teacher.department_id != admin.department_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only schedule lectures for your own department.")

        department_id = payload.department_id if payload.department_id is not None else teacher.department_id

        # Subject mapping & autofill
        subject_title = payload.subject.strip() if payload.subject else None
        if payload.subject_id:
            sub = db.query(models.Subject).filter(
                models.Subject.id == payload.subject_id,
                models.Subject.college_id == admin.college_id,
            ).first()
            if sub:
                if not subject_title:
                    subject_title = sub.name
                if sub.department_id and not department_id:
                    department_id = sub.department_id
                if sub.course_id and not payload.course_id:
                    payload.course_id = sub.course_id
                if sub.semester and not payload.semester:
                    payload.semester = sub.semester

        if not subject_title:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Subject title or valid subject ID is required.")

        # Course mapping & autofill
        course_name_val = payload.course_name.strip() if payload.course_name else None
        if payload.course_id:
            course_obj = db.query(models.Course).filter(
                models.Course.id == payload.course_id,
                models.Course.college_id == admin.college_id,
            ).first()
            if course_obj and not course_name_val:
                course_name_val = f"{course_obj.name} ({course_obj.code})"

        # Classroom mapping & room string autofill
        room_val = payload.room.strip() if payload.room else None
        if payload.classroom_id:
            room_obj = db.query(models.Classroom).filter(
                models.Classroom.id == payload.classroom_id,
                models.Classroom.college_id == admin.college_id,
            ).first()
            if room_obj:
                room_val = f"{room_obj.building} - {room_obj.room_number}" if room_obj.building else room_obj.room_number

        # 1. Conflict Check: Faculty overlap
        fac_collision = db.query(models.WeeklyLecture).filter(
            models.WeeklyLecture.college_id == admin.college_id,
            models.WeeklyLecture.is_active.is_(True),
            models.WeeklyLecture.status != "cancelled",
            models.WeeklyLecture.day_of_week == payload.day_of_week,
            models.WeeklyLecture.start_time < payload.end_time,
            models.WeeklyLecture.end_time > payload.start_time,
            or_(
                models.WeeklyLecture.user_id == teacher.id,
                models.WeeklyLecture.substitute_faculty_id == teacher.id,
            ),
        ).first()
        if fac_collision:
            day_str = WEEKDAY_NAMES[payload.day_of_week] if 0 <= payload.day_of_week < len(WEEKDAY_NAMES) else f"Day {payload.day_of_week}"
            st_str = fac_collision.start_time.strftime("%H:%M") if hasattr(fac_collision.start_time, "strftime") else str(fac_collision.start_time)[:5]
            et_str = fac_collision.end_time.strftime("%H:%M") if hasattr(fac_collision.end_time, "strftime") else str(fac_collision.end_time)[:5]
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Faculty Conflict: {teacher.full_name} is already scheduled for '{fac_collision.subject}' in {fac_collision.room or 'assigned room'} from {st_str} to {et_str} on {day_str}.",
            )

        # 2. Conflict Check: Classroom overlap
        if payload.classroom_id or room_val:
            room_conds = []
            if payload.classroom_id:
                room_conds.append(models.WeeklyLecture.classroom_id == payload.classroom_id)
            if room_val:
                room_conds.append(models.WeeklyLecture.room == room_val)
            room_collision = db.query(models.WeeklyLecture).filter(
                models.WeeklyLecture.college_id == admin.college_id,
                models.WeeklyLecture.is_active.is_(True),
                models.WeeklyLecture.status != "cancelled",
                models.WeeklyLecture.day_of_week == payload.day_of_week,
                models.WeeklyLecture.start_time < payload.end_time,
                models.WeeklyLecture.end_time > payload.start_time,
                or_(*room_conds),
            ).first()
            if room_collision:
                day_str = WEEKDAY_NAMES[payload.day_of_week] if 0 <= payload.day_of_week < len(WEEKDAY_NAMES) else f"Day {payload.day_of_week}"
                st_str = room_collision.start_time.strftime("%H:%M") if hasattr(room_collision.start_time, "strftime") else str(room_collision.start_time)[:5]
                et_str = room_collision.end_time.strftime("%H:%M") if hasattr(room_collision.end_time, "strftime") else str(room_collision.end_time)[:5]
                occ_name = room_collision.user.full_name if room_collision.user else "another faculty"
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Classroom Conflict: Room '{room_val or room_collision.room}' is already allocated to {occ_name} for '{room_collision.subject}' from {st_str} to {et_str} on {day_str}.",
                )

        # 3. Check Substitute Faculty conflict (if provided)
        if payload.substitute_faculty_id:
            sub_fac = db.query(models.User).filter(
                models.User.id == payload.substitute_faculty_id,
                models.User.college_id == admin.college_id,
                models.User.is_active.is_(True),
            ).first()
            if not sub_fac:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Substitute faculty member not found.")

        lecture = models.WeeklyLecture(
            college_id=admin.college_id,
            department_id=department_id,
            user_id=teacher.id,
            subject=subject_title,
            course_name=course_name_val,
            day_of_week=payload.day_of_week,
            start_time=payload.start_time,
            end_time=payload.end_time,
            room=room_val,
            is_active=True,
            created_by=admin.id,
            subject_id=payload.subject_id,
            course_id=payload.course_id,
            academic_year_id=payload.academic_year_id,
            classroom_id=payload.classroom_id,
            semester=payload.semester,
            lecture_type=payload.lecture_type or "Theory",
            substitute_faculty_id=payload.substitute_faculty_id,
            status="scheduled",
        )
        db.add(lecture)
        db.commit()
        db.refresh(lecture)
        return _weekly_lecture_payload(lecture)

    @app.put("/admin/timetable/{lecture_id}")
    def update_timetable_entry(
        lecture_id: int,
        payload: WeeklyLectureUpdate,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN, models.UserRole.HOD)),
        db: Session = Depends(get_db),
    ):
        lecture = db.query(models.WeeklyLecture).filter(
            models.WeeklyLecture.id == lecture_id,
            models.WeeklyLecture.college_id == admin.college_id,
            models.WeeklyLecture.is_active.is_(True),
        ).first()
        if lecture is None or (admin.role == models.UserRole.HOD and lecture.department_id != admin.department_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Timetable entry not found.")

        target_user_id = payload.user_id if payload.user_id is not None else lecture.user_id
        target_day = payload.day_of_week if payload.day_of_week is not None else lecture.day_of_week
        target_start = payload.start_time if payload.start_time is not None else lecture.start_time
        target_end = payload.end_time if payload.end_time is not None else lecture.end_time
        if target_end <= target_start:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Lecture end time must be after start time.")

        target_classroom_id = payload.classroom_id if payload.classroom_id is not None else lecture.classroom_id
        target_room = payload.room if payload.room is not None else lecture.room

        if payload.classroom_id:
            rm_obj = db.query(models.Classroom).filter(
                models.Classroom.id == payload.classroom_id,
                models.Classroom.college_id == admin.college_id,
            ).first()
            if rm_obj:
                target_room = f"{rm_obj.building} - {rm_obj.room_number}" if rm_obj.building else rm_obj.room_number

        # 1. Faculty conflict check (exclude this lecture)
        fac_coll = db.query(models.WeeklyLecture).filter(
            models.WeeklyLecture.id != lecture.id,
            models.WeeklyLecture.college_id == admin.college_id,
            models.WeeklyLecture.is_active.is_(True),
            models.WeeklyLecture.status != "cancelled",
            models.WeeklyLecture.day_of_week == target_day,
            models.WeeklyLecture.start_time < target_end,
            models.WeeklyLecture.end_time > target_start,
            or_(
                models.WeeklyLecture.user_id == target_user_id,
                models.WeeklyLecture.substitute_faculty_id == target_user_id,
            ),
        ).first()
        if fac_coll:
            t_user = db.query(models.User).filter(models.User.id == target_user_id).first()
            t_name = t_user.full_name if t_user else "Faculty member"
            day_str = WEEKDAY_NAMES[target_day] if 0 <= target_day < len(WEEKDAY_NAMES) else f"Day {target_day}"
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Faculty Conflict: {t_name} is already scheduled for '{fac_coll.subject}' in {fac_coll.room or 'room'} on {day_str}.",
            )

        # 2. Classroom conflict check (exclude this lecture)
        if target_classroom_id or target_room:
            room_conds = []
            if target_classroom_id:
                room_conds.append(models.WeeklyLecture.classroom_id == target_classroom_id)
            if target_room:
                room_conds.append(models.WeeklyLecture.room == target_room)
            room_coll = db.query(models.WeeklyLecture).filter(
                models.WeeklyLecture.id != lecture.id,
                models.WeeklyLecture.college_id == admin.college_id,
                models.WeeklyLecture.is_active.is_(True),
                models.WeeklyLecture.status != "cancelled",
                models.WeeklyLecture.day_of_week == target_day,
                models.WeeklyLecture.start_time < target_end,
                models.WeeklyLecture.end_time > target_start,
                or_(*room_conds),
            ).first()
            if room_coll:
                day_str = WEEKDAY_NAMES[target_day] if 0 <= target_day < len(WEEKDAY_NAMES) else f"Day {target_day}"
                occ_name = room_coll.user.full_name if room_coll.user else "another faculty"
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Classroom Conflict: Room '{target_room or room_coll.room}' is already booked by {occ_name} on {day_str}.",
                )

        # Apply updates
        if payload.user_id is not None:
            lecture.user_id = payload.user_id
        if payload.department_id is not None:
            lecture.department_id = payload.department_id
        if payload.subject_id is not None:
            sub = db.query(models.Subject).filter(models.Subject.id == payload.subject_id).first()
            if sub:
                lecture.subject_id = sub.id
                lecture.subject = sub.name
        elif payload.subject is not None:
            lecture.subject = payload.subject.strip()

        if payload.course_id is not None:
            c_obj = db.query(models.Course).filter(models.Course.id == payload.course_id).first()
            if c_obj:
                lecture.course_id = c_obj.id
                lecture.course_name = f"{c_obj.name} ({c_obj.code})"
        elif payload.course_name is not None:
            lecture.course_name = payload.course_name.strip()

        if payload.academic_year_id is not None:
            lecture.academic_year_id = payload.academic_year_id
        if payload.classroom_id is not None:
            lecture.classroom_id = payload.classroom_id
        lecture.room = target_room
        if payload.semester is not None:
            lecture.semester = payload.semester
        if payload.lecture_type is not None:
            lecture.lecture_type = payload.lecture_type
        if payload.day_of_week is not None:
            lecture.day_of_week = payload.day_of_week
        if payload.start_time is not None:
            lecture.start_time = payload.start_time
        if payload.end_time is not None:
            lecture.end_time = payload.end_time
        if payload.substitute_faculty_id is not None:
            lecture.substitute_faculty_id = payload.substitute_faculty_id

        db.commit()
        db.refresh(lecture)
        return _weekly_lecture_payload(lecture)

    @app.patch("/admin/timetable/{lecture_id}/status")
    def update_timetable_status(
        lecture_id: int,
        payload: WeeklyLectureStatusUpdate,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN, models.UserRole.HOD)),
        db: Session = Depends(get_db),
    ):
        lecture = db.query(models.WeeklyLecture).filter(
            models.WeeklyLecture.id == lecture_id,
            models.WeeklyLecture.college_id == admin.college_id,
            models.WeeklyLecture.is_active.is_(True),
        ).first()
        if lecture is None or (admin.role == models.UserRole.HOD and lecture.department_id != admin.department_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Timetable entry not found.")

        lecture.status = payload.status
        if payload.status == "cancelled":
            lecture.cancellation_reason = payload.cancellation_reason or "Cancelled by administrator."
        else:
            lecture.cancellation_reason = None

        db.commit()
        db.refresh(lecture)
        return _weekly_lecture_payload(lecture)

    @app.post("/admin/timetable/{lecture_id}/assign-substitute")
    def assign_timetable_substitute(
        lecture_id: int,
        payload: WeeklyLectureSubstituteUpdate,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN, models.UserRole.HOD)),
        db: Session = Depends(get_db),
    ):
        lecture = db.query(models.WeeklyLecture).filter(
            models.WeeklyLecture.id == lecture_id,
            models.WeeklyLecture.college_id == admin.college_id,
            models.WeeklyLecture.is_active.is_(True),
        ).first()
        if lecture is None or (admin.role == models.UserRole.HOD and lecture.department_id != admin.department_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Timetable entry not found.")

        if payload.substitute_faculty_id is not None:
            sub = db.query(models.User).filter(
                models.User.id == payload.substitute_faculty_id,
                models.User.college_id == admin.college_id,
                models.User.is_active.is_(True),
            ).first()
            if not sub:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Substitute faculty not found.")
            # Conflict check for substitute faculty
            sub_coll = db.query(models.WeeklyLecture).filter(
                models.WeeklyLecture.id != lecture.id,
                models.WeeklyLecture.college_id == admin.college_id,
                models.WeeklyLecture.is_active.is_(True),
                models.WeeklyLecture.status != "cancelled",
                models.WeeklyLecture.day_of_week == lecture.day_of_week,
                models.WeeklyLecture.start_time < lecture.end_time,
                models.WeeklyLecture.end_time > lecture.start_time,
                or_(
                    models.WeeklyLecture.user_id == sub.id,
                    models.WeeklyLecture.substitute_faculty_id == sub.id,
                ),
            ).first()
            if sub_coll:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Substitute Conflict: {sub.full_name} is already teaching '{sub_coll.subject}' during this time.",
                )
            lecture.substitute_faculty_id = sub.id
        else:
            lecture.substitute_faculty_id = None

        db.commit()
        db.refresh(lecture)
        return _weekly_lecture_payload(lecture)

    @app.delete("/admin/timetable/{lecture_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_timetable_entry(
        lecture_id: int,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN, models.UserRole.HOD)),
        db: Session = Depends(get_db),
    ):
        lecture = db.query(models.WeeklyLecture).filter(
            models.WeeklyLecture.id == lecture_id,
            models.WeeklyLecture.college_id == admin.college_id,
            models.WeeklyLecture.is_active.is_(True),
        ).first()
        if lecture is None or (
            admin.role == models.UserRole.HOD and lecture.department_id != admin.department_id
        ):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Timetable entry not found.")
        lecture.is_active = False
        db.commit()

    @app.get("/additional-lectures/mine")
    def list_my_additional_lectures(
        user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        requests = (
            db.query(models.AdditionalLectureRequest)
            .filter(
                models.AdditionalLectureRequest.user_id == user.id,
                models.AdditionalLectureRequest.college_id == user.college_id,
            )
            .order_by(models.AdditionalLectureRequest.created_at.desc())
            .limit(100)
            .all()
        )
        return [_additional_lecture_payload(item) for item in requests]

    @app.post("/additional-lectures", status_code=status.HTTP_201_CREATED)
    def create_additional_lecture_request(
        payload: AdditionalLectureCreate,
        user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        if user.role not in (models.UserRole.FACULTY, models.UserRole.STAFF):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only faculty and staff can request an additional lecture.")
        if payload.lecture_date < _attendance_now().date():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Additional lectures must be requested for today or a future date.")
        weekly_conflict = db.query(models.WeeklyLecture.id).filter(
            models.WeeklyLecture.user_id == user.id,
            models.WeeklyLecture.college_id == user.college_id,
            models.WeeklyLecture.day_of_week == payload.lecture_date.weekday(),
            models.WeeklyLecture.is_active.is_(True),
            models.WeeklyLecture.start_time < payload.end_time,
            models.WeeklyLecture.end_time > payload.start_time,
        ).first()
        request_conflict = db.query(models.AdditionalLectureRequest.id).filter(
            models.AdditionalLectureRequest.user_id == user.id,
            models.AdditionalLectureRequest.college_id == user.college_id,
            models.AdditionalLectureRequest.lecture_date == payload.lecture_date,
            models.AdditionalLectureRequest.status.in_(("pending", "approved")),
            models.AdditionalLectureRequest.start_time < payload.end_time,
            models.AdditionalLectureRequest.end_time > payload.start_time,
        ).first()
        if weekly_conflict or request_conflict:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This additional lecture overlaps an existing or requested lecture.")
        request = models.AdditionalLectureRequest(
            college_id=user.college_id,
            user_id=user.id,
            lecture_date=payload.lecture_date,
            subject=payload.subject.strip(),
            start_time=payload.start_time,
            end_time=payload.end_time,
            room=payload.room.strip() if payload.room else None,
            reason=payload.reason.strip(),
            status="pending",
        )
        db.add(request)
        db.flush()
        reviewers = db.query(models.User).filter(
            models.User.college_id == user.college_id,
            models.User.is_active.is_(True),
            models.User.role == models.UserRole.SUPER_ADMIN,
        )
        if user.department_id is not None:
            reviewers = reviewers.union(
                db.query(models.User).filter(
                    models.User.college_id == user.college_id,
                    models.User.department_id == user.department_id,
                    models.User.role == models.UserRole.HOD,
                    models.User.is_active.is_(True),
                )
            )
        for reviewer in reviewers.all():
            db.add(models.Notification(
                user_id=reviewer.id,
                college_id=user.college_id,
                title="Additional lecture request",
                message=f"{user.full_name} requested an additional lecture for {payload.lecture_date.isoformat()}.",
                type="info",
                action_url="/admin/approvals",
            ))
        db.commit()
        db.refresh(request)
        return _additional_lecture_payload(request)

    @app.get("/admin/additional-lectures")
    def list_additional_lecture_requests(
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN, models.UserRole.HOD)),
        db: Session = Depends(get_db),
    ):
        query = db.query(models.AdditionalLectureRequest).join(
            models.User, models.User.id == models.AdditionalLectureRequest.user_id
        ).filter(models.AdditionalLectureRequest.college_id == admin.college_id)
        if admin.role == models.UserRole.HOD:
            query = query.filter(models.User.department_id == admin.department_id)
        requests = query.order_by(
            models.AdditionalLectureRequest.created_at.desc()
        ).limit(500).all()
        return [_additional_lecture_payload(item) for item in requests]

    @app.post("/admin/additional-lectures/{request_id}/review")
    def review_additional_lecture_request(
        request_id: int,
        payload: AdditionalLectureReview,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN, models.UserRole.HOD)),
        db: Session = Depends(get_db),
    ):
        request = (
            db.query(models.AdditionalLectureRequest)
            .join(models.User, models.User.id == models.AdditionalLectureRequest.user_id)
            .filter(
                models.AdditionalLectureRequest.id == request_id,
                models.AdditionalLectureRequest.college_id == admin.college_id,
                models.AdditionalLectureRequest.status == "pending",
            )
            .with_for_update()
            .first()
        )
        if request is None or request.user_id == admin.id or (
            admin.role == models.UserRole.HOD and request.user.department_id != admin.department_id
        ):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pending additional lecture request not found.")
        if payload.approved:
            weekly_conflict = db.query(models.WeeklyLecture.id).filter(
                models.WeeklyLecture.user_id == request.user_id,
                models.WeeklyLecture.college_id == request.college_id,
                models.WeeklyLecture.day_of_week == request.lecture_date.weekday(),
                models.WeeklyLecture.is_active.is_(True),
                models.WeeklyLecture.start_time < request.end_time,
                models.WeeklyLecture.end_time > request.start_time,
            ).first()
            request_conflict = db.query(models.AdditionalLectureRequest.id).filter(
                models.AdditionalLectureRequest.id != request.id,
                models.AdditionalLectureRequest.user_id == request.user_id,
                models.AdditionalLectureRequest.college_id == request.college_id,
                models.AdditionalLectureRequest.lecture_date == request.lecture_date,
                models.AdditionalLectureRequest.status == "approved",
                models.AdditionalLectureRequest.start_time < request.end_time,
                models.AdditionalLectureRequest.end_time > request.start_time,
            ).first()
            if weekly_conflict or request_conflict:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This request now overlaps another scheduled lecture.")
        request.status = "approved" if payload.approved else "rejected"
        request.reviewed_by = admin.id
        request.reviewed_at = _utcnow()
        request.review_remarks = payload.remarks.strip() if payload.remarks else None
        db.add(models.Notification(
            user_id=request.user_id,
            college_id=request.college_id,
            title=f"Additional lecture request {request.status}",
            message=(
                f"Your request for {request.lecture_date.isoformat()} was {request.status}."
                + (f" {request.review_remarks}" if request.review_remarks else "")
            ),
            type="success" if payload.approved else "warning",
            action_url="/user/additional-lectures",
        ))
        db.commit()
        return {"id": request.id, "status": request.status}

    @app.get("/admin/attendance")
    def attendance_report(
        report_date: date | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
        department_id: int | None = None,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN, models.UserRole.HOD)),
        db: Session = Depends(get_db),
    ):
        today = _attendance_now().date()
        start = report_date or start_date or today
        end = report_date or end_date or today
        if end < start or (end - start).days > 366:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid attendance report range.")
        query = (
            db.query(models.AttendanceRecord, models.User)
            .join(models.User, models.User.id == models.AttendanceRecord.user_id)
            .filter(
                models.AttendanceRecord.college_id == admin.college_id,
                models.AttendanceRecord.date >= start,
                models.AttendanceRecord.date <= end,
            )
        )
        if admin.role == models.UserRole.HOD:
            query = query.filter(models.User.department_id == admin.department_id)
        elif department_id is not None:
            query = query.filter(models.User.department_id == department_id)
        rows = query.order_by(models.AttendanceRecord.date.desc(), models.User.full_name).limit(5000).all()
        return [
            {
                **_attendance_payload(record),
                "employee": {
                    "id": employee.id,
                    "employee_id": employee.employee_id,
                    "full_name": employee.full_name,
                    "department_id": employee.department_id,
                },
            }
            for record, employee in rows
        ]

    # =========================================================================
    # PHASE 2: VISITING FACULTY MANAGEMENT ENDPOINTS
    # =========================================================================

    @app.get("/admin/faculty")
    def list_visiting_faculty(
        search: str | None = None,
        department_id: int | None = None,
        status_filter: str | None = None,
        face_status: str | None = None,
        sort_by: str = "full_name",
        sort_order: str = "asc",
        page: int = 1,
        limit: int = 15,
        admin: models.User = Depends(require_roles(*ADMIN_ROLES)),
        db: Session = Depends(get_db),
    ):
        query = db.query(models.User).filter(
            models.User.college_id == admin.college_id,
            models.User.role == models.UserRole.FACULTY,
        )
        if admin.role == models.UserRole.HOD:
            query = query.filter(models.User.department_id == admin.department_id)
        elif department_id:
            query = query.filter(models.User.department_id == department_id)

        if search:
            s = f"%{search.strip().lower()}%"
            query = query.filter(
                (func.lower(models.User.full_name).like(s))
                | (func.lower(models.User.employee_id).like(s))
                | (func.lower(models.User.email).like(s))
                | (models.User.phone.like(s))
            )

        if status_filter and status_filter != "all":
            if status_filter == "active":
                query = query.filter(models.User.is_active.is_(True))
            elif status_filter == "inactive":
                query = query.filter(models.User.is_active.is_(False), (models.User.account_status != "suspended") | (models.User.account_status.is_(None)))
            elif status_filter == "suspended":
                query = query.filter(models.User.account_status == "suspended")

        if face_status and face_status != "all":
            try:
                b_status = models.BiometricStatus(face_status)
                query = query.filter(models.User.face_enrollment_status == b_status)
            except ValueError:
                pass

        total = query.count()

        order_col = models.User.full_name
        if sort_by == "employee_id":
            order_col = models.User.employee_id
        elif sort_by == "date_of_joining":
            order_col = models.User.date_of_joining
        elif sort_by == "created_at":
            order_col = models.User.created_at

        if sort_order.lower() == "desc":
            query = query.order_by(order_col.desc())
        else:
            query = query.order_by(order_col.asc())

        offset = max(0, (page - 1) * limit)
        items = query.offset(offset).limit(limit).all()

        results = []
        for faculty in items:
            dept_name = faculty.department.name if faculty.department else None
            results.append({
                "id": faculty.id,
                "employee_id": faculty.employee_id,
                "full_name": faculty.full_name,
                "email": faculty.email,
                "phone": faculty.phone,
                "gender": faculty.gender,
                "department_id": faculty.department_id,
                "department_name": dept_name,
                "designation": faculty.designation,
                "qualification": faculty.qualification,
                "specialization": faculty.specialization,
                "experience_years": faculty.experience_years,
                "date_of_joining": str(faculty.date_of_joining) if faculty.date_of_joining else None,
                "is_active": faculty.is_active,
                "account_status": faculty.account_status or ("active" if faculty.is_active else "inactive"),
                "face_enrolled": faculty.face_enrolled,
                "face_enrollment_status": faculty.face_enrollment_status.value if faculty.face_enrollment_status else "not_enrolled",
                "profile_photo": faculty.profile_photo,
                "created_at": faculty.created_at.isoformat() if faculty.created_at else None,
            })

        return {
            "items": results,
            "total": total,
            "page": page,
            "limit": limit,
            "pages": math.ceil(total / limit) if limit > 0 else 1,
        }

    @app.post("/admin/faculty", status_code=status.HTTP_201_CREATED)
    def create_visiting_faculty(
        payload: FacultyCreate,
        request: Request,
        admin: models.User = Depends(require_roles(*ADMIN_ROLES)),
        db: Session = Depends(get_db),
    ):
        email = str(payload.email).strip().lower()
        if db.query(models.User.id).filter(models.User.college_id == admin.college_id, func.lower(models.User.email) == email).first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A faculty member with this email address already exists in this institution.")

        phone = payload.phone.strip() if payload.phone else None
        if phone and db.query(models.User.id).filter(models.User.college_id == admin.college_id, models.User.phone == phone).first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A faculty member with this phone number already exists in this institution.")

        dept_id = admin.department_id if admin.role == models.UserRole.HOD else payload.department_id

        year = _attendance_now().year
        employee_id = payload.employee_id.strip() if payload.employee_id else None
        if not employee_id or payload.auto_generate_id:
            count = db.query(models.User.id).filter(
                models.User.college_id == admin.college_id,
                models.User.employee_id.like(f"VF-{year}-%")
            ).count()
            candidate_num = count + 1
            while True:
                candidate_id = f"VF-{year}-{candidate_num:04d}"
                if not db.query(models.User.id).filter(models.User.college_id == admin.college_id, models.User.employee_id == candidate_id).first():
                    employee_id = candidate_id
                    break
                candidate_num += 1
        else:
            if db.query(models.User.id).filter(models.User.college_id == admin.college_id, models.User.employee_id == employee_id).first():
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Faculty ID '{employee_id}' is already registered in this institution.")

        default_pw = payload.password or secrets.token_urlsafe(12)
        new_faculty = models.User(
            college_id=admin.college_id,
            department_id=dept_id,
            employee_id=employee_id,
            full_name=payload.full_name.strip(),
            email=email,
            phone=phone,
            gender=payload.gender,
            designation=payload.designation or "Visiting Faculty",
            qualification=payload.qualification,
            specialization=payload.specialization,
            experience_years=payload.experience_years,
            date_of_joining=payload.date_of_joining or _attendance_now().date(),
            address=payload.address,
            password_hash=hash_password(default_pw),
            role=models.UserRole.FACULTY,
            is_active=True,
            account_status="active",
            face_enrolled=False,
            face_enrollment_status=models.BiometricStatus.NOT_ENROLLED,
        )
        db.add(new_faculty)
        db.flush()

        db.add(
            models.AuditLog(
                college_id=admin.college_id,
                user_id=admin.id,
                action="faculty.created",
                resource_type="user",
                resource_id=new_faculty.id,
                new_value={"employee_id": employee_id, "name": new_faculty.full_name},
                ip_address=request.client.host if request.client else None,
            )
        )
        db.commit()
        db.refresh(new_faculty)
        return {
            "id": new_faculty.id,
            "employee_id": new_faculty.employee_id,
            "full_name": new_faculty.full_name,
            "email": new_faculty.email,
            "phone": new_faculty.phone,
            "department_id": new_faculty.department_id,
            "account_status": new_faculty.account_status,
            "generated_password": default_pw if not payload.password else None,
            "message": "Faculty registered successfully.",
        }

    @app.get("/admin/faculty/{faculty_id}")
    def get_faculty_details(
        faculty_id: int,
        admin: models.User = Depends(require_roles(*ADMIN_ROLES)),
        db: Session = Depends(get_db),
    ):
        faculty = db.query(models.User).filter(
            models.User.id == faculty_id,
            models.User.college_id == admin.college_id,
        ).first()
        if not faculty:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Faculty not found.")
        return faculty

    @app.get("/admin/faculty/{faculty_id}/profile")
    def get_faculty_profile(
        faculty_id: int,
        admin: models.User = Depends(require_roles(*ADMIN_ROLES)),
        db: Session = Depends(get_db),
    ):
        faculty = db.query(models.User).filter(
            models.User.id == faculty_id,
            models.User.college_id == admin.college_id,
        ).first()
        if not faculty:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Faculty record not found.")

        if admin.role == models.UserRole.HOD and faculty.department_id != admin.department_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access outside your department scope.")

        # 1. Personal Information
        personal_info = {
            "full_name": faculty.full_name,
            "employee_id": faculty.employee_id,
            "email": faculty.email,
            "phone": faculty.phone,
            "gender": faculty.gender,
            "address": faculty.address,
            "profile_photo": faculty.profile_photo,
        }

        # 2. Professional Information
        professional_info = {
            "qualification": faculty.qualification,
            "specialization": faculty.specialization,
            "experience_years": faculty.experience_years,
            "designation": faculty.designation,
            "department_id": faculty.department_id,
            "department_name": faculty.department.name if faculty.department else "Unassigned",
            "date_of_joining": str(faculty.date_of_joining) if faculty.date_of_joining else None,
            "account_status": faculty.account_status or ("active" if faculty.is_active else "inactive"),
            "is_active": faculty.is_active,
        }

        # 3. Assigned Subjects
        assignments = db.query(models.FacultySubjectAssignment).filter(
            models.FacultySubjectAssignment.faculty_id == faculty.id
        ).all()
        assigned_subjects = [
            {
                "id": a.id,
                "subject_id": a.subject_id,
                "subject_name": a.subject.name if a.subject else "Subject",
                "subject_code": a.subject.code if a.subject else "SUB",
                "credits": a.subject.credits if a.subject else 4,
                "assigned_at": a.assigned_at.isoformat() if a.assigned_at else None,
            }
            for a in assignments
        ]

        # 4. Lecture Schedule
        lectures = db.query(models.WeeklyLecture).filter(
            models.WeeklyLecture.user_id == faculty.id,
            models.WeeklyLecture.is_active.is_(True),
        ).all()
        days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        lecture_schedule = [
            {
                "id": lec.id,
                "day_of_week": lec.day_of_week,
                "day_name": days[lec.day_of_week] if 0 <= lec.day_of_week < 7 else "Day",
                "subject_name": lec.subject,
                "room_number": lec.room,
                "start_time": str(lec.start_time),
                "end_time": str(lec.end_time),
            }
            for lec in lectures
        ]

        # 5. Attendance History (Recent 30 records)
        att_records = db.query(models.AttendanceRecord).filter(
            models.AttendanceRecord.user_id == faculty.id
        ).order_by(models.AttendanceRecord.date.desc()).limit(30).all()
        attendance_history = [
            {
                "id": r.id,
                "date": str(r.date),
                "status": r.status.value,
                "punch_in_time": r.punch_in_time.isoformat() if r.punch_in_time else None,
                "punch_out_time": r.punch_out_time.isoformat() if r.punch_out_time else None,
                "is_late": r.is_late,
                "late_by_minutes": r.late_by_minutes,
                "net_working_minutes": r.net_working_minutes,
                "face_verified": r.face_verified,
                "geofence_verified": r.geofence_verified,
            }
            for r in att_records
        ]

        # 6. Leave History
        leaves = db.query(models.LeaveApplication).filter(
            models.LeaveApplication.user_id == faculty.id
        ).order_by(models.LeaveApplication.created_at.desc()).all()
        leave_history = [
            {
                "id": lv.id,
                "start_date": str(lv.start_date),
                "end_date": str(lv.end_date),
                "leave_type": lv.leave_type.name if lv.leave_type else "Leave",
                "days_count": lv.days_count,
                "reason": lv.reason,
                "status": lv.status.value,
                "review_remarks": lv.review_remarks,
                "created_at": lv.created_at.isoformat() if lv.created_at else None,
            }
            for lv in leaves
        ]

        # 7. Availability Slots
        avail_records = db.query(models.FacultyAvailability).filter(
            models.FacultyAvailability.faculty_id == faculty.id
        ).all()
        availability = [
            {
                "id": av.id,
                "day_of_week": av.day_of_week,
                "day_name": days[av.day_of_week] if 0 <= av.day_of_week < 7 else "Day",
                "start_time": str(av.start_time),
                "end_time": str(av.end_time),
                "is_available": av.is_available,
                "status": av.status,
                "notes": av.notes,
            }
            for av in avail_records
        ]

        # 8. Face Registration Status
        biometric_logs = db.query(models.BiometricVerificationLog).filter(
            models.BiometricVerificationLog.user_id == faculty.id
        ).order_by(models.BiometricVerificationLog.created_at.desc()).limit(10).all()
        face_registration = {
            "face_enrolled": faculty.face_enrolled,
            "enrollment_status": faculty.face_enrollment_status.value if faculty.face_enrollment_status else "not_enrolled",
            "recent_verifications": [
                {
                    "timestamp": log.created_at.isoformat() if log.created_at else None,
                    "action": log.action,
                    "result": log.result.value if hasattr(log.result, "value") else str(log.result),
                    "confidence_score": log.confidence_score,
                    "liveness_score": log.liveness_score,
                }
                for log in biometric_logs
            ]
        }

        # 9. Workload Summary
        total_assigned = len(lectures)
        completed_lectures = db.query(models.LectureAttendanceRecord).filter(
            models.LectureAttendanceRecord.user_id == faculty.id,
            models.LectureAttendanceRecord.punch_out_time.isnot(None),
        ).count()
        total_minutes = sum(r.net_working_minutes for r in att_records if r.net_working_minutes)
        rate = db.query(models.FacultyPaymentRate).filter(
            models.FacultyPaymentRate.faculty_id == faculty.id
        ).first()
        rate_per_hour = rate.rate_per_hour if rate else 1000.0
        workload_summary = {
            "assigned_lectures_per_week": total_assigned,
            "total_completed_lectures": completed_lectures,
            "total_teaching_hours": round(total_minutes / 60, 1),
            "payment_rate_per_hour": rate_per_hour,
            "estimated_earnings": round((total_minutes / 60) * rate_per_hour, 2),
        }

        # 10. Account Activity
        sessions = db.query(models.UserSession).filter(
            models.UserSession.user_id == faculty.id
        ).order_by(models.UserSession.created_at.desc()).limit(10).all()
        account_activity = [
            {
                "id": s.id,
                "login_time": s.created_at.isoformat() if s.created_at else None,
                "ip_address": s.ip_address,
                "device_info": s.device_info,
                "is_active": s.is_active,
            }
            for s in sessions
        ]

        return {
            "id": faculty.id,
            "personal_info": personal_info,
            "professional_info": professional_info,
            "assigned_subjects": assigned_subjects,
            "lecture_schedule": lecture_schedule,
            "attendance_history": attendance_history,
            "leave_history": leave_history,
            "availability": availability,
            "face_registration": face_registration,
            "workload_summary": workload_summary,
            "account_activity": account_activity,
        }

    @app.put("/admin/faculty/{faculty_id}")
    def update_faculty_profile(
        faculty_id: int,
        payload: FacultyUpdate,
        request: Request,
        admin: models.User = Depends(require_roles(*ADMIN_ROLES)),
        db: Session = Depends(get_db),
    ):
        faculty = db.query(models.User).filter(models.User.id == faculty_id, models.User.college_id == admin.college_id).first()
        if not faculty:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Faculty not found.")
        if admin.role == models.UserRole.HOD and faculty.department_id != admin.department_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access outside your department scope.")

        phone = payload.phone.strip() if payload.phone else None
        if phone:
            dup = db.query(models.User.id).filter(models.User.college_id == admin.college_id, models.User.phone == phone, models.User.id != faculty_id).first()
            if dup:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Phone number already in use by another faculty member.")

        faculty.full_name = payload.full_name.strip()
        faculty.phone = phone
        faculty.gender = payload.gender
        if admin.role != models.UserRole.HOD:
            faculty.department_id = payload.department_id
        faculty.qualification = payload.qualification
        faculty.specialization = payload.specialization
        faculty.experience_years = payload.experience_years
        if payload.date_of_joining:
            faculty.date_of_joining = payload.date_of_joining
        faculty.address = payload.address
        if payload.designation:
            faculty.designation = payload.designation

        db.add(
            models.AuditLog(
                college_id=admin.college_id,
                user_id=admin.id,
                action="faculty.updated",
                resource_type="user",
                resource_id=faculty.id,
                ip_address=request.client.host if request.client else None,
            )
        )
        db.commit()
        return {"status": "success", "message": "Faculty profile updated successfully."}

    @app.post("/admin/faculty/{faculty_id}/activate")
    def activate_faculty(
        faculty_id: int,
        request: Request,
        admin: models.User = Depends(require_roles(*ADMIN_ROLES)),
        db: Session = Depends(get_db),
    ):
        faculty = db.query(models.User).filter(models.User.id == faculty_id, models.User.college_id == admin.college_id).first()
        if not faculty:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Faculty not found.")
        faculty.is_active = True
        faculty.account_status = "active"
        db.add(models.AuditLog(college_id=admin.college_id, user_id=admin.id, action="faculty.activated", resource_type="user", resource_id=faculty.id, ip_address=request.client.host if request.client else None))
        db.commit()
        return {"status": "success", "account_status": "active"}

    @app.post("/admin/faculty/{faculty_id}/deactivate")
    def deactivate_faculty(
        faculty_id: int,
        request: Request,
        admin: models.User = Depends(require_roles(*ADMIN_ROLES)),
        db: Session = Depends(get_db),
    ):
        faculty = db.query(models.User).filter(models.User.id == faculty_id, models.User.college_id == admin.college_id).first()
        if not faculty:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Faculty not found.")
        faculty.is_active = False
        faculty.account_status = "inactive"
        db.add(models.AuditLog(college_id=admin.college_id, user_id=admin.id, action="faculty.deactivated", resource_type="user", resource_id=faculty.id, ip_address=request.client.host if request.client else None))
        db.commit()
        return {"status": "success", "account_status": "inactive"}

    @app.post("/admin/faculty/{faculty_id}/suspend")
    def suspend_faculty(
        faculty_id: int,
        request: Request,
        admin: models.User = Depends(require_roles(*ADMIN_ROLES)),
        db: Session = Depends(get_db),
    ):
        faculty = db.query(models.User).filter(models.User.id == faculty_id, models.User.college_id == admin.college_id).first()
        if not faculty:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Faculty not found.")
        faculty.is_active = False
        faculty.account_status = "suspended"
        db.add(models.AuditLog(college_id=admin.college_id, user_id=admin.id, action="faculty.suspended", resource_type="user", resource_id=faculty.id, ip_address=request.client.host if request.client else None))
        db.commit()
        return {"status": "success", "account_status": "suspended"}

    @app.delete("/admin/faculty/{faculty_id}")
    def delete_faculty(
        faculty_id: int,
        request: Request,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN, models.UserRole.COLLEGE_ADMIN)),
        db: Session = Depends(get_db),
    ):
        faculty = db.query(models.User).filter(models.User.id == faculty_id, models.User.college_id == admin.college_id).first()
        if not faculty:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Faculty not found.")

        has_attendance = db.query(models.AttendanceRecord.id).filter(models.AttendanceRecord.user_id == faculty.id).first()
        has_lecture_att = db.query(models.LectureAttendanceRecord.id).filter(models.LectureAttendanceRecord.user_id == faculty.id).first()
        if has_attendance or has_lecture_att:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot permanently delete faculty records linked to historical attendance. Use Deactivate or Suspend instead."
            )

        db.add(models.AuditLog(college_id=admin.college_id, user_id=admin.id, action="faculty.deleted", resource_type="user", resource_id=faculty.id, ip_address=request.client.host if request.client else None))
        db.delete(faculty)
        db.commit()
        return {"status": "success", "message": "Faculty record deleted successfully."}

    # =========================================================================
    # PHASE 2: REAL-TIME DATABASE-DRIVEN EXECUTIVE DASHBOARD
    # =========================================================================

    @app.get("/admin/dashboard")
    def admin_dashboard(
        admin: models.User = Depends(require_roles(*ADMIN_ROLES)),
        db: Session = Depends(get_db),
    ):
        now_dt = _attendance_now()
        today = now_dt.date()
        now_time = now_dt.time()
        today_weekday = now_dt.weekday() # 0 = Monday

        # 1. Visiting Faculty Stats
        fac_q = db.query(models.User).filter(
            models.User.college_id == admin.college_id,
            models.User.role == models.UserRole.FACULTY,
        )
        if admin.role == models.UserRole.HOD:
            fac_q = fac_q.filter(models.User.department_id == admin.department_id)
        all_faculty = fac_q.all()
        total_faculty = len(all_faculty)
        active_faculty = sum(1 for f in all_faculty if f.is_active)
        inactive_faculty = sum(1 for f in all_faculty if not f.is_active)
        faculty_ids = [f.id for f in all_faculty]

        # 2. Today's Attendance Records
        rec_q = db.query(models.AttendanceRecord).filter(
            models.AttendanceRecord.college_id == admin.college_id,
            models.AttendanceRecord.date == today,
        )
        if admin.role == models.UserRole.HOD:
            rec_q = rec_q.join(models.User).filter(models.User.department_id == admin.department_id)
        today_records = rec_q.all()

        present_today = sum(1 for r in today_records if r.status in (models.AttendanceStatus.PRESENT, models.AttendanceStatus.HALF_DAY, models.AttendanceStatus.PUNCHED_OUT, models.AttendanceStatus.ON_BREAK))
        punched_in_faculty_ids = {r.user_id for r in today_records if r.punch_in_time is not None}
        faculty_on_campus = sum(1 for r in today_records if r.punch_in_time is not None and r.punch_out_time is None and r.status != models.AttendanceStatus.ON_BREAK)
        late_arrivals = sum(1 for r in today_records if r.is_late)

        # 3. Approved Leaves for Today
        leaves_today = db.query(models.LeaveApplication).filter(
            models.LeaveApplication.college_id == admin.college_id,
            models.LeaveApplication.start_date <= today,
            models.LeaveApplication.end_date >= today,
            models.LeaveApplication.status == models.LeaveStatus.APPROVED,
        ).all()
        on_leave_faculty_ids = {lv.user_id for lv in leaves_today}

        # 4. Scheduled Lectures for Today (Weekly Lectures + Approved Additional Lectures)
        lec_q = db.query(models.WeeklyLecture).filter(
            models.WeeklyLecture.college_id == admin.college_id,
            models.WeeklyLecture.day_of_week == today_weekday,
            models.WeeklyLecture.is_active.is_(True),
        )
        if admin.role == models.UserRole.HOD:
            lec_q = lec_q.filter(models.WeeklyLecture.department_id == admin.department_id)
        weekly_today = lec_q.all()

        addl_q = db.query(models.AdditionalLectureRequest).filter(
            models.AdditionalLectureRequest.college_id == admin.college_id,
            models.AdditionalLectureRequest.lecture_date == today,
            models.AdditionalLectureRequest.status == "approved",
        )
        if admin.role == models.UserRole.HOD:
            addl_q = addl_q.filter(models.AdditionalLectureRequest.department_id == admin.department_id)
        addl_today = addl_q.all()

        scheduled_lectures_today = len(weekly_today) + len(addl_today)

        # 5. Completed & Cancelled Lectures
        comp_lec_q = db.query(models.LectureAttendanceRecord).filter(
            models.LectureAttendanceRecord.college_id == admin.college_id,
            models.LectureAttendanceRecord.lecture_date == today,
            models.LectureAttendanceRecord.punch_out_time.isnot(None),
        )
        if admin.role == models.UserRole.HOD:
            comp_lec_q = comp_lec_q.join(models.User).filter(models.User.department_id == admin.department_id)
        completed_lectures = comp_lec_q.count()

        canc_q = db.query(models.AdditionalLectureRequest).filter(
            models.AdditionalLectureRequest.college_id == admin.college_id,
            models.AdditionalLectureRequest.lecture_date == today,
            models.AdditionalLectureRequest.status == "cancelled",
        )
        if admin.role == models.UserRole.HOD:
            canc_q = canc_q.filter(models.AdditionalLectureRequest.department_id == admin.department_id)
        cancelled_lectures = canc_q.count()

        # 6. Absence Calculation: Faculty with scheduled attendance DUE who have not punched in and are not on leave
        due_faculty_ids = set()
        for w in weekly_today:
            if w.start_time <= now_time and w.user_id:
                due_faculty_ids.add(w.user_id)
        for a in addl_today:
            try:
                st = datetime.strptime(a.start_time, "%H:%M").time() if isinstance(a.start_time, str) else a.start_time
                if st <= now_time:
                    due_faculty_ids.add(a.user_id)
            except Exception:
                pass

        absent_faculty_ids = [fid for fid in due_faculty_ids if fid not in punched_in_faculty_ids and fid not in on_leave_faculty_ids]
        absent_today = len(absent_faculty_ids)

        # 7. Pending Approvals
        pending_leaves = db.query(models.LeaveApplication).filter(
            models.LeaveApplication.college_id == admin.college_id,
            models.LeaveApplication.status == models.LeaveStatus.PENDING,
        )
        if admin.role == models.UserRole.HOD:
            pending_leaves = pending_leaves.join(models.User).filter(models.User.department_id == admin.department_id)
        pending_leave_requests = pending_leaves.count()

        pending_avail_q = db.query(models.FacultyAvailability).filter(
            models.FacultyAvailability.college_id == admin.college_id,
            models.FacultyAvailability.status == "pending",
        )
        if admin.role == models.UserRole.HOD:
            pending_avail_q = pending_avail_q.join(models.User).filter(models.User.department_id == admin.department_id)
        pending_availability_requests = pending_avail_q.count()

        pending_corr_q = db.query(models.AttendanceCorrection).filter(
            models.AttendanceCorrection.college_id == admin.college_id,
            models.AttendanceCorrection.status == "pending",
        )
        if admin.role == models.UserRole.HOD:
            pending_corr_q = pending_corr_q.join(models.User).filter(models.User.department_id == admin.department_id)
        pending_attendance_corrections = pending_corr_q.count()

        pending_biometrics = _pending_biometric_count(db, admin)

        # 8. Visualisations: Weekly Attendance Trends (last 7 days from DB)
        weekly_trends = []
        for d_offset in range(6, -1, -1):
            target_date = today - timedelta(days=d_offset)
            t_rec = db.query(models.AttendanceRecord).filter(
                models.AttendanceRecord.college_id == admin.college_id,
                models.AttendanceRecord.date == target_date,
            )
            if admin.role == models.UserRole.HOD:
                t_rec = t_rec.join(models.User).filter(models.User.department_id == admin.department_id)
            t_rows = t_rec.all()
            p_cnt = sum(1 for r in t_rows if r.status in (models.AttendanceStatus.PRESENT, models.AttendanceStatus.HALF_DAY, models.AttendanceStatus.PUNCHED_OUT, models.AttendanceStatus.ON_BREAK))
            l_cnt = sum(1 for r in t_rows if r.is_late)
            weekly_trends.append({
                "date": target_date.isoformat(),
                "day_name": target_date.strftime("%a"),
                "present": p_cnt,
                "late": l_cnt,
                "records": len(t_rows),
            })

        # 9. Visualisations: Department-wise Attendance
        dept_attendance = []
        depts = db.query(models.Department).filter(
            models.Department.college_id == admin.college_id,
            models.Department.is_active.is_(True),
        ).all()
        for dept in depts:
            d_fac_cnt = db.query(models.User.id).filter(
                models.User.college_id == admin.college_id,
                models.User.department_id == dept.id,
                models.User.role == models.UserRole.FACULTY,
            ).count()
            d_pres_cnt = db.query(models.AttendanceRecord.id).join(models.User).filter(
                models.AttendanceRecord.college_id == admin.college_id,
                models.AttendanceRecord.date == today,
                models.User.department_id == dept.id,
                models.AttendanceRecord.status.in_((models.AttendanceStatus.PRESENT, models.AttendanceStatus.HALF_DAY, models.AttendanceStatus.PUNCHED_OUT, models.AttendanceStatus.ON_BREAK)),
            ).count()
            dept_attendance.append({
                "department_id": dept.id,
                "department_name": dept.name,
                "department_code": dept.code,
                "total_faculty": d_fac_cnt,
                "present_today": d_pres_cnt,
                "attendance_percentage": round((d_pres_cnt / d_fac_cnt * 100), 1) if d_fac_cnt > 0 else 0,
            })

        # 10. Teaching Hours Overview
        total_scheduled_minutes = sum(
            int((datetime.combine(today, w.end_time) - datetime.combine(today, w.start_time)).total_seconds() / 60)
            for w in weekly_today if w.end_time and w.start_time
        )
        total_completed_minutes = sum(r.net_working_minutes for r in today_records if r.net_working_minutes)

        # 11. Today's Lectures Feed & Upcoming Lectures
        today_lectures_list = []
        for w in weekly_today:
            fac = db.query(models.User).filter(models.User.id == w.user_id).first()
            is_done = db.query(models.LectureAttendanceRecord.id).filter(
                models.LectureAttendanceRecord.weekly_lecture_id == w.id,
                models.LectureAttendanceRecord.lecture_date == today,
                models.LectureAttendanceRecord.punch_out_time.isnot(None),
            ).first() is not None
            today_lectures_list.append({
                "id": w.id,
                "subject": w.subject,
                "faculty_name": fac.full_name if fac else "Unassigned",
                "room": w.room,
                "start_time": str(w.start_time),
                "end_time": str(w.end_time),
                "is_completed": is_done,
                "is_upcoming": w.start_time > now_time,
            })

        upcoming_lectures = [lec for lec in today_lectures_list if lec["is_upcoming"]][:5]

        # 12. Recent Attendance Activity (Latest 10)
        recent_activity = []
        recent_punches = db.query(models.AttendanceRecord).filter(
            models.AttendanceRecord.college_id == admin.college_id,
        ).order_by(models.AttendanceRecord.updated_at.desc()).limit(8).all()
        for rp in recent_punches:
            u = rp.user
            recent_activity.append({
                "id": rp.id,
                "faculty_name": u.full_name if u else "Faculty",
                "employee_id": u.employee_id if u else "VF",
                "date": str(rp.date),
                "status": rp.status.value,
                "punch_in": rp.punch_in_time.strftime("%I:%M %p") if rp.punch_in_time else "—",
                "punch_out": rp.punch_out_time.strftime("%I:%M %p") if rp.punch_out_time else "—",
                "face_verified": rp.punch_in_face_verified,
                "geofence_verified": rp.punch_in_gps_verified,
            })

        # 13. Recent Faculty Registrations (Latest 5)
        recent_reg = db.query(models.User).filter(
            models.User.college_id == admin.college_id,
            models.User.role == models.UserRole.FACULTY,
        ).order_by(models.User.created_at.desc()).limit(5).all()
        recent_registrations = [
            {
                "id": reg.id,
                "employee_id": reg.employee_id,
                "full_name": reg.full_name,
                "department": reg.department.name if reg.department else "Unassigned",
                "created_at": reg.created_at.strftime("%d %b %Y"),
                "status": reg.account_status or ("active" if reg.is_active else "inactive"),
            }
            for reg in recent_reg
        ]

        # 14. Recent Admin Activity Logs (Latest 5)
        recent_audit = db.query(models.AuditLog).filter(
            models.AuditLog.college_id == admin.college_id,
        ).order_by(models.AuditLog.created_at.desc()).limit(5).all()
        admin_activities = [
            {
                "id": al.id,
                "action": al.action,
                "resource_type": al.resource_type,
                "resource_id": al.resource_id,
                "timestamp": al.created_at.strftime("%d %b, %I:%M %p") if al.created_at else "—",
            }
            for al in recent_audit
        ]

        # 15. Verification Failure Alerts (Biometric failures in last 48 hours)
        fail_logs = db.query(models.BiometricVerificationLog).filter(
            models.BiometricVerificationLog.college_id == admin.college_id,
            models.BiometricVerificationLog.result != models.VerificationResult.PASS,
            models.BiometricVerificationLog.created_at >= _utcnow() - timedelta(hours=48),
        ).order_by(models.BiometricVerificationLog.created_at.desc()).limit(6).all()
        verification_alerts = [
            {
                "id": fl.id,
                "faculty_name": fl.user.full_name if fl.user else "Unknown",
                "action": fl.action,
                "result": fl.result.value if hasattr(fl.result, "value") else str(fl.result),
                "timestamp": fl.created_at.strftime("%d %b, %I:%M %p") if fl.created_at else "—",
                "confidence_score": fl.similarity_score,
            }
            for fl in fail_logs
        ]

        return {
            "date": today.isoformat(),
            "statistics": {
                "total_visiting_faculty": total_faculty,
                "active_faculty": active_faculty,
                "inactive_faculty": inactive_faculty,
                "present_today": present_today,
                "absent_today": absent_today,
                "faculty_currently_on_campus": faculty_on_campus,
                "late_arrivals": late_arrivals,
                "today_scheduled_lectures": scheduled_lectures_today,
                "completed_lectures": completed_lectures,
                "cancelled_lectures": cancelled_lectures,
                "pending_leave_requests": pending_leave_requests,
                "pending_availability_requests": pending_availability_requests,
                "pending_attendance_corrections": pending_attendance_corrections,
                "pending_biometric_enrollments": pending_biometrics,
            },
            "visualisations": {
                "daily_overview": {
                    "present": present_today,
                    "late": late_arrivals,
                    "absent": absent_today,
                    "on_campus": faculty_on_campus,
                    "on_leave": len(on_leave_faculty_ids),
                },
                "weekly_trends": weekly_trends,
                "department_attendance": dept_attendance,
                "teaching_hours": {
                    "scheduled_hours": round(total_scheduled_minutes / 60, 1),
                    "completed_hours": round(total_completed_minutes / 60, 1),
                },
            },
            "feeds": {
                "today_lectures": today_lectures_list,
                "upcoming_lectures": upcoming_lectures,
                "recent_activity": recent_activity,
                "recent_registrations": recent_registrations,
                "recent_admin_activities": admin_activities,
                "verification_alerts": verification_alerts,
            },
        }

    @app.get("/admin/reports/attendance.csv")
    def export_attendance_csv(
        report_date: date,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN, models.UserRole.HOD)),
        db: Session = Depends(get_db),
    ):
        import csv
        import io
        from fastapi.responses import StreamingResponse

        query = (
            db.query(models.AttendanceRecord, models.User)
            .join(models.User, models.User.id == models.AttendanceRecord.user_id)
            .filter(
                models.AttendanceRecord.college_id == admin.college_id,
                models.AttendanceRecord.date == report_date,
            )
        )
        if admin.role == models.UserRole.HOD:
            query = query.filter(models.User.department_id == admin.department_id)
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(("Employee ID", "Name", "Date", "Status", "Punch in", "Punch out", "Net working minutes"))
        for record, employee in query.order_by(models.User.full_name).all():
            safe_name = "'" + employee.full_name if employee.full_name.startswith(("=", "+", "-", "@")) else employee.full_name
            writer.writerow(
                (
                    employee.employee_id,
                    safe_name,
                    record.date.isoformat(),
                    record.status.value,
                    record.punch_in_time.isoformat() if record.punch_in_time else "",
                    record.punch_out_time.isoformat() if record.punch_out_time else "",
                    record.net_working_minutes or 0,
                )
            )
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="attendance-{report_date.isoformat()}.csv"'},
        )

    @app.get("/leave/types")
    def list_leave_types(
        user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        leave_types = (
            db.query(models.LeaveType)
            .filter(
                models.LeaveType.college_id == user.college_id,
                models.LeaveType.is_active.is_(True),
            )
            .order_by(models.LeaveType.name)
            .all()
        )
        return [
            {
                "id": item.id,
                "name": item.name,
                "code": item.code,
                "max_days_per_year": item.max_days_per_year,
                "is_paid": item.is_paid,
                "requires_document": item.requires_document,
            }
            for item in leave_types
        ]

    @app.post("/admin/leave-types", status_code=status.HTTP_201_CREATED)
    def create_leave_type(
        payload: LeaveTypeCreate,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        code = payload.code.strip().upper()
        duplicate = (
            db.query(models.LeaveType.id)
            .filter(
                models.LeaveType.college_id == admin.college_id,
                func.upper(models.LeaveType.code) == code,
            )
            .first()
        )
        if duplicate:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A leave type with this code already exists.")
        leave_type = models.LeaveType(
            college_id=admin.college_id,
            name=payload.name.strip(),
            code=code,
            max_days_per_year=payload.max_days_per_year,
            is_paid=payload.is_paid,
            requires_document=payload.requires_document,
            is_active=True,
        )
        db.add(leave_type)
        db.commit()
        db.refresh(leave_type)
        return {"id": leave_type.id, "name": leave_type.name, "code": leave_type.code}

    @app.post("/leave/applications", status_code=status.HTTP_201_CREATED)
    def apply_for_leave(
        payload: LeaveApplicationCreate,
        user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        leave_type = (
            db.query(models.LeaveType)
            .filter(
                models.LeaveType.id == payload.leave_type_id,
                models.LeaveType.college_id == user.college_id,
                models.LeaveType.is_active.is_(True),
            )
            .first()
        )
        if leave_type is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Leave type not found.")
        if leave_type.requires_document:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="This leave type requires supporting documents, but secure document upload is not configured.",
            )
        overlapping = (
            db.query(models.LeaveApplication.id)
            .filter(
                models.LeaveApplication.user_id == user.id,
                models.LeaveApplication.status.in_((models.LeaveStatus.PENDING, models.LeaveStatus.APPROVED)),
                models.LeaveApplication.start_date <= payload.end_date,
                models.LeaveApplication.end_date >= payload.start_date,
            )
            .first()
        )
        if overlapping:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This leave period overlaps another pending or approved request.")

        total_days = _count_leave_days(db, user.college_id, payload.start_date, payload.end_date)
        if total_days == 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The selected leave period contains no working days.")
        current_year = payload.start_date.year
        last_year = payload.end_date.year
        while current_year <= last_year:
            year_start = date(current_year, 1, 1)
            year_end = date(current_year, 12, 31)
            requested_start = max(payload.start_date, year_start)
            requested_end = min(payload.end_date, year_end)
            requested_days = _count_leave_days(db, user.college_id, requested_start, requested_end)
            used_days = 0
            existing_applications = (
                db.query(models.LeaveApplication)
                .filter(
                    models.LeaveApplication.user_id == user.id,
                    models.LeaveApplication.leave_type_id == leave_type.id,
                    models.LeaveApplication.status.in_((models.LeaveStatus.PENDING, models.LeaveStatus.APPROVED)),
                    models.LeaveApplication.start_date <= year_end,
                    models.LeaveApplication.end_date >= year_start,
                )
                .all()
            )
            for existing in existing_applications:
                used_days += _count_leave_days(
                    db,
                    user.college_id,
                    max(existing.start_date, year_start),
                    min(existing.end_date, year_end),
                )
            if used_days + requested_days > leave_type.max_days_per_year:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Requested leave exceeds the {leave_type.name} balance for {current_year}.",
                )
            current_year += 1

        application = models.LeaveApplication(
            user_id=user.id,
            college_id=user.college_id,
            leave_type_id=leave_type.id,
            start_date=payload.start_date,
            end_date=payload.end_date,
            total_days=total_days,
            reason=payload.reason.strip(),
            status=models.LeaveStatus.PENDING,
        )
        db.add(application)
        db.flush()
        reviewers = db.query(models.User).filter(
            models.User.college_id == user.college_id,
            models.User.is_active.is_(True),
            models.User.role == models.UserRole.SUPER_ADMIN,
        )
        if user.department_id is not None:
            reviewers = reviewers.union(
                db.query(models.User).filter(
                    models.User.college_id == user.college_id,
                    models.User.department_id == user.department_id,
                    models.User.role == models.UserRole.HOD,
                    models.User.is_active.is_(True),
                )
            )
        for reviewer in reviewers.all():
            db.add(
                models.Notification(
                    user_id=reviewer.id,
                    college_id=user.college_id,
                    title="New leave application",
                    message=f"{user.full_name} submitted a leave request for {total_days} working day(s).",
                    type="info",
                    action_url="/admin/leave",
                )
            )
        db.commit()
        return {
            "id": application.id,
            "status": application.status.value,
            "total_days": application.total_days,
        }

    @app.get("/leave/applications")
    def list_leave_applications(
        user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        query = (
            db.query(models.LeaveApplication, models.User, models.LeaveType)
            .join(models.User, models.User.id == models.LeaveApplication.user_id)
            .join(models.LeaveType, models.LeaveType.id == models.LeaveApplication.leave_type_id)
            .filter(models.LeaveApplication.college_id == user.college_id)
        )
        if user.role == models.UserRole.SUPER_ADMIN:
            pass
        elif user.role == models.UserRole.HOD:
            query = query.filter(models.User.department_id == user.department_id)
        else:
            query = query.filter(models.LeaveApplication.user_id == user.id)
        rows = query.order_by(models.LeaveApplication.created_at.desc()).limit(500).all()
        return [
            {
                "id": application.id,
                "employee": {"id": employee.id, "name": employee.full_name, "employee_id": employee.employee_id},
                "leave_type": {"id": leave_type.id, "name": leave_type.name},
                "start_date": application.start_date,
                "end_date": application.end_date,
                "total_days": application.total_days,
                "reason": application.reason,
                "status": application.status.value,
                "reviewed_at": application.reviewed_at,
                "review_remarks": application.review_remarks,
                "created_at": application.created_at,
            }
            for application, employee, leave_type in rows
        ]

    @app.post("/leave/applications/{application_id}/review")
    def review_leave_application(
        application_id: int,
        payload: LeaveReview,
        request: Request,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN, models.UserRole.HOD)),
        db: Session = Depends(get_db),
    ):
        application = (
            db.query(models.LeaveApplication)
            .filter(
                models.LeaveApplication.id == application_id,
                models.LeaveApplication.college_id == admin.college_id,
                models.LeaveApplication.status == models.LeaveStatus.PENDING,
            )
            .with_for_update()
            .first()
        )
        if application is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pending leave application not found.")
        employee = db.query(models.User).filter(models.User.id == application.user_id).first()
        if employee is None or not _user_can_review(admin, employee) or employee.id == admin.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pending leave application not found.")

        new_status = models.LeaveStatus.APPROVED if payload.approved else models.LeaveStatus.REJECTED
        application.status = new_status
        application.reviewed_by = admin.id
        application.reviewed_at = _utcnow()
        application.review_remarks = (payload.remarks or "").strip() or None
        if payload.approved:
            overlap = (
                db.query(models.LeaveApplication.id)
                .filter(
                    models.LeaveApplication.id != application.id,
                    models.LeaveApplication.user_id == employee.id,
                    models.LeaveApplication.status == models.LeaveStatus.APPROVED,
                    models.LeaveApplication.start_date <= application.end_date,
                    models.LeaveApplication.end_date >= application.start_date,
                )
                .first()
            )
            if overlap:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The requested dates overlap another approved leave.")
        db.add(
            models.AuditLog(
                college_id=admin.college_id,
                user_id=admin.id,
                action="leave.application_reviewed",
                resource_type="leave_application",
                resource_id=application.id,
                new_value={"status": new_status.value, "remarks": application.review_remarks},
                ip_address=request.client.host if request.client else None,
            )
        )
        db.add(
            models.Notification(
                user_id=employee.id,
                college_id=admin.college_id,
                title="Leave application reviewed",
                message=(
                    "Your leave application was approved."
                    if payload.approved
                    else f"Your leave application was rejected. {application.review_remarks or ''}".strip()
                ),
                type="success" if payload.approved else "warning",
            )
        )
        db.commit()
        return {"id": application.id, "status": application.status.value}

    @app.post("/leave/applications/{application_id}/cancel")
    def cancel_leave_application(
        application_id: int,
        user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        application = (
            db.query(models.LeaveApplication)
            .filter(
                models.LeaveApplication.id == application_id,
                models.LeaveApplication.user_id == user.id,
                models.LeaveApplication.college_id == user.college_id,
                models.LeaveApplication.status == models.LeaveStatus.PENDING,
            )
            .with_for_update()
            .first()
        )
        if application is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pending leave application not found.")
        application.status = models.LeaveStatus.CANCELLED
        application.updated_at = _utcnow()
        db.commit()
        return {"id": application.id, "status": application.status.value}

    @app.get("/notifications")
    def list_notifications(
        user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        notifications = (
            db.query(models.Notification)
            .filter(
                models.Notification.user_id == user.id,
                models.Notification.college_id == user.college_id,
            )
            .order_by(models.Notification.created_at.desc())
            .limit(100)
            .all()
        )
        return [
            {
                "id": item.id,
                "title": item.title,
                "message": item.message,
                "type": item.type,
                "is_read": item.is_read,
                "action_url": item.action_url,
                "created_at": item.created_at,
            }
            for item in notifications
        ]

    @app.post("/notifications/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
    def mark_notification_read(
        notification_id: int,
        user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        notification = (
            db.query(models.Notification)
            .filter(
                models.Notification.id == notification_id,
                models.Notification.user_id == user.id,
                models.Notification.college_id == user.college_id,
            )
            .first()
        )
        if notification is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found.")
        notification.is_read = True
        db.commit()

    # =========================================================================
    # PHASE 4: ACADEMIC MANAGEMENT (DEPARTMENTS, COURSES, SUBJECTS, AY, CLASSROOMS, HOLIDAYS)
    # =========================================================================

    # --- 1. DEPARTMENT MANAGEMENT ---
    @app.get("/admin/academic/departments")
    def get_academic_departments(
        search: str | None = None,
        status_filter: str = "all",
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN, models.UserRole.HOD)),
        db: Session = Depends(get_db),
    ):
        query = db.query(models.Department).filter(models.Department.college_id == admin.college_id)
        if status_filter == "active":
            query = query.filter(models.Department.is_active.is_(True))
        elif status_filter == "inactive":
            query = query.filter(models.Department.is_active.is_(False))

        if search and search.strip():
            s = f"%{search.strip()}%"
            query = query.filter(
                or_(
                    models.Department.name.ilike(s),
                    models.Department.code.ilike(s),
                    models.Department.description.ilike(s),
                )
            )

        all_depts = query.order_by(models.Department.name).all()

        # KPIs across college
        total_departments = db.query(models.Department).filter(models.Department.college_id == admin.college_id).count()
        active_departments = db.query(models.Department).filter(models.Department.college_id == admin.college_id, models.Department.is_active.is_(True)).count()
        total_hods = db.query(models.Department).filter(models.Department.college_id == admin.college_id, models.Department.hod_id.isnot(None)).count()
        total_faculty_assigned = db.query(models.User).filter(models.User.college_id == admin.college_id, models.User.department_id.isnot(None), models.User.is_active.is_(True)).count()

        results = []
        for d in all_depts:
            fac_count = db.query(models.User).filter(models.User.college_id == admin.college_id, models.User.department_id == d.id).count()
            course_count = db.query(models.Course).filter(models.Course.college_id == admin.college_id, models.Course.department_id == d.id).count()
            subject_count = db.query(models.Subject).filter(models.Subject.college_id == admin.college_id, models.Subject.department_id == d.id).count()
            
            hod_name = None
            hod_email = None
            if d.hod_id:
                hod_user = db.query(models.User).filter(models.User.id == d.hod_id).first()
                if hod_user:
                    hod_name = hod_user.full_name
                    hod_email = hod_user.email

            results.append({
                "id": d.id,
                "name": d.name,
                "code": d.code or "",
                "description": d.description or "",
                "is_active": d.is_active,
                "hod_id": d.hod_id,
                "hod_name": hod_name,
                "hod_email": hod_email,
                "faculty_count": fac_count,
                "course_count": course_count,
                "subject_count": subject_count,
                "created_at": d.created_at.isoformat() if d.created_at else None,
            })

        return {
            "summary": {
                "total_departments": total_departments,
                "active_departments": active_departments,
                "total_hods": total_hods,
                "total_faculty_assigned": total_faculty_assigned,
            },
            "items": results,
        }

    @app.post("/admin/academic/departments", status_code=status.HTTP_201_CREATED)
    def create_academic_department(
        payload: DepartmentCreate,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        code = payload.code.strip().upper() if payload.code else None
        if code:
            existing = db.query(models.Department).filter(
                models.Department.college_id == admin.college_id,
                models.Department.code == code,
            ).first()
            if existing:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Department code '{code}' is already in use.")

        dept = models.Department(
            college_id=admin.college_id,
            name=payload.name.strip(),
            code=code,
            description=payload.description.strip() if payload.description else None,
            hod_id=payload.hod_id,
            is_active=payload.is_active,
        )
        db.add(dept)
        db.commit()
        db.refresh(dept)
        return {"id": dept.id, "name": dept.name, "code": dept.code}

    @app.put("/admin/academic/departments/{dept_id}")
    def update_academic_department(
        dept_id: int,
        payload: DepartmentUpdate,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        dept = db.query(models.Department).filter(
            models.Department.id == dept_id,
            models.Department.college_id == admin.college_id,
        ).first()
        if not dept:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found.")

        if payload.name is not None:
            dept.name = payload.name.strip()
        if payload.code is not None:
            new_code = payload.code.strip().upper() if payload.code else None
            if new_code and new_code != dept.code:
                dup = db.query(models.Department).filter(
                    models.Department.college_id == admin.college_id,
                    models.Department.code == new_code,
                    models.Department.id != dept_id,
                ).first()
                if dup:
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Department code '{new_code}' already exists.")
            dept.code = new_code
        if payload.description is not None:
            dept.description = payload.description.strip() if payload.description else None
        if payload.hod_id is not None:
            if payload.hod_id == 0 or payload.hod_id == -1:
                dept.hod_id = None
            else:
                user = db.query(models.User).filter(models.User.id == payload.hod_id, models.User.college_id == admin.college_id).first()
                if not user:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected HOD user does not exist.")
                dept.hod_id = user.id
        if payload.is_active is not None:
            dept.is_active = payload.is_active

        dept.updated_at = _utcnow()
        db.commit()
        return {"id": dept.id, "name": dept.name, "code": dept.code, "is_active": dept.is_active}

    @app.patch("/admin/academic/departments/{dept_id}/status")
    def toggle_department_status(
        dept_id: int,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        dept = db.query(models.Department).filter(
            models.Department.id == dept_id,
            models.Department.college_id == admin.college_id,
        ).first()
        if not dept:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found.")
        dept.is_active = not dept.is_active
        dept.updated_at = _utcnow()
        db.commit()
        return {"id": dept.id, "is_active": dept.is_active}

    @app.get("/admin/academic/departments/{dept_id}/faculty")
    def get_department_faculty(
        dept_id: int,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN, models.UserRole.HOD)),
        db: Session = Depends(get_db),
    ):
        dept = db.query(models.Department).filter(
            models.Department.id == dept_id,
            models.Department.college_id == admin.college_id,
        ).first()
        if not dept:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found.")

        faculty_list = db.query(models.User).filter(
            models.User.college_id == admin.college_id,
            models.User.department_id == dept_id,
        ).order_by(models.User.full_name).all()

        return [
            {
                "id": f.id,
                "employee_id": f.employee_id,
                "full_name": f.full_name,
                "email": f.email,
                "phone": f.phone,
                "designation": f.designation,
                "role": f.role.value if hasattr(f.role, "value") else str(f.role),
                "is_hod": (f.id == dept.hod_id),
                "account_status": getattr(f, "account_status", "active"),
                "face_enrollment_status": f.face_enrollment_status.value if hasattr(f.face_enrollment_status, "value") else str(f.face_enrollment_status),
            }
            for f in faculty_list
        ]

    @app.post("/admin/academic/departments/{dept_id}/assign-faculty")
    def assign_faculty_to_department(
        dept_id: int,
        payload: DepartmentAssignFaculty,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        dept = db.query(models.Department).filter(
            models.Department.id == dept_id,
            models.Department.college_id == admin.college_id,
        ).first()
        if not dept:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found.")

        count = 0
        for fid in payload.faculty_ids:
            user = db.query(models.User).filter(models.User.id == fid, models.User.college_id == admin.college_id).first()
            if user:
                user.department_id = dept_id
                count += 1
        db.commit()
        return {"assigned_count": count, "department_id": dept_id}

    @app.delete("/admin/academic/departments/{dept_id}/faculty/{faculty_id}")
    def unassign_faculty_from_department(
        dept_id: int,
        faculty_id: int,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        user = db.query(models.User).filter(
            models.User.id == faculty_id,
            models.User.department_id == dept_id,
            models.User.college_id == admin.college_id,
        ).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Faculty member not found in this department.")
        user.department_id = None
        db.commit()
        return {"message": "Faculty unassigned from department successfully."}


    # --- 2. COURSE MANAGEMENT ---
    @app.get("/admin/academic/courses")
    def get_academic_courses(
        department_id: int | None = None,
        search: str | None = None,
        status_filter: str = "all",
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN, models.UserRole.HOD)),
        db: Session = Depends(get_db),
    ):
        query = db.query(models.Course).filter(models.Course.college_id == admin.college_id)
        if department_id:
            query = query.filter(models.Course.department_id == department_id)
        if status_filter == "active":
            query = query.filter(models.Course.is_active.is_(True))
        elif status_filter == "inactive":
            query = query.filter(models.Course.is_active.is_(False))

        if search and search.strip():
            s = f"%{search.strip()}%"
            query = query.filter(or_(models.Course.name.ilike(s), models.Course.code.ilike(s)))

        courses = query.order_by(models.Course.name).all()

        total_courses = db.query(models.Course).filter(models.Course.college_id == admin.college_id).count()
        active_courses = db.query(models.Course).filter(models.Course.college_id == admin.college_id, models.Course.is_active.is_(True)).count()
        depts_covered = db.query(models.Course.department_id).filter(models.Course.college_id == admin.college_id, models.Course.department_id.isnot(None)).distinct().count()

        results = []
        for c in courses:
            sub_count = db.query(models.Subject).filter(models.Subject.college_id == admin.college_id, models.Subject.course_id == c.id).count()
            dept_name = c.department.name if c.department else "Unassigned"
            results.append({
                "id": c.id,
                "name": c.name,
                "code": c.code,
                "department_id": c.department_id,
                "department_name": dept_name,
                "duration_years": c.duration_years or 3,
                "total_semesters": c.total_semesters or 6,
                "description": c.description or "",
                "is_active": c.is_active,
                "subject_count": sub_count,
            })

        return {
            "summary": {
                "total_courses": total_courses,
                "active_courses": active_courses,
                "total_departments_covered": depts_covered,
            },
            "items": results,
        }

    @app.post("/admin/academic/courses", status_code=status.HTTP_201_CREATED)
    def create_academic_course(
        payload: CourseCreate,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        code = payload.code.strip().upper()
        existing = db.query(models.Course).filter(
            models.Course.college_id == admin.college_id,
            models.Course.code == code,
        ).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Course with code '{code}' already exists.")

        course = models.Course(
            college_id=admin.college_id,
            name=payload.name.strip(),
            code=code,
            department_id=payload.department_id,
            duration_years=payload.duration_years,
            total_semesters=payload.total_semesters,
            description=payload.description.strip() if payload.description else None,
            is_active=payload.is_active,
        )
        db.add(course)
        db.commit()
        db.refresh(course)
        return {"id": course.id, "name": course.name, "code": course.code}

    @app.put("/admin/academic/courses/{course_id}")
    def update_academic_course(
        course_id: int,
        payload: CourseUpdate,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        course = db.query(models.Course).filter(
            models.Course.id == course_id,
            models.Course.college_id == admin.college_id,
        ).first()
        if not course:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found.")

        if payload.name is not None:
            course.name = payload.name.strip()
        if payload.code is not None:
            new_code = payload.code.strip().upper()
            if new_code != course.code:
                dup = db.query(models.Course).filter(
                    models.Course.college_id == admin.college_id,
                    models.Course.code == new_code,
                    models.Course.id != course_id,
                ).first()
                if dup:
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Course code '{new_code}' already exists.")
            course.code = new_code
        if payload.department_id is not None:
            course.department_id = payload.department_id if payload.department_id > 0 else None
        if payload.duration_years is not None:
            course.duration_years = payload.duration_years
        if payload.total_semesters is not None:
            course.total_semesters = payload.total_semesters
        if payload.description is not None:
            course.description = payload.description.strip() if payload.description else None
        if payload.is_active is not None:
            course.is_active = payload.is_active

        course.updated_at = _utcnow()
        db.commit()
        return {"id": course.id, "name": course.name, "code": course.code, "is_active": course.is_active}

    @app.patch("/admin/academic/courses/{course_id}/status")
    def toggle_course_status(
        course_id: int,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        course = db.query(models.Course).filter(
            models.Course.id == course_id,
            models.Course.college_id == admin.college_id,
        ).first()
        if not course:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found.")
        course.is_active = not course.is_active
        course.updated_at = _utcnow()
        db.commit()
        return {"id": course.id, "is_active": course.is_active}

    @app.delete("/admin/academic/courses/{course_id}")
    def delete_academic_course(
        course_id: int,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        course = db.query(models.Course).filter(
            models.Course.id == course_id,
            models.Course.college_id == admin.college_id,
        ).first()
        if not course:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found.")
        sub_count = db.query(models.Subject).filter(models.Subject.course_id == course_id).count()
        if sub_count > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot delete course '{course.name}' because {sub_count} subject(s) are linked to it. Please reassign or remove them first, or deactivate the course."
            )
        db.delete(course)
        db.commit()
        return {"message": "Course deleted successfully."}


    # --- 3. SUBJECT MANAGEMENT ---
    @app.get("/admin/academic/subjects")
    def get_academic_subjects(
        department_id: int | None = None,
        course_id: int | None = None,
        semester: int | None = None,
        subject_type: str | None = None,
        status_filter: str = "all",
        search: str | None = None,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN, models.UserRole.HOD)),
        db: Session = Depends(get_db),
    ):
        query = db.query(models.Subject).filter(models.Subject.college_id == admin.college_id)
        if department_id:
            query = query.filter(models.Subject.department_id == department_id)
        if course_id:
            query = query.filter(models.Subject.course_id == course_id)
        if semester:
            query = query.filter(models.Subject.semester == semester)
        if subject_type and subject_type != "all":
            query = query.filter(models.Subject.subject_type == subject_type)
        if status_filter == "active":
            query = query.filter(models.Subject.is_active.is_(True))
        elif status_filter == "inactive":
            query = query.filter(models.Subject.is_active.is_(False))

        if search and search.strip():
            s = f"%{search.strip()}%"
            query = query.filter(or_(models.Subject.name.ilike(s), models.Subject.code.ilike(s)))

        subjects = query.order_by(models.Subject.name).all()

        total_subjects = db.query(models.Subject).filter(models.Subject.college_id == admin.college_id).count()
        theory_count = db.query(models.Subject).filter(models.Subject.college_id == admin.college_id, models.Subject.subject_type == "Theory").count()
        lab_count = db.query(models.Subject).filter(models.Subject.college_id == admin.college_id, models.Subject.subject_type.ilike("%Lab%")).count()

        results = []
        unassigned_count = 0
        for sub in subjects:
            assignments = (
                db.query(models.FacultySubjectAssignment)
                .filter(models.FacultySubjectAssignment.subject_id == sub.id)
                .all()
            )
            assigned_faculty = []
            for a in assignments:
                f_user = db.query(models.User).filter(models.User.id == a.faculty_id).first()
                if f_user:
                    assigned_faculty.append({
                        "id": f_user.id,
                        "full_name": f_user.full_name,
                        "employee_id": f_user.employee_id,
                    })

            if len(assigned_faculty) == 0:
                unassigned_count += 1

            results.append({
                "id": sub.id,
                "name": sub.name,
                "code": sub.code,
                "department_id": sub.department_id,
                "department_name": sub.department.name if sub.department else "Unassigned",
                "course_id": sub.course_id,
                "course_name": sub.course.name if sub.course else "Unassigned",
                "semester": sub.semester or 1,
                "credits": sub.credits or 4,
                "subject_type": sub.subject_type or "Theory",
                "is_active": sub.is_active,
                "assigned_faculty": assigned_faculty,
            })

        return {
            "summary": {
                "total_subjects": total_subjects,
                "theory_count": theory_count,
                "lab_count": lab_count,
                "unassigned_count": unassigned_count,
            },
            "items": results,
        }

    @app.post("/admin/academic/subjects", status_code=status.HTTP_201_CREATED)
    def create_academic_subject(
        payload: SubjectCreate,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        code = payload.code.strip().upper()
        dup = db.query(models.Subject).filter(
            models.Subject.college_id == admin.college_id,
            models.Subject.code == code,
        ).first()
        if dup:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Subject with code '{code}' already exists.")

        sub = models.Subject(
            college_id=admin.college_id,
            name=payload.name.strip(),
            code=code,
            department_id=payload.department_id if payload.department_id and payload.department_id > 0 else None,
            course_id=payload.course_id if payload.course_id and payload.course_id > 0 else None,
            semester=payload.semester,
            credits=payload.credits,
            subject_type=payload.subject_type,
            is_active=payload.is_active,
        )
        db.add(sub)
        db.commit()
        db.refresh(sub)
        return {"id": sub.id, "name": sub.name, "code": sub.code}

    @app.put("/admin/academic/subjects/{subject_id}")
    def update_academic_subject(
        subject_id: int,
        payload: SubjectUpdate,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        sub = db.query(models.Subject).filter(
            models.Subject.id == subject_id,
            models.Subject.college_id == admin.college_id,
        ).first()
        if not sub:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found.")

        if payload.name is not None:
            sub.name = payload.name.strip()
        if payload.code is not None:
            new_code = payload.code.strip().upper()
            if new_code != sub.code:
                dup = db.query(models.Subject).filter(
                    models.Subject.college_id == admin.college_id,
                    models.Subject.code == new_code,
                    models.Subject.id != subject_id,
                ).first()
                if dup:
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Subject code '{new_code}' already exists.")
            sub.code = new_code
        if payload.department_id is not None:
            sub.department_id = payload.department_id if payload.department_id > 0 else None
        if payload.course_id is not None:
            sub.course_id = payload.course_id if payload.course_id > 0 else None
        if payload.semester is not None:
            sub.semester = payload.semester
        if payload.credits is not None:
            sub.credits = payload.credits
        if payload.subject_type is not None:
            sub.subject_type = payload.subject_type
        if payload.is_active is not None:
            sub.is_active = payload.is_active

        sub.updated_at = _utcnow()
        db.commit()
        return {"id": sub.id, "name": sub.name, "code": sub.code, "is_active": sub.is_active}

    @app.patch("/admin/academic/subjects/{subject_id}/status")
    def toggle_subject_status(
        subject_id: int,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        sub = db.query(models.Subject).filter(
            models.Subject.id == subject_id,
            models.Subject.college_id == admin.college_id,
        ).first()
        if not sub:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found.")
        sub.is_active = not sub.is_active
        sub.updated_at = _utcnow()
        db.commit()
        return {"id": sub.id, "is_active": sub.is_active}

    @app.delete("/admin/academic/subjects/{subject_id}")
    def delete_academic_subject(
        subject_id: int,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        sub = db.query(models.Subject).filter(
            models.Subject.id == subject_id,
            models.Subject.college_id == admin.college_id,
        ).first()
        if not sub:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found.")
        # Remove assignments
        db.query(models.FacultySubjectAssignment).filter(models.FacultySubjectAssignment.subject_id == subject_id).delete()
        db.delete(sub)
        db.commit()
        return {"message": "Subject deleted successfully."}

    @app.post("/admin/academic/subjects/{subject_id}/assign-faculty")
    def assign_faculty_to_subject(
        subject_id: int,
        payload: SubjectAssignFaculty,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        sub = db.query(models.Subject).filter(
            models.Subject.id == subject_id,
            models.Subject.college_id == admin.college_id,
        ).first()
        if not sub:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found.")

        # Sync assignments
        existing_assignments = db.query(models.FacultySubjectAssignment).filter(
            models.FacultySubjectAssignment.subject_id == subject_id
        ).all()
        existing_fids = {a.faculty_id for a in existing_assignments}

        for fid in payload.faculty_ids:
            if fid not in existing_fids:
                db.add(models.FacultySubjectAssignment(
                    college_id=admin.college_id,
                    faculty_id=fid,
                    subject_id=subject_id,
                ))

        db.commit()
        return {"message": f"Assigned {len(payload.faculty_ids)} faculty member(s) to subject."}

    @app.delete("/admin/academic/subjects/{subject_id}/faculty/{faculty_id}")
    def unassign_faculty_from_subject(
        subject_id: int,
        faculty_id: int,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        assignment = db.query(models.FacultySubjectAssignment).filter(
            models.FacultySubjectAssignment.subject_id == subject_id,
            models.FacultySubjectAssignment.faculty_id == faculty_id,
            models.FacultySubjectAssignment.college_id == admin.college_id,
        ).first()
        if not assignment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Faculty is not assigned to this subject.")
        db.delete(assignment)
        db.commit()
        return {"message": "Faculty unassigned from subject successfully."}


    # --- 4. ACADEMIC YEAR MANAGEMENT ---
    @app.get("/admin/academic/academic-years")
    def get_academic_years(
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN, models.UserRole.HOD)),
        db: Session = Depends(get_db),
    ):
        years = (
            db.query(models.AcademicYear)
            .filter(models.AcademicYear.college_id == admin.college_id)
            .order_by(models.AcademicYear.start_date.desc())
            .all()
        )
        return [
            {
                "id": y.id,
                "name": y.name,
                "start_date": y.start_date.isoformat() if y.start_date else None,
                "end_date": y.end_date.isoformat() if y.end_date else None,
                "is_current": y.is_current,
                "is_archived": y.is_archived,
                "created_at": y.created_at.isoformat() if y.created_at else None,
            }
            for y in years
        ]

    @app.post("/admin/academic/academic-years", status_code=status.HTTP_201_CREATED)
    def create_academic_year(
        payload: AcademicYearCreate,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        name = payload.name.strip()
        dup = db.query(models.AcademicYear).filter(
            models.AcademicYear.college_id == admin.college_id,
            models.AcademicYear.name == name,
        ).first()
        if dup:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Academic year '{name}' already exists.")

        try:
            s_date = datetime.strptime(payload.start_date, "%Y-%m-%d").date()
            e_date = datetime.strptime(payload.end_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid date format. Use YYYY-MM-DD.")

        if e_date <= s_date:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="End date must be after start date.")

        if payload.is_current:
            # Unset all other academic years in college
            db.query(models.AcademicYear).filter(
                models.AcademicYear.college_id == admin.college_id
            ).update({"is_current": False})

        ay = models.AcademicYear(
            college_id=admin.college_id,
            name=name,
            start_date=s_date,
            end_date=e_date,
            is_current=payload.is_current,
            is_archived=False,
        )
        db.add(ay)
        db.commit()
        db.refresh(ay)
        return {"id": ay.id, "name": ay.name, "is_current": ay.is_current}

    @app.put("/admin/academic/academic-years/{ay_id}")
    def update_academic_year(
        ay_id: int,
        payload: AcademicYearUpdate,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        ay = db.query(models.AcademicYear).filter(
            models.AcademicYear.id == ay_id,
            models.AcademicYear.college_id == admin.college_id,
        ).first()
        if not ay:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Academic year not found.")

        if payload.name is not None:
            new_name = payload.name.strip()
            if new_name != ay.name:
                dup = db.query(models.AcademicYear).filter(
                    models.AcademicYear.college_id == admin.college_id,
                    models.AcademicYear.name == new_name,
                    models.AcademicYear.id != ay_id,
                ).first()
                if dup:
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Academic year '{new_name}' already exists.")
            ay.name = new_name
        if payload.start_date is not None:
            ay.start_date = datetime.strptime(payload.start_date, "%Y-%m-%d").date()
        if payload.end_date is not None:
            ay.end_date = datetime.strptime(payload.end_date, "%Y-%m-%d").date()
        if payload.is_current is True:
            db.query(models.AcademicYear).filter(
                models.AcademicYear.college_id == admin.college_id
            ).update({"is_current": False})
            ay.is_current = True
        elif payload.is_current is False:
            ay.is_current = False
        if payload.is_archived is not None:
            ay.is_archived = payload.is_archived
            if ay.is_archived:
                ay.is_current = False

        db.commit()
        return {"id": ay.id, "name": ay.name, "is_current": ay.is_current, "is_archived": ay.is_archived}

    @app.post("/admin/academic/academic-years/{ay_id}/activate")
    def set_active_academic_year(
        ay_id: int,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        ay = db.query(models.AcademicYear).filter(
            models.AcademicYear.id == ay_id,
            models.AcademicYear.college_id == admin.college_id,
        ).first()
        if not ay:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Academic year not found.")

        db.query(models.AcademicYear).filter(
            models.AcademicYear.college_id == admin.college_id
        ).update({"is_current": False})

        ay.is_current = True
        ay.is_archived = False
        db.commit()
        return {"id": ay.id, "name": ay.name, "is_current": True}

    @app.post("/admin/academic/academic-years/{ay_id}/archive")
    def archive_academic_year(
        ay_id: int,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        ay = db.query(models.AcademicYear).filter(
            models.AcademicYear.id == ay_id,
            models.AcademicYear.college_id == admin.college_id,
        ).first()
        if not ay:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Academic year not found.")
        ay.is_archived = True
        ay.is_current = False
        db.commit()
        return {"id": ay.id, "name": ay.name, "is_archived": True}


    # --- 5. CLASSROOM MANAGEMENT ---
    @app.get("/admin/academic/classrooms")
    def get_academic_classrooms(
        search: str | None = None,
        room_type: str | None = None,
        status_filter: str = "all",
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN, models.UserRole.HOD)),
        db: Session = Depends(get_db),
    ):
        query = db.query(models.Classroom).filter(models.Classroom.college_id == admin.college_id)
        if room_type and room_type != "all":
            query = query.filter(models.Classroom.room_type == room_type)
        if status_filter == "active":
            query = query.filter(models.Classroom.is_active.is_(True))
        elif status_filter == "inactive":
            query = query.filter(models.Classroom.is_active.is_(False))

        if search and search.strip():
            s = f"%{search.strip()}%"
            query = query.filter(
                or_(
                    models.Classroom.room_number.ilike(s),
                    models.Classroom.building.ilike(s),
                    models.Classroom.floor.ilike(s),
                )
            )

        rooms = query.order_by(models.Classroom.room_number).all()

        total_rooms = db.query(models.Classroom).filter(models.Classroom.college_id == admin.college_id).count()
        total_capacity = sum((r.capacity or 0) for r in rooms)
        lecture_halls = db.query(models.Classroom).filter(models.Classroom.college_id == admin.college_id, models.Classroom.room_type == "Lecture Hall").count()
        labs = db.query(models.Classroom).filter(models.Classroom.college_id == admin.college_id, models.Classroom.room_type.ilike("%Lab%")).count()

        return {
            "summary": {
                "total_classrooms": total_rooms,
                "total_capacity": total_capacity,
                "lecture_halls": lecture_halls,
                "laboratories": labs,
            },
            "items": [
                {
                    "id": r.id,
                    "room_number": r.room_number,
                    "building": r.building or "Main Campus",
                    "floor": r.floor or "Ground Floor",
                    "capacity": r.capacity or 60,
                    "room_type": r.room_type or "Lecture Hall",
                    "is_active": r.is_active,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                for r in rooms
            ],
        }

    @app.post("/admin/academic/classrooms", status_code=status.HTTP_201_CREATED)
    def create_academic_classroom(
        payload: ClassroomCreate,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        room_num = payload.room_number.strip()
        dup = db.query(models.Classroom).filter(
            models.Classroom.college_id == admin.college_id,
            models.Classroom.room_number == room_num,
        ).first()
        if dup:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Classroom '{room_num}' already exists.")

        room = models.Classroom(
            college_id=admin.college_id,
            room_number=room_num,
            building=payload.building.strip() if payload.building else None,
            floor=payload.floor.strip() if payload.floor else None,
            capacity=payload.capacity,
            room_type=payload.room_type,
            is_active=payload.is_active,
        )
        db.add(room)
        db.commit()
        db.refresh(room)
        return {"id": room.id, "room_number": room.room_number}

    @app.put("/admin/academic/classrooms/{room_id}")
    def update_academic_classroom(
        room_id: int,
        payload: ClassroomUpdate,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        room = db.query(models.Classroom).filter(
            models.Classroom.id == room_id,
            models.Classroom.college_id == admin.college_id,
        ).first()
        if not room:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classroom not found.")

        if payload.room_number is not None:
            new_num = payload.room_number.strip()
            if new_num != room.room_number:
                dup = db.query(models.Classroom).filter(
                    models.Classroom.college_id == admin.college_id,
                    models.Classroom.room_number == new_num,
                    models.Classroom.id != room_id,
                ).first()
                if dup:
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Classroom '{new_num}' already exists.")
            room.room_number = new_num
        if payload.building is not None:
            room.building = payload.building.strip() if payload.building else None
        if payload.floor is not None:
            room.floor = payload.floor.strip() if payload.floor else None
        if payload.capacity is not None:
            room.capacity = payload.capacity
        if payload.room_type is not None:
            room.room_type = payload.room_type
        if payload.is_active is not None:
            room.is_active = payload.is_active

        db.commit()
        return {"id": room.id, "room_number": room.room_number, "is_active": room.is_active}

    @app.patch("/admin/academic/classrooms/{room_id}/status")
    def toggle_classroom_status(
        room_id: int,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        room = db.query(models.Classroom).filter(
            models.Classroom.id == room_id,
            models.Classroom.college_id == admin.college_id,
        ).first()
        if not room:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classroom not found.")
        room.is_active = not room.is_active
        db.commit()
        return {"id": room.id, "is_active": room.is_active}

    @app.delete("/admin/academic/classrooms/{room_id}")
    def delete_academic_classroom(
        room_id: int,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        room = db.query(models.Classroom).filter(
            models.Classroom.id == room_id,
            models.Classroom.college_id == admin.college_id,
        ).first()
        if not room:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classroom not found.")
        db.delete(room)
        db.commit()
        return {"message": "Classroom deleted successfully."}


    # --- 6. HOLIDAY MANAGEMENT ---
    @app.get("/admin/academic/holidays")
    def get_academic_holidays(
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN, models.UserRole.HOD)),
        db: Session = Depends(get_db),
    ):
        holidays = (
            db.query(models.Holiday)
            .filter(models.Holiday.college_id == admin.college_id)
            .order_by(models.Holiday.date.asc())
            .all()
        )
        return [
            {
                "id": h.id,
                "name": h.name,
                "date": h.date.isoformat() if h.date else None,
                "description": h.description or "",
                "created_at": h.created_at.isoformat() if h.created_at else None,
            }
            for h in holidays
        ]

    @app.post("/admin/academic/holidays", status_code=status.HTTP_201_CREATED)
    def create_academic_holiday(
        payload: HolidayCreate,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        try:
            h_date = datetime.strptime(payload.date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid date format. Use YYYY-MM-DD.")

        dup = db.query(models.Holiday).filter(
            models.Holiday.college_id == admin.college_id,
            models.Holiday.date == h_date,
            models.Holiday.name == payload.name.strip(),
        ).first()
        if dup:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A holiday with this name on this date already exists.")

        h = models.Holiday(
            college_id=admin.college_id,
            name=payload.name.strip(),
            date=h_date,
            description=payload.description.strip() if payload.description else None,
        )
        db.add(h)
        db.commit()
        db.refresh(h)
        return {"id": h.id, "name": h.name, "date": h.date.isoformat()}

    @app.put("/admin/academic/holidays/{holiday_id}")
    def update_academic_holiday(
        holiday_id: int,
        payload: HolidayUpdate,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        h = db.query(models.Holiday).filter(
            models.Holiday.id == holiday_id,
            models.Holiday.college_id == admin.college_id,
        ).first()
        if not h:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Holiday not found.")

        if payload.name is not None:
            h.name = payload.name.strip()
        if payload.date is not None:
            h.date = datetime.strptime(payload.date, "%Y-%m-%d").date()
        if payload.description is not None:
            h.description = payload.description.strip() if payload.description else None

        db.commit()
        return {"id": h.id, "name": h.name, "date": h.date.isoformat()}

    @app.delete("/admin/academic/holidays/{holiday_id}")
    def delete_academic_holiday(
        holiday_id: int,
        admin: models.User = Depends(require_roles(models.UserRole.SUPER_ADMIN)),
        db: Session = Depends(get_db),
    ):
        h = db.query(models.Holiday).filter(
            models.Holiday.id == holiday_id,
            models.Holiday.college_id == admin.college_id,
        ).first()
        if not h:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Holiday not found.")
        db.delete(h)
        db.commit()
        return {"message": "Holiday deleted successfully."}

    return app


app = create_app()
