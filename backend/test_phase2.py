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


def setup_college_and_admin(db):
    college = models.College(name="Test College", code="TESTCOL", is_active=True)
    db.add(college)
    db.flush()

    dept = models.Department(college_id=college.id, name="Computer Engineering", code="CE")
    db.add(dept)
    db.flush()

    admin = models.User(
        college_id=college.id,
        department_id=dept.id,
        employee_id="ADM-001",
        full_name="Super Administrator",
        email="admin@test.edu",
        username="admin.test",
        password_hash=hash_password("SuperSecretAdminPass123"),
        role=models.UserRole.SUPER_ADMIN,
        is_active=True,
    )
    db.add(admin)
    db.flush()

    now = main._utcnow()
    session = models.UserSession(
        user_id=admin.id,
        refresh_token_hash="test-session-" + secrets.token_urlsafe(16),
        is_active=True,
        expires_at=now + datetime.timedelta(days=1),
        last_used=now,
    )
    db.add(session)
    db.commit()

    token = main._make_access_token(admin, session.id)
    return college.id, dept.id, admin.id, token


def test_visiting_faculty_crud_and_status(client):
    test_client, test_sessions = client
    with test_sessions() as db:
        college_id, dept_id, admin_id, token = setup_college_and_admin(db)

    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create Visiting Faculty with auto-generated ID
    create_payload = {
        "full_name": "Dr. Alan Turing",
        "email": "alan.turing@test.edu",
        "phone": "+91 99999 11111",
        "gender": "Male",
        "department_id": dept_id,
        "qualification": "Ph.D. Mathematics",
        "specialization": "Cryptography & AI",
        "experience_years": 8.5,
        "designation": "Visiting Professor",
        "auto_generate_id": True,
    }
    res = test_client.post("/admin/faculty", json=create_payload, headers=headers)
    assert res.status_code == 201
    created_data = res.json()
    assert created_data["full_name"] == "Dr. Alan Turing"
    assert created_data["employee_id"].startswith("VF-")
    faculty_id = created_data["id"]

    # 2. Duplicate email should fail with 409
    res_dup = test_client.post("/admin/faculty", json=create_payload, headers=headers)
    assert res_dup.status_code == 409

    # 3. Duplicate phone should fail with 409
    create_payload_dup_phone = dict(create_payload)
    create_payload_dup_phone["email"] = "other.email@test.edu"
    res_dup_phone = test_client.post("/admin/faculty", json=create_payload_dup_phone, headers=headers)
    assert res_dup_phone.status_code == 409

    # 4. List Visiting Faculty
    list_res = test_client.get("/admin/faculty", headers=headers)
    assert list_res.status_code == 200
    list_data = list_res.json()
    assert list_data["total"] == 1
    assert list_data["items"][0]["full_name"] == "Dr. Alan Turing"
    assert list_data["items"][0]["account_status"] == "active"

    # 5. Search Visiting Faculty
    search_res = test_client.get("/admin/faculty?search=Turing", headers=headers)
    assert search_res.status_code == 200
    assert search_res.json()["total"] == 1

    search_empty = test_client.get("/admin/faculty?search=NonExistent", headers=headers)
    assert search_empty.status_code == 200
    assert search_empty.json()["total"] == 0

    # 6. Update Visiting Faculty Profile
    update_payload = {
        "full_name": "Dr. Alan Mathison Turing",
        "phone": "+91 99999 11111",
        "gender": "Male",
        "department_id": dept_id,
        "qualification": "Ph.D. Cambridge",
        "specialization": "Theoretical Computer Science",
        "experience_years": 10.0,
        "designation": "Distinguished Visiting Professor",
    }
    update_res = test_client.put(f"/admin/faculty/{faculty_id}", json=update_payload, headers=headers)
    assert update_res.status_code == 200

    # 7. Check 10-Tab Profile Data
    profile_res = test_client.get(f"/admin/faculty/{faculty_id}/profile", headers=headers)
    assert profile_res.status_code == 200
    profile = profile_res.json()
    assert profile["personal_info"]["full_name"] == "Dr. Alan Mathison Turing"
    assert profile["professional_info"]["qualification"] == "Ph.D. Cambridge"
    assert "assigned_subjects" in profile
    assert "lecture_schedule" in profile
    assert "attendance_history" in profile
    assert "leave_history" in profile
    assert "availability" in profile
    assert "face_registration" in profile
    assert "workload_summary" in profile
    assert "account_activity" in profile

    # 8. Deactivate Faculty
    deact_res = test_client.post(f"/admin/faculty/{faculty_id}/deactivate", headers=headers)
    assert deact_res.status_code == 200
    assert deact_res.json()["account_status"] == "inactive"

    # 9. Suspend Faculty
    susp_res = test_client.post(f"/admin/faculty/{faculty_id}/suspend", headers=headers)
    assert susp_res.status_code == 200
    assert susp_res.json()["account_status"] == "suspended"

    # 10. Activate Faculty
    act_res = test_client.post(f"/admin/faculty/{faculty_id}/activate", headers=headers)
    assert act_res.status_code == 200
    assert act_res.json()["account_status"] == "active"

    # 11. Safe Delete Check: Add attendance record, verify deletion is BLOCKED
    with test_sessions() as db:
        att = models.AttendanceRecord(
            college_id=college_id,
            user_id=faculty_id,
            date=datetime.date.today(),
            status=models.AttendanceStatus.PRESENT,
        )
        db.add(att)
        db.commit()

    del_res = test_client.delete(f"/admin/faculty/{faculty_id}", headers=headers)
    assert del_res.status_code == 400
    assert "Cannot permanently delete faculty records linked to historical attendance" in del_res.json()["detail"]


