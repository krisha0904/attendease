from datetime import timedelta

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import main
import models
from database import Base, get_db
from password_service import hash_password, verify_password


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "test-secret-key-with-at-least-32-characters")
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


def create_college(db, code, email, role=models.UserRole.FACULTY):
    college = models.College(name=f"College {code}", code=code)
    db.add(college)
    db.flush()
    department = models.Department(
        college_id=college.id,
        name=f"Department {code}",
        code=f"DEPT-{code}",
    )
    db.add(department)
    db.flush()
    user = models.User(
        college_id=college.id,
        department_id=department.id,
        employee_id=f"EMP-{code}",
        full_name=f"User {code}",
        email=email,
        role=role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    return college.id, department.id, user.email


def login_with_otp(test_client, test_sessions, monkeypatch, email):
    sent = []
    monkeypatch.setattr(main, "_send_otp_email", lambda recipient, otp, validity_minutes=5: sent.append((recipient, otp)))
    response = test_client.post("/auth/otp/request", json={"email": email})
    assert response.status_code == 202
    assert response.json() == {"message": "If an active account exists, a sign-in code has been sent."}
    assert len(sent) == 1
    response = test_client.post("/auth/otp/verify", json={"email": email, "otp": sent[0][1]})
    assert response.status_code == 200
    return response.json(), sent[0][1]


def test_unknown_email_does_not_send_or_reveal_otp(client, monkeypatch):
    test_client, _ = client
    sent = []
    monkeypatch.setattr(main, "_send_otp_email", lambda recipient, otp, validity_minutes=5: sent.append(otp))

    response = test_client.post("/auth/otp/request", json={"email": "missing@example.edu"})

    assert response.status_code == 202
    assert not sent
    assert "otp" not in response.json()


def test_login_otp_uses_configured_validity_and_respects_resend_cooldown(client, monkeypatch):
    test_client, test_sessions = client
    with test_sessions() as db:
        college_id, _, email = create_college(db, "OTP-POLICY", "person@otp-policy.example")
        db.add(
            models.AttendancePolicy(
                college_id=college_id,
                otp_validity_minutes=2,
                otp_resend_cooldown_seconds=300,
            )
        )
        db.commit()

    sent = []
    monkeypatch.setattr(main, "_send_otp_email", lambda recipient, otp, validity_minutes=5: sent.append(otp))
    payload = {"email": email}
    assert test_client.post("/auth/otp/request", json=payload).status_code == 202
    assert test_client.post("/auth/otp/request", json=payload).status_code == 202
    assert len(sent) == 1

    with test_sessions() as db:
        otp_records = db.query(models.OTPVerification).order_by(models.OTPVerification.created_at).all()
        assert len(otp_records) == 1
        validity_seconds = (otp_records[0].expires_at - otp_records[0].created_at).total_seconds()
        assert 119 <= validity_seconds <= 120
        otp_records[0].created_at -= timedelta(seconds=61)
        db.commit()

    assert test_client.post("/auth/otp/request", json=payload).status_code == 202
    assert len(sent) == 2
    with test_sessions() as db:
        otp_records = db.query(models.OTPVerification).order_by(models.OTPVerification.created_at).all()
        assert len(otp_records) == 2
        assert otp_records[0].is_used
        validity_seconds = (otp_records[1].expires_at - otp_records[1].created_at).total_seconds()
        assert 119 <= validity_seconds <= 120


@pytest.mark.parametrize(
    ("role", "portal", "wrong_portal"),
    [
        (models.UserRole.FACULTY, "user", "admin"),
        (models.UserRole.STAFF, "user", "admin"),
    ],
)
def test_login_otp_is_limited_to_the_correct_portal(client, monkeypatch, role, portal, wrong_portal):
    test_client, test_sessions = client
    with test_sessions() as db:
        _, _, email = create_college(db, f"PORTAL-{role.value}", f"{role.value}@portal.example", role)

    sent_codes = []
    monkeypatch.setattr(main, "_send_otp_email", lambda recipient, otp, validity_minutes=5: sent_codes.append(otp))
    requested = test_client.post("/auth/otp/request", json={"email": email})
    assert requested.status_code == 202
    payload = {"email": email, "otp": sent_codes[0], "portal": wrong_portal}
    wrong_login = test_client.post("/auth/otp/verify", json=payload)
    assert wrong_login.status_code == 403
    assert wrong_login.json()["detail"] == f"This account must use the {portal} sign-in portal."
    with test_sessions() as db:
        assert db.query(models.UserSession).count() == 0
        assert not db.query(models.OTPVerification).one().is_used

    payload["portal"] = portal
    correct_login = test_client.post("/auth/otp/verify", json=payload)
    assert correct_login.status_code == 200
    assert correct_login.json()["user"]["role"] == role.value


def test_admin_username_login_identifies_college_without_email_otp(client, monkeypatch):
    test_client, test_sessions = client
    with test_sessions() as db:
        north_id, _, north_email = create_college(
            db, "NORTH", "north-admin@example.edu", models.UserRole.SUPER_ADMIN
        )
        south_id, _, south_email = create_college(
            db, "SOUTH", "south-admin@example.edu", models.UserRole.HOD
        )
        north = db.query(models.User).filter_by(email=north_email).one()
        north.username = "north.admin"
        north.password_hash = hash_password("North-Admin-Password-123")
        south = db.query(models.User).filter_by(email=south_email).one()
        south.username = "south.hod"
        south.password_hash = hash_password("South-HOD-Password-123")
        db.commit()

    sent_codes = []
    monkeypatch.setattr(main, "_send_otp_email", lambda *args, **kwargs: sent_codes.append(args))
    otp_request = test_client.post("/auth/otp/request", json={"email": north_email})
    assert otp_request.status_code == 202
    assert not sent_codes

    north_login = test_client.post(
        "/auth/admin-login",
        json={"username": "NORTH.ADMIN", "password": "North-Admin-Password-123"},
    )
    south_login = test_client.post(
        "/auth/admin-login",
        json={"username": "south.hod", "password": "South-HOD-Password-123"},
    )
    assert north_login.status_code == 200
    assert north_login.json()["user"]["college_id"] == north_id
    assert south_login.status_code == 200
    assert south_login.json()["user"]["college_id"] == south_id
    assert north_login.json()["user"]["username"] == "north.admin"
    assert test_client.post(
        "/auth/admin-login",
        json={"username": "north.admin", "password": "wrong-password"},
    ).status_code == 401
    assert test_client.post(
        "/auth/login",
        json={"email": north_email, "password": "North-Admin-Password-123"},
    ).status_code == 401


def test_otp_validity_policy_is_limited_to_two_through_five_minutes():
    with pytest.raises(ValueError):
        main.AttendancePolicyUpdate(otp_validity_minutes=1)
    with pytest.raises(ValueError):
        main.AttendancePolicyUpdate(otp_validity_minutes=6)
    with pytest.raises(ValueError):
        main.AttendancePolicyUpdate(otp_resend_cooldown_seconds=300)


def test_otp_email_uses_configured_sender_and_expiry(monkeypatch):
    sent_messages = []

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            assert host == "smtp.gmail.com"
            assert port == 587
            assert timeout == 15

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_value, traceback):
            return False

        def starttls(self):
            pass

        def login(self, username, password):
            assert username == "sender@gmail.com"
            assert password == "test-app-password"

        def send_message(self, message):
            sent_messages.append(message)

    monkeypatch.setenv("SMTP_HOST", "smtp.gmail.com")
    monkeypatch.setenv("SMTP_PORT", "587")
    monkeypatch.setenv("SMTP_USERNAME", "sender@gmail.com")
    monkeypatch.setenv("SMTP_PASSWORD", "test-app-password")
    monkeypatch.setenv("SMTP_FROM", "")
    monkeypatch.setattr(main.smtplib, "SMTP", FakeSMTP)

    main._send_otp_email("recipient@gmail.com", "123456", validity_minutes=2)

    assert len(sent_messages) == 1
    assert sent_messages[0]["From"] == "sender@gmail.com"
    assert sent_messages[0]["To"] == "recipient@gmail.com"
    assert "expires in 2 minutes" in sent_messages[0].get_content()


