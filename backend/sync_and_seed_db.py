import os
import sys
from datetime import date, datetime, time, timedelta

# Ensure local dev DB is used
if "ATTENDEASE_TESTING" in os.environ:
    del os.environ["ATTENDEASE_TESTING"]

if "BIOMETRIC_ENCRYPTION_KEY" not in os.environ:
    os.environ["BIOMETRIC_ENCRYPTION_KEY"] = "uY_R1W1qQ43u-Xh4r-yNf4r1mZ0lVfA_R9FvV_D7m-k="

import models
import database
import sqlite3
from password_service import hash_password
import face_service
import numpy as np

print(f"Connecting to database via engine: {database.engine.url}...")
from sqlalchemy import inspect, text

inspector = inspect(database.engine)
existing_tables = set(inspector.get_table_names())
is_sqlite = getattr(database.engine, "dialect", None) and database.engine.dialect.name == "sqlite"
quote = '"' if is_sqlite else '`'

# 1. Add missing columns to existing tables if missing
alterations = [
    ("colleges", "timezone", "VARCHAR(50) DEFAULT 'Asia/Kolkata'"),
    ("departments", "hod_id", "INTEGER"),
    ("users", "username", "VARCHAR(150)"),
    ("users", "email_verified", "BOOLEAN DEFAULT 1"),
    ("users", "account_status", "VARCHAR(20) DEFAULT 'active'"),
    ("users", "gender", "VARCHAR(20)"),
    ("users", "qualification", "VARCHAR(255)"),
    ("users", "specialization", "VARCHAR(255)"),
    ("users", "experience_years", "FLOAT"),
    ("users", "address", "TEXT"),
    ("attendance_policies", "face_match_threshold", "FLOAT DEFAULT 0.363"),
    ("attendance_policies", "lecture_punch_in_window_minutes", "INTEGER DEFAULT 15"),
    ("attendance_policies", "lecture_punch_out_window_minutes", "INTEGER DEFAULT 15"),
    ("notifications", "priority", "VARCHAR(20) DEFAULT 'normal'"),
    ("notifications", "read_at", "DATETIME"),
    ("attendance_records", "is_manual_override", "BOOLEAN DEFAULT 0"),
    ("attendance_records", "override_reason", "TEXT"),
    ("attendance_records", "overridden_by_id", "INTEGER"),
    ("attendance_records", "overridden_at", "DATETIME"),
]

with database.engine.connect() as conn:
    for table, col, col_def in alterations:
        if table in existing_tables:
            try:
                table_cols = {c["name"] for c in inspector.get_columns(table)}
                if col not in table_cols:
                    conn.execute(text(f"ALTER TABLE {quote}{table}{quote} ADD COLUMN {quote}{col}{quote} {col_def}"))
                    conn.commit()
                    print(f"Added column: {table}.{col}")
            except Exception as e:
                print(f"Notice altering {table}.{col}: {e}")

# 2. Create all missing tables using SQLAlchemy models
print("Creating any missing tables in database...")
models.Base.metadata.create_all(bind=database.engine)
print("All tables successfully synced!")

# 3. Seed Institutional Data
from sqlalchemy.orm import sessionmaker
Session = sessionmaker(bind=database.engine)
db = Session()

# Check or create College
college = db.query(models.College).first()
if not college:
    college = models.College(
        name="Apex Institute of Technology",
        code="APEX-INST",
        address="100 Academic Avenue, Tech City, Gujarat 380009",
        phone="+91 79 2397 5000",
        email="info@apex.edu",
        website="https://apex.edu",
        timezone="Asia/Kolkata",
        subscription_plan="enterprise",
        is_active=True,
    )
    db.add(college)
    db.commit()
    db.refresh(college)
else:
    college.name = "Apex Institute of Technology"
    college.code = "APEX-INST"
    college.address = "100 Academic Avenue, Tech City, Gujarat 380009"
    college.phone = "+91 79 2397 5000"
    college.email = "info@apex.edu"
    college.website = "https://apex.edu"
    college.timezone = "Asia/Kolkata"
    db.commit()

# College Location & GPS Geofence
loc = db.query(models.CollegeLocation).filter(models.CollegeLocation.college_id == college.id).first()
if not loc:
    loc = models.CollegeLocation(
        college_id=college.id,
        name="Apex Institute Main Campus",
        latitude=23.022500,
        longitude=72.571400,
        geofence_radius=100.0,
        min_gps_accuracy=50.0,
        is_active=True,
    )
    db.add(loc)
    db.commit()

