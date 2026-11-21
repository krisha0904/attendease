import os
import sys
from datetime import date, datetime, time, timedelta

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

print("Setting up Phase 13 in-memory test database...")
engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
models.Base.metadata.create_all(bind=engine)
Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = Session()

# 1. Setup College, Admin, and Department
college = models.College(name="Apex Institute of Technology", code="APEX_P13", is_active=True)
db.add(college)
db.commit()

admin = models.User(
    college_id=college.id,
    employee_id="SUPER-ADM-P13",
    full_name="Director General",
    email="director@apex.edu",
    username="director.apex",
    password_hash=hash_password("RootAdminPassword123"),
    role=models.UserRole.SUPER_ADMIN,
    is_active=True,
)
dept_cse = models.Department(college_id=college.id, name="Computer Science & Engineering", code="CSE", is_active=True)
db.add_all([admin, dept_cse])
db.commit()

# Create a sample user session
session1 = models.UserSession(
    user_id=admin.id,
    refresh_token_hash="hash_token_admin_apex",
    device_info="Chrome 130 / macOS Sequoia",
    ip_address="192.168.1.50",
    is_active=True,
    expires_at=datetime.utcnow() + timedelta(days=7),
    created_at=datetime.utcnow(),
    last_used=datetime.utcnow(),
)
sec_event1 = models.SecurityEvent(
    college_id=college.id,
    user_id=admin.id,
    event_type="UNUSUAL_GEO_PUNCH_ATTEMPT",
    severity="high",
    description="Punch-in attempted 450m outside designated campus boundary.",
    ip_address="192.168.1.99",
    resolved=False,
)
db.add_all([session1, sec_event1])
db.commit()

print(f"Entities created: College={college.id}, SuperAdmin={admin.id}, Dept={dept_cse.id}")

app = main.create_app()

def get_route(path, method="GET"):
    for r in app.routes:
        if getattr(r, "path", None) == path and method.upper() in getattr(r, "methods", set()):
            return r.endpoint
    raise ValueError(f"Route {method} {path} not found")

get_institution_settings = get_route("/admin/settings/institution", "GET")
update_institution_settings = get_route("/admin/settings/institution", "PUT")
list_administrators = get_route("/admin/administrators", "GET")
create_administrator = get_route("/admin/administrators", "POST")
update_administrator = get_route("/admin/administrators/{user_id}", "PUT")
delete_administrator = get_route("/admin/administrators/{user_id}", "DELETE")
get_audit_logs = get_route("/admin/audit-logs", "GET")
get_security_sessions = get_route("/admin/security/sessions", "GET")
revoke_security_session = get_route("/admin/security/sessions/{session_id}/revoke", "POST")
get_security_events = get_route("/admin/security/events", "GET")
resolve_security_event = get_route("/admin/security/events/{event_id}/resolve", "POST")
list_backups = get_route("/admin/backups", "GET")
create_backup_snapshot = get_route("/admin/backups/create", "POST")
download_backup_snapshot = get_route("/admin/backups/{backup_id}/download", "GET")
restore_backup_snapshot = get_route("/admin/backups/{backup_id}/restore", "POST")
delete_backup_snapshot = get_route("/admin/backups/{backup_id}", "DELETE")
import_faculty_batch = get_route("/admin/import/faculty", "POST")
export_dataset_csv = get_route("/admin/export/{dataset}", "GET")

# -------------------------------------------------------------
# Test 1: Institution Settings (Get & Update)
# -------------------------------------------------------------
print("\n--- Test 1: Get & Update Institution Settings ---")
init_settings = get_institution_settings(admin=admin, db=db)
assert init_settings["college"]["name"] == "Apex Institute of Technology"
assert init_settings["location"]["geofence_radius"] == 100.0
assert init_settings["policy"]["face_match_threshold"] == 0.363
print(f"Initial settings fetched: College={init_settings['college']['name']}, Geofence={init_settings['location']['geofence_radius']}m, SFace Threshold={init_settings['policy']['face_match_threshold']}")

