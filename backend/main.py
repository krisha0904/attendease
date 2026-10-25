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
import smtplib
from email.message import EmailMessage
from database import engine, get_db, SessionLocal
import uvicorn
from dotenv import load_dotenv

load_dotenv()

SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM = os.getenv("SMTP_FROM") or SMTP_USERNAME
DEBUG_OTP = os.getenv("DEBUG_OTP", "false").lower() == "true"

models.Base.metadata.create_all(bind=engine)
database.ensure_database_schema()

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


def send_email_otp(recipient: str, otp: str) -> bool:
    if not SMTP_HOST or not SMTP_USERNAME or not SMTP_PASSWORD:
        print(f"\nEMAIL OTP READY (SMTP not configured): {otp} for {recipient}\n")
        return False

    try:
        msg = EmailMessage()
        msg["Subject"] = "Your AttendEase login OTP"
        msg["From"] = SMTP_FROM or SMTP_USERNAME
        msg["To"] = recipient
        msg.set_content(
            f"Your AttendEase login OTP is: {otp}\n\n"
            "Use this code to verify your identity and continue login."
        )

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(msg)
        return True
    except Exception as exc:
        print(f"SMTP delivery failed for {recipient}: {exc}")
        return False

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
    print(f"\n====================\nADMIN DEBUG OTP: {otp} for User ID {req.user_id} via email\n====================\n")
    return {
        "status": "success",
        "message": "OTP sent successfully to Department Admin via email",
        "otp": otp
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
def send_otp(identifier: str, method: str = "email", db: Session = Depends(get_db)):
    lookup = identifier.strip()
    lookup_email = lookup.lower() if "@" in lookup else None

    db_user = db.query(models.User).filter(
        or_(models.User.phone == lookup, models.User.email == lookup_email)
    ).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="Account not found")

    target_email = (lookup_email or lookup).lower()
    if not db_user.email and not target_email:
        raise HTTPException(status_code=400, detail="No email is registered for this account")
    if db_user.email:
        target_email = db_user.email.lower()

    otp = str(random.randint(100000, 999999))
    otp_storage[lookup] = otp
    otp_storage[target_email] = otp

    email_success = send_email_otp(target_email, otp)

    print(f"\n{'='*20}")
    print(f"OTP READY: {otp} for {lookup} via email to {target_email}")
    print(f"{'='*20}\n")

    payload = {
        "message": "OTP sent successfully via email",
        "email_success": email_success,
        "delivery_status": "email"
    }
    if DEBUG_OTP:
        payload["otp"] = otp
    return payload

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
        if isinstance(embedding, dict):
            db_user.face_embedding = json.dumps(embedding)
        else:
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
            if isinstance(embedding, dict):
                embedding_json = json.dumps(embedding)
            else:
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

    stored_value = json.loads(db_user.face_embedding) if db_user.face_embedding else None
    current_embedding = face_service.get_face_embedding(punch.face_image_base64)

    if current_embedding is None:
        raise HTTPException(status_code=400, detail="No face detected in photo")

    is_verified = face_service.verify_faces(stored_value, current_embedding)

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

def build_attendance_report(db: Session, user_id: Optional[int] = None):
    query = db.query(models.Attendance, models.User).join(models.User, models.Attendance.user_id == models.User.id)
    if user_id:
        query = query.filter(models.Attendance.user_id == user_id)

    records = query.order_by(models.Attendance.punch_in.desc()).all()
    results = []

    for att, usr in records:
        in_str = att.punch_in.strftime("%Y-%m-%d %H:%M:%S") if att.punch_in else "--"
        out_str = att.punch_out.strftime("%Y-%m-%d %H:%M:%S") if att.punch_out else "Active"

        duration_seconds = 0
        if att.punch_in and att.punch_out:
            duration_seconds = int((att.punch_out - att.punch_in).total_seconds())
        elif att.punch_in:
            duration_seconds = int((datetime.datetime.now() - att.punch_in).total_seconds())

        hours, remainder = divmod(duration_seconds, 3600)
        minutes, _ = divmod(remainder, 60)
        duration_str = f"{hours}h {minutes}m" if duration_seconds else "--"
        if att.punch_in and not att.punch_out:
            duration_str = f"{hours}h {minutes}m (Active)"

        results.append({
            "id": att.id,
            "user_id": usr.id,
            "user_name": usr.name,
            "faculty_id": usr.faculty_id,
            "date": att.date.strftime("%Y-%m-%d") if att.date else "--",
            "punch_in": in_str,
            "punch_out": out_str,
            "status": att.status or "Present",
            "work_duration": duration_str,
            "out_of_range_reason": att.out_of_range_reason or "In Range",
            "total_minutes": int(duration_seconds / 60),
        })

    return results