# Attendance Policy
pol = db.query(models.AttendancePolicy).filter(models.AttendancePolicy.college_id == college.id).first()
if not pol:
    pol = models.AttendancePolicy(
        college_id=college.id,
        require_face_for_punch_in=True,
        require_face_for_punch_out=True,
        require_face_for_breaks=False,
        require_gps_for_punch_in=True,
        require_gps_for_punch_out=True,
        face_match_threshold=0.363,
        lecture_punch_in_window_minutes=15,
        lecture_punch_out_window_minutes=15,
        max_otp_attempts=3,
        otp_validity_minutes=5,
        otp_resend_cooldown_seconds=60,
        is_active=True,
    )
    db.add(pol)
    db.commit()

# Leave Types
default_leaves = [
    ("Casual Leave", "CL", 12, True, False),
    ("Medical Leave", "ML", 10, True, True),
    ("Duty Leave", "DL", 15, True, True),
    ("Earned Leave", "EL", 30, True, False),
    ("Compensatory Off", "CO", 5, True, False),
    ("Leave Without Pay", "LWP", 90, False, False),
]
for lt_name, lt_code, max_d, paid, doc_req in default_leaves:
    exist_lt = db.query(models.LeaveType).filter(models.LeaveType.college_id == college.id, models.LeaveType.code == lt_code).first()
    if not exist_lt:
        db.add(models.LeaveType(
            college_id=college.id,
            name=lt_name,
            code=lt_code,
            max_days_per_year=max_d,
            is_paid=paid,
            requires_document=doc_req,
            is_active=True,
        ))
db.commit()

# Working Shift
shift = db.query(models.WorkingShift).filter(models.WorkingShift.college_id == college.id).first()
if not shift:
    shift = models.WorkingShift(
        college_id=college.id,
        name="Standard Academic Shift",
        start_time=time(9, 0),
        end_time=time(17, 0),
        grace_period_minutes=15,
        half_day_minutes=240,
        full_day_minutes=360,
        max_break_minutes=60,
        is_active=True,
    )
    db.add(shift)
    db.commit()
    db.refresh(shift)

# Departments
dept_data = [
    ("Computer Science & Engineering", "CSE", "Core computing and software engineering disciplines"),
    ("Information Technology", "IT", "Network systems, cloud computing, and cybersecurity"),
    ("Electronics & Communication", "ECE", "Embedded systems, VLSI, and signal processing"),
    ("Mechanical Engineering", "MECH", "Thermodynamics, robotics, and industrial design"),
]
dept_map = {}
for d_name, d_code, d_desc in dept_data:
    d = db.query(models.Department).filter(models.Department.college_id == college.id, models.Department.code == d_code).first()
    if not d:
        d = models.Department(college_id=college.id, name=d_name, code=d_code, description=d_desc, is_active=True)
        db.add(d)
        db.commit()
        db.refresh(d)
    dept_map[d_code] = d

# Academic Years
ay = db.query(models.AcademicYear).filter(models.AcademicYear.college_id == college.id, models.AcademicYear.name == "Academic Year 2025-2026").first()
if not ay:
    ay = models.AcademicYear(
        college_id=college.id,
        name="Academic Year 2025-2026",
        start_date=date(2025, 7, 1),
        end_date=date(2026, 6, 30),
        is_current=True,
    )
    db.add(ay)
    db.commit()
    db.refresh(ay)

# Classrooms
rooms_data = [
    ("LH-101", "Academic Block A", "1st Floor", 80, "Lecture Hall"),
    ("LH-102", "Academic Block A", "1st Floor", 80, "Lecture Hall"),
    ("LAB-201", "Computing Center", "2nd Floor", 45, "Computer Laboratory"),
    ("SEM-301", "Main Auditorium Block", "3rd Floor", 120, "Seminar Hall"),
]
room_map = {}
for r_num, bld, flr, cap, r_type in rooms_data:
    r = db.query(models.Classroom).filter(models.Classroom.college_id == college.id, models.Classroom.room_number == r_num).first()
    if not r:
        r = models.Classroom(college_id=college.id, room_number=r_num, building=bld, floor=flr, capacity=cap, room_type=r_type, is_active=True)
        db.add(r)
        db.commit()
        db.refresh(r)
    room_map[r_num] = r

# Courses & Subjects
course_cse = db.query(models.Course).filter(models.Course.college_id == college.id, models.Course.code == "BTECH-CSE").first()
if not course_cse:
    course_cse = models.Course(
        college_id=college.id,
        department_id=dept_map["CSE"].id,
        name="B.Tech Computer Science & Engineering",
        code="BTECH-CSE",
        duration_years=4,
        total_semesters=8,
        description="Undergraduate Degree Program in Computer Science",
        is_active=True,
    )
    db.add(course_cse)
    db.commit()
    db.refresh(course_cse)

