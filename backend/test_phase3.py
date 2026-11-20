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


def setup_admin_and_college(db):
    college = models.College(name="Apex Institute of Technology", code="APEX", is_active=True)
    db.add(college)
    db.flush()

    dept = models.Department(college_id=college.id, name="Computer Engineering", code="CE")
    db.add(dept)
    db.flush()

    admin = models.User(
        college_id=college.id,
        department_id=dept.id,
        employee_id="ADM-2026-001",
        full_name="Dr. Eleanor Vance",
        email="admin@apex.edu",
        username="admin.eleanor",
        password_hash=hash_password("SuperSecretPass123"),
        role=models.UserRole.SUPER_ADMIN,
        is_active=True,
    )
    db.add(admin)
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
    return college.id, dept.id, admin.id, token


def test_face_registration_management_endpoints(client):
    test_client, test_sessions = client
    with test_sessions() as db:
        college_id, dept_id, admin_id, token = setup_admin_and_college(db)

        # Faculty 1: Pending Approval
        f1 = models.User(
            college_id=college_id,
            department_id=dept_id,
            employee_id="VF-2026-0101",
            full_name="Prof. Krisha Patel",
            email="krisha.patel@apex.edu",
            role=models.UserRole.FACULTY,
            is_active=True,
            face_enrolled=False,
            face_enrollment_status=models.BiometricStatus.PENDING_APPROVAL,
            password_hash=hash_password("DummyPass123"),
        )
        # Faculty 2: Approved
        f2 = models.User(
            college_id=college_id,
            department_id=dept_id,
            employee_id="VF-2026-0102",
            full_name="Prof. Tanisha Sharma",
            email="tanisha.sharma@apex.edu",
            role=models.UserRole.FACULTY,
            is_active=True,
            face_enrolled=True,
            face_enrollment_status=models.BiometricStatus.APPROVED,
            password_hash=hash_password("DummyPass123"),
        )
        # Faculty 3: Not Registered
        f3 = models.User(
            college_id=college_id,
            department_id=dept_id,
            employee_id="VF-2026-0103",
            full_name="Dr. Vikram Rao",
            email="vikram.rao@apex.edu",
            role=models.UserRole.FACULTY,
            is_active=True,
            face_enrolled=False,
            face_enrollment_status=models.BiometricStatus.NOT_ENROLLED,
            password_hash=hash_password("DummyPass123"),
        )
        db.add_all([f1, f2, f3])
        db.commit()

        # Add templates
        t1 = models.BiometricTemplate(
            college_id=college_id,
            user_id=f1.id,
            face_embedding="mock_encrypted_embedding_f1",
            enrollment_status=models.BiometricStatus.PENDING_APPROVAL,
            enrolled_at=main._utcnow() - datetime.timedelta(hours=2),
        )
        t2 = models.BiometricTemplate(
            college_id=college_id,
            user_id=f2.id,
            face_embedding="mock_encrypted_embedding_f2",
            enrollment_status=models.BiometricStatus.APPROVED,
            enrolled_at=main._utcnow() - datetime.timedelta(days=5),
            approved_at=main._utcnow() - datetime.timedelta(days=4),
            approved_by=admin_id,
        )
        db.add_all([t1, t2])

        # Add enrollments
        e1 = models.BiometricEnrollment(
            college_id=college_id,
            user_id=f1.id,
            status=models.BiometricStatus.PENDING_APPROVAL,
            consented_at=main._utcnow() - datetime.timedelta(hours=2),
        )
        e2 = models.BiometricEnrollment(
            college_id=college_id,
            user_id=f2.id,
            status=models.BiometricStatus.APPROVED,
            consented_at=main._utcnow() - datetime.timedelta(days=5),
            reviewed_at=main._utcnow() - datetime.timedelta(days=4),
            reviewed_by=admin_id,
        )
        db.add_all([e1, e2])

        # Add verification logs for Faculty 2
        log_pass = models.BiometricVerificationLog(
            college_id=college_id,
            user_id=f2.id,
            action="punch_in",
            result=models.VerificationResult.PASS,
            similarity_score=0.885,
            liveness_score=0.96,
            liveness_passed=True,
            created_at=main._utcnow() - datetime.timedelta(hours=1),
        )
        log_fail = models.BiometricVerificationLog(
            college_id=college_id,
            user_id=f2.id,
            action="punch_out",
            result=models.VerificationResult.FAIL,
            similarity_score=0.21,
            liveness_score=0.94,
            liveness_passed=True,
            failure_reason="face_mismatch",
            created_at=main._utcnow() - datetime.timedelta(minutes=30),
        )
        db.add_all([log_pass, log_fail])
        db.commit()

        f1_id = f1.id
        f2_id = f2.id

    headers = {"Authorization": f"Bearer {token}"}

    # 1. Test List Enrollments & Summary KPIs
    list_res = test_client.get("/admin/biometrics/enrollments", headers=headers)
    assert list_res.status_code == 200
    data = list_res.json()
    assert data["summary"]["total_faculty"] == 3
    assert data["summary"]["pending_count"] == 1
    assert data["summary"]["approved_count"] == 1
    assert data["summary"]["not_enrolled_count"] == 1
    assert len(data["items"]) == 3

    # 2. Test Filtering by Status
    pending_res = test_client.get("/admin/biometrics/enrollments?status=pending_approval", headers=headers)
    assert pending_res.status_code == 200
    assert pending_res.json()["total"] == 1
    assert pending_res.json()["items"][0]["faculty_name"] == "Prof. Krisha Patel"

    # 3. Test Search Filter
    search_res = test_client.get("/admin/biometrics/enrollments?search=Tanisha", headers=headers)
    assert search_res.status_code == 200
    assert search_res.json()["total"] == 1
    assert search_res.json()["items"][0]["faculty_name"] == "Prof. Tanisha Sharma"

    # 4. Test Single Faculty Biometric Details & History
    details_res = test_client.get(f"/admin/biometrics/enrollments/{f2_id}", headers=headers)
    assert details_res.status_code == 200
    details = details_res.json()
    assert details["faculty"]["full_name"] == "Prof. Tanisha Sharma"
    assert details["template"]["enrollment_status"] == "approved"
    assert details["statistics"]["total_attempts"] == 2
    assert details["statistics"]["pass_count"] == 1
    assert details["statistics"]["fail_count"] == 1
    assert len(details["verification_history"]) == 2

    # 5. Test Approve Enrollment (Approve Krisha's pending template)
    approve_res = test_client.post(f"/admin/biometrics/enrollments/{f1_id}/approve", headers=headers)
    assert approve_res.status_code == 200
    assert approve_res.json()["status"] == "approved"

    # Verify updated status
    verify_f1 = test_client.get(f"/admin/biometrics/enrollments/{f1_id}", headers=headers).json()
    assert verify_f1["faculty"]["face_enrolled"] is True
    assert verify_f1["faculty"]["face_enrollment_status"] == "approved"

    # 6. Test Reject Enrollment with Reason
    reject_payload = {"reason": "Low lighting and tilted face angle in capture frame"}
    reject_res = test_client.post(f"/admin/biometrics/enrollments/{f1_id}/reject", json=reject_payload, headers=headers)
    assert reject_res.status_code == 200
    assert reject_res.json()["status"] == "rejected"

    verify_reject = test_client.get(f"/admin/biometrics/enrollments/{f1_id}", headers=headers).json()
    assert verify_reject["faculty"]["face_enrolled"] is False
    assert verify_reject["faculty"]["face_enrollment_status"] == "rejected"

    # 7. Test Request Re-Enrollment
    re_enroll_payload = {"reason": "Quality check failure. Please re-capture in well-lit room."}
    re_res = test_client.post(f"/admin/biometrics/enrollments/{f1_id}/request-re-enrollment", json=re_enroll_payload, headers=headers)
    assert re_res.status_code == 200
    assert re_res.json()["status"] == "re_enrollment_required"

    verify_re = test_client.get(f"/admin/biometrics/enrollments/{f1_id}", headers=headers).json()
    assert verify_re["faculty"]["face_enrollment_status"] == "re_enrollment_required"
    assert verify_re["template"]["has_embedding"] is False

    # 8. Test Central Verification Audit Logs Feed
    verif_res = test_client.get("/admin/biometrics/verifications", headers=headers)
    assert verif_res.status_code == 200
    verif_data = verif_res.json()
    assert verif_data["total"] >= 2

    fail_verif_res = test_client.get("/admin/biometrics/verifications?result=fail", headers=headers)
    assert fail_verif_res.status_code == 200
    assert fail_verif_res.json()["total"] == 1
    assert fail_verif_res.json()["items"][0]["failure_reason"] == "face_mismatch"
