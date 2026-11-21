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

print("Setting up Phase 7 in-memory test database...")
engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
models.Base.metadata.create_all(bind=engine)
Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = Session()

# 1. Setup College, Admin, and 2 Faculty Members
college = models.College(name="Apex Institute of Technology", code="APEX_P7", is_active=True)
db.add(college)
db.commit()

admin = models.User(
    college_id=college.id,
    employee_id="ADM-2026-P7",
    full_name="Dean Registrar",
    email="dean.reg@apex.edu",
    username="dean.reg",
    password_hash=hash_password("SuperSecretPass123"),
    role=models.UserRole.SUPER_ADMIN,
    is_active=True,
)
db.add(admin)

dept = models.Department(
    college_id=college.id,
    name="Mechanical Engineering",
    code="MECH",
    is_active=True,
)
db.add(dept)
db.commit()

fac1 = models.User(
    college_id=college.id,
    employee_id="FAC-2026-ME01",
    full_name="Prof. James Watt",
    email="watt@apex.edu",
    username="james.watt",
    department_id=dept.id,
    password_hash=hash_password("WattPass123"),
    role=models.UserRole.FACULTY,
    designation="Visiting Professor",
    is_active=True,
)
fac2 = models.User(
    college_id=college.id,
    employee_id="FAC-2026-ME02",
    full_name="Prof. Rudolf Diesel",
    email="diesel@apex.edu",
    username="rudolf.diesel",
    department_id=dept.id,
    password_hash=hash_password("DieselPass123"),
    role=models.UserRole.FACULTY,
    designation="Visiting Professor",
    is_active=True,
)
db.add(fac1)
db.add(fac2)
db.commit()

# Setup Attendance Record for fac1 (forgot to punch out)
today = date.today()
punch_in = datetime.combine(today, time(9, 10))
rec1 = models.AttendanceRecord(
    college_id=college.id,
    user_id=fac1.id,
    date=today,
    status=models.AttendanceStatus.ABSENT, # incomplete workday marked absent
    punch_in_time=punch_in,
    punch_out_time=None,
    total_working_minutes=0,
    net_working_minutes=0,
)
db.add(rec1)
db.commit()

print("Setup completed. Running Phase 7 logic tests...")
app = main.create_app()

def get_route(path, method="GET"):
    for r in app.routes:
        if getattr(r, "path", None) == path and method.upper() in getattr(r, "methods", set()):
            return r.endpoint
    raise ValueError(f"Route {method} {path} not found")

submit_correction = get_route("/attendance-corrections", "POST")
list_corrections = get_route("/admin/attendance-corrections", "GET")
review_correction = get_route("/admin/attendance-corrections/{correction_id}/review", "POST")
get_my_corrections = get_route("/attendance-corrections/mine", "GET")

# 1. Test Faculty Submit Correction Request 1
req1_payload = main.AttendanceCorrectionCreate(
    target_date=today,
    requested_punch_in="09:00",
    requested_punch_out="17:00",
    reason="Biometric terminal screen was unresponsive when departing campus at 17:00.",
)
c1_res = submit_correction(payload=req1_payload, user=fac1, db=db)
assert c1_res["status"] == "pending"
assert c1_res["faculty_name"] == "Prof. James Watt"
assert c1_res["original_punch_in"] == "09:10"
assert c1_res["requested_punch_out"] == "17:00"
c1_id = c1_res["id"]
print("✓ Submit Correction Request 1: PASSED (id=", c1_id, ")")

# 2. Test Faculty Submit Correction Request 2 (Diesel)
req2_payload = main.AttendanceCorrectionCreate(
    target_date=today,
    requested_punch_in="08:45",
    requested_punch_out="16:45",
    reason="Offsite university inspection duty in the morning.",
)
c2_res = submit_correction(payload=req2_payload, user=fac2, db=db)
c2_id = c2_res["id"]
print("✓ Submit Correction Request 2: PASSED (id=", c2_id, ")")

# 3. Test List Admin Attendance Corrections & Summary KPIs
corr_list = list_corrections(status_filter="all", admin=admin, db=db)
assert corr_list["summary"]["total_requests"] == 2
assert corr_list["summary"]["pending_count"] == 2
assert corr_list["summary"]["approved_count"] == 0
assert corr_list["summary"]["rejected_count"] == 0
assert len(corr_list["items"]) == 2
print("✓ List Corrections with Summary KPIs: PASSED")

# 4. Test Reject Request 2
rej_payload = main.AttendanceCorrectionReview(
    action="reject",
    admin_remarks="Please provide official proof or movement letter for offsite inspection.",
)
rej_res = review_correction(correction_id=c2_id, payload=rej_payload, admin=admin, db=db)
assert rej_res["correction"]["status"] == "rejected"
assert rej_res["correction"]["admin_remarks"] == "Please provide official proof or movement letter for offsite inspection."
assert rej_res["correction"]["reviewed_by_name"] == "Dean Registrar"
print("✓ Reject Correction Request with Mandatory Remarks: PASSED")

# 5. Test Approve Request 1
app_payload = main.AttendanceCorrectionReview(
    action="approve",
    admin_remarks="Verified with gate security logbook entry at 17:02.",
)
app_res = review_correction(correction_id=c1_id, payload=app_payload, admin=admin, db=db)
assert app_res["correction"]["status"] == "approved"
assert app_res["correction"]["admin_remarks"] == "Verified with gate security logbook entry at 17:02."
assert app_res["correction"]["reviewed_by_name"] == "Dean Registrar"
print("✓ Approve Correction Request: PASSED")

# 6. Verify that the actual AttendanceRecord was updated accordingly
updated_att = db.query(models.AttendanceRecord).filter(
    models.AttendanceRecord.user_id == fac1.id,
    models.AttendanceRecord.date == today,
).first()
assert updated_att.status == models.AttendanceStatus.PRESENT
assert updated_att.punch_out_time is not None
assert updated_att.punch_out_time.hour == 17
assert updated_att.is_manual_override is True
assert f"Approved Correction Request #{c1_id}" in updated_att.override_reason
assert updated_att.overridden_by_id == admin.id
assert updated_att.total_working_minutes == 480 # 09:00 to 17:00
print("✓ Underlying AttendanceRecord Updated to Present with Audit Override: PASSED")

# 7. Verify Notification was created
notif = db.query(models.Notification).filter(models.Notification.user_id == fac1.id).first()
assert notif is not None
assert "Attendance Correction Approved" in notif.title
print("✓ Faculty Notification Dispatched: PASSED")

# 8. Verify Updated Summary KPIs
post_corr = list_corrections(status_filter="all", admin=admin, db=db)
assert post_corr["summary"]["pending_count"] == 0
assert post_corr["summary"]["approved_count"] == 1
assert post_corr["summary"]["rejected_count"] == 1
print("✓ Live Summary KPIs Auto-Refreshed: PASSED")

# 9. Verify Faculty's Own View
my_res = get_my_corrections(user=fac1, db=db)
assert len(my_res) == 1
assert my_res[0]["status"] == "approved"
print("✓ Faculty My Corrections View: PASSED")

db.close()
print("\n" + "=" * 60)
print("ALL PHASE 7 ATTENDANCE CORRECTIONS BACKEND TESTS PASSED 100%!")
print("=" * 60)
