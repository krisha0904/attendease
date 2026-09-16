from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import Optional
import datetime
import math
import models, schemas, database, face_service
import json
import numpy as np
import random
import os
from database import engine, get_db, SessionLocal
import uvicorn
from dotenv import load_dotenv
try:
    from twilio.rest import Client
except ImportError:
    Client = None

load_dotenv()

# Twilio Configuration
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER")
TWILIO_WHATSAPP_NUMBER = os.getenv("TWILIO_WHATSAPP_NUMBER")

models.Base.metadata.create_all(bind=engine)

# Seed initial data
db_session = SessionLocal()
if db_session.query(models.Department).count() == 0:
    rollwala = models.Department(
        name="Rollwala Computer Center",
        lat=23.03594131796963,
        lng=72.54588142528459,
        radius=100.0
    )
    db_session.add(rollwala)
    db_session.commit()
db_session.close()

app = FastAPI(title="Smart Faculty Attendance API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def haversine(lat1, lon1, lat2, lon2):
    # Radius of the Earth in km
    R = 6371.0

    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)

    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    distance = R * c * 1000 # Convert to meters
    return distance

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

    # Format phone number (+91 for India if not present)
    formatted_phone = phone if phone.startswith("+") else f"+91{phone}"

    # Try sending via Twilio
    success = False
    error_msg = ""

    if Client and TWILIO_ACCOUNT_SID and "ACxxx" not in TWILIO_ACCOUNT_SID:
        try:
            client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
            if method == "whatsapp":
                message = client.messages.create(
                    from_=f"whatsapp:{TWILIO_WHATSAPP_NUMBER}",
                    body=f"Your Smart Attendance verification code is: {otp}",
                    to=f"whatsapp:{formatted_phone}"
                )
            else:
                message = client.messages.create(
                    body=f"Your Smart Attendance verification code is: {otp}",
                    from_=TWILIO_PHONE_NUMBER,
                    to=formatted_phone
                )
            success = True
            print(f"Twilio Message Sent: {message.sid}")
        except Exception as e:
            error_msg = str(e)
            print(f"Twilio Error: {e}")

    # Fallback/Debug Console Log
    print(f"\n{'='*20}")
    print(f"DEBUG OTP: {otp} for {formatted_phone} via {method.upper()}")
    if error_msg:
        print(f"TWILIO FAILED: {error_msg}")
    print(f"{'='*20}\n")

    return {
        "message": f"OTP sent successfully via {method}",
        "otp": otp, # Include OTP in response for testing/demo if Twilio fails
        "twilio_success": success
    }

@app.post("/verify-otp")
def verify_otp(request: schemas.OTPVerifyRequest, db: Session = Depends(get_db)):
    stored_otp = otp_storage.get(request.phone)
    if stored_otp and stored_otp == request.otp:
        # OTP is valid, clear it
        del otp_storage[request.phone]

        db_user = db.query(models.User).filter(models.User.phone == request.phone).first()
        # If user has no face embedding stored, it's their first time face setup
        needs_face_setup = db_user.face_embedding is None or db_user.face_embedding == ""
        return {
            "success": True,
            "user_id": db_user.id,
            "needs_face_setup": needs_face_setup,
            "name": db_user.name
        }

    raise HTTPException(status_code=401, detail="Invalid OTP")

@app.post("/register-face-only")
def register_face_only(request: schemas.PunchInRequest, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.id == request.user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    embedding = face_service.get_face_embedding(request.face_image_base64)
    if embedding is not None:
        db_user.face_embedding = json.dumps(embedding.tolist())
        db.commit()
        return {"status": "success", "message": "Face profile registered successfully for existing faculty!"}

    raise HTTPException(status_code=400, detail="Could not process face image embedding")

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
        # Calculate precise distance using Haversine formula
        dist_meters = haversine(dept.lat, dept.lng, punch.lat, punch.lng)

        # Check if user is within the allowed radius
        if dist_meters > dept.radius:
            raise HTTPException(
                status_code=403,
                detail=f"You are outside the department geofence ({int(dist_meters)}m away)"
            )

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
