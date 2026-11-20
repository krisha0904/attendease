import os
import sys

# Ensure in-memory testing DB is used
os.environ["ATTENDEASE_TESTING"] = "1"

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import models
import main
from password_service import hash_password

print("Setting up Phase 5 in-memory test database...")
engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
models.Base.metadata.create_all(bind=engine)
Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = Session()

# 1. Setup College, Admin, and 2 Faculty Members
college = models.College(name="Apex Engineering Institute", code="APEX_P5", is_active=True)
db.add(college)
db.commit()

admin = models.User(
    college_id=college.id,
    employee_id="ADM-2026-P5",
    full_name="Dean Timetable",
    email="dean.tt@apex.edu",
    username="dean.tt",
    password_hash=hash_password("SuperSecretPass123"),
    role=models.UserRole.SUPER_ADMIN,
    is_active=True,
)
db.add(admin)

fac1 = models.User(
    college_id=college.id,
    employee_id="FAC-2026-001",
    full_name="Dr. Nikola Tesla",
    email="tesla@apex.edu",
    username="nikola.tesla",
    password_hash=hash_password("TeslaPass123"),
    role=models.UserRole.FACULTY,
    designation="Visiting Professor",
    is_active=True,
)
fac2 = models.User(
    college_id=college.id,
    employee_id="FAC-2026-002",
    full_name="Dr. Marie Curie",
    email="curie@apex.edu",
    username="marie.curie",
    password_hash=hash_password("CuriePass123"),
    role=models.UserRole.FACULTY,
    designation="Visiting Professor",
    is_active=True,
)
db.add(fac1)
db.add(fac2)

# Department, Course, Subject, Classroom, Academic Year
dept = models.Department(
    college_id=college.id,
    name="Electrical & Electronics",
    code="EEE",
    is_active=True,
)
db.add(dept)
db.commit()

course = models.Course(
    college_id=college.id,
    department_id=dept.id,
    name="B.Tech Electrical",
    code="BTECH-EEE",
    duration_years=4,
    total_semesters=8,
    is_active=True,
)
db.add(course)
db.commit()

sub1 = models.Subject(
    college_id=college.id,
    department_id=dept.id,
    course_id=course.id,
    name="Electromagnetic Theory",
    code="EE301",
    semester=3,
    credits=4,
    subject_type="Theory",
    is_active=True,
)
sub2 = models.Subject(
    college_id=college.id,
    department_id=dept.id,
    course_id=course.id,
    name="Quantum Mechanics",
    code="EE302",
    semester=3,
    credits=3,
    subject_type="Theory",
    is_active=True,
)
db.add(sub1)
db.add(sub2)

from datetime import date, time

ay = models.AcademicYear(
    college_id=college.id,
    name="AY 2025-2026",
    start_date=date(2025, 7, 1),
    end_date=date(2026, 6, 30),
    is_current=True,
)
db.add(ay)

room1 = models.Classroom(
    college_id=college.id,
    room_number="Room 401",
    building="Tesla Wing",
    floor="4th Floor",
    capacity=60,
    room_type="Lecture Hall",
    is_active=True,
)
room2 = models.Classroom(
    college_id=college.id,
    room_number="Lab 102",
    building="Curie Complex",
    floor="1st Floor",
    capacity=30,
    room_type="Laboratory",
    is_active=True,
)
db.add(room1)
db.add(room2)
db.commit()

print("Setup completed. Running Phase 5 logic tests...")
app = main.create_app()

def get_route(path, method="GET"):
    for r in app.routes:
        if getattr(r, "path", None) == path and method.upper() in getattr(r, "methods", set()):
            return r.endpoint
    raise ValueError(f"Route {method} {path} not found")

create_lecture = get_route("/admin/timetable", "POST")
list_timetable = get_route("/admin/timetable", "GET")
get_matrix = get_route("/admin/timetable/matrix", "GET")
check_conflict = get_route("/admin/timetable/check-conflict", "POST")
update_lecture = get_route("/admin/timetable/{lecture_id}", "PUT")
update_status = get_route("/admin/timetable/{lecture_id}/status", "PATCH")
assign_sub = get_route("/admin/timetable/{lecture_id}/assign-substitute", "POST")
delete_lecture = get_route("/admin/timetable/{lecture_id}", "DELETE")

# 1. Test Create Lecture 1
from datetime import time
lec1_payload = main.WeeklyLectureCreate(
    user_id=fac1.id,
    department_id=dept.id,
    subject_id=sub1.id,
    course_id=course.id,
    academic_year_id=ay.id,
    classroom_id=room1.id,
    semester=3,
    lecture_type="Theory",
    day_of_week=0, # Monday
    start_time=time(9, 0),
    end_time=time(10, 30),
)
res1 = create_lecture(payload=lec1_payload, admin=admin, db=db)
lec1_id = res1["id"]
assert res1["subject"] == "Electromagnetic Theory"
assert res1["faculty_name"] == "Dr. Nikola Tesla"
assert res1["room_number"] == "Room 401"
print("✓ Create Lecture 1: PASSED (id=", lec1_id, ")")