@app.get("/attendance/report")
def get_attendance_report(
    user_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    return build_attendance_report(db, user_id=user_id)


@app.get("/attendance/summary")
def get_attendance_summary(db: Session = Depends(get_db)):
    rows = build_attendance_report(db)
    total_minutes = sum(item["total_minutes"] for item in rows)
    present = sum(1 for item in rows if item["status"] == "Present")
    return {
        "total_records": len(rows),
        "total_minutes": total_minutes,
        "present_records": present,
        "records": rows[:10],
    }

@app.get("/departments")
def get_departments(db: Session = Depends(get_db)):
    return db.query(models.Department).all()

@app.get("/users/{user_id}")
def get_user_profile(user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "id": user.id,
        "faculty_id": user.faculty_id,
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "role": user.role,
        "department_id": user.department_id,
    }

@app.get("/attendance/summary/{user_id}")
def get_user_attendance_summary(user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    records = db.query(models.Attendance).filter(models.Attendance.user_id == user_id).order_by(models.Attendance.id.desc()).all()
    total_seconds = 0
    current_active = None

    for record in records:
        if record.punch_in and record.punch_out:
            total_seconds += int((record.punch_out - record.punch_in).total_seconds())
        elif record.punch_in:
            current_active = record

    hours, remainder = divmod(total_seconds, 3600)
    minutes, _ = divmod(remainder, 60)

    latest = records[0] if records else None
    punch_in = latest.punch_in.strftime("%I:%M %p") if latest and latest.punch_in else None
    status = "Present" if current_active else ("Checked Out" if latest and latest.punch_out else "Not Started")

    return {
        "user_id": user.id,
        "name": user.name,
        "faculty_id": user.faculty_id,
        "total_work_hours": f"{hours}h {minutes}m",
        "punch_in": punch_in,
        "status": status,
        "records_count": len(records),
    }

@app.post("/attendance/break")
def toggle_break(user_id: int, db: Session = Depends(get_db)):
    return {"status": "success", "message": "Break status updated"}

# HOD / Admin Endpoints
def get_user_status_for_today(db: Session, user_id: int):
    today_start = datetime.datetime.combine(datetime.date.today(), datetime.time.min)
    today_end = today_start + datetime.timedelta(days=1)

    attendance_records = db.query(models.Attendance).filter(
        models.Attendance.user_id == user_id,
        models.Attendance.punch_in >= today_start,
        models.Attendance.punch_in < today_end,
    ).order_by(models.Attendance.id.desc()).all()

    if not attendance_records:
        return {"status": "ABSENT", "time": "--"}

    latest = attendance_records[0]
    active_break = db.query(models.Break).filter(
        models.Break.attendance_id == latest.id,
        models.Break.break_in.is_not(None),
        models.Break.break_out.is_(None),
    ).first()

    if active_break:
        return {"status": "ON BREAK", "time": active_break.break_in.strftime("%I:%M %p") if active_break.break_in else "--"}

    if latest.punch_out is not None:
        return {"status": "WORKING", "time": latest.punch_in.strftime("%I:%M %p") if latest.punch_in else "--"}

    return {"status": "WORKING", "time": latest.punch_in.strftime("%I:%M %p") if latest.punch_in else "--"}


def build_hod_dashboard_summary(db: Session):
    users = db.query(models.User).order_by(models.User.name.asc()).all()
    staff_list = []
    present = 0
    on_break = 0
    absent = 0

    for user in users:
        status_info = get_user_status_for_today(db, user.id)
        status = status_info["status"]
        if status == "WORKING":
            present += 1
        elif status == "ON BREAK":
            on_break += 1
        else:
            absent += 1

        staff_list.append({
            "name": user.name,
            "status": status,
            "time": status_info["time"],
        })

    return {
        "present": present,
        "on_break": on_break,
        "absent": absent,
        "staff_list": staff_list,
    }


@app.get("/hod/dashboard-summary")
def get_hod_summary(db: Session = Depends(get_db)):
    return build_hod_dashboard_summary(db)


def get_leave_status_for_user(db: Session, user_id: int):
    leave_requests = db.query(models.LeaveRequest).filter(
        models.LeaveRequest.user_id == user_id,
    ).order_by(models.LeaveRequest.created_at.desc()).all()

    return [
        {
            "id": item.id,
            "user_id": item.user_id,
            "leave_type": item.leave_type,
            "reason": item.reason,
            "status": item.status,
            "start_date": item.start_date.isoformat() if item.start_date else None,
            "end_date": item.end_date.isoformat() if item.end_date else None,
            "created_at": item.created_at.isoformat() if item.created_at else None,
        }
        for item in leave_requests
    ]


def get_faculty_details_by_id(db: Session, faculty_id: str):
    user = db.query(models.User).filter(
        models.User.faculty_id == faculty_id
    ).first()

    if not user:
        raise HTTPException(status_code=404, detail="Faculty not found")

    rows = db.query(models.Attendance).filter(
        models.Attendance.user_id == user.id
    ).order_by(models.Attendance.id.desc()).all()

    total_seconds = 0
    latest_attendance = rows[0] if rows else None
    break_rows = []

    for row in rows:
        if row.punch_in and row.punch_out:
            total_seconds += int((row.punch_out - row.punch_in).total_seconds())

        attendance_breaks = db.query(models.Break).filter(
            models.Break.attendance_id == row.id,
            models.Break.break_in.is_not(None),
        ).order_by(models.Break.id.asc()).all()
        for item in attendance_breaks:
            if item.break_in and item.break_out:
                duration = int((item.break_out - item.break_in).total_seconds())
                item_duration_minutes = max(0, int(duration / 60))
                break_rows.append({
                    "in": item.break_in.strftime("%I:%M %p"),
                    "out": item.break_out.strftime("%I:%M %p"),
                    "duration_minutes": item_duration_minutes,
                })

    total_minutes = max(0, int(total_seconds / 60))
    break_minutes = sum(item["duration_minutes"] for item in break_rows)

    return {
        "name": user.name,
        "faculty_id": user.faculty_id,
        "punch_in": latest_attendance.punch_in.strftime("%I:%M %p") if latest_attendance and latest_attendance.punch_in else "--",
        "punch_out": latest_attendance.punch_out.strftime("%I:%M %p") if latest_attendance and latest_attendance.punch_out else "--",
        "total_work_minutes": total_minutes,
        "total_break_minutes": break_minutes,
        "breaks": break_rows,
    }


@app.get("/hod/faculty-details/{faculty_id}")
def get_faculty_details(faculty_id: str, db: Session = Depends(get_db)):
    return get_faculty_details_by_id(db, faculty_id)


@app.get("/hod/leave-requests")
def get_leave_requests(db: Session = Depends(get_db)):
    requests = db.query(models.LeaveRequest).order_by(models.LeaveRequest.created_at.desc()).all()
    payload = []
    for item in requests:
        user = db.query(models.User).filter(models.User.id == item.user_id).first()
        payload.append({
            "id": item.id,
            "user_id": item.user_id,
            "faculty_id": user.faculty_id if user else "N/A",
            "name": user.name if user else "Unknown",
            "leave_type": item.leave_type,
            "reason": item.reason,
            "status": item.status,
            "start_date": item.start_date.isoformat() if item.start_date else None,
            "end_date": item.end_date.isoformat() if item.end_date else None,
        })
    return payload

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
    return get_leave_status_for_user(db, user_id)


@app.patch("/leave/{leave_id}/status")
def update_leave_status(leave_id: int, payload: schemas.LeaveStatusUpdate, db: Session = Depends(get_db)):
    leave_request = db.query(models.LeaveRequest).filter(models.LeaveRequest.id == leave_id).first()
    if not leave_request:
        raise HTTPException(status_code=404, detail="Leave request not found")

    leave_request.status = payload.status.strip().title()
    db.commit()
    db.refresh(leave_request)
    return {
        "id": leave_request.id,
        "user_id": leave_request.user_id,
        "status": leave_request.status,
        "message": "Leave status updated successfully",
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
