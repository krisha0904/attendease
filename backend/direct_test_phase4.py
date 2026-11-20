import os
import sys

os.environ["ATTENDEASE_TESTING"] = "1"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret-key-with-at-least-32-characters"
os.environ["BIOMETRIC_ENCRYPTION_KEY"] = "uY_R1W1qQ43u-Xh4r-yNf4r1mZ0lVfA_R9FvV_D7m-k="

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import main
import models
from database import Base
from password_service import hash_password

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(bind=engine)
Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = Session()

# 1. Setup College, Admin, and Faculty
college = models.College(name="Apex Institute of Technology", code="APEX_P4", is_active=True)
db.add(college)
db.commit()

admin = models.User(
    college_id=college.id,
    employee_id="ADM-2026-001",
    full_name="Dean Academic",
    email="dean@apex.edu",
    username="dean.academic",
    password_hash=hash_password("SuperSecretPass123"),
    role=models.UserRole.SUPER_ADMIN,
    is_active=True,
)
db.add(admin)

faculty = models.User(
    college_id=college.id,
    employee_id="FAC-2026-001",
    full_name="Prof. Alan Turing",
    email="alan@apex.edu",
    username="alan.turing",
    password_hash=hash_password("AlanSecretPass123"),
    role=models.UserRole.FACULTY,
    designation="Visiting Professor",
    is_active=True,
)
db.add(faculty)
db.commit()

print("Setup completed. Running Phase 4 logic tests...")

app = main.create_app()

# Test 1: Department Management
# We find the route handler functions in app.routes
routes = {r.path: r.endpoint for r in app.routes if hasattr(r, "endpoint")}

create_dept = routes.get("/admin/academic/departments")
# Test create department
payload = main.DepartmentCreate(
    name="Computer Science & Engineering",
    code="CSE",
    description="Department of CS",
    hod_id=faculty.id,
    is_active=True,
)
res1 = routes["/admin/academic/departments"](payload=payload, admin=admin, db=db)
assert res1["code"] == "CSE"
dept_id = res1["id"]
print("✓ Create Department: PASSED (id=", dept_id, ")")

# List departments
res_list = routes["/admin/academic/departments"](search=None, status_filter="all", admin=admin, db=db)
assert res_list["summary"]["total_departments"] == 1
assert res_list["items"][0]["hod_name"] == "Prof. Alan Turing"
print("✓ List Departments & HOD Mapping: PASSED")

# Assign faculty to department
assign_dept_fac = routes["/admin/academic/departments/{dept_id}/assign-faculty"]
res_assign = assign_dept_fac(dept_id=dept_id, payload=main.DepartmentAssignFaculty(faculty_ids=[faculty.id]), admin=admin, db=db)
assert res_assign["assigned_count"] == 1
print("✓ Assign Faculty to Department: PASSED")

# Get department faculty
get_dept_fac = routes["/admin/academic/departments/{dept_id}/faculty"]
res_fac_list = get_dept_fac(dept_id=dept_id, admin=admin, db=db)
assert len(res_fac_list) == 1
assert res_fac_list[0]["full_name"] == "Prof. Alan Turing"
assert res_fac_list[0]["is_hod"] is True
print("✓ Department Faculty Roster: PASSED")

# Toggle department status
toggle_dept = routes["/admin/academic/departments/{dept_id}/status"]
res_tog = toggle_dept(dept_id=dept_id, admin=admin, db=db)
assert res_tog["is_active"] is False
toggle_dept(dept_id=dept_id, admin=admin, db=db)
print("✓ Toggle Department Status: PASSED")

# Test 2: Course & Subject Management
create_course = routes["/admin/academic/courses"]
c_payload = main.CourseCreate(
    name="B.Tech Computer Science",
    code="BTECH-CS",
    department_id=dept_id,
    duration_years=4,
    total_semesters=8,
    description="4-year engineering program",
    is_active=True,
)
res_c = create_course(payload=c_payload, admin=admin, db=db)
course_id = res_c["id"]
assert res_c["code"] == "BTECH-CS"
print("✓ Create Course: PASSED (id=", course_id, ")")

list_courses = routes["/admin/academic/courses"]
c_list = list_courses(department_id=None, search=None, status_filter="all", admin=admin, db=db)
assert len(c_list["items"]) == 1
assert c_list["items"][0]["name"] == "B.Tech Computer Science"
print("✓ List Courses: PASSED")

