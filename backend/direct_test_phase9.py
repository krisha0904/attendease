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

print("Setting up Phase 9 in-memory test database...")
engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
models.Base.metadata.create_all(bind=engine)
Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = Session()

# 1. Setup College, Admin, Department, and Faculty
college = models.College(name="Apex Institute of Technology", code="APEX_P9", is_active=True)
db.add(college)
db.commit()

admin = models.User(
    college_id=college.id,
    employee_id="ADM-2026-P9",
    full_name="Dean Academic",
    email="dean.acad@apex.edu",
    username="dean.acad",
    password_hash=hash_password("SuperSecretPass123"),
    role=models.UserRole.SUPER_ADMIN,
    is_active=True,
)
db.add(admin)

dept = models.Department(
    college_id=college.id,
    name="Computer Science & Engineering",
    code="CSE",
    is_active=True,
)
db.add(dept)
db.commit()

fac1 = models.User(
    college_id=college.id,
    employee_id="FAC-2026-CS01",
    full_name="Dr. Alan Turing",
    email="turing@apex.edu",
    username="alan.turing",
    department_id=dept.id,
    password_hash=hash_password("TuringPass123"),
    role=models.UserRole.FACULTY,
    designation="Visiting Professor",
    is_active=True,
)
fac2 = models.User(
    college_id=college.id,
    employee_id="FAC-2026-CS02",
    full_name="Dr. Grace Hopper",
    email="hopper@apex.edu",
    username="grace.hopper",
    department_id=dept.id,
    password_hash=hash_password("HopperPass123"),
    role=models.UserRole.FACULTY,
    designation="Visiting Professor",
    is_active=True,
)
db.add_all([fac1, fac2])
db.commit()

# Setup scheduled lectures for Dr. Alan Turing on Monday (0) and Wednesday (2)
lec1 = models.WeeklyLecture(
    college_id=college.id,
    department_id=dept.id,
    user_id=fac1.id,
    subject="Automata & Computability",
    course_name="B.Tech CS",
    day_of_week=0, # Monday
    start_time=time(10, 0),
    end_time=time(11, 30),
    room="Lab 101",
    is_active=True,
)
lec2 = models.WeeklyLecture(
    college_id=college.id,
    department_id=dept.id,
    user_id=fac1.id,
    subject="Cryptography & Complexity",
    course_name="B.Tech CS",
    day_of_week=2, # Wednesday
    start_time=time(14, 0),
    end_time=time(15, 30),
    room="Lecture Hall 3",
    is_active=True,
)
db.add_all([lec1, lec2])
db.commit()

print(f"Entities created: College={college.id}, Admin={admin.id}, Fac1={fac1.id}, Fac2={fac2.id}, Lectures=2")

app = main.create_app()

def get_route(path, method="GET"):
    for r in app.routes:
        if getattr(r, "path", None) == path and method.upper() in getattr(r, "methods", set()):
            return r.endpoint
    raise ValueError(f"Route {method} {path} not found")

list_leave_types = get_route("/leave-types", "GET")
admin_list_leaves = get_route("/admin/leaves", "GET")
admin_create_leave = get_route("/admin/leaves", "POST")
admin_affected_lectures = get_route("/admin/leaves/{leave_id}/affected-lectures", "GET")
admin_review_leave = get_route("/admin/leaves/{leave_id}/review", "POST")
admin_cancel_leave = get_route("/admin/leaves/{leave_id}", "DELETE")
submit_leave_faculty = get_route("/leaves", "POST")
get_my_leaves = get_route("/leaves/mine", "GET")

dummy_req = MagicMock()
dummy_req.client.host = "127.0.0.1"

# Test 1: Auto-seeding and listing leave types
print("\n--- Test 1: Auto-seed and list leave types ---")
lt_list = list_leave_types(user=fac1, db=db)
print(f"Loaded {len(lt_list)} leave types: {[t['code'] for t in lt_list]}")
assert len(lt_list) >= 5
cl_type = next(t for t in lt_list if t["code"] == "CL")
ml_type = next(t for t in lt_list if t["code"] == "ML")

# Test 2: Faculty submits leave application spanning a Monday to Wednesday (3 days)
# Let's find upcoming Monday and Wednesday
today = date.today()
monday = today + timedelta(days=((0 - today.weekday()) % 7))
if monday < today:
    monday += timedelta(days=7)
wednesday = monday + timedelta(days=2) # Mon, Tue, Wed = 3 days