update_payload = main.InstitutionSettingsUpdate(
    address="Apex Innovation Campus, Tech City Boulevard",
    phone="+91 22 9876 5432",
    latitude=28.6139,
    longitude=77.2090,
    geofence_radius=150.0,
    face_match_threshold=0.380,
    lecture_punch_in_window_minutes=20,
)
res_up = update_institution_settings(payload=update_payload, admin=admin, db=db)
assert "updated successfully" in res_up["message"]

refreshed_settings = get_institution_settings(admin=admin, db=db)
assert refreshed_settings["college"]["address"] == "Apex Innovation Campus, Tech City Boulevard"
assert refreshed_settings["location"]["geofence_radius"] == 150.0
assert refreshed_settings["policy"]["face_match_threshold"] == 0.380
assert refreshed_settings["policy"]["lecture_punch_in_window_minutes"] == 20
print("Institution settings and biometric/geofence policies updated successfully!")

# -------------------------------------------------------------
# Test 2: Administrator Roles & Permissions Management
# -------------------------------------------------------------
print("\n--- Test 2: Administrator Creation & Role Management ---")
new_adm_payload = main.AdminUserCreate(
    full_name="Prof. Alan Turing",
    email="alan.turing@apex.edu",
    username="alan.turing",
    password="EnigmaPassword456",
    role="hod",
    department_id=dept_cse.id,
    phone="+91 9988776655",
)
created_adm = create_administrator(payload=new_adm_payload, admin=admin, db=db)
assert created_adm["username"] == "alan.turing"
assert created_adm["role"] == "hod"
print(f"Created Administrator: {created_adm['full_name']} as HOD of CSE")

# List administrators
adm_list = list_administrators(admin=admin, db=db)
assert adm_list["summary"]["total_admins"] >= 2
assert adm_list["summary"]["super_admins"] >= 1
assert adm_list["summary"]["department_hods"] >= 1
print(f"Administrators list verified: Total={adm_list['summary']['total_admins']}, SuperAdmins={adm_list['summary']['super_admins']}, HODs={adm_list['summary']['department_hods']}")

# Update admin role to college_admin
update_administrator(
    user_id=created_adm["id"],
    payload=main.AdminUserUpdate(role="college_admin"),
    admin=admin,
    db=db,
)
updated_user = db.query(models.User).filter(models.User.id == created_adm["id"]).first()
assert updated_user.role == models.UserRole.COLLEGE_ADMIN
print("Administrator role successfully elevated to college_admin!")

# Verify self-deletion protection
try:
    delete_administrator(user_id=admin.id, admin=admin, db=db)
    assert False, "Should have prevented self-deletion"
except Exception as e:
    detail_str = getattr(e, "detail", str(e))
    assert "cannot delete your own" in detail_str.lower()
    print("Self-deletion prevention guard verified!")

# -------------------------------------------------------------
# Test 3: Immutable Audit Logs Verification
# -------------------------------------------------------------
print("\n--- Test 3: Audit Trail Verification ---")
audit_resp = get_audit_logs(admin=admin, db=db)
actions = [item["action"] for item in audit_resp["items"]]
print(f"Audit log actions recorded ({audit_resp['summary']['total_actions']} total): {actions}")
assert "UPDATE_INSTITUTION_SETTINGS" in actions
assert "CREATE_ADMIN_USER" in actions
assert "UPDATE_ADMIN_USER" in actions
print("Audit logging engine successfully validated!")

# -------------------------------------------------------------
# Test 4: Active Sessions & Security Threat Monitoring
# -------------------------------------------------------------
print("\n--- Test 4: Active Sessions & Threat Surveillance ---")
sessions_resp = get_security_sessions(admin=admin, db=db)
assert sessions_resp["summary"]["active_sessions"] >= 1
print(f"Active sessions detected: {sessions_resp['summary']['active_sessions']}")

