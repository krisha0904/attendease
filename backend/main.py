from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import or_
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
        name="Department of Computer Science - Rollwala Center",
        lat=23.03594131796963,
        lng=72.54588142528459,
        radius=100.0
    )
    cs_block = models.Department(
        name="Computer Science Academic Block & Labs",
        lat=22.998200,
        lng=72.498800,
        radius=150.0
    )
    cs_library = models.Department(
        name="CS Department Library & Seminar Hall",
        lat=23.015000,
        lng=72.532000,
        radius=120.0
    )
    db_session.add_all([rollwala, cs_block, cs_library])
    db_session.commit()

if db_session.query(models.Event).count() == 0:
    e1 = models.Event(
        title="Computer Science Academic Council Meeting",
        description="Quarterly review meeting for CS faculty members and lab heads in Seminar Hall A.\nPlease bring syllabus and lab curriculum updates.",
        date="Tomorrow at 10:30 AM"
    )
    e2 = models.Event(
        title="CS Department Biometric System Maintenance",
        description="Scheduled maintenance for attendance servers on Saturday from 2 PM to 4 PM. Punch actions during this window will sync upon server restart.",
        date="Saturday, 2:00 PM"
    )
    e3 = models.Event(
        title="Annual CS Department Tech Fest Preparation",
        description="Faculty coordinators and student volunteers needed for venue setup at the Department Complex.",
        date="Next Monday"
    )
    db_session.add_all([e1, e2, e3])
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
@app.get("/check-user/{identifier}")
def check_user(identifier: str, db: Session = Depends(get_db)):
    lookup = identifier.strip()
    db_user = db.query(models.User).filter(
        or_(models.User.phone == lookup, models.User.email == lookup.lower())
    ).first()
    if db_user:
        return {"exists": True, "user_id": db_user.id}
    return {"exists": False}

# Simple in-memory OTP storage for demo
otp_storage = {}
admin_otp_storage = {}

@app.get("/events")
def get_events(db: Session = Depends(get_db)):
    events = db.query(models.Event).all()
    return events

@app.post("/admin/send-otp")
def send_admin_otp(req: schemas.AdminOTPSendRequest, db: Session = Depends(get_db)):
    otp = str(random.randint(100000, 999999))
    admin_otp_storage[req.user_id] = otp
    print(f"\n====================\nADMIN DEBUG OTP: {otp} for User ID {req.user_id} via {req.method}\n====================\n")
    return {
        "status": "success",
        "message": f"OTP sent successfully to Department Admin via {req.method.upper()}",
        "otp": otp # Provided for demo testing
    }

@app.post("/admin/verify-otp")
def verify_admin_otp(req: schemas.AdminOTPVerifyRequest, db: Session = Depends(get_db)):
    stored_otp = admin_otp_storage.get(req.user_id)
    if stored_otp and stored_otp == req.otp:
        del admin_otp_storage[req.user_id]
        return {"success": True, "message": "Admin OTP verified successfully"}
    raise HTTPException(status_code=401, detail="Invalid or expired Admin OTP")

# Route aliases for backwards compatibility
@app.post("/hr/send-otp")
def send_hr_otp(req: schemas.AdminOTPSendRequest, db: Session = Depends(get_db)):
    return send_admin_otp(req, db)

@app.post("/hr/verify-otp")
def verify_hr_otp(req: schemas.AdminOTPVerifyRequest, db: Session = Depends(get_db)):
    return verify_admin_otp(req, db)

@app.post("/send-otp/{identifier}")
def send_otp(identifier: str, method: str = "sms", db: Session = Depends(get_db)):
    lookup = identifier.strip()
    lookup_email = lookup.lower() if "@" in lookup else None

    db_user = db.query(models.User).filter(
        or_(models.User.phone == lookup, models.User.email == lookup_email)
    ).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="Account not found")

    otp = str(random.randint(100000, 999999))
    otp_storage[lookup] = otp
    if lookup_email:
        otp_storage[lookup_email] = otp

    formatted_phone = lookup if lookup.startswith("+") else f"+91{lookup}" if lookup.isdigit() else lookup
    success = False
    error_msg = ""

    if "@" not in lookup and Client and TWILIO_ACCOUNT_SID and "ACxxx" not in TWILIO_ACCOUNT_SID:
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

    channel = "EMAIL" if "@" in lookup else method.upper()
    print(f"\n{'='*20}")
    print(f"DEBUG OTP: {otp} for {lookup} via {channel}")
    if error_msg:
        print(f"TWILIO FAILED: {error_msg}")
    print(f"{'='*20}\n")

    return {
        "message": f"OTP sent successfully via {channel.lower()}",
        "otp": otp,
        "twilio_success": success
    }

