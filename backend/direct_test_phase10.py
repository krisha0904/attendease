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

print("Setting up Phase 10 in-memory test database...")
engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
models.Base.metadata.create_all(bind=engine)
Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = Session()

# 1. Setup College, Admin, Departments, and Faculty
college = models.College(name="Apex Institute of Technology", code="APEX_P10", is_active=True)
db.add(college)
db.commit()

admin = models.User(
    college_id=college.id,
    employee_id="ADM-2026-P10",
    full_name="Dean Administration",
    email="dean.admin@apex.edu",
    username="dean.admin",
    password_hash=hash_password("SuperSecretPass123"),
    role=models.UserRole.SUPER_ADMIN,
    is_active=True,
)
db.add(admin)

dept_cs = models.Department(
    college_id=college.id,
    name="Computer Science & Engineering",
    code="CSE",
    is_active=True,
)
dept_ec = models.Department(
    college_id=college.id,
    name="Electronics & Communication",
    code="ECE",
    is_active=True,
)
db.add_all([dept_cs, dept_ec])
db.commit()

# Primary Faculty (needs replacement for lecture)
fac_primary = models.User(
    college_id=college.id,
    employee_id="FAC-2026-CS01",
    full_name="Prof. John von Neumann",
    email="neumann@apex.edu",
    username="john.neumann",
    department_id=dept_cs.id,
    password_hash=hash_password("NeumannPass123"),
    role=models.UserRole.FACULTY,
    designation="Senior Professor",
    is_active=True,
)
# Candidate 1: Same department, available (Match score 100%)
fac_sub1 = models.User(
    college_id=college.id,
    employee_id="FAC-2026-CS02",
    full_name="Prof. Claude Shannon",
    email="shannon@apex.edu",
    username="claude.shannon",
    department_id=dept_cs.id,
    password_hash=hash_password("ShannonPass123"),
    role=models.UserRole.FACULTY,
    designation="Associate Professor",
    is_active=True,
)
# Candidate 2: Different department, available (Match score 80%)
fac_sub2 = models.User(
    college_id=college.id,
    employee_id="FAC-2026-EC01",
    full_name="Prof. Guglielmo Marconi",
    email="marconi@apex.edu",
    username="guglielmo.marconi",
    department_id=dept_ec.id,
    password_hash=hash_password("MarconiPass123"),
    role=models.UserRole.FACULTY,
    designation="Visiting Professor",
    is_active=True,
)
# Candidate 3: Same department, but has conflicting lecture at same time (Ineligible)
fac_sub3 = models.User(
    college_id=college.id,
    employee_id="FAC-2026-CS03",
    full_name="Prof. Norbert Wiener",
    email="wiener@apex.edu",
    username="norbert.wiener",
    department_id=dept_cs.id,
    password_hash=hash_password("WienerPass123"),
    role=models.UserRole.FACULTY,
    designation="Adjunct Professor",
    is_active=True,
)
db.add_all([fac_primary, fac_sub1, fac_sub2, fac_sub3])
db.commit()

# Primary Faculty's Lecture on Tuesday (1) at 10:00 - 11:30
lec_primary = models.WeeklyLecture(
    college_id=college.id,
    department_id=dept_cs.id,
    user_id=fac_primary.id,
    subject="Computer Architecture & von Neumann Model",
    course_name="B.Tech CS",
    day_of_week=1, # Tuesday
    start_time=time(10, 0),
    end_time=time(11, 30),
    room="Hall 201",
    is_active=True,
)
# Norbert Wiener's conflicting lecture on Tuesday (1) at 10:30 - 12:00
lec_conflict = models.WeeklyLecture(
    college_id=college.id,
    department_id=dept_cs.id,
    user_id=fac_sub3.id,
    subject="Cybernetics & Systems",
    course_name="B.Tech CS",
    day_of_week=1, # Tuesday
    start_time=time(10, 30),
    end_time=time(12, 0),
    room="Hall 105",
    is_active=True,
)
db.add_all([lec_primary, lec_conflict])
db.commit()

print(f"Entities created: College={college.id}, Admin={admin.id}, Lectures={lec_primary.id}, {lec_conflict.id}")

app = main.create_app()

def get_route(path, method="GET"):
    for r in app.routes:
        if getattr(r, "path", None) == path and method.upper() in getattr(r, "methods", set()):
            return r.endpoint
    raise ValueError(f"Route {method} {path} not found")

get_eligible_subs = get_route("/admin/substitutes/eligible-faculty", "GET")
assign_sub = get_route("/admin/substitutes/assign", "POST")
list_subs = get_route("/admin/substitutes", "GET")
ack_sub_admin = get_route("/admin/substitutes/{sub_id}/acknowledge", "POST")
revoke_sub = get_route("/admin/substitutes/{sub_id}", "DELETE")
get_my_subs = get_route("/substitutes/mine", "GET")
respond_sub_fac = get_route("/substitutes/{sub_id}/respond", "POST")

dummy_req = MagicMock()
dummy_req.client.host = "127.0.0.1"

# Target date: next Tuesday
today = date.today()
tuesday = today + timedelta(days=((1 - today.weekday()) % 7))
if tuesday <= today:
    tuesday += timedelta(days=7)