def test_placeholder_secret_is_rejected(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "replace-with-a-random-value-at-least-32-characters-long")

    with pytest.raises(HTTPException) as error:
        main._hash_otp("person@example.edu", "123456")

    assert error.value.status_code == 503


def test_password_login_uses_salted_hash_and_rejects_wrong_password(client):
    test_client, test_sessions = client
    with test_sessions() as db:
        _, _, email = create_college(db, "PASSWORD", "person@example.edu")
        user = db.query(models.User).filter_by(email=email).one()
        user.password_hash = hash_password("Correct-Password-123")
        db.commit()
        stored_hash = user.password_hash

    assert stored_hash != "Correct-Password-123"
    assert verify_password("Correct-Password-123", stored_hash)
    assert not verify_password("wrong-password", stored_hash)
    assert not verify_password("anything", None)
    assert test_client.post(
        "/auth/login",
        json={"email": email, "password": "wrong-password"},
    ).status_code == 401

    response = test_client.post(
        "/auth/login",
        json={"email": email, "password": "Correct-Password-123"},
    )
    assert response.status_code == 200
    assert response.json()["user"]["email"] == email


def test_registration_uses_existing_college_id_and_creates_account_after_verification(client, monkeypatch):
    test_client, test_sessions = client
    with test_sessions() as db:
        north = models.College(name="North College", code="NORTH-1", is_active=True)
        south = models.College(name="South College", code="SOUTH-1", is_active=True)
        inactive = models.College(name="Inactive College", code="INACTIVE-1", is_active=False)
        db.add_all([north, south, inactive])
        db.commit()
        north_id = north.id
        south_id = south.id

    colleges = test_client.get("/auth/colleges")
    assert colleges.status_code == 200
    assert [college["name"] for college in colleges.json()] == ["North College", "South College"]
    assert all("code" not in college for college in colleges.json())
    assert test_client.get("/auth/colleges").json()[0]["id"] == north_id

    sent_codes = []
    monkeypatch.setattr(main, "_send_otp_email", lambda recipient, otp: sent_codes.append((recipient, otp)))
    payload = {
        "college_id": north_id,
        "college_code": "SOUTH-1",
        "employee_id": "VF-001",
        "full_name": "North Faculty",
        "email": "faculty@north.example",
        "password": "Faculty-Password-123",
    }
    mismatch = test_client.post("/auth/register", json=payload)
    assert mismatch.status_code == 400
    assert "does not match" in mismatch.json()["detail"]

    payload["college_code"] = "UNKNOWN-1"
    assert test_client.post("/auth/register", json=payload).status_code == 400

    payload["college_code"] = "north-1"
    registration = test_client.post(
        "/auth/register",
        json=payload,
    )
    assert registration.status_code == 201
    assert registration.json()["role"] == "faculty"
    assert "verification code" in registration.json()["message"]
    with test_sessions() as db:
        assert db.query(models.User).count() == 0
        pending = db.query(models.PendingRegistration).one()
        assert pending.college_id == north_id
        assert pending.password_hash != payload["password"]
        assert pending.otp_hash != sent_codes[0][1]

    verify_payload = {"college_id": south_id, "email": payload["email"], "otp": sent_codes[0][1]}
    assert test_client.post("/auth/register/verify", json=verify_payload).status_code == 401
    verify_payload["college_id"] = north_id
    verify_payload["otp"] = "000000"
    assert test_client.post("/auth/register/verify", json=verify_payload).status_code == 401
    verify_payload["otp"] = sent_codes[0][1]
    verified = test_client.post("/auth/register/verify", json=verify_payload)
    assert verified.status_code == 200

    with test_sessions() as db:
        user = db.query(models.User).filter_by(email=payload["email"]).one()
        assert user.college_id == north_id
        assert user.role == models.UserRole.FACULTY
        assert user.email_verified and user.is_active
        assert verify_password(payload["password"], user.password_hash)
        assert db.query(models.PendingRegistration).count() == 0

    assert test_client.post(
        "/auth/login",
        json={"email": payload["email"], "password": payload["password"]},
    ).status_code == 200