print(f"\n--- Test 2: Faculty submits leave request ({monday} to {wednesday}) ---")
f1_req = main.LeaveApplicationCreate(
    leave_type_id=cl_type["id"],
    start_date=monday,
    end_date=wednesday,
    reason="Attending ACM Computing Conference",
)
f1_res = submit_leave_faculty(payload=f1_req, user=fac1, db=db)
print(f"Submitted: ID={f1_res['id']}, Status={f1_res['status']}, Total Days={f1_res['total_days']}, Affected Lectures={f1_res['affected_lectures_count']}")
assert f1_res["status"] == "pending"
assert f1_res["faculty_id"] == fac1.id
assert f1_res["total_days"] == 3
# Dr. Turing has 1 lecture on Monday and 1 lecture on Wednesday = 2 affected lectures!
assert f1_res["affected_lectures_count"] == 2

# Test 3: Faculty views their submitted leave requests
print("\n--- Test 3: Faculty views personal leaves ---")
my_leaves = get_my_leaves(user=fac1, db=db)
assert len(my_leaves) == 1
assert my_leaves[0]["id"] == f1_res["id"]
assert my_leaves[0]["affected_lectures_count"] == 2
print("Personal leave history retrieved successfully!")

# Test 4: Admin inspects affected lectures detail
print("\n--- Test 4: Inspect affected lectures breakdown ---")
aff_res = admin_affected_lectures(leave_id=f1_res["id"], admin=admin, db=db)
print(f"Affected count={aff_res['affected_count']}, items={len(aff_res['affected_lectures'])}")
assert aff_res["affected_count"] == 2
assert any(lec["subject"] == "Automata & Computability" for lec in aff_res["affected_lectures"])
assert any(lec["subject"] == "Cryptography & Complexity" for lec in aff_res["affected_lectures"])
print("Affected lectures accurately computed against weekly timetable!")

# Test 5: Admin lists leaves and checks KPIs
print("\n--- Test 5: Admin lists leaves with summary KPIs ---")
adm_list = admin_list_leaves(admin=admin, db=db)
assert len(adm_list["items"]) == 1
assert adm_list["kpis"]["total_requests"] == 1
assert adm_list["kpis"]["pending_requests"] == 1
assert adm_list["kpis"]["approved_requests"] == 0
assert adm_list["kpis"]["affected_lectures_total"] == 2
print(f"Admin KPIs verified: {adm_list['kpis']}")

# Test 6: Admin approves leave with remarks
print("\n--- Test 6: Admin reviews and approves leave ---")
rev_req = main.LeaveReviewRequest(
    action="approve",
    review_remarks="Approved by Academic Council for ACM Conference presentation."
)
rev_res = admin_review_leave(leave_id=f1_res["id"], payload=rev_req, request=dummy_req, admin=admin, db=db)
assert rev_res["status"] == "approved"
assert rev_res["reviewed_by_id"] == admin.id
assert rev_res["review_remarks"] == "Approved by Academic Council for ACM Conference presentation."
print(f"Approved leave ID={rev_res['id']} with status={rev_res['status']}")

# Test 7: Admin directly creates leave for Faculty 2 (Dr. Grace Hopper)
print("\n--- Test 7: Admin creates direct leave for Faculty 2 ---")
thursday = monday + timedelta(days=3)
friday = monday + timedelta(days=4)
adm_create_req = main.AdminLeaveCreate(
    faculty_id=fac2.id,
    leave_type_id=ml_type["id"],
    start_date=thursday,
    end_date=friday,
    reason="Medical checkup & doctor recommended rest",
    status="approved",
    remarks="Medical certificate verified by clinic",
)
adm_create_res = admin_create_leave(payload=adm_create_req, request=dummy_req, admin=admin, db=db)
assert adm_create_res["status"] == "approved"
assert adm_create_res["faculty_id"] == fac2.id
assert adm_create_res["total_days"] == 2
print(f"Admin created leave: ID={adm_create_res['id']}, Status={adm_create_res['status']}")

# Test 8: Verify updated KPIs
print("\n--- Test 8: Verify updated KPIs ---")
adm_list2 = admin_list_leaves(admin=admin, db=db)
assert len(adm_list2["items"]) == 2
assert adm_list2["kpis"]["total_requests"] == 2
assert adm_list2["kpis"]["pending_requests"] == 0
assert adm_list2["kpis"]["approved_requests"] == 2
assert adm_list2["kpis"]["total_days_approved"] == 5 # 3 days + 2 days
print("KPIs updated and verified accurately!")

# Test 9: Admin cancels Faculty 2 leave
print("\n--- Test 9: Admin cancels leave ---")
del_res = admin_cancel_leave(leave_id=adm_create_res["id"], request=dummy_req, admin=admin, db=db)
print(f"Cancellation response: {del_res}")
adm_list3 = admin_list_leaves(admin=admin, db=db)
f2_leave = next(l for l in adm_list3["items"] if l["id"] == adm_create_res["id"])
assert f2_leave["status"] == "cancelled"
print("Cancellation verified successfully!")

print("\n==================================================")
print("ALL PHASE 9 BACKEND TESTS PASSED SUCCESSFULLY! (100%)")
print("==================================================")
