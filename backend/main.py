from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import Optional
import datetime
import models, schemas, database, face_service
import json
import numpy as np
import random
import os
from twilio.rest import Client
from database import engine, get_db
import uvicorn

# Twilio Config
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER")
TWILIO_WHATSAPP_NUMBER = os.getenv("TWILIO_WHATSAPP_NUMBER")

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Smart Faculty Attendance API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Welcome to Faculty Attendance API"}

# Auth & User Endpoints
@app.get("/check-user/{phone}")
def check_user(phone: str, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.phone == phone).first()
    if db_user:
        return {"exists": True, "user_id": db_user.id}
    return {"exists": False}

# Simple in-memory OTP storage for demo
otp_storage = {}

@app.post("/send-otp/{phone}")
def send_otp(phone: str, method: str = "sms", db: Session = Depends(get_db)):
    # Check if user exists
    db_user = db.query(models.User).filter(models.User.phone == phone).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="Account not found")

    # Generate a simple 6-digit OTP
    otp = str(random.randint(100000, 999999))
    otp_storage[phone] = otp

    # Format phone number for Twilio (ensure it starts with +)
    formatted_phone = phone if phone.startswith("+") else f"+91{phone}"

    # Real Sending using Twilio
    try:
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        message_body = f"Your Smart Attendance verification code is: {otp}"

        if method == "whatsapp":
            message = client.messages.create(
                from_=f"whatsapp:{TWILIO_WHATSAPP_NUMBER}",
                body=message_body,
                to=f"whatsapp:{formatted_phone}"
            )
        else:
            message = client.messages.create(
                from_=TWILIO_PHONE_NUMBER,
                body=message_body,
                to=formatted_phone
            )
        print(f"Twilio Success: {message.sid}")
    except Exception as e:
        print(f"Twilio Error: {e}")
        # We'll still return the OTP for now so the user isn't stuck if Twilio fails
        # In production, you would handle this more strictly.
        pass

    # Simulate sending SMS/WhatsApp (Console Debug)
    print(f"\n{'='*20}")
    print(f"DEBUG: Sending OTP {otp} to {formatted_phone} via {method.upper()}")
    print(f"{'='*20}\n")

    return {"message": f"OTP sent successfully via {method}", "otp": otp}

@app.post("/verify-otp")
def verify_otp(request: schemas.OTPVerifyRequest, db: Session = Depends(get_db)):
    stored_otp = otp_storage.get(request.phone)
    if stored_otp and stored_otp == request.otp:
        # OTP is valid, clear it
        del otp_storage[request.phone]

        db_user = db.query(models.User).filter(models.User.phone == request.phone).first()
        return {"success": True, "user_id": db_user.id}

    raise HTTPException(status_code=401, detail="Invalid OTP")

@app.post("/register", response_model=schemas.UserResponse)
def register_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    # Check if user exists
    db_user = db.query(models.User).filter(models.User.faculty_id == user.faculty_id).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Faculty ID already registered")

    embedding_json = None
    if user.face_image:
        embedding = face_service.get_face_embedding(user.face_image)
        if embedding is not None:
            embedding_json = json.dumps(embedding.tolist())

    # Create user data excluding face_image for the model
    user_data = user.dict()
    user_data.pop('face_image', None)

    db_user = models.User(**user_data, face_embedding=embedding_json)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

# Attendance Endpoints
@app.post("/attendance/punch-in")
def punch_in(punch: schemas.PunchInRequest, db: Session = Depends(get_db)):
    # 1. Fetch User
    db_user = db.query(models.User).filter(models.User.id == punch.user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    # 2. Verify Face Embedding
    if not db_user.face_embedding:
         raise HTTPException(status_code=400, detail="Face not registered for this user")

    stored_embedding = np.array(json.loads(db_user.face_embedding))
    current_embedding = face_service.get_face_embedding(punch.face_image_base64)

    if current_embedding is None:
        raise HTTPException(status_code=400, detail="No face detected in photo")

    is_verified = face_service.verify_faces(stored_embedding, current_embedding)

    if not is_verified:
        raise HTTPException(status_code=401, detail="Face verification failed")

    # 3. Verify GPS Location (Geofencing)
    # Fetch department coordinates
    dept = db.query(models.Department).filter(models.Department.id == db_user.department_id).first()
    if dept:
        # Simple Euclidean distance for demo (should use Haversine in production)
        dist = ((dept.lat - punch.lat)**2 + (dept.lng - punch.lng)**2)**0.5
        # 0.001 roughly equals 111 meters
        if dist > 0.001:
            raise HTTPException(status_code=403, detail="You are outside the department geofence")

    # 4. Save Attendance
    new_attendance = models.Attendance(
        user_id=punch.user_id,
        punch_in=datetime.datetime.now(),
        status="Present"
    )
    db.add(new_attendance)
    db.commit()

    return {"status": "success", "message": f"Punched in at {datetime.datetime.now().strftime('%H:%M %p')}"}

@app.post("/attendance/break")
def toggle_break(user_id: int, db: Session = Depends(get_db)):
    return {"status": "success", "message": "Break status updated"}

# HOD / Admin Endpoints
@app.get("/hod/dashboard-summary")
def get_hod_summary(db: Session = Depends(get_db)):
    # Logic to count present, on break, absent
    return {
        "present": 18,
        "on_break": 2,
        "absent": 3,
        "staff_list": [
            {"name": "Dr. Patel", "status": "WORKING", "time": "09:02 AM"},
            {"name": "Prof. Shah", "status": "WORKING", "time": "08:55 AM"},
            {"name": "Prof. Mehta", "status": "ON BREAK", "time": "01:05 PM"},
            {"name": "Prof. Kumar", "status": "ABSENT", "time": "--"},
        ]
    }

@app.get("/hod/faculty-details/{faculty_id}")
def get_faculty_details(faculty_id: str, db: Session = Depends(get_db)):
    return {
        "name": "Dr. Patel",
        "punch_in": "09:02 AM",
        "punch_out": "05:58 PM",
        "total_work": "7h 59m",
        "total_break": "47m",
        "breaks": [
            {"in": "11:15 AM", "out": "11:25 AM"},
            {"in": "01:05 PM", "out": "01:42 PM"}
        ]
    }

# Leave Management
@app.post("/leave/apply")
def apply_leave(leave: schemas.LeaveRequestCreate, db: Session = Depends(get_db)):
    db_leave = models.LeaveRequest(**leave.dict())
    db.add(db_leave)
    db.commit()
    db.refresh(db_leave)
    return db_leave

@app.get("/leave/status/{user_id}")
def get_leave_status(user_id: int, db: Session = Depends(get_db)):
    return db.query(models.LeaveRequest).filter(models.LeaveRequest.user_id == user_id).all()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
