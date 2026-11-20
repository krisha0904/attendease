import os
import sys
from datetime import date, datetime, time

# Ensure in-memory testing DB is used
os.environ["ATTENDEASE_TESTING"] = "1"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret-key-with-at-least-32-characters"
os.environ["BIOMETRIC_ENCRYPTION_KEY"] = "uY_R1W1qQ43u-Xh4r-yNf4r1mZ0lVfA_R9FvV_D7m-k="

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import models
import main
from password_service import hash_password

print("Setting up Phase 6 in-memory test database...")
engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
models.Base.metadata.create_all(bind=engine)
Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = Session()

# 1. Setup College, Admin, and 2 Faculty Members
college = models.College(name="Apex Institute of Technology", code="APEX_P6", is_active=True)
db.add(college)
db.commit()

admin = models.User(
    college_id=college.id,
    employee_id="ADM-2026-P6",
    full_name="Dean Attendance",
    email="dean.att@apex.edu",
    username="dean.att",
    password_hash=hash_password("SuperSecretPass123"),
    role=models.UserRole.SUPER_ADMIN,
    is_active=True,
)
db.add(admin)

dept = models.Department(
    college_id=college.id,
    name="Computer Science",
    code="CS",
    is_active=True,
)
db.add(dept)
db.commit()

fac1 = models.User(
    college_id=college.id,
    employee_id="FAC-2026-101",
    full_name="Dr. Ada Lovelace",
    email="ada@apex.edu",
    username="ada.lovelace",
    department_id=dept.id,
    password_hash=hash_password("AdaPass123"),
    role=models.UserRole.FACULTY,
    designation="Visiting Professor",
    is_active=True,
)
fac2 = models.User(
    college_id=college.id,
    employee_id="FAC-2026-102",
    full_name="Dr. Charles Babbage",
    email="charles@apex.edu",
    username="charles.babbage",
    department_id=dept.id,
    password_hash=hash_password("BabbagePass123"),
    role=models.UserRole.FACULTY,
    designation="Visiting Professor",
    is_active=True,
)
db.add(fac1)
db.add(fac2)
db.commit()

# Setup scheduled weekly lecture for fac1 on today's weekday
today = date.today()
today_weekday = today.weekday()

lec1 = models.WeeklyLecture(
    college_id=college.id,
    department_id=dept.id,
    user_id=fac1.id,
    subject="Algorithms & Data Structures",
    day_of_week=today_weekday,
    start_time=time(10, 0),
    end_time=time(11, 30),
    room="Room 201",
    is_active=True,
)
db.add(lec1)
db.commit()

# Setup Attendance Record for fac1 (Present, face-verified, GPS verified)
punch_in = datetime.combine(today, time(9, 45))
punch_out = datetime.combine(today, time(17, 15))
rec1 = models.AttendanceRecord(
    college_id=college.id,
    user_id=fac1.id,
    date=today,
    status=models.AttendanceStatus.PRESENT,
    punch_in_time=punch_in,
    punch_out_time=punch_out,
    total_working_minutes=450,
    net_working_minutes=410,
    total_break_minutes=40,
    is_late=False,
    punch_in_face_verified=True,
    punch_out_face_verified=True,
    punch_in_gps_verified=True,
    punch_in_distance_m=12.5,
)
db.add(rec1)
db.commit()

# Setup Lecture Attendance Record for fac1 on this date
lec_att1 = models.LectureAttendanceRecord(
    college_id=college.id,
    user_id=fac1.id,
    weekly_lecture_id=lec1.id,
    lecture_date=today,
    punch_in_time=datetime.combine(today, time(9, 58)),
    punch_out_time=datetime.combine(today, time(11, 32)),
    punch_in_face_verified=True,
    punch_out_face_verified=True,
)
db.add(lec_att1)
db.commit()

print("Setup completed. Running Phase 6 logic tests...")
app = main.create_app()

def get_route(path, method="GET"):
    for r in app.routes:
        if getattr(r, "path", None) == path and method.upper() in getattr(r, "methods", set()):
            return r.endpoint
    raise ValueError(f"Route {method} {path} not found")

list_attendance = get_route("/admin/attendance", "GET")
get_details = get_route("/admin/attendance/{record_id}/details", "GET")
manual_override = get_route("/admin/attendance/manual-override", "POST")
export_csv = get_route("/admin/attendance/export", "GET")

# 1. Test List Attendance
res = list_attendance(
    report_date=today,
    status_filter="all",
    verification_filter="all",
    search=None,
    admin=admin,
    db=db,
)
assert len(res["items"]) == 1
item = res["items"][0]
assert item["faculty"]["full_name"] == "Dr. Ada Lovelace"
assert item["status"] == "present"
assert item["punch_in_face_verified"] is True
assert item["punch_in_gps_verified"] is True
assert item["lectures_summary"]["scheduled_count"] == 1
assert item["lectures_summary"]["attended_count"] == 1
assert item["lectures_summary"]["completed_all"] is True
print("✓ List Attendance with Lecture Breakdown: PASSED")

# 2. Test Attendance Summary KPIs
summary = res["summary"]
assert summary["total_faculty"] == 2
assert summary["present_count"] == 1
assert summary["absent_count"] == 1 # fac2 has no punch in
assert summary["biometric_pass_rate"] == 100.0
print("✓ Attendance Summary KPIs Calculation: PASSED")

# 3. Test Attendance Details API
details = get_details(record_id=rec1.id, admin=admin, db=db)
assert details["faculty"]["full_name"] == "Dr. Ada Lovelace"
assert len(details["lectures_breakdown"]) == 1
lec_info = details["lectures_breakdown"][0]
assert lec_info["subject"] == "Algorithms & Data Structures"
assert lec_info["attended"] is True
assert lec_info["face_verified"] is True
print("✓ Detailed Single-Record Inspection API: PASSED")

# 4. Test Manual Attendance Override
override_payload = main.AttendanceManualOverride(
    user_id=fac2.id,
    date=today,
    status="present",
    punch_in_time="09:15",
    punch_out_time="17:00",
    reason="Gate biometric scanner network lag; verified by security gate log.",
)
over_res = manual_override(payload=override_payload, admin=admin, db=db)
assert "Attendance successfully updated" in over_res["message"]
assert over_res["record"]["is_manual_override"] is True
assert over_res["record"]["override_reason"] == "Gate biometric scanner network lag; verified by security gate log."
assert over_res["record"]["overridden_by_name"] == "Dean Attendance"
print("✓ Admin Manual Attendance Override with Audit: PASSED")

# Verify that fac2 is now present in the list
updated_list = list_attendance(report_date=today, admin=admin, db=db)
assert len(updated_list["items"]) == 2
assert updated_list["summary"]["present_count"] == 2
assert updated_list["summary"]["absent_count"] == 0
print("✓ Live KPI Auto-Update after Override: PASSED")

# 5. Test CSV Export
csv_res = export_csv(report_date=today, admin=admin, db=db)
csv_text = csv_res.body.decode("utf-8")
assert "Dr. Ada Lovelace" in csv_text
assert "Dr. Charles Babbage" in csv_text
assert "Gate biometric scanner network lag" in csv_text
print("✓ CSV Export Generation: PASSED")

db.close()
print("\n" + "=" * 60)
print("ALL PHASE 6 ATTENDANCE MANAGEMENT BACKEND TESTS PASSED 100%!")
print("=" * 60)
