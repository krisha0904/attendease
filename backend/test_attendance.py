import base64
from datetime import date, timedelta

import cv2
import numpy as np
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import main
import models
import face_service
import liveness_service
from database import Base, get_db
from password_service import hash_password


@pytest.fixture
def attendance_client(monkeypatch):
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
        yield test_client, test_sessions, monkeypatch
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


def create_accounts(db):
    college = models.College(name="Attendance College", code="ATTEND")
    db.add(college)
    db.flush()
    department = models.Department(college_id=college.id, name="Science", code="SCI")
    db.add(department)
    db.flush()
    admin = models.User(
        college_id=college.id,
        department_id=department.id,
        employee_id="ADMIN-1",
        full_name="College Admin",
        email="admin@attendance.example",
        password_hash=hash_password("Admin-Password-123"),
        role=models.UserRole.SUPER_ADMIN,
        is_active=True,
    )
    faculty = models.User(
        college_id=college.id,
        department_id=department.id,
        employee_id="FAC-1",
        full_name="Faculty Member",
        email="faculty@attendance.example",
        password_hash=hash_password("Faculty-Password-123"),
        role=models.UserRole.FACULTY,
        is_active=True,
    )
    db.add_all((admin, faculty))
    db.add(
        models.CollegeLocation(
            college_id=college.id,
            name="Main Campus",
            latitude=12.0,
            longitude=77.0,
            geofence_radius=200,
            min_gps_accuracy=30,
            is_active=True,
        )
    )
    db.commit()
    return admin.email, faculty.email, college.id, faculty.id


def login(client, test_sessions, monkeypatch, email):
    password = "Admin-Password-123" if email == "admin@attendance.example" else "Faculty-Password-123"
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def live_capture(idempotency_key):
    image = "a" * 200
    return {
        "idempotency_key": idempotency_key,
        "challenge_token": "c" * 32,
        "frames": [image] * 4,
        "face_image_base64": image,
    }


def test_password_authenticated_attendance_state_transitions_and_idempotent_retries(attendance_client):
    client, test_sessions, monkeypatch = attendance_client
    monkeypatch.setattr(main, "_verify_face", lambda *args, **kwargs: (True, 1.0, 0.99, object()))
    with test_sessions() as db:
        admin_email, faculty_email, _, _ = create_accounts(db)
    headers = login(client, test_sessions, monkeypatch, faculty_email)
    punch_in = client.post(
        "/attendance/punch_in",
        json=live_capture("punch-in-key-0001"),
        headers=headers,
    )
    assert punch_in.status_code == 200, punch_in.text
    assert punch_in.json()["status"] == "present"
    retry = client.post(
        "/attendance/punch_in",
        json=live_capture("punch-in-key-0001"),
        headers=headers,
    )
    assert retry.status_code == 200
    assert retry.json()["id"] == punch_in.json()["id"]

    duplicate = client.post(
        "/attendance/punch_in",
        json=live_capture("punch-in-key-0002"),
        headers=headers,
    )
    assert duplicate.status_code == 409
    punch_out = client.post(
        "/attendance/punch_out",
        json=live_capture("punch-out-key-0001"),
        headers=headers,
    )
    assert punch_out.status_code == 200
    assert punch_out.json()["status"] in ("punched_out", "half_day")
    assert client.get("/attendance/mine", headers=headers).status_code == 200

    with test_sessions() as db:
        assert db.query(models.AttendanceEvent).count() == 2
        assert db.query(models.AttendanceRecord).count() == 1


def test_punch_in_requires_live_face_capture_and_does_not_create_record_without_it(attendance_client):
    client, test_sessions, monkeypatch = attendance_client
    with test_sessions() as db:
        _, faculty_email, _, faculty_id = create_accounts(db)
    headers = login(client, test_sessions, monkeypatch, faculty_email)
    response = client.post(
        "/attendance/punch_in",
        json={"idempotency_key": "simple-punch-in-001"},
        headers=headers,
    )
    assert response.status_code == 400
    assert "live face verification is required" in response.json()["detail"]
    with test_sessions() as db:
        assert db.query(models.LocationVerificationLog).count() == 0
        assert db.query(models.AttendanceRecord).filter_by(user_id=faculty_id).count() == 0