# 2. Test Faculty Conflict Detection
# Try to schedule fac1 at 9:30 - 11:00 on Monday (overlaps 9:00 - 10:30) in room2
fac_clash_payload = main.WeeklyLectureCreate(
    user_id=fac1.id,
    department_id=dept.id,
    subject_id=sub2.id,
    classroom_id=room2.id,
    day_of_week=0,
    start_time=time(9, 30),
    end_time=time(11, 0),
)
caught_fac_conflict = False
try:
    create_lecture(payload=fac_clash_payload, admin=admin, db=db)
except main.HTTPException as exc:
    assert exc.status_code == 409
    assert "Faculty Conflict" in exc.detail
    caught_fac_conflict = True
assert caught_fac_conflict
print("✓ Faculty Overlap Conflict Detection: PASSED (409 Conflict correctly caught)")

# 3. Test Classroom Conflict Detection
# Try to schedule fac2 at 10:00 - 11:30 on Monday in room1 (overlaps 9:00 - 10:30)
room_clash_payload = main.WeeklyLectureCreate(
    user_id=fac2.id,
    department_id=dept.id,
    subject_id=sub2.id,
    classroom_id=room1.id,
    day_of_week=0,
    start_time=time(10, 0),
    end_time=time(11, 30),
)
caught_room_conflict = False
try:
    create_lecture(payload=room_clash_payload, admin=admin, db=db)
except main.HTTPException as exc:
    assert exc.status_code == 409
    assert "Classroom Conflict" in exc.detail
    caught_room_conflict = True
assert caught_room_conflict
print("✓ Classroom Overlap Conflict Detection: PASSED (409 Conflict correctly caught)")

# 4. Test Pre-flight Conflict Check Endpoint
pre_check_res = check_conflict(
    payload=main.WeeklyLectureConflictCheck(
        user_id=fac1.id,
        classroom_id=room2.id,
        day_of_week=0,
        start_time=time(9, 30),
        end_time=time(10, 30),
    ),
    admin=admin,
    db=db,
)
assert pre_check_res["has_conflict"] is True
assert pre_check_res["conflict_type"] == "faculty"
print("✓ Pre-flight Conflict Check API: PASSED")

# 5. Create Non-conflicting Lecture 2
lec2_payload = main.WeeklyLectureCreate(
    user_id=fac2.id,
    department_id=dept.id,
    subject_id=sub2.id,
    classroom_id=room2.id,
    day_of_week=0,
    start_time=time(11, 0),
    end_time=time(12, 30),
    lecture_type="Lab",
)
res2 = create_lecture(payload=lec2_payload, admin=admin, db=db)
lec2_id = res2["id"]
print("✓ Create Non-conflicting Lecture 2: PASSED (id=", lec2_id, ")")

# 6. Test List Timetable & Summary KPIs
tt_data = list_timetable(admin=admin, db=db)
assert len(tt_data["items"]) == 2
assert tt_data["summary"]["total_lectures"] == 2
assert tt_data["summary"]["assigned_faculty_count"] == 2
print("✓ List Timetable with Summary KPIs: PASSED")

# 7. Test Timetable Matrix Grouping
matrix_data = get_matrix(admin=admin, db=db)
monday_item = next(d for d in matrix_data["matrix"] if d["day_index"] == 0)
assert monday_item["total_sessions"] == 2
assert len(monday_item["lectures"]) == 2
print("✓ Timetable Matrix Day-Grouping: PASSED")

# 8. Test Update Timetable Entry
upd_res = update_lecture(
    lecture_id=lec2_id,
    payload=main.WeeklyLectureUpdate(
        start_time=time(14, 0),
        end_time=time(15, 30),
    ),
    admin=admin,
    db=db,
)
assert upd_res["start_time"] == "14:00"
assert upd_res["end_time"] == "15:30"
print("✓ Update Timetable Entry: PASSED")

# 9. Test Substitute Faculty Assignment
sub_res = assign_sub(
    lecture_id=lec1_id,
    payload=main.WeeklyLectureSubstituteUpdate(substitute_faculty_id=fac2.id),
    admin=admin,
    db=db,
)
assert sub_res["substitute_faculty_name"] == "Dr. Marie Curie"
print("✓ Assign Substitute Faculty: PASSED")

# 10. Test Status Update & Cancellation
status_res = update_status(
    lecture_id=lec1_id,
    payload=main.WeeklyLectureStatusUpdate(
        status="cancelled",
        cancellation_reason="National Conference",
    ),
    admin=admin,
    db=db,
)
assert status_res["status"] == "cancelled"
assert status_res["cancellation_reason"] == "National Conference"
print("✓ Status Lifecycle (Cancelled with Reason): PASSED")

# 11. Test Delete Entry
delete_lecture(lecture_id=lec2_id, admin=admin, db=db)
del_check = list_timetable(admin=admin, db=db)
assert len(del_check["items"]) == 1 # lec2 was deactivated
print("✓ Delete / Deactivate Timetable Entry: PASSED")

db.close()
print("\n" + "=" * 60)
print("ALL PHASE 5 LECTURE & TIMETABLE BACKEND TESTS PASSED 100%!")
print("=" * 60)