# Revoke session1
revoke_resp = revoke_security_session(session_id=session1.id, admin=admin, db=db)
assert "revoked successfully" in revoke_resp["message"]
revoked_session = db.query(models.UserSession).filter(models.UserSession.id == session1.id).first()
assert not revoked_session.is_active
print("Session revocation successfully enforced!")

# Security events
events_resp = get_security_events(admin=admin, db=db)
assert events_resp["summary"]["open_alerts"] >= 1
ev_id = events_resp["items"][0]["id"]

resolve_resp = resolve_security_event(event_id=ev_id, admin=admin, db=db)
assert "resolved" in resolve_resp["message"]
updated_ev = db.query(models.SecurityEvent).filter(models.SecurityEvent.id == ev_id).first()
assert updated_ev.resolved is True
print("Security incident resolution verified!")

# -------------------------------------------------------------
# Test 5: Backup & Disaster Recovery Snapshots
# -------------------------------------------------------------
print("\n--- Test 5: Backup Snapshot Lifecycle ---")
backup_resp = create_backup_snapshot(
    payload=main.BackupCreateRequest(notes="Pre-examination institutional snapshot", backup_type="full"),
    admin=admin,
    db=db,
)
assert backup_resp["status"] == "completed"
bk_id = backup_resp["id"]
print(f"Generated backup snapshot #{bk_id}: {backup_resp['filename']} ({backup_resp['file_size_mb']} MB)")

backups_list = list_backups(admin=admin, db=db)
assert backups_list["summary"]["total_backups"] >= 1

# Restore / verify snapshot integrity
restore_res = restore_backup_snapshot(backup_id=bk_id, admin=admin, db=db)
assert restore_res["integrity"] == "VERIFIED_CLEAN"
print(f"Snapshot restore validation verified: {restore_res['message']}")

# Download snapshot
download_stream = download_backup_snapshot(backup_id=bk_id, admin=admin, db=db)
assert download_stream.headers["Content-Disposition"].startswith("attachment; filename=")
print("Backup download stream validated!")

# Delete snapshot
del_res = delete_backup_snapshot(backup_id=bk_id, admin=admin, db=db)
assert "deleted successfully" in del_res["message"]
print("Backup snapshot removal verified!")

# -------------------------------------------------------------
# Test 6: Bulk Faculty Import & CSV Data Export
# -------------------------------------------------------------
print("\n--- Test 6: Bulk Faculty Import & CSV Data Export ---")
import_payload = main.FacultyImportPayload(
    rows=[
        main.FacultyImportRow(
            full_name="Prof. Donald Knuth",
            email="knuth@stanford.edu",
            employee_id="VF-KNUTH-01",
            department_code="CSE",
            designation="Professor Emeritus",
        ),
        main.FacultyImportRow(
            full_name="Prof. Edsger Dijkstra",
            email="dijkstra@utexas.edu",
            employee_id="VF-DIJKSTRA-02",
            department_code="CSE",
            designation="Visiting Scholar",
        ),
        # Duplicate row to test conflict handling
        main.FacultyImportRow(
            full_name="Duplicate Turing",
            email="alan.turing@apex.edu",
            employee_id="VF-DUP-03",
        ),
    ]
)
import_result = import_faculty_batch(payload=import_payload, admin=admin, db=db)
assert import_result["imported_count"] == 2
assert import_result["skipped_count"] == 1
print(f"Batch import results: Imported={import_result['imported_count']}, Skipped={import_result['skipped_count']}")

# Export faculty CSV
export_stream = export_dataset_csv(dataset="faculty", admin=admin, db=db)
assert "faculty_directory_" in export_stream.headers["Content-Disposition"]

# Export audit logs CSV
export_audit = export_dataset_csv(dataset="audit_logs", admin=admin, db=db)
assert "audit_trail_" in export_audit.headers["Content-Disposition"]
print("CSV Export streams verified for Faculty and Audit Trail!")

print("\n" + "=" * 50)
print("ALL PHASE 13 BACKEND TESTS PASSED SUCCESSFULLY! (100%)")
print("=" * 50)
