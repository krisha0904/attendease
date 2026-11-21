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

print("Setting up Phase 11 in-memory test database...")
engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
models.Base.metadata.create_all(bind=engine)
Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = Session()

# 1. Setup College, Admin, 2 Departments, and 3 Users
college = models.College(name="Apex Institute of Technology", code="APEX_P11", is_active=True)
db.add(college)
db.commit()

admin = models.User(
    college_id=college.id,
    employee_id="ADM-2026-P11",
    full_name="Dean Broadcast",
    email="dean.broadcast@apex.edu",
    username="dean.broadcast",
    password_hash=hash_password("SuperSecretPass123"),
    role=models.UserRole.SUPER_ADMIN,
    is_active=True,
)
dept_it = models.Department(college_id=college.id, name="Information Technology", code="IT", is_active=True)
dept_ece = models.Department(college_id=college.id, name="Electronics", code="ECE", is_active=True)
db.add_all([admin, dept_it, dept_ece])
db.commit()

# Faculty 1 in IT
fac_it = models.User(
    college_id=college.id,
    employee_id="FAC-2026-IT01",
    full_name="Prof. Tim Berners-Lee",
    email="timbl@apex.edu",
    username="tim.bl",
    department_id=dept_it.id,
    password_hash=hash_password("WebPass123"),
    role=models.UserRole.FACULTY,
    designation="Visiting Professor",
    is_active=True,
)
# Faculty 2 in ECE
fac_ece = models.User(
    college_id=college.id,
    employee_id="FAC-2026-EC01",
    full_name="Prof. Heinrich Hertz",
    email="hertz@apex.edu",
    username="heinrich.hertz",
    department_id=dept_ece.id,
    password_hash=hash_password("WavePass123"),
    role=models.UserRole.FACULTY,
    designation="Visiting Professor",
    is_active=True,
)
# Non-faculty Staff (Admin/Staff)
staff = models.User(
    college_id=college.id,
    employee_id="STF-2026-01",
    full_name="John Registrar",
    email="registrar@apex.edu",
    username="john.reg",
    password_hash=hash_password("StaffPass123"),
    role=models.UserRole.SUPER_ADMIN,
    is_active=True,
)
db.add_all([fac_it, fac_ece, staff])
db.commit()

print(f"Entities created: College={college.id}, Admin={admin.id}, FacIT={fac_it.id}, FacECE={fac_ece.id}, Staff={staff.id}")

app = main.create_app()

def get_route(path, method="GET"):
    for r in app.routes:
        if getattr(r, "path", None) == path and method.upper() in getattr(r, "methods", set()):
            return r.endpoint
    raise ValueError(f"Route {method} {path} not found")

create_announcement = get_route("/admin/announcements", "POST")
list_announcements = get_route("/admin/announcements", "GET")
deactivate_announcement = get_route("/admin/announcements/{announcement_id}", "DELETE")
get_active_announcements = get_route("/announcements/active", "GET")
list_notifications = get_route("/notifications", "GET")
mark_read = get_route("/notifications/{notification_id}/read", "POST")
mark_all_read = get_route("/notifications/read-all", "POST")
delete_notification = get_route("/notifications/{notification_id}", "DELETE")

dummy_req = MagicMock()
dummy_req.client.host = "127.0.0.1"

# Test 1: Admin creates targeted announcement for IT department
print("\n--- Test 1: Admin creates targeted announcement (IT Department) ---")
ann1_req = main.AnnouncementCreate(
    title="IT Lab Infrastructure Maintenance",
    message="Server cluster upgrade scheduled for Saturday 18:00. Cloud IDE access will be temporarily paused.",
    type="warning",
    priority="high",
    target_role="faculty",
    target_department_id=dept_it.id,
    action_url="/announcements/it-maintenance",
)
ann1_res = create_announcement(payload=ann1_req, request=dummy_req, admin=admin, db=db)
print(f"Created: ID={ann1_res['id']}, Title={ann1_res['title']}, Target={ann1_res['target_department_name']}")
assert ann1_res["target_department_id"] == dept_it.id