@app.post("/verify-otp")
def verify_otp(request: schemas.OTPVerifyRequest, db: Session = Depends(get_db)):
    identifier = request.phone or request.email
    if not identifier:
        raise HTTPException(status_code=400, detail="Phone or email is required")

    lookup = identifier.strip()
    stored_otp = otp_storage.get(lookup) or otp_storage.get(lookup.lower())
    if stored_otp and stored_otp == request.otp:
        otp_storage.pop(lookup, None)
        otp_storage.pop(lookup.lower(), None)

        db_user = db.query(models.User).filter(
            or_(models.User.phone == lookup, models.User.email == lookup.lower())
        ).first()
        if not db_user:
            raise HTTPException(status_code=404, detail="Account not found")

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
    dept = db.query(models.Department).filter(models.Department.id == db_user.department_id).first()
    if dept:
        dist_meters = haversine(dept.lat, dept.lng, punch.lat, punch.lng)
        if dist_meters > dept.radius and not punch.out_of_range_reason:
            raise HTTPException(
                status_code=403,
                detail=f"Out of range ({int(dist_meters)}m). Reason required (LJ, MoneyPlant, or Other)."
            )

    # 4. Save Attendance
    new_attendance = models.Attendance(
        user_id=punch.user_id,
        punch_in=datetime.datetime.now(),
        status="Present",
        out_of_range_reason=punch.out_of_range_reason,
        out_of_range_remarks=punch.out_of_range_remarks
    )
    db.add(new_attendance)
    db.commit()

    return {"status": "success", "message": f"Punched in at {datetime.datetime.now().strftime('%H:%M %p')}"}

@app.post("/attendance/punch-out")
def punch_out(punch: schemas.PunchOutRequest, db: Session = Depends(get_db)):
    attendance = db.query(models.Attendance).filter(
        models.Attendance.user_id == punch.user_id,
        models.Attendance.punch_out.is_(None)
    ).order_by(models.Attendance.id.desc()).first()

    now = datetime.datetime.now()
    if attendance:
        attendance.punch_out = now
        db.commit()
        return {"status": "success", "message": f"Punched out at {now.strftime('%H:%M %p')}"}
    else:
        # Create completed record
        new_attendance = models.Attendance(
            user_id=punch.user_id,
            punch_in=now,
            punch_out=now,
            status="Present"
        )
        db.add(new_attendance)
        db.commit()
        return {"status": "success", "message": f"Punched out at {now.strftime('%H:%M %p')}"}

@app.get("/attendance/report")
def get_attendance_report(
    user_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    query = db.query(models.Attendance, models.User).join(models.User, models.Attendance.user_id == models.User.id)
    if user_id:
        query = query.filter(models.Attendance.user_id == user_id)

    records = query.all()
    results = []
    for att, usr in records:
        in_str = att.punch_in.strftime("%Y-%m-%d %H:%M:%S") if att.punch_in else "--"
        out_str = att.punch_out.strftime("%Y-%m-%d %H:%M:%S") if att.punch_out else "Active"

        duration_str = "--"
        if att.punch_in and att.punch_out:
            diff = att.punch_out - att.punch_in
            hours, remainder = divmod(diff.seconds, 3600)
            minutes, _ = divmod(remainder, 60)
            duration_str = f"{hours}h {minutes}m"
        elif att.punch_in:
            diff = datetime.datetime.now() - att.punch_in
            hours, remainder = divmod(diff.seconds, 3600)
            minutes, _ = divmod(remainder, 60)
            duration_str = f"{hours}h {minutes}m (Active)"

        results.append({
            "id": att.id,
            "user_id": usr.id,
            "user_name": usr.name,
            "faculty_id": usr.faculty_id,
            "date": att.date.strftime("%Y-%m-%d") if att.date else "--",
            "punch_in": in_str,
            "punch_out": out_str,
            "status": att.status,
            "work_duration": duration_str,
            "out_of_range_reason": att.out_of_range_reason or "In Range"
        })
    return results

@app.get("/departments")
def get_departments(db: Session = Depends(get_db)):
    return db.query(models.Department).all()

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