def test_registration_resend_cooldown_and_single_use_codes(client, monkeypatch):
    test_client, test_sessions = client
    with test_sessions() as db:
        college_id = models.College(name="Cooldown College", code="COOL-1", is_active=True)
        db.add(college_id)
        db.commit()
        college_id = college_id.id

    sent_codes = []
    monkeypatch.setattr(main, "_send_otp_email", lambda recipient, otp: sent_codes.append(otp))
    registration = test_client.post(
        "/auth/register",
        json={
            "college_id": college_id,
            "college_code": "COOL-1",
            "employee_id": "ADMIN-001",
            "full_name": "College Admin",
            "email": "admin@cooldown.example",
            "password": "Admin-Password-123",
        },
    )
    assert registration.status_code == 201
    with test_sessions() as db:
        assert db.query(models.User).count() == 0
        pending = db.query(models.PendingRegistration).one()
        pending_id = pending.id
    resend_payload = {"college_id": college_id, "email": "admin@cooldown.example"}
    assert test_client.post("/auth/register/resend", json=resend_payload).status_code == 429

    with test_sessions() as db:
        pending = db.query(models.PendingRegistration).filter_by(id=pending_id).one()
        pending.otp_created_at -= timedelta(seconds=61)
        db.commit()

    resent = test_client.post("/auth/register/resend", json=resend_payload)
    assert resent.status_code == 202
    assert len(sent_codes) == 2
    verify_payload = {**resend_payload, "otp": sent_codes[0]}
    assert test_client.post("/auth/register/verify", json=verify_payload).status_code == 401
    verify_payload["otp"] = sent_codes[1]
    assert test_client.post("/auth/register/verify", json=verify_payload).status_code == 200
    assert test_client.post("/auth/register/verify", json=verify_payload).status_code == 401