# Check fan-out notification delivery: Prof. Tim Berners-Lee (IT) should have 1 notification, Hertz (ECE) should have 0
it_notifs = list_notifications(user=fac_it, db=db)
ece_notifs = list_notifications(user=fac_ece, db=db)
print(f"Delivered notifications: IT Faculty={it_notifs['unread_count']}, ECE Faculty={ece_notifs['unread_count']}")
assert it_notifs["unread_count"] == 1
assert ece_notifs["unread_count"] == 0
assert it_notifs["items"][0]["title"] == "IT Lab Infrastructure Maintenance"

# Test 2: Admin creates College-wide Urgent announcement
print("\n--- Test 2: Admin creates College-wide Urgent announcement ---")
ann2_req = main.AnnouncementCreate(
    title="Urgent: Biometric Firmware Update",
    message="All facial recognition terminals are updating algorithms. Punch-in verification time reduced to 0.4s.",
    type="urgent",
    priority="critical",
    target_role=None, # All roles
    target_department_id=None, # All departments
)
ann2_res = create_announcement(payload=ann2_req, request=dummy_req, admin=admin, db=db)
assert ann2_res["priority"] == "critical"

# Both faculty members and admin should now receive this college broadcast
it_notifs2 = list_notifications(user=fac_it, db=db)
ece_notifs2 = list_notifications(user=fac_ece, db=db)
print(f"After broadcast: IT={it_notifs2['unread_count']}, ECE={ece_notifs2['unread_count']}")
assert it_notifs2["unread_count"] == 2
assert ece_notifs2["unread_count"] == 1

# Test 3: Admin lists announcements with live KPIs
print("\n--- Test 3: Admin lists announcements with KPIs ---")
ann_list = list_announcements(admin=admin, db=db)
print(f"Announcements total={ann_list['kpis']['total_announcements']}, urgent={ann_list['kpis']['urgent_alerts']}, sent={ann_list['kpis']['total_notifications_sent']}")
assert ann_list["kpis"]["total_announcements"] == 2
assert ann_list["kpis"]["urgent_alerts"] == 2
# 1 sent to IT + 4 sent to all active users = 5 total notifications
assert ann_list["kpis"]["total_notifications_sent"] >= 4

# Test 4: User fetches active announcements banner
print("\n--- Test 4: User fetches relevant active announcements ---")
user_active_ann = get_active_announcements(user=fac_it, db=db)
assert len(user_active_ann) == 2
print(f"IT Faculty active banners: {[a['title'] for a in user_active_ann]}")

# Test 5: Mark individual notification as read
print("\n--- Test 5: Mark notification as read ---")
first_notif_id = it_notifs2["items"][0]["id"]
read_res = mark_read(notification_id=first_notif_id, user=fac_it, db=db)
assert read_res["is_read"] == True
assert read_res["read_at"] is not None

check_unread = list_notifications(filter_type="unread", user=fac_it, db=db)
assert check_unread["unread_count"] == 1
print(f"Unread count successfully decremented to {check_unread['unread_count']}")

# Test 6: Mark all notifications as read in bulk
print("\n--- Test 6: Bulk mark all read ---")
bulk_res = mark_all_read(user=fac_it, db=db)
print(f"Bulk response: {bulk_res}")
check_unread2 = list_notifications(filter_type="unread", user=fac_it, db=db)
assert check_unread2["unread_count"] == 0
print("All notifications marked read successfully!")

# Test 7: Dismiss / Delete notification
print("\n--- Test 7: Dismiss notification ---")
del_res = delete_notification(notification_id=first_notif_id, user=fac_it, db=db)
print(f"Dismiss response: {del_res}")
all_after_del = list_notifications(user=fac_it, db=db)
assert all_after_del["total_count"] == 1
print("Notification successfully deleted from inbox!")

# Test 8: Deactivate Announcement
print("\n--- Test 8: Deactivate Announcement ---")
deact_res = deactivate_announcement(announcement_id=ann1_res["id"], admin=admin, db=db)
print(f"Deactivate response: {deact_res}")
ann_list2 = list_announcements(admin=admin, db=db)
assert ann_list2["kpis"]["active_broadcasts"] == 1
print("Announcement deactivated successfully!")

print("\n==================================================")
print("ALL PHASE 11 BACKEND TESTS PASSED SUCCESSFULLY! (100%)")
print("==================================================")