# Test 1: Discover eligible substitute candidates
print(f"\n--- Test 1: Query eligible substitute faculty for lecture #{lec_primary.id} on {tuesday} ---")
elig_res = get_eligible_subs(lecture_id=lec_primary.id, lecture_date=tuesday, admin=admin, db=db)
candidates = elig_res["candidates"]
print(f"Candidates returned: {len(candidates)}")
for c in candidates:
    print(f" - {c['full_name']} ({c['department_name']}): eligible={c['is_eligible']}, score={c['match_score']}, conflict={c['conflict_reason']}")

# Validate ranking and conflict detection
assert len(candidates) == 3
# Candidate 1 (Shannon): same dept, available -> match 100%
assert candidates[0]["full_name"] == "Prof. Claude Shannon"
assert candidates[0]["is_eligible"] == True
assert candidates[0]["match_score"] == 100

# Candidate 2 (Marconi): other dept, available -> match 80%
assert candidates[1]["full_name"] == "Prof. Guglielmo Marconi"
assert candidates[1]["is_eligible"] == True
assert candidates[1]["match_score"] == 80

# Candidate 3 (Wiener): has overlapping lecture -> ineligible (score 0%)
assert candidates[2]["full_name"] == "Prof. Norbert Wiener"
assert candidates[2]["is_eligible"] == False
assert "Schedule Conflict" in (candidates[2]["conflict_reason"] or "")

# Test 2: Attempt assignment of conflicting candidate (Wiener) -> should raise 409
print("\n--- Test 2: Attempt assignment of conflicting candidate (should fail with 409) ---")
try:
    bad_req = main.SubstituteAssignCreate(
        lecture_id=lec_primary.id,
        substitute_faculty_id=fac_sub3.id,
        lecture_date=tuesday,
        remarks="Should fail due to overlapping Cybernetics lecture",
    )
    assign_sub(payload=bad_req, request=dummy_req, admin=admin, db=db)
    assert False, "Expected 409 Conflict exception was not raised"
except Exception as e:
    print(f"Properly rejected with: {getattr(e, 'detail', str(e))}")
    assert getattr(e, "status_code", None) == 409

# Test 3: Successfully assign eligible substitute (Claude Shannon)
print("\n--- Test 3: Successfully assign Claude Shannon as substitute ---")
good_req = main.SubstituteAssignCreate(
    lecture_id=lec_primary.id,
    substitute_faculty_id=fac_sub1.id,
    lecture_date=tuesday,
    remarks="Covering Computer Architecture during von Neumann's keynote trip",
)
sub_res = assign_sub(payload=good_req, request=dummy_req, admin=admin, db=db)
print(f"Assigned successfully: ID={sub_res['id']}, Status={sub_res['status']}, Sub={sub_res['substitute_faculty_name']}")
assert sub_res["status"] == "pending"
assert sub_res["substitute_faculty_id"] == fac_sub1.id
assert sub_res["original_faculty_id"] == fac_primary.id
# Check WeeklyLecture directly updated
db.refresh(lec_primary)
assert lec_primary.substitute_faculty_id == fac_sub1.id

# Test 4: List assignments with live KPIs
print("\n--- Test 4: Admin lists assignments with KPIs ---")
subs_list = list_subs(admin=admin, db=db)
assert len(subs_list["items"]) == 1
assert subs_list["kpis"]["total_substitutions"] == 1
assert subs_list["kpis"]["pending_acknowledgements"] == 1
assert subs_list["kpis"]["active_substitutions"] == 0
print(f"KPIs verified: total={subs_list['kpis']['total_substitutions']}, pending={subs_list['kpis']['pending_acknowledgements']}")

# Test 5: Faculty self-service view and acknowledgement
print("\n--- Test 5: Faculty self-service view and accept response ---")
shannon_subs = get_my_subs(user=fac_sub1, db=db)
assert len(shannon_subs) == 1
assert shannon_subs[0]["id"] == sub_res["id"]

resp_req = main.SubstituteResponse(
    action="accept",
    remarks="Accepted. Course materials reviewed and ready for Tuesday.",
)
resp_res = respond_sub_fac(sub_id=sub_res["id"], payload=resp_req, user=fac_sub1, db=db)
assert resp_res["status"] == "accepted"
assert resp_res["response_remarks"] == "Accepted. Course materials reviewed and ready for Tuesday."
print(f"Faculty accepted assignment: Status={resp_res['status']}, Acknowledgement={resp_res['acknowledgement_at']}")

# Test 6: Updated KPIs reflect active assignment
print("\n--- Test 6: Verify updated KPIs after acceptance ---")
subs_list2 = list_subs(admin=admin, db=db)
assert subs_list2["kpis"]["pending_acknowledgements"] == 0
assert subs_list2["kpis"]["active_substitutions"] == 1
print("KPIs successfully updated after acceptance!")

# Test 7: Admin revokes substitute assignment
print("\n--- Test 7: Admin revokes substitution ---")
rev_res = revoke_sub(sub_id=sub_res["id"], admin=admin, db=db)
print(f"Revoke response: {rev_res}")
db.refresh(lec_primary)
assert lec_primary.substitute_faculty_id is None
subs_list3 = list_subs(admin=admin, db=db)
assert subs_list3["items"][0]["status"] == "revoked"
print("Revocation successfully cleared substitute linkage from lecture schedule!")

print("\n==================================================")
print("ALL PHASE 10 BACKEND TESTS PASSED SUCCESSFULLY! (100%)")
print("==================================================")
