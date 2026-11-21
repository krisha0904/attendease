import os
import sys
from datetime import date, datetime, time, timedelta
from unittest.mock import MagicMock

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

print("Setting up Phase 12 in-memory test database...")
engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
models.Base.metadata.create_all(bind=engine)
Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = Session()

# 1. Setup College, Admin, Department, and Faculty Members
college = models.College(name="Apex Institute of Technology", code="APEX_P12", is_active=True)
db.add(college)
db.commit()

admin = models.User(
    college_id=college.id,
    employee_id="ADM-2026-P12",
    full_name="Dean Finance & Academic",
    email="dean.finance@apex.edu",
    username="dean.finance",
    password_hash=hash_password("SuperSecretPass123"),
    role=models.UserRole.SUPER_ADMIN,
    is_active=True,
)
dept_ai = models.Department(college_id=college.id, name="Artificial Intelligence", code="AI", is_active=True)
db.add_all([admin, dept_ai])
db.commit()

fac1 = models.User(
    college_id=college.id,
    employee_id="FAC-2026-AI01",
    full_name="Prof. Geoffrey Hinton",
    email="hinton@apex.edu",
    username="geoffrey.hinton",
    department_id=dept_ai.id,
    password_hash=hash_password("DeepLearning123"),
    role=models.UserRole.FACULTY,
    designation="Distinguished Visiting Professor",
    is_active=True,
)
fac2 = models.User(
    college_id=college.id,
    employee_id="FAC-2026-AI02",
    full_name="Prof. Yann LeCun",
    email="lecun@apex.edu",
    username="yann.lecun",
    department_id=dept_ai.id,
    password_hash=hash_password("ConvNetPass123"),
    role=models.UserRole.FACULTY,
    designation="Visiting Professor",
    is_active=True,
)
db.add_all([fac1, fac2])
db.commit()

# Setup Weekly Lecture for Prof. Hinton
lec1 = models.WeeklyLecture(
    college_id=college.id,
    department_id=dept_ai.id,
    user_id=fac1.id,
    subject="Deep Neural Architectures",
    course_name="M.Tech AI",
    day_of_week=0, # Monday
    start_time=time(10, 0),
    end_time=time(12, 0),
    room="Lab AI-1",
    is_active=True,
)
db.add(lec1)
db.commit()

# Setup 2 Delivered Lectures (LectureAttendanceRecord) for Prof. Hinton
today = date.today()
monday1 = today - timedelta(days=7)
monday2 = today - timedelta(days=14)

rec1 = models.LectureAttendanceRecord(
    college_id=college.id,
    user_id=fac1.id,
    weekly_lecture_id=lec1.id,
    lecture_date=monday1,
    punch_in_time=datetime.combine(monday1, time(9, 58)), # On time (2 mins early)
    punch_out_time=datetime.combine(monday1, time(12, 2)),
    punch_in_face_verified=True,
    punch_out_face_verified=True,
)
rec2 = models.LectureAttendanceRecord(
    college_id=college.id,
    user_id=fac1.id,
    weekly_lecture_id=lec1.id,
    lecture_date=monday2,
    punch_in_time=datetime.combine(monday2, time(10, 0)), # On time
    punch_out_time=datetime.combine(monday2, time(12, 0)),
    punch_in_face_verified=True,
    punch_out_face_verified=True,
)
db.add_all([rec1, rec2])
db.commit()

print(f"Entities created: College={college.id}, Admin={admin.id}, Fac1={fac1.id}, Fac2={fac2.id}, Records=2")

app = main.create_app()

def get_route(path, method="GET"):
    for r in app.routes:
        if getattr(r, "path", None) == path and method.upper() in getattr(r, "methods", set()):
            return r.endpoint
    raise ValueError(f"Route {method} {path} not found")

list_payment_rates = get_route("/admin/reports/payment-rates", "GET")
set_payment_rate = get_route("/admin/reports/payment-rates", "POST")
get_honorarium = get_route("/admin/reports/honorarium", "GET")
settle_honorarium = get_route("/admin/reports/settle", "POST")
export_csv = get_route("/admin/reports/honorarium/export", "GET")

dummy_req = MagicMock()
dummy_req.client.host = "127.0.0.1"