def test_admin_dashboard_realtime_metrics(client):
    test_client, test_sessions = client
    with test_sessions() as db:
        college_id, dept_id, admin_id, token = setup_college_and_admin(db)

        # Create two faculty members
        f1 = models.User(
            college_id=college_id,
            department_id=dept_id,
            employee_id="VF-2026-0001",
            full_name="Prof. Claude Shannon",
            email="shannon@test.edu",
            role=models.UserRole.FACULTY,
            is_active=True,
            password_hash=hash_password("DummyPass123"),
        )
        f2 = models.User(
            college_id=college_id,
            department_id=dept_id,
            employee_id="VF-2026-0002",
            full_name="Prof. Ada Lovelace",
            email="lovelace@test.edu",
            role=models.UserRole.FACULTY,
            is_active=False,
            account_status="inactive",
            password_hash=hash_password("DummyPass123"),
        )
        db.add_all([f1, f2])
        db.commit()

        # Add attendance today for f1
        today = datetime.date.today()
        rec = models.AttendanceRecord(
            college_id=college_id,
            user_id=f1.id,
            date=today,
            punch_in_time=datetime.datetime.now(),
            status=models.AttendanceStatus.PRESENT,
            is_late=False,
            punch_in_face_verified=True,
            punch_in_gps_verified=True,
        )
        db.add(rec)

        # Add a weekly lecture for today
        day_of_week = today.weekday()
        lec = models.WeeklyLecture(
            college_id=college_id,
            department_id=dept_id,
            user_id=f1.id,
            subject="Information Theory",
            room="LH-101",
            day_of_week=day_of_week,
            start_time=datetime.time(10, 0),
            end_time=datetime.time(11, 30),
            is_active=True,
        )
        db.add(lec)
        db.commit()

    headers = {"Authorization": f"Bearer {token}"}
    res = test_client.get("/admin/dashboard", headers=headers)
    assert res.status_code == 200
    dash = res.json()

    # Verify 13 Statistics
    stats = dash["statistics"]
    assert stats["total_visiting_faculty"] == 2
    assert stats["active_faculty"] == 1
    assert stats["inactive_faculty"] == 1
    assert stats["present_today"] == 1
    assert stats["faculty_currently_on_campus"] == 1
    assert stats["today_scheduled_lectures"] >= 1

    # Verify Visualisations
    vis = dash["visualisations"]
    assert "weekly_trends" in vis
    assert len(vis["weekly_trends"]) == 7
    assert "department_attendance" in vis
    assert len(vis["department_attendance"]) == 1
    assert vis["department_attendance"][0]["department_name"] == "Computer Engineering"
    assert vis["department_attendance"][0]["present_today"] == 1

    # Verify Feeds
    feeds = dash["feeds"]
    assert "today_lectures" in feeds
    assert len(feeds["today_lectures"]) >= 1
    assert feeds["today_lectures"][0]["subject"] == "Information Theory"
    assert "recent_activity" in feeds
    assert len(feeds["recent_activity"]) >= 1
    assert feeds["recent_activity"][0]["faculty_name"] == "Prof. Claude Shannon"
    assert "recent_registrations" in feeds
    assert "verification_alerts" in feeds