subjects_data = [
    ("Data Structures & Algorithms", "CS-301", 3, 4, "Core"),
    ("Operating Systems & Kernel Architecture", "CS-302", 3, 4, "Core"),
    ("Machine Learning & Deep Learning", "CS-501", 5, 4, "Elective"),
    ("Cloud Computing & Distributed Systems", "CS-502", 5, 3, "Elective"),
]
subj_map = {}
for s_name, s_code, sem, cred, s_type in subjects_data:
    s = db.query(models.Subject).filter(models.Subject.college_id == college.id, models.Subject.code == s_code).first()
    if not s:
        s = models.Subject(
            college_id=college.id,
            department_id=dept_map["CSE"].id,
            course_id=course_cse.id,
            name=s_name,
            code=s_code,
            semester=sem,
            credits=cred,
            subject_type=s_type,
            is_active=True,
        )
        db.add(s)
        db.commit()
        db.refresh(s)
    subj_map[s_code] = s

# Users: Super Admin, HOD, and Visiting Faculty
users_data = [
    {
        "full_name": "Campus Administrator",
        "email": "admin@apex.edu",
        "username": "admin_super",
        "employee_id": "ADM-001",
        "role": models.UserRole.SUPER_ADMIN,
        "dept_code": None,
        "designation": "Director of Administration",
        "password": "Password@123",
    },
    {
        "full_name": "Dr. Arvind Mehta",
        "email": "hod.cse@apex.edu",
        "username": "hod_cse",
        "employee_id": "HOD-CSE-01",
        "role": models.UserRole.HOD,
        "dept_code": "CSE",
        "designation": "Head of Department (CSE)",
        "password": "Password@123",
    },
    {
        "full_name": "Dr. Rajesh Sharma",
        "email": "rajesh.sharma@apex.edu",
        "username": "rajesh.sharma",
        "employee_id": "VF-2025-001",
        "role": models.UserRole.FACULTY,
        "dept_code": "CSE",
        "designation": "Visiting Professor",
        "password": "Password@123",
        "specialization": "Data Structures & Cloud Architecture",
        "qualification": "Ph.D. Computer Science",
        "experience_years": 14.5,
    },
    {
        "full_name": "Prof. Anita Desai",
        "email": "anita.desai@apex.edu",
        "username": "anita.desai",
        "employee_id": "VF-2025-002",
        "role": models.UserRole.FACULTY,
        "dept_code": "CSE",
        "designation": "Adjunct Professor",
        "password": "Password@123",
        "specialization": "Machine Learning & AI",
        "qualification": "M.Tech Software Engineering",
        "experience_years": 8.0,
    },
]

user_map = {}
for u_dict in users_data:
    u = db.query(models.User).filter(models.User.email == u_dict["email"]).first()
    if not u:
        u = models.User(
            college_id=college.id,
            department_id=dept_map[u_dict["dept_code"]].id if u_dict["dept_code"] else None,
            shift_id=shift.id,
            employee_id=u_dict["employee_id"],
            full_name=u_dict["full_name"],
            email=u_dict["email"],
            username=u_dict["username"],
            password_hash=hash_password(u_dict["password"]),
            role=u_dict["role"],
            designation=u_dict["designation"],
            specialization=u_dict.get("specialization"),
            qualification=u_dict.get("qualification"),
            experience_years=u_dict.get("experience_years"),
            is_active=True,
            email_verified=True,
            account_status="active",
        )
        db.add(u)
        db.commit()
        db.refresh(u)
    else:
        u.role = u_dict["role"]
        u.username = u_dict["username"]
        u.password_hash = hash_password(u_dict["password"])
        u.is_active = True
        u.email_verified = True
        u.account_status = "active"
        db.commit()
    user_map[u_dict["username"]] = u

# Link HOD to Department
dept_map["CSE"].hod_id = user_map["hod_cse"].id
db.commit()

# Setup Biometric Template for Dr. Rajesh Sharma & Prof. Anita Desai
for uname in ["rajesh.sharma", "anita.desai"]:
    u_obj = user_map[uname]
    tpl = db.query(models.BiometricTemplate).filter(models.BiometricTemplate.user_id == u_obj.id).first()
    if not tpl:
        # Generate normalized 128-d mock embedding vector
        np.random.seed(u_obj.id + 42)
        v = np.random.randn(128).astype(np.float32)
        v = v / np.linalg.norm(v)
        encrypted_v = face_service.encrypt_embedding(v)

        tpl = models.BiometricTemplate(
            user_id=u_obj.id,
            college_id=college.id,
            face_embedding=encrypted_v,
            enrollment_status=models.BiometricStatus.APPROVED,
            approved_by=user_map["admin_super"].id,
            approved_at=datetime.utcnow(),
        )
        db.add(tpl)
        u_obj.face_enrolled = True
        u_obj.face_enrollment_status = models.BiometricStatus.APPROVED
        db.commit()