# Test 1: Auto-seed default baseline payment rate
print("\n--- Test 1: List and auto-seed default payment rates ---")
rates = list_payment_rates(admin=admin, db=db)
print(f"Rates returned: {len(rates)} items: {rates}")
assert len(rates) >= 1
assert rates[0]["rate_per_lecture"] == 1500.0
assert rates[0]["rate_per_hour"] == 1000.0

# Test 2: Set premium rate for Prof. Hinton (2500 per lecture)
print("\n--- Test 2: Configure custom honorarium rate for Prof. Hinton ---")
rate_req = main.FacultyPaymentRateSet(
    faculty_id=fac1.id,
    rate_per_lecture=2500.0,
    rate_per_hour=1500.0,
    effective_from=today - timedelta(days=30),
)
set_res = set_payment_rate(payload=rate_req, admin=admin, db=db)
assert set_res["rate_per_lecture"] == 2500.0
assert set_res["faculty_id"] == fac1.id
print(f"Custom rate saved: ₹{set_res['rate_per_lecture']} / lecture")

# Test 3: Calculate Honorarium & Analytics
print("\n--- Test 3: Calculate Honorarium & Punctuality Analytics ---")
date_start = today - timedelta(days=30)
hon_res = get_honorarium(date_from=date_start, date_to=today, admin=admin, db=db)
items = hon_res["items"]
kpis = hon_res["kpis"]

hinton_item = next(i for i in items if i["faculty_id"] == fac1.id)
print(f"Hinton breakdown: lectures={hinton_item['completed_lectures']}, hours={hinton_item['total_hours_delivered']}, gross=₹{hinton_item['gross_amount']}, punctuality={hinton_item['punctuality_rate']}%")

assert hinton_item["completed_lectures"] == 2
# 2 lectures * 2500 rate = 5000 INR
assert hinton_item["gross_amount"] == 5000.0
assert hinton_item["punctuality_rate"] == 100.0
assert hinton_item["settlement_status"] == "pending"

assert kpis["total_honorarium_payable"] == 5000.0
assert kpis["total_lectures_conducted"] == 2
assert kpis["pending_amount"] == 5000.0
assert kpis["settled_amount"] == 0.0
print("Honorarium accurately computed against delivered attendance logs!")

# Test 4: Settle Honorarium Payout
print("\n--- Test 4: Settle Honorarium Payout for Prof. Hinton ---")
settle_req = main.FinancialSettlementCreate(
    faculty_id=fac1.id,
    period_start=date_start,
    period_end=today,
    total_lectures=2,
    total_hours=hinton_item["total_hours_delivered"],
    gross_amount=hinton_item["gross_amount"],
    transaction_ref="NEFT-APEX-2026-AI-01",
    notes="Monthly honorarium payment approved by Dean",
)
settle_res = settle_honorarium(payload=settle_req, request=dummy_req, admin=admin, db=db)
print(f"Settled response: ID={settle_res['id']}, Status={settle_res['status']}, Ref={settle_res['transaction_ref']}")
assert settle_res["status"] == "settled"
assert settle_res["gross_amount"] == 5000.0
assert settle_res["transaction_ref"] == "NEFT-APEX-2026-AI-01"

# Test 5: Verify updated KPIs and Settlement Status
print("\n--- Test 5: Verify updated settlement figures ---")
hon_res2 = get_honorarium(date_from=date_start, date_to=today, admin=admin, db=db)
hinton_item2 = next(i for i in hon_res2["items"] if i["faculty_id"] == fac1.id)
assert hinton_item2["settlement_status"] == "settled"
assert hinton_item2["transaction_ref"] == "NEFT-APEX-2026-AI-01"
assert hon_res2["kpis"]["settled_amount"] == 5000.0
assert hon_res2["kpis"]["pending_amount"] == 0.0
print("Settlement transition and KPIs verified successfully!")

# Test 6: Export CSV Statement
print("\n--- Test 6: Export Honorarium CSV ---")
csv_res = export_csv(date_from=date_start, date_to=today, admin=admin, db=db)
assert csv_res.media_type == "text/csv"
assert "attachment" in csv_res.headers.get("content-disposition", "")
print("CSV Statement export stream successfully created!")

print("\n==================================================")
print("ALL PHASE 12 BACKEND TESTS PASSED SUCCESSFULLY! (100%)")
print("==================================================")
