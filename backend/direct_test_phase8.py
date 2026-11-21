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

print("Setting up Phase 8 in-memory test database...")
engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
models.Base.metadata.create_all(bind=engine)
Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = Session()

# 1. Setup College, Admin, and 2 Faculty Members
college = models.College(name="Apex Institute of Technology", code="APEX_P8", is_active=True)
db.add(college)
db.commit()

admin = models.User(
    college_id=college.id,
    employee_id="ADM-2026-P8",
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
    name="Electrical Engineering",
    code="EE",
    is_active=True,
)
db.add(dept)
db.commit()

fac1 = models.User(
    college_id=college.id,
    employee_id="FAC-2026-EE01",
    full_name="Prof. Nikola Tesla",
    email="tesla@apex.edu",
    username="nikola.tesla",
    department_id=dept.id,
    password_hash=hash_password("TeslaPass123"),
    role=models.UserRole.FACULTY,
    designation="Visiting Professor",
    is_active=True,
)
fac2 = models.User(
    college_id=college.id,
    employee_id="FAC-2026-EE02",
    full_name="Prof. Thomas Edison",
    email="edison@apex.edu",
    username="thomas.edison",
    department_id=dept.id,
    password_hash=hash_password("EdisonPass123"),
    role=models.UserRole.FACULTY,
    designation="Adjunct Lecturer",
    is_active=True,
)
db.add_all([fac1, fac2])
db.commit()

print(f"Entities created: College={college.id}, Admin={admin.id}, Fac1={fac1.id}, Fac2={fac2.id}")

app = main.create_app()

def get_route(path, method="GET"):
    for r in app.routes:
        if getattr(r, "path", None) == path and method.upper() in getattr(r, "methods", set()):
            return r.endpoint
    raise ValueError(f"Route {method} {path} not found")

submit_avail = get_route("/faculty-availability", "POST")
get_my_avails = get_route("/faculty-availability/mine", "GET")
list_admin_avails = get_route("/admin/faculty-availability", "GET")
create_admin_avail = get_route("/admin/faculty-availability", "POST")
update_admin_avail = get_route("/admin/faculty-availability/{avail_id}", "PUT")
review_avail = get_route("/admin/faculty-availability/{avail_id}/review", "POST")
delete_avail = get_route("/admin/faculty-availability/{avail_id}", "DELETE")

# Test 1: Faculty 1 submits availability window (e.g. Monday 09:00 - 13:00)
print("\n--- Test 1: Faculty self-submits availability ---")
f1_req = main.FacultyAvailabilityCreate(
    day_of_week=0, # Monday
    start_time="09:00",
    end_time="13:00",
    is_available=True,
    notes="Available for morning lectures"
)
f1_res = submit_avail(payload=f1_req, user=fac1, db=db)
print(f"Submitted: ID={f1_res['id']}, Status={f1_res['status']}, Day={f1_res['day_name']}, Time={f1_res['start_time']}-{f1_res['end_time']}")
assert f1_res["status"] == "pending"
assert f1_res["faculty_id"] == fac1.id
assert f1_res["day_of_week"] == 0

# Test 2: Faculty 1 views their own submissions
print("\n--- Test 2: Faculty views own availability ---")
my_avails = get_my_avails(user=fac1, db=db)
assert len(my_avails) == 1
assert my_avails[0]["id"] == f1_res["id"]
print(f"Verified faculty personal view: {len(my_avails)} records retrieved.")

# Test 3: Admin lists availability windows and checks KPIs
print("\n--- Test 3: Admin lists availability with KPIs ---")
admin_list = list_admin_avails(admin=admin, db=db)
assert len(admin_list["items"]) == 1
assert admin_list["kpis"]["pending_requests"] == 1
assert admin_list["kpis"]["approved_windows"] == 0
print(f"KPIs verified: total={admin_list['kpis']['total_windows']}, pending={admin_list['kpis']['pending_requests']}")

# Test 4: Admin reviews and approves Faculty 1 submission
print("\n--- Test 4: Admin reviews and approves window ---")
rev_req = main.FacultyAvailabilityReview(
    action="approve",
    admin_remarks="Approved for Semester 1 morning slots"
)
rev_res = review_avail(avail_id=f1_res["id"], payload=rev_req, admin=admin, db=db)
assert rev_res["status"] == "approved"
assert rev_res["reviewed_by_id"] == admin.id
assert rev_res["admin_remarks"] == "Approved for Semester 1 morning slots"
print(f"Approved: ID={rev_res['id']}, Status={rev_res['status']}, Reviewer={rev_res['reviewed_by_name']}")

# Test 5: Admin creates a direct blackout window for Faculty 2 (e.g. Wednesday 14:00 - 18:00 blackout)
print("\n--- Test 5: Admin directly creates blackout window ---")
adm_req = main.FacultyAvailabilityCreate(
    faculty_id=fac2.id,
    day_of_week=2, # Wednesday
    start_time="14:00",
    end_time="18:00",
    is_available=False,
    notes="Industry consulting commitment - blackout"
)
adm_res = create_admin_avail(payload=adm_req, admin=admin, db=db)
assert adm_res["status"] == "approved"
assert adm_res["is_available"] == False
assert adm_res["faculty_id"] == fac2.id
print(f"Admin created window: ID={adm_res['id']}, is_available={adm_res['is_available']}, Notes={adm_res['notes']}")

# Test 6: Verify updated KPIs
print("\n--- Test 6: Check updated KPIs ---")
admin_list2 = list_admin_avails(admin=admin, db=db)
assert len(admin_list2["items"]) == 2
assert admin_list2["kpis"]["total_windows"] == 2
assert admin_list2["kpis"]["approved_windows"] == 1
assert admin_list2["kpis"]["blackout_windows"] == 1
assert admin_list2["kpis"]["pending_requests"] == 0
assert admin_list2["kpis"]["faculty_covered"] == 2
print("KPIs successfully updated and verified!")

# Test 7: Admin updates Faculty 2 window
print("\n--- Test 7: Admin updates window timing ---")
upd_req = main.FacultyAvailabilityUpdate(
    start_time="13:30",
    end_time="17:30",
    notes="Updated blackout time window"
)
upd_res = update_admin_avail(avail_id=adm_res["id"], payload=upd_req, admin=admin, db=db)
assert upd_res["start_time"] == "13:30"
assert upd_res["end_time"] == "17:30"
assert upd_res["notes"] == "Updated blackout time window"
print(f"Updated successfully: {upd_res['start_time']} - {upd_res['end_time']}")

# Test 8: Admin deletes Faculty 2 window
print("\n--- Test 8: Admin deletes window ---")
del_res = delete_avail(avail_id=adm_res["id"], admin=admin, db=db)
print(f"Delete response: {del_res}")
admin_list3 = list_admin_avails(admin=admin, db=db)
assert len(admin_list3["items"]) == 1
assert admin_list3["kpis"]["total_windows"] == 1
print("Window deletion verified successfully!")

print("\n==================================================")
print("ALL PHASE 8 BACKEND TESTS PASSED SUCCESSFULLY! (100%)")
print("==================================================")
