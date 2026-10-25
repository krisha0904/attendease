import unittest
from datetime import datetime, timedelta

import models
from database import Base, SessionLocal, engine
from main import build_hod_dashboard_summary, get_leave_status_for_user, get_faculty_details_by_id, build_attendance_report
import face_service


class HodLeaveLogicTests(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(bind=engine)
        self.db = SessionLocal()
        self.db.query(models.Break).delete()
        self.db.query(models.LeaveRequest).delete()
        self.db.query(models.Attendance).delete()
        self.db.query(models.User).delete()
        self.db.query(models.Department).delete()
        self.db.commit()

        dept = models.Department(name="Computer Science", lat=0.0, lng=0.0, radius=100.0)
        self.db.add(dept)
        self.db.commit()
        self.db.refresh(dept)

        self.user1 = models.User(
            faculty_id="FAC-001",
            name="Dr. Patel",
            email="patel@example.com",
            phone="9000000001",
            role="teacher",
            department_id=dept.id,
        )
        self.user2 = models.User(
            faculty_id="FAC-002",
            name="Prof. Shah",
            email="shah@example.com",
            phone="9000000002",
            role="teacher",
            department_id=dept.id,
        )
        self.user3 = models.User(
            faculty_id="FAC-003",
            name="Prof. Kumar",
            email="kumar@example.com",
            phone="9000000003",
            role="staff",
            department_id=dept.id,
        )
        self.db.add_all([self.user1, self.user2, self.user3])
        self.db.commit()
        self.db.refresh(self.user1)
        self.db.refresh(self.user2)
        self.db.refresh(self.user3)

    def tearDown(self):
        self.db.close()

    def test_hod_summary_counts_live_users(self):
        now = datetime.now()
        att1 = models.Attendance(user_id=self.user1.id, punch_in=now - timedelta(hours=3), punch_out=None, status="Present")
        att2 = models.Attendance(user_id=self.user2.id, punch_in=now - timedelta(hours=2), punch_out=now - timedelta(minutes=30), status="Present")
        self.db.add_all([att1, att2])
        self.db.commit()
        self.db.refresh(att1)
        self.db.refresh(att2)

        break_record = models.Break(attendance_id=att2.id, break_in=now - timedelta(minutes=40), break_out=None)
        self.db.add(break_record)
        self.db.commit()

        summary = build_hod_dashboard_summary(self.db)
        self.assertEqual(summary["present"], 1)
        self.assertEqual(summary["on_break"], 1)
        self.assertEqual(summary["absent"], 1)
        self.assertEqual(summary["staff_list"][0]["name"], "Dr. Patel")

    def test_leave_status_returns_user_requests(self):
        leave = models.LeaveRequest(
            user_id=self.user1.id,
            start_date=datetime.now(),
            end_date=datetime.now() + timedelta(days=2),
            reason="Medical",
            leave_type="Sick",
            status="Approved",
        )
        self.db.add(leave)
        self.db.commit()

        result = get_leave_status_for_user(self.db, self.user1.id)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["status"], "Approved")

    def test_faculty_details_returns_live_stats(self):
        now = datetime.now()
        attendance = models.Attendance(
            user_id=self.user1.id,
            punch_in=now - timedelta(hours=4),
            punch_out=now - timedelta(minutes=30),
            status="Present",
        )
        self.db.add(attendance)
        self.db.commit()

        break_record = models.Break(
            attendance_id=attendance.id,
            break_in=now - timedelta(hours=2),
            break_out=now - timedelta(hours=1, minutes=25),
            duration_seconds=2100,
        )
        self.db.add(break_record)
        self.db.commit()

        details = get_faculty_details_by_id(self.db, self.user1.faculty_id)
        self.assertEqual(details["name"], "Dr. Patel")
        self.assertGreater(details["total_work_minutes"], 0)
        self.assertEqual(details["breaks"][0]["duration_minutes"], 35)

    def test_attendance_report_returns_real_records(self):
        now = datetime.now()
        attendance = models.Attendance(
            user_id=self.user1.id,
            punch_in=now - timedelta(hours=5),
            punch_out=now - timedelta(hours=2, minutes=10),
            status="Present",
        )
        self.db.add(attendance)
        self.db.commit()

        report = build_attendance_report(self.db, user_id=self.user1.id)
        self.assertEqual(len(report), 1)
        self.assertEqual(report[0]["user_name"], "Dr. Patel")
        self.assertGreater(report[0]["total_minutes"], 100)

    def test_face_recognition_dependency_is_available(self):
        self.assertTrue(hasattr(face_service, "FACE_RECOGNITION_AVAILABLE"))


if __name__ == "__main__":
    unittest.main()