# Setup Faculty Payment Rate Matrix
rate = db.query(models.FacultyPaymentRate).filter(models.FacultyPaymentRate.college_id == college.id).first()
if not rate:
    db.add(models.FacultyPaymentRate(
        college_id=college.id,
        rate_per_lecture=1500.0,
        rate_per_hour=1000.0,
        effective_from=date(2025, 7, 1),
    ))
    db.commit()

# Setup Weekly Lecture Timetable
for fid, s_code, r_num, dow, st, et in [
    (user_map["rajesh.sharma"].id, "CS-301", "LH-101", 0, time(9, 30), time(11, 0)),
    (user_map["anita.desai"].id, "CS-501", "LAB-201", 0, time(11, 30), time(13, 0)),
    (user_map["rajesh.sharma"].id, "CS-502", "LH-102", 1, time(10, 0), time(11, 30)),
    (user_map["rajesh.sharma"].id, "CS-301", "LH-101", 2, time(9, 30), time(11, 0)),
    (user_map["anita.desai"].id, "CS-501", "LAB-201", 3, time(14, 0), time(15, 30)),
]:
    s_obj = subj_map[s_code]
    r_obj = room_map[r_num]
    lec = db.query(models.WeeklyLecture).filter(
        models.WeeklyLecture.college_id == college.id,
        models.WeeklyLecture.user_id == fid,
        models.WeeklyLecture.day_of_week == dow,
        models.WeeklyLecture.start_time == st,
    ).first()
    if not lec:
        db.add(models.WeeklyLecture(
            college_id=college.id,
            department_id=dept_map["CSE"].id,
            user_id=fid,
            subject=s_obj.name,
            subject_id=s_obj.id,
            course_name=course_cse.name,
            course_id=course_cse.id,
            room=r_obj.room_number,
            classroom_id=r_obj.id,
            day_of_week=dow,
            start_time=st,
            end_time=et,
            is_active=True,
        ))
db.commit()

# Setup Sample Delivered Attendance Records for Past Lectures
today = date.today()
for days_ago in range(1, 6):
    past_date = today - timedelta(days=days_ago)
    if past_date.weekday() < 5:  # Mon - Fri
        # Workday record
        att_rec = db.query(models.AttendanceRecord).filter(
            models.AttendanceRecord.college_id == college.id,
            models.AttendanceRecord.user_id == user_map["rajesh.sharma"].id,
            models.AttendanceRecord.date == past_date,
        ).first()
        if not att_rec:
            punch_in = datetime.combine(past_date, time(9, 15))
            punch_out = datetime.combine(past_date, time(16, 45))
            db.add(models.AttendanceRecord(
                college_id=college.id,
                user_id=user_map["rajesh.sharma"].id,
                date=past_date,
                status=models.AttendanceStatus.PRESENT,
                punch_in_time=punch_in,
                punch_out_time=punch_out,
                total_working_minutes=450,
                net_working_minutes=450,
                punch_in_face_verified=True,
                punch_in_gps_verified=True,
                punch_out_face_verified=True,
                punch_out_gps_verified=True,
            ))
            # Lecture attendance record
            db.add(models.LectureAttendanceRecord(
                college_id=college.id,
                user_id=user_map["rajesh.sharma"].id,
                weekly_lecture_id=1,
                lecture_date=past_date,
                punch_in_time=datetime.combine(past_date, time(9, 25)),
                punch_out_time=datetime.combine(past_date, time(11, 0)),
                punch_in_face_verified=True,
                punch_out_face_verified=True,
            ))
db.commit()

# Setup Announcements
db.add(models.Announcement(
    college_id=college.id,
    created_by_id=user_map["admin_super"].id,
    title="Mid-Semester Biometric Punch Compliance Notice",
    message="All visiting faculty are requested to ensure SFace biometrics are authenticated at scheduled classroom entry.",
    type="info",
    priority="normal",
    is_active=True,
))
db.commit()

# Setup Audit Log entry
db.add(models.AuditLog(
    college_id=college.id,
    user_id=user_map["admin_super"].id,
    action="SYSTEM_INIT_AND_SEED",
    resource_type="Database",
    new_value={"status": "INITIALIZED_AND_SEEDED", "college": college.name},
    ip_address="127.0.0.1",
))
db.commit()

print("\n" + "=" * 60)
print("DATABASE FULLY SYNCHRONIZED AND INSTITUTIONAL DATA SEEDED!")
print(f"College: {college.name} ({college.code})")
print(f"Super Admin Login:  admin@apex.edu  /  Password@123  (Username: admin_super)")
print(f"Department HOD:     hod.cse@apex.edu / Password@123  (Username: hod_cse)")
print(f"Visiting Faculty:   rajesh.sharma@apex.edu / Password@123")
print(f"Visiting Faculty:   anita.desai@apex.edu / Password@123")
print("=" * 60)
