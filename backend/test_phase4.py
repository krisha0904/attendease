import os
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SECRET_KEY"] = "test-secret-key-with-at-least-32-characters"
os.environ["BIOMETRIC_ENCRYPTION_KEY"] = "uY_R1W1qQ43u-Xh4r-yNf4r1mZ0lVfA_R9FvV_D7m-k="

import datetime
import secrets
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import main
import models
from database import Base, get_db
from password_service import hash_password


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "test-secret-key-with-at-least-32-characters")
    monkeypatch.setenv("BIOMETRIC_ENCRYPTION_KEY", "uY_R1W1qQ43u-Xh4r-yNf4r1mZ0lVfA_R9FvV_D7m-k=")
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    test_sessions = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    app = main.create_app()

    def override_get_db():
        db = test_sessions()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client, test_sessions
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


def setup_admin_and_faculty(db):
    college = models.College(name="Apex Institute of Technology", code="APEX4", is_active=True)
    db.add(college)
    db.flush()

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
    db.flush()

    now = main._utcnow()
    session = models.UserSession(
        user_id=admin.id,
        refresh_token_hash="token-hash-" + secrets.token_urlsafe(16),
        is_active=True,
        expires_at=now + datetime.timedelta(days=1),
        last_used=now,
    )
    db.add(session)
    db.commit()

    token = main._make_access_token(admin, session.id)
    return college.id, admin.id, faculty.id, token


def test_department_management(client):
    test_client, test_sessions = client
    with test_sessions() as db:
        college_id, admin_id, faculty_id, token = setup_admin_and_faculty(db)

    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create department
    res = test_client.post(
        "/admin/academic/departments",
        json={
            "name": "Computer Science & Engineering",
            "code": "CSE",
            "description": "Department of CS",
            "hod_id": faculty_id,
            "is_active": True,
        },
        headers=headers,
    )
    assert res.status_code == 201
    dept_id = res.json()["id"]

    # 2. Get departments
    res_list = test_client.get("/admin/academic/departments", headers=headers)
    assert res_list.status_code == 200
    data = res_list.json()
    assert data["summary"]["total_departments"] >= 1
    assert data["items"][0]["code"] == "CSE"
    assert data["items"][0]["hod_name"] == "Prof. Alan Turing"

    # 3. Assign faculty to department
    res_assign = test_client.post(
        f"/admin/academic/departments/{dept_id}/assign-faculty",
        json={"faculty_ids": [faculty_id]},
        headers=headers,
    )
    assert res_assign.status_code == 200

    # 4. View department faculty
    res_fac = test_client.get(f"/admin/academic/departments/{dept_id}/faculty", headers=headers)
    assert res_fac.status_code == 200
    assert len(res_fac.json()) == 1
    assert res_fac.json()[0]["full_name"] == "Prof. Alan Turing"

    # 5. Toggle department status
    res_toggle = test_client.patch(f"/admin/academic/departments/{dept_id}/status", headers=headers)
    assert res_toggle.status_code == 200
    assert res_toggle.json()["is_active"] is False


