from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class UserCreate(BaseModel):
    faculty_id: str
    name: str
    email: str
    phone: str
    role: str
    department_id: int
    face_image: Optional[str] = None

class UserResponse(UserCreate):
    id: int
    class Config:
        from_attributes = True

class OTPVerifyRequest(BaseModel):
    phone: str
    otp: str

class PunchInRequest(BaseModel):
    user_id: int
    lat: float
    lng: float
    face_image_base64: str # Sent from Flutter for verification

class LeaveRequestCreate(BaseModel):
    user_id: int
    start_date: datetime
    end_date: datetime
    reason: str
    leave_type: str # Sick, Casual, etc.

class LeaveResponse(LeaveRequestCreate):
    id: int
    status: str # Pending, Approved, Rejected
    class Config:
        from_attributes = True
