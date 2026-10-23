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

class AdminOTPSendRequest(BaseModel):
    user_id: int
    admin_phone: str
    method: Optional[str] = "whatsapp" # whatsapp or sms

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

class LeaveResponse(LeaveRequestCreate):
    id: int
    status: str # Pending, Approved, Rejected
    class Config:
        from_attributes = True
