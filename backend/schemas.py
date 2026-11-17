from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class LoginRequest(BaseModel):
    email: str
    password: str

class UserCreate(BaseModel):
    faculty_id: str
    name: str
    email: str
    phone: str
    role: str = "visiting_faculty"
    department_id: int = 1
    specialization: Optional[str] = None
    password: Optional[str] = None
    face_image: Optional[str] = None

class UserResponse(BaseModel):
    id: int
    faculty_id: str
    name: str
    email: str
    phone: str
    role: str
    department_id: int
    specialization: Optional[str] = None
    is_active: Optional[int] = 1
    is_face_enrolled: Optional[int] = 0

    class Config:
        from_attributes = True

class GeofenceUpdateRequest(BaseModel):
    department_id: int = 1
    lat: float
    lng: float
    radius: float

class OTPVerifyRequest(BaseModel):
    phone: Optional[str] = None
    email: Optional[str] = None
    otp: str

class PunchInRequest(BaseModel):
    user_id: int
    lat: float
    lng: float
    face_image_base64: str # Sent from Flutter for verification
    out_of_range_reason: Optional[str] = None
    out_of_range_remarks: Optional[str] = None

class PunchOutRequest(BaseModel):
    user_id: int
    lat: float
    lng: float
    face_image_base64: str
    out_of_range_reason: Optional[str] = None
    out_of_range_remarks: Optional[str] = None

class AdminOTPSendRequest(BaseModel):
    user_id: int
    admin_phone: str
    method: Optional[str] = "email"

class AdminOTPVerifyRequest(BaseModel):
    user_id: int
    otp: str

# Legacy aliases for compatibility
HROTPSendRequest = AdminOTPSendRequest
HROTPVerifyRequest = AdminOTPVerifyRequest

class EventResponse(BaseModel):
    id: int
    title: str
    description: str
    date: str
    class Config:
        from_attributes = True

class LeaveRequestCreate(BaseModel):
    user_id: int
    start_date: datetime
    end_date: datetime
    reason: str
    leave_type: str # Sick, Casual, etc.

class LeaveStatusUpdate(BaseModel):
    status: str

class LeaveResponse(LeaveRequestCreate):
    id: int
    status: str # Pending, Approved, Rejected
    class Config:
        from_attributes = True
