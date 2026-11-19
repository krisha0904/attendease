from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum, Float
from sqlalchemy.orm import relationship
from database import Base
import datetime
import enum

class UserRole(str, enum.Enum):
    VISITING_FACULTY = "visiting_faculty"
    TEACHER = "teacher"
    STAFF = "staff"
    HOD = "hod"
    ADMIN = "admin"

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    faculty_id = Column(String(50), unique=True, index=True)
    name = Column(String(100))
    email = Column(String(100), unique=True, nullable=False)
    phone = Column(String(20), unique=True, index=True)
    role = Column(String(30), default="visiting_faculty") # visiting_faculty, teacher, staff, hod, admin
    department_id = Column(Integer, ForeignKey("departments.id"))
    specialization = Column(String(100), nullable=True)
    password_hash = Column(String(255), nullable=True)
    is_active = Column(Integer, default=1)
    is_face_enrolled = Column(Integer, default=0)
    face_embedding = Column(String(5000)) # Stored as JSON string

class Department(Base):
    __tablename__ = "departments"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100))
    lat = Column(Float)
    lng = Column(Float)
    radius = Column(Float, default=100.0)

class Attendance(Base):
    __tablename__ = "attendance"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    date = Column(DateTime, default=datetime.date.today)
    punch_in = Column(DateTime)
    punch_out = Column(DateTime)
    status = Column(String(20)) # Present, Absent, Leave
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    geofence_verified = Column(Integer, default=1)
    face_verified = Column(Integer, default=1)
    out_of_range_reason = Column(String(100), nullable=True) # LJ, MoneyPlant, Other
    out_of_range_remarks = Column(String(500), nullable=True)

class Break(Base):
    __tablename__ = "breaks"
    id = Column(Integer, primary_key=True, index=True)
    attendance_id = Column(Integer, ForeignKey("attendance.id"))
    break_in = Column(DateTime)
    break_out = Column(DateTime)
    duration_seconds = Column(Integer, default=0)

class Event(Base):
    __tablename__ = "events"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200))
    description = Column(String(1000))
    date = Column(String(50))
    created_at = Column(DateTime, default=datetime.datetime.now)

class LeaveRequest(Base):
    __tablename__ = "leave_requests"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    start_date = Column(DateTime)
    end_date = Column(DateTime)
    reason = Column(String(500))
    leave_type = Column(String(50))
    status = Column(String(20), default="Pending")
    created_at = Column(DateTime, default=datetime.datetime.now)

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True)
    faculty_id = Column(String(50), nullable=True)
    faculty_name = Column(String(100), nullable=True)
    action = Column(String(50)) # Punch In, Punch Out, Registration, Face Registration
    status = Column(String(20)) # SUCCESS, FAILED
    failure_reason = Column(String(255), nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    distance_meters = Column(Float, nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.now)