def test_registration_email_failure_rolls_back_pending_account(client, monkeypatch):
    test_client, test_sessions = client
    with test_sessions() as db:
        college = models.College(name="No Email College", code="NOEMAIL", is_active=True)
        db.add(college)
        db.commit()
        college_id = college.id

    def fail_sending_email(recipient, otp):
        raise HTTPException(status_code=503, detail="Email delivery is not configured.")

    monkeypatch.setattr(main, "_send_otp_email", fail_sending_email)
    response = test_client.post(
        "/auth/register",
        json={
            "college_id": college_id,
            "college_code": "NOEMAIL",
            "employee_id": "ADMIN-001",
            "full_name": "College Admin",
            "email": "admin@noemail.example",
            "password": "Admin-Password-123",
        },
    )
    assert response.status_code == 503
    with test_sessions() as db:
        assert db.query(models.College).count() == 1
        assert db.query(models.User).count() == 0
        assert db.query(models.PendingRegistration).count() == 0
        assert db.query(models.OTPVerification).count() == 0


def test_password_change_revokes_existing_sessions(client):
    test_client, test_sessions = client
    with test_sessions() as db:
        _, _, email = create_college(db, "PASSWORD-CHANGE", "person@example.edu")
        user = db.query(models.User).filter_by(email=email).one()
        user.password_hash = hash_password("Original-Password-123")
        db.commit()

    login = test_client.post(
        "/auth/login",
        json={"email": email, "password": "Original-Password-123"},
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    changed = test_client.post(
        "/auth/password/change",
        json={
            "current_password": "Original-Password-123",
            "new_password": "Updated-Password-456",
        },
        headers=headers,
    )

    assert changed.status_code == 200
    assert test_client.get("/auth/me", headers=headers).status_code == 401
    assert test_client.post(
        "/auth/login",
        json={"email": email, "password": "Original-Password-123"},
    ).status_code == 401
    assert test_client.post(
        "/auth/login",
        json={"email": email, "password": "Updated-Password-456"},
    ).status_code == 200


def test_otp_is_single_use_and_refresh_tokens_rotate(client, monkeypatch):
    test_client, test_sessions = client
    with test_sessions() as db:
        _, _, email = create_college(db, "ONE", "person@example.edu")

    tokens, otp = login_with_otp(test_client, test_sessions, monkeypatch, email)
    assert test_client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    ).status_code == 200

    sent_otp = test_client.post("/auth/otp/verify", json={"email": email, "otp": otp})
    assert sent_otp.status_code == 401

    refreshed = test_client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refreshed.status_code == 200
    assert refreshed.json()["refresh_token"] != tokens["refresh_token"]
    assert test_client.post(
        "/auth/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    ).status_code == 401


def test_wrong_otp_attempts_invalidate_the_code(client, monkeypatch):
    test_client, test_sessions = client
    with test_sessions() as db:
        _, _, email = create_college(db, "TWO", "person@example.edu")

    sent = []
    monkeypatch.setattr(main, "_send_otp_email", lambda recipient, otp, validity_minutes=5: sent.append(otp))
    assert test_client.post("/auth/otp/request", json={"email": email}).status_code == 202
    assert sent
    for _ in range(3):
        response = test_client.post("/auth/otp/verify", json={"email": email, "otp": "000000"})
        assert response.status_code == 401
    assert test_client.post(
        "/auth/otp/verify",
        json={"email": email, "otp": sent[0]},
    ).status_code == 401


def test_admin_user_management_is_role_and_tenant_scoped(client, monkeypatch):
    test_client, test_sessions = client
    with test_sessions() as db:
        college_a_id, department_a_id, admin_email = create_college(
            db,
            "A",
            "admin@example.edu",
            models.UserRole.SUPER_ADMIN,
        )
        _, department_b_id, _ = create_college(db, "B", "other@example.edu")

    with test_sessions() as db:
        admin = db.query(models.User).filter_by(email=admin_email).one()
        admin.username = "college-a.admin"
        admin.password_hash = hash_password("College-Admin-Password-123")
        db.commit()
    admin_login = test_client.post(
        "/auth/admin-login",
        json={"username": "college-a.admin", "password": "College-Admin-Password-123"},
    )
    assert admin_login.status_code == 200
    tokens = admin_login.json()
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    response = test_client.get("/admin/users", headers=headers)
    assert response.status_code == 200
    assert [user["email"] for user in response.json()] == [admin_email]

    payload = {
        "employee_id": "FAC-NEW",
        "full_name": "New Faculty",
        "email": "new@example.edu",
        "phone": "+15551234567",
        "password": "Correct-Horse-123",
        "department_id": department_b_id,
        "role": "faculty",
    }
    assert test_client.post("/admin/users", json=payload, headers=headers).status_code == 404
    payload["department_id"] = department_a_id
    created = test_client.post("/admin/users", json=payload, headers=headers)
    assert created.status_code == 201
    assert created.json()["college_id"] == college_a_id
    with test_sessions() as db:
        assert db.query(models.User).filter_by(email="new@example.edu").one().phone == "+15551234567"

    with test_sessions() as db:
        faculty = models.User(
            college_id=college_a_id,
            department_id=department_a_id,
            employee_id="FAC-OTHER",
            full_name="Faculty User",
            email="faculty@example.edu",
            phone="+15557654321",
            role=models.UserRole.FACULTY,
            is_active=True,
        )
        db.add(faculty)
        db.commit()
        faculty_email = faculty.email
    faculty_tokens, _ = login_with_otp(test_client, test_sessions, monkeypatch, faculty_email)
    faculty_headers = {"Authorization": f"Bearer {faculty_tokens['access_token']}"}
    assert test_client.get("/admin/users", headers=faculty_headers).status_code == 403
    directory = test_client.get("/directory", headers=faculty_headers)
    assert directory.status_code == 200
    entries = directory.json()
    assert {entry["email"] for entry in entries} == {admin_email, "new@example.edu", faculty_email}
    assert next(entry for entry in entries if entry["email"] == faculty_email)["phone"] == "+15557654321"
    assert all("password_hash" not in entry for entry in entries)


def test_projects_and_tasks_are_department_scoped_and_assignable(client):
    test_client, test_sessions = client
    with test_sessions() as db:
        college_id, department_id, manager_email = create_college(
            db,
            "TASKS",
            "hod@tasks.example",
            models.UserRole.HOD,
        )
        manager = db.query(models.User).filter_by(email=manager_email).one()
        manager.password_hash = hash_password("Manager-Password-123")
        faculty = models.User(
            college_id=college_id,
            department_id=department_id,
            employee_id="FAC-TASKS",
            full_name="Assigned Faculty",
            email="faculty@tasks.example",
            password_hash=hash_password("Faculty-Password-123"),
            role=models.UserRole.FACULTY,
            is_active=True,
        )
        other_college_id, other_department_id, other_email = create_college(
            db,
            "OTHER-TASKS",
            "other@tasks.example",
        )
        outside_faculty = models.User(
            college_id=other_college_id,
            department_id=other_department_id,
            employee_id="FAC-OUTSIDE",
            full_name="Outside Faculty",
            email="outside@tasks.example",
            role=models.UserRole.FACULTY,
            is_active=True,
        )
        db.add_all([faculty, outside_faculty])
        db.commit()
        faculty_id = faculty.id
        outside_faculty_id = outside_faculty.id

    manager_login = test_client.post(
        "/auth/login",
        json={"email": manager_email, "password": "Manager-Password-123"},
    ).json()
    manager_headers = {"Authorization": f"Bearer {manager_login['access_token']}"}
    project = test_client.post(
        "/projects",
        json={"name": "Visiting Faculty Orientation", "department_id": department_id},
        headers=manager_headers,
    )
    assert project.status_code == 201
    project_id = project.json()["id"]
    status_update = test_client.patch(
        f"/projects/{project_id}",
        json={"status": "on_hold"},
        headers=manager_headers,
    )
    assert status_update.status_code == 200
    assert status_update.json()["status"] == "on_hold"

    assigned = test_client.post(
        "/tasks",
        json={
            "title": "Prepare orientation materials",
            "project_id": project_id,
            "assignee_id": faculty_id,
            "due_date": "2026-12-01",
        },
        headers=manager_headers,
    )
    assert assigned.status_code == 201
    task_id = assigned.json()["id"]
    assert test_client.post(
        "/tasks",
        json={"title": "Out of scope", "assignee_id": outside_faculty_id},
        headers=manager_headers,
    ).status_code == 404
    assert len(test_client.get("/tasks?scope=all", headers=manager_headers).json()) == 1
    assert len(test_client.get(f"/tasks?scope=all&project_id={project_id}", headers=manager_headers).json()) == 1

    faculty_login = test_client.post(
        "/auth/login",
        json={"email": "faculty@tasks.example", "password": "Faculty-Password-123"},
    ).json()
    faculty_headers = {"Authorization": f"Bearer {faculty_login['access_token']}"}
    updated = test_client.patch(
        f"/tasks/{task_id}",
        json={"status": "in_progress", "progress": 40},
        headers=faculty_headers,
    )
    assert updated.status_code == 200
    assert updated.json()["progress"] == 40
    assert test_client.get("/tasks?scope=assigned_to_me", headers=faculty_headers).json()[0]["project_name"] == "Visiting Faculty Orientation"