def test_course_and_subject_management(client):
    test_client, test_sessions = client
    with test_sessions() as db:
        college_id, admin_id, faculty_id, token = setup_admin_and_faculty(db)

    headers = {"Authorization": f"Bearer {token}"}

    # Create Department
    res_dept = test_client.post(
        "/admin/academic/departments",
        json={"name": "Information Technology", "code": "IT", "is_active": True},
        headers=headers,
    )
    dept_id = res_dept.json()["id"]

    # 1. Create Course
    res_c = test_client.post(
        "/admin/academic/courses",
        json={
            "name": "B.Tech Information Technology",
            "code": "BTECH-IT",
            "department_id": dept_id,
            "duration_years": 4,
            "total_semesters": 8,
            "description": "Undergrad 4-year degree",
            "is_active": True,
        },
        headers=headers,
    )
    assert res_c.status_code == 201
    course_id = res_c.json()["id"]

    # 2. Get Courses
    res_courses = test_client.get("/admin/academic/courses", headers=headers)
    assert res_courses.status_code == 200
    assert len(res_courses.json()["items"]) >= 1

    # 3. Create Subject
    res_sub = test_client.post(
        "/admin/academic/subjects",
        json={
            "name": "Database Management Systems",
            "code": "IT401",
            "department_id": dept_id,
            "course_id": course_id,
            "semester": 4,
            "credits": 4,
            "subject_type": "Theory",
            "is_active": True,
        },
        headers=headers,
    )
    assert res_sub.status_code == 201
    subject_id = res_sub.json()["id"]

    # 4. Assign faculty to subject
    res_sub_assign = test_client.post(
        f"/admin/academic/subjects/{subject_id}/assign-faculty",
        json={"faculty_ids": [faculty_id]},
        headers=headers,
    )
    assert res_sub_assign.status_code == 200

    # 5. List subjects
    res_subs = test_client.get("/admin/academic/subjects", headers=headers)
    assert res_subs.status_code == 200
    assert len(res_subs.json()["items"]) >= 1
    sub_item = [s for s in res_subs.json()["items"] if s["id"] == subject_id][0]
    assert sub_item["code"] == "IT401"
    assert len(sub_item["assigned_faculty"]) == 1
    assert sub_item["assigned_faculty"][0]["full_name"] == "Prof. Alan Turing"


def test_academic_year_classroom_and_holiday(client):
    test_client, test_sessions = client
    with test_sessions() as db:
        college_id, admin_id, faculty_id, token = setup_admin_and_faculty(db)

    headers = {"Authorization": f"Bearer {token}"}

    # 1. Academic Year
    res_ay = test_client.post(
        "/admin/academic/academic-years",
        json={
            "name": "Academic Year 2025-2026",
            "start_date": "2025-07-01",
            "end_date": "2026-06-30",
            "is_current": True,
        },
        headers=headers,
    )
    assert res_ay.status_code == 201
    ay_id = res_ay.json()["id"]
    assert res_ay.json()["is_current"] is True

    res_ay_list = test_client.get("/admin/academic/academic-years", headers=headers)
    assert res_ay_list.status_code == 200
    assert len(res_ay_list.json()) >= 1

    # Archive
    res_arch = test_client.post(f"/admin/academic/academic-years/{ay_id}/archive", headers=headers)
    assert res_arch.status_code == 200
    assert res_arch.json()["is_archived"] is True

    # 2. Classroom
    res_room = test_client.post(
        "/admin/academic/classrooms",
        json={
            "room_number": "LH-301",
            "building": "Science Wing",
            "floor": "3rd Floor",
            "capacity": 80,
            "room_type": "Lecture Hall",
            "is_active": True,
        },
        headers=headers,
    )
    assert res_room.status_code == 201
    room_id = res_room.json()["id"]

    res_rooms = test_client.get("/admin/academic/classrooms", headers=headers)
    assert res_rooms.status_code == 200
    assert res_rooms.json()["summary"]["total_classrooms"] >= 1

    # 3. Holiday
    res_h = test_client.post(
        "/admin/academic/holidays",
        json={
            "name": "Gandhi Jayanti",
            "date": "2026-10-02",
            "description": "National Holiday",
        },
        headers=headers,
    )
    assert res_h.status_code == 201
    holiday_id = res_h.json()["id"]

    res_h_list = test_client.get("/admin/academic/holidays", headers=headers)
    assert res_h_list.status_code == 200
    assert len(res_h_list.json()) >= 1

    # Delete Holiday
    res_del_h = test_client.delete(f"/admin/academic/holidays/{holiday_id}", headers=headers)
    assert res_del_h.status_code == 200


if __name__ == "__main__":
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    test_sessions = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    app = main.create_app()

    def override_get_db():
        db = test_sessions()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        print("Running Phase 4 Tests directly...")
        test_department_management((test_client, test_sessions))
        print("PASS: Department Management")
        test_course_and_subject_management((test_client, test_sessions))
        print("PASS: Course & Subject Management")
        test_academic_year_classroom_and_holiday((test_client, test_sessions))
        print("PASS: Academic Year, Classroom & Holiday Management")
        print("\n*** ALL PHASE 4 BACKEND TESTS PASSED (100%) ***")