# Create Subject
create_subject = routes["/admin/academic/subjects"]
sub_payload = main.SubjectCreate(
    name="Advanced Data Structures",
    code="CS301",
    department_id=dept_id,
    course_id=course_id,
    semester=3,
    credits=4,
    subject_type="Theory",
    is_active=True,
)
res_sub = create_subject(payload=sub_payload, admin=admin, db=db)
sub_id = res_sub["id"]
assert res_sub["code"] == "CS301"
print("✓ Create Subject: PASSED (id=", sub_id, ")")

# Assign Faculty to Subject
assign_sub_fac = routes["/admin/academic/subjects/{subject_id}/assign-faculty"]
res_sub_assign = assign_sub_fac(subject_id=sub_id, payload=main.SubjectAssignFaculty(faculty_ids=[faculty.id]), admin=admin, db=db)
print("✓ Assign Faculty to Subject: PASSED")

list_subjects = routes["/admin/academic/subjects"]
sub_list = list_subjects(department_id=None, course_id=None, semester=None, subject_type=None, status_filter="all", search=None, admin=admin, db=db)
assert len(sub_list["items"]) == 1
assert len(sub_list["items"][0]["assigned_faculty"]) == 1
assert sub_list["items"][0]["assigned_faculty"][0]["full_name"] == "Prof. Alan Turing"
print("✓ List Subjects & Assigned Visiting Faculty: PASSED")

# Test 3: Academic Year
create_ay = routes["/admin/academic/academic-years"]
ay_payload = main.AcademicYearCreate(
    name="Academic Year 2025-2026",
    start_date="2025-07-01",
    end_date="2026-06-30",
    is_current=True,
)
res_ay = create_ay(payload=ay_payload, admin=admin, db=db)
ay_id = res_ay["id"]
assert res_ay["is_current"] is True
print("✓ Create Academic Year: PASSED (id=", ay_id, ")")

list_ay = routes["/admin/academic/academic-years"]
ay_list = list_ay(admin=admin, db=db)
assert len(ay_list) == 1
assert ay_list[0]["is_current"] is True
print("✓ List Academic Years: PASSED")

archive_ay = routes["/admin/academic/academic-years/{ay_id}/archive"]
res_arch = archive_ay(ay_id=ay_id, admin=admin, db=db)
assert res_arch["is_archived"] is True
print("✓ Archive Academic Year: PASSED")

# Test 4: Classroom Management
create_room = routes["/admin/academic/classrooms"]
room_payload = main.ClassroomCreate(
    room_number="LH-101",
    building="Main Block",
    floor="1st Floor",
    capacity=80,
    room_type="Lecture Hall",
    is_active=True,
)
res_room = create_room(payload=room_payload, admin=admin, db=db)
room_id = res_room["id"]
assert res_room["room_number"] == "LH-101"
print("✓ Create Classroom: PASSED (id=", room_id, ")")

list_rooms = routes["/admin/academic/classrooms"]
room_list = list_rooms(search=None, room_type=None, status_filter="all", admin=admin, db=db)
assert room_list["summary"]["total_classrooms"] == 1
assert room_list["summary"]["total_capacity"] == 80
print("✓ List Classrooms & Capacity Calculation: PASSED")

# Test 5: Holiday Management
create_holiday = routes["/admin/academic/holidays"]
h_payload = main.HolidayCreate(
    name="Independence Day",
    date="2026-08-15",
    description="National Holiday",
)
res_h = create_holiday(payload=h_payload, admin=admin, db=db)
h_id = res_h["id"]
assert res_h["name"] == "Independence Day"
print("✓ Create Holiday: PASSED (id=", h_id, ")")

list_holidays = routes["/admin/academic/holidays"]
h_list = list_holidays(admin=admin, db=db)
assert len(h_list) == 1
assert h_list[0]["name"] == "Independence Day"
print("✓ List Holidays: PASSED")

delete_holiday = routes["/admin/academic/holidays/{holiday_id}"]
res_del = delete_holiday(holiday_id=h_id, admin=admin, db=db)
assert res_del["message"] == "Holiday deleted successfully."
print("✓ Delete Holiday: PASSED")

db.close()
print("\n" + "=" * 60)
print("ALL PHASE 4 BACKEND LOGIC & SCHEMAS TESTED AND VERIFIED 100%!")
print("=" * 60)