def test_bundled_liveness_rejects_capture_without_a_face(attendance_client):
    client, test_sessions, monkeypatch = attendance_client
    monkeypatch.delenv("LIVENESS_PROVIDER", raising=False)
    with test_sessions() as db:
        _, faculty_email, _, faculty_id = create_accounts(db)
    headers = login(client, test_sessions, monkeypatch, faculty_email)
    challenge = client.post("/biometrics/challenge", json={"action": "enrollment"}, headers=headers)
    assert challenge.status_code == 200
    encoded, buffer = cv2.imencode(".jpg", np.zeros((320, 320, 3), dtype=np.uint8))
    assert encoded
    image = "data:image/jpeg;base64," + base64.b64encode(buffer).decode("ascii")

    response = client.post(
        "/biometrics/enroll",
        json={
            "challenge_token": challenge.json()["challenge_token"],
            "frames": [image] * 4,
            "face_image_base64": image,
            "consent": True,
        },
        headers=headers,
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Liveness verification failed."
    with test_sessions() as db:
        stored_challenge = db.query(models.LivenessChallenge).filter_by(user_id=faculty_id).one()
        assert stored_challenge.is_used is True


def test_face_enrollment_challenge_uses_passive_liveness(attendance_client):
        client, test_sessions, monkeypatch = attendance_client
        with test_sessions() as db:
            _, faculty_email, _, _ = create_accounts(db)
        headers = login(client, test_sessions, monkeypatch, faculty_email)

        enrollment = client.post("/biometrics/challenge", json={"action": "enrollment"}, headers=headers)
        attendance = client.post("/biometrics/challenge", json={"action": "punch_in"}, headers=headers)

        assert enrollment.status_code == 200
        assert enrollment.json()["instruction"] == "passive"
        assert attendance.status_code == 200
        assert attendance.json()["instruction"] in {"blink", "turn_left", "turn_right", "smile"}
        assert db.query(models.BiometricTemplate).count() == 0


def test_face_enrollment_rejects_failed_liveness(attendance_client):
    client, test_sessions, monkeypatch = attendance_client
    with test_sessions() as db:
        _, faculty_email, _, faculty_id = create_accounts(db)
    headers = login(client, test_sessions, monkeypatch, faculty_email)
    monkeypatch.setattr(liveness_service, "verify_sequence", lambda instruction, frames: (False, 0.1))
    challenge = client.post("/biometrics/challenge", json={"action": "enrollment"}, headers=headers)
    image = "a" * 200

    response = client.post(
        "/biometrics/enroll",
        json={
            "challenge_token": challenge.json()["challenge_token"],
            "frames": [image] * 4,
            "face_image_base64": image,
            "consent": True,
        },
        headers=headers,
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Liveness verification failed."
    with test_sessions() as db:
        assert db.query(models.BiometricTemplate).filter_by(user_id=faculty_id).count() == 0


def test_cors_allows_frontend_method_preflight(attendance_client):
    client, _, _ = attendance_client

    response = client.options(
        "/admin/location",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )

    assert response.status_code == 200
    assert "PUT" in response.headers["access-control-allow-methods"]


def test_liveness_capture_has_total_size_limit():
    with pytest.raises(ValueError, match="12 MB"):
        main._validate_capture_frames(["x" * 4_000_001] * 3)


def test_biometric_enrollment_requires_consent_and_admin_approval(attendance_client):
    client, test_sessions, monkeypatch = attendance_client
    with test_sessions() as db:
        admin_email, faculty_email, _, faculty_id = create_accounts(db)
    faculty_headers = login(client, test_sessions, monkeypatch, faculty_email)
    admin_headers = login(client, test_sessions, monkeypatch, admin_email)
    monkeypatch.setenv("BIOMETRIC_ENCRYPTION_KEY", Fernet.generate_key().decode("ascii"))
    monkeypatch.setattr(liveness_service, "verify_sequence", lambda instruction, frames: (True, 0.99))
    monkeypatch.setattr(face_service, "embedding_from_base64", lambda image: np.ones(128, dtype=np.float32) / np.sqrt(128))

    challenge = client.post("/biometrics/challenge", json={"action": "enrollment"}, headers=faculty_headers)
    assert challenge.status_code == 200
    image = "a" * 200
    missing_consent = client.post(
        "/biometrics/enroll",
        json={
            "challenge_token": challenge.json()["challenge_token"],
            "frames": [image] * 4,
            "face_image_base64": image,
            "consent": False,
        },
        headers=faculty_headers,
    )
    assert missing_consent.status_code == 400

    challenge = client.post("/biometrics/challenge", json={"action": "enrollment"}, headers=faculty_headers)
    submitted = client.post(
        "/biometrics/enroll",
        json={
            "challenge_token": challenge.json()["challenge_token"],
            "frames": [image] * 4,
            "face_image_base64": image,
            "consent": True,
        },
        headers=faculty_headers,
    )
    assert submitted.status_code == 202
    assert submitted.json()["status"] == "pending_approval"

    duplicate_challenge = client.post("/biometrics/challenge", json={"action": "enrollment"}, headers=faculty_headers)
    duplicate = client.post(
        "/biometrics/enroll",
        json={
            "challenge_token": duplicate_challenge.json()["challenge_token"],
            "frames": [image] * 4,
            "face_image_base64": image,
            "consent": True,
        },
        headers=faculty_headers,
    )
    assert duplicate.status_code == 409
    with test_sessions() as db:
        assert db.query(models.BiometricTemplate).filter_by(user_id=faculty_id).count() == 1

    pending = client.get("/admin/biometrics/pending", headers=admin_headers)
    assert pending.status_code == 200
    assert pending.json()[0]["user"]["id"] == faculty_id
    enrollment_id = pending.json()[0]["enrollment_id"]
    reviewed = client.post(
        f"/admin/biometrics/{enrollment_id}/review",
        json={"approved": True},
        headers=admin_headers,
    )
    assert reviewed.status_code == 200
    assert client.get("/auth/me", headers=faculty_headers).json()["face_enrollment_status"] == "approved"
    punch_challenge = client.post("/biometrics/challenge", json={"action": "punch_in"}, headers=faculty_headers)
    assert punch_challenge.status_code == 200
    punch = client.post(
        "/attendance/punch_in",
        json={
            "idempotency_key": "face-verified-punch-in-01",
            "challenge_token": punch_challenge.json()["challenge_token"],
            "frames": [image] * 4,
            "face_image_base64": image,
        },
        headers=faculty_headers,
    )
    assert punch.status_code == 200, punch.text

    with test_sessions() as db:
        template = db.query(models.BiometricTemplate).filter_by(user_id=faculty_id).one()
        assert template.face_embedding is not None
        assert "1.0" not in template.face_embedding
        assert np.allclose(face_service.decrypt_embedding(template.face_embedding), np.ones(128, dtype=np.float32) / np.sqrt(128))
        assert db.query(models.BiometricEnrollment).count() == 1
        assert db.query(models.AttendanceEvent).one().face_verified is True


def test_leave_application_review_and_overlapping_request_rejection(attendance_client):
    client, test_sessions, monkeypatch = attendance_client
    with test_sessions() as db:
        admin_email, faculty_email, college_id, _ = create_accounts(db)
        leave_type = models.LeaveType(
            college_id=college_id,
            name="Casual Leave",
            code="CL",
            max_days_per_year=12,
            is_paid=True,
            requires_document=False,
            is_active=True,
        )
        db.add(leave_type)
        db.commit()
        leave_type_id = leave_type.id
    faculty_headers = login(client, test_sessions, monkeypatch, faculty_email)
    admin_headers = login(client, test_sessions, monkeypatch, admin_email)
    future_workday = date.today() + timedelta(days=1)
    while future_workday.weekday() >= 5:
        future_workday += timedelta(days=1)
    application = {
        "leave_type_id": leave_type_id,
        "start_date": future_workday.isoformat(),
        "end_date": future_workday.isoformat(),
        "reason": "Personal leave",
    }

    created = client.post("/leave/applications", json=application, headers=faculty_headers)
    assert created.status_code == 201
    assert created.json()["total_days"] == 1
    overlap = client.post("/leave/applications", json=application, headers=faculty_headers)
    assert overlap.status_code == 409

    reviewed = client.post(
        f"/leave/applications/{created.json()['id']}/review",
        json={"approved": True, "remarks": "Approved"},
        headers=admin_headers,
    )
    assert reviewed.status_code == 200
    assert reviewed.json()["status"] == "approved"
    assert client.get("/leave/applications", headers=faculty_headers).json()[0]["status"] == "approved"
