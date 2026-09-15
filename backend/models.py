from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum, Float
from sqlalchemy.orm import relationship
from database import Base
import datetime
import enum

class UserRole(str, enum.Enum):
    TEACHER = "teacher"
    STAFF = "staff"
    HOD = "hod"
    ADMIN = "admin"

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    faculty_id = Column(String(50), unique=True, index=True)
    name = Column(String(100))
    email = Column(String(100), unique=True)
    phone = Column(String(20), unique=True, index=True)
    role = Column(String(20)) # teacher, staff, hod, admin
    department_id = Column(Integer, ForeignKey("departments.id"))
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

class Break(Base):
    __tablename__ = "breaks"
    id = Column(Integer, primary_key=True, index=True)
    attendance_id = Column(Integer, ForeignKey("attendance.id"))
    break_in = Column(DateTime)
    break_out = Column(DateTime)

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
