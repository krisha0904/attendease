"""
Direct Test Script for Visiting Faculty User Module - 1. Dashboard
Directly tests the route handlers and database entities against attendease_dev.db:
- Faculty Profile & SFace Biometric Enrollment / Approval Status
- Today's Lecture Schedule & Real-Time Status Resolution
- Financial KPIs (Taught Hours, Rate per Lecture/Hour, Estimated Remuneration)
- Pending Substitute Invitations & 1-Click Accept / Decline DB update
- Campus Presence Check-in / Punch-out Status
- Institutional Notice Board Announcements
"""

import os
import sys
from datetime import date, datetime, time, timedelta

# Ensure correct database file is targeted
backend_dir = os.path.dirname(os.path.abspath(__file__))
db_path = os.path.join(backend_dir, "attendease_dev.db")
os.environ["DATABASE_URL"] = f"sqlite:///{db_path}"
os.environ["BIOMETRIC_ENCRYPTION_KEY"] = "uY_R1W1qQ43u-Xh4r-yNf4r1mZ0lVfA_R9FvV_D7m-k="
os.environ["SECRET_KEY"] = "attendease-super-secret-jwt-key-2025-at-least-32-chars-long"

from database import SessionLocal
import models
import main

def get_route(path: str, method: str = "GET"):
    for r in main.app.routes:
        if getattr(r, "path", None) == path and method.upper() in getattr(r, "methods", set()):
            return r.endpoint
    raise ValueError(f"Route {method} {path} not found in app")

def run_tests():
    print("=" * 75)
    print("  VISITING FACULTY MODULE: 1. DASHBOARD - COMPREHENSIVE DB VERIFICATION")
    print("=" * 75)

    db = SessionLocal()

    try:
        # Step 1: Verify Faculty User in Database
        print("\n[STEP 1] Querying Visiting Faculty user from SQLite database...")
        faculty_user = db.query(models.User).filter(
            models.User.email == "rajesh.sharma@apex.edu"
        ).first()
        assert faculty_user is not None, "Faculty user rajesh.sharma@apex.edu not found in database!"
        print(f"  -> Found Faculty: ID={faculty_user.id}, Name='{faculty_user.full_name}', Role={faculty_user.role.value}, Dept={faculty_user.department.name if faculty_user.department else 'N/A'}")

        # Step 2: Verify Biometric Template in Database
        print("\n[STEP 2] Verifying Biometric Template & Approval in Database...")
        biometric_tmpl = db.query(models.BiometricTemplate).filter(
            models.BiometricTemplate.user_id == faculty_user.id
        ).first()
        assert biometric_tmpl is not None, "Biometric template record missing in database!"
        bio_status = biometric_tmpl.enrollment_status.value if hasattr(biometric_tmpl.enrollment_status, "value") else str(biometric_tmpl.enrollment_status)
        print(f"  -> Biometric Template ID={biometric_tmpl.id}, Status='{bio_status}', ApprovedBy User ID={biometric_tmpl.approved_by}")
        assert bio_status == "approved", f"Biometric template expected 'approved', got '{bio_status}'"

        # Step 3: Verify Payment Rate Matrix in Database
        print("\n[STEP 3] Verifying Visiting Faculty Payment Rate in Database...")
        rate_entry = db.query(models.FacultyPaymentRate).filter(
            models.FacultyPaymentRate.faculty_id == faculty_user.id
        ).first()
        if not rate_entry:
            rate_entry = models.FacultyPaymentRate(
                college_id=faculty_user.college_id,
                faculty_id=faculty_user.id,
                rate_per_lecture=1500.0,
                rate_per_hour=1000.0,
            )
            db.add(rate_entry)
            db.commit()
            db.refresh(rate_entry)
        print(f"  -> Payment Matrix: Rate/Lecture=INR {rate_entry.rate_per_lecture}, Rate/Hour=INR {rate_entry.rate_per_hour}")

        # Step 4: Call Faculty Dashboard Route Handler Directly
        print("\n[STEP 4] Executing GET /faculty/dashboard route handler with real DB session...")
        faculty_dashboard = get_route("/faculty/dashboard", "GET")
        dash = faculty_dashboard(user=faculty_user, db=db)

        # 4a: Validate Faculty Profile in Response
        prof = dash["faculty"]
        print(f"  -> Profile Verified: {prof['full_name']} | Employee ID: {prof['employee_id']} | Dept: {prof['department']} | Biometrics: {prof['biometric_status']}")
        assert prof["id"] == faculty_user.id
        assert prof["biometric_status"] == "approved"
        assert prof["face_enrolled"] is True

        # 4b: Validate Today's Teaching Statistics
        today_stats = dash["today_stats"]
        print(f"  -> Today's Stats: Assigned={today_stats['assigned_lectures']}, Completed={today_stats['completed_lectures']}, Upcoming={today_stats['upcoming_lectures']}")
        assert "assigned_lectures" in today_stats
        assert "completed_lectures" in today_stats
        assert "upcoming_lectures" in today_stats

        # 4c: Validate Financial Metrics
        fin = dash["financial_stats"]
        print(f"  -> Financials: Done This Month={fin['month_completed_lectures']} lectures | Taught={fin['month_taught_hours']} hrs | Rate=INR {fin['rate_per_lecture']} | Estimated Honorarium=INR {fin['estimated_monthly_earnings']}")
        assert fin["rate_per_lecture"] == rate_entry.rate_per_lecture
        assert fin["rate_per_hour"] == rate_entry.rate_per_hour

        # 4d: Validate Today's Lectures Timeline
        today_lectures = dash["today_lectures"]
        print(f"  -> Today's Lecture Schedule ({len(today_lectures)} entries):")
        for i, lec in enumerate(today_lectures):
            print(f"     [{i+1}] {lec['start_time']} - {lec['end_time']} | {lec['subject']} | Room {lec['room']} | Status: {lec['status']} | CanPunchIn: {lec['can_punch_in']}")
            assert "schedule_id" in lec
            assert "subject" in lec
            assert "status" in lec

        # 4e: Validate Next/Live Lecture
        next_lec = dash["next_lecture"]
        if next_lec:
            print(f"  -> Hero Next Lecture: {next_lec['subject']} at {next_lec['start_time']} (Room: {next_lec['room']})")
        else:
            print("  -> No upcoming or live lectures remaining today (schedule completed or off-hours).")

        # 4f: Validate Day Attendance (Campus Presence)
        day_att = dash["day_attendance"]
        print(f"  -> Campus Presence: Status={day_att['status']}, PunchedIn={day_att['punched_in']}, PunchedOut={day_att['punched_out']}")
        assert "status" in day_att

        # 4g: Validate Announcements
        announcements = dash["announcements"]
        print(f"  -> Announcements ({len(announcements)} active notices):")
        for ann in announcements:
            print(f"     * [{ann['priority'].upper()}] {ann['title']}: {ann['message'][:60]}...")

        # Step 5: Test Pending Substitute Invitation & Response Flow
        print("\n[STEP 5] Testing Substitute Teaching Invitation & Direct DB Acceptance...")
        pending_sub = db.query(models.SubstituteAssignment).filter(
            models.SubstituteAssignment.substitute_faculty_id == faculty_user.id,
            models.SubstituteAssignment.status == "pending"
        ).first()

        if not pending_sub:
            other_lec = db.query(models.WeeklyLecture).filter(
                models.WeeklyLecture.user_id != faculty_user.id
            ).first()
            if other_lec:
                new_sub = models.SubstituteAssignment(
                    college_id=faculty_user.college_id,
                    lecture_id=other_lec.id,
                    original_faculty_id=other_lec.user_id,
                    substitute_faculty_id=faculty_user.id,
                    lecture_date=date.today(),
                    status="pending",
                    remarks="Medical emergency substitution request",
                    created_at=datetime.utcnow()
                )
                db.add(new_sub)
                db.commit()
                db.refresh(new_sub)
                pending_sub = new_sub
                print(f"  -> Created pending substitute assignment ID={pending_sub.id} for testing.")

        # Re-fetch dashboard to verify substitute invite is present
        dash2 = faculty_dashboard(user=faculty_user, db=db)
        subs = dash2["pending_substitutes"]
        assert len(subs) > 0, "Expected at least 1 pending substitute request in dashboard"
        target_sub = subs[0]
        print(f"  -> Detected Pending Substitute Invite in Dashboard: ID={target_sub['id']}, Subject='{target_sub['subject']}', Date={target_sub['date']}")

        # Respond to substitute request via respond endpoint
        respond_route = get_route("/substitutes/{sub_id}/respond", "POST")
        req_payload = main.SubstituteResponse(
            action="accept",
            remarks="Accepted through direct faculty dashboard verification test."
        )
        res = respond_route(sub_id=target_sub["id"], payload=req_payload, user=faculty_user, db=db)
        assert res["status"] == "accepted", f"Expected 'accepted', got {res['status']}"
        print(f"  -> Endpoint Response: Status='{res['status']}', Acknowledgement={res.get('acknowledgement_at')}")

        # Verify DB row directly
        db.expire_all()
        db_sub = db.query(models.SubstituteAssignment).filter(
            models.SubstituteAssignment.id == target_sub["id"]
        ).first()
        assert db_sub.status == "accepted", f"Database status should be 'accepted', got '{db_sub.status}'"
        print(f"  -> Direct DB Verification: substitute_assignments table record {db_sub.id} status is verified as '{db_sub.status}'")

        # Step 6: Test Today's Active Lecture & Real-Time Punch Lifecycle in DB
        print("\n[STEP 6] Testing Today's Lecture Scheduling & Live Punch Lifecycle...")
        today_dow = date.today().weekday()
        test_dow_lec = db.query(models.WeeklyLecture).filter(
            models.WeeklyLecture.college_id == faculty_user.college_id,
            models.WeeklyLecture.user_id == faculty_user.id,
            models.WeeklyLecture.day_of_week == today_dow
        ).first()

        if not test_dow_lec:
            # Create a lecture for today
            subj = db.query(models.Subject).filter(models.Subject.college_id == faculty_user.college_id).first()
            room = db.query(models.Classroom).filter(models.Classroom.college_id == faculty_user.college_id).first()
            course = db.query(models.Course).filter(models.Course.college_id == faculty_user.college_id).first()
            ay = db.query(models.AcademicYear).filter(models.AcademicYear.college_id == faculty_user.college_id).first()
            
            test_dow_lec = models.WeeklyLecture(
                college_id=faculty_user.college_id,
                department_id=faculty_user.department_id,
                user_id=faculty_user.id,
                academic_year_id=ay.id if ay else None,
                course_id=course.id if course else None,
                subject_id=subj.id if subj else None,
                classroom_id=room.id if room else None,
                subject=subj.name if subj else "Advanced Cloud Systems",
                room=room.room_number if room else "LH-101",
                course_name=course.name if course else "B.Tech CSE",
                day_of_week=today_dow,
                start_time=time(14, 0),
                end_time=time(15, 30),
                is_active=True,
            )
            db.add(test_dow_lec)
            db.commit()
            db.refresh(test_dow_lec)
            print(f"  -> Seeded lecture for today (DoW={today_dow}): ID={test_dow_lec.id}, Subject='{test_dow_lec.subject}', Time=14:00-15:30")

        # Query dashboard and verify lecture appears
        dash3 = faculty_dashboard(user=faculty_user, db=db)
        today_lecs = dash3["today_lectures"]
        assert len(today_lecs) > 0, "Today's lectures should contain at least 1 scheduled lecture"
        matching_lec = next((l for l in today_lecs if l["schedule_id"] == test_dow_lec.id), None)
        assert matching_lec is not None, f"Lecture {test_dow_lec.id} not found in today_lectures"
        print(f"  -> Verified Lecture in Today's Schedule: '{matching_lec['subject']}' | Time={matching_lec['start_time']}-{matching_lec['end_time']} | Initial Status={matching_lec['status']}")

        # Simulate Live Lecture Punch-In in DB
        now_dt = datetime.now()
        lec_att = db.query(models.LectureAttendanceRecord).filter(
            models.LectureAttendanceRecord.college_id == faculty_user.college_id,
            models.LectureAttendanceRecord.user_id == faculty_user.id,
            models.LectureAttendanceRecord.weekly_lecture_id == test_dow_lec.id,
            models.LectureAttendanceRecord.lecture_date == date.today(),
        ).first()

        if not lec_att:
            lec_att = models.LectureAttendanceRecord(
                college_id=faculty_user.college_id,
                user_id=faculty_user.id,
                weekly_lecture_id=test_dow_lec.id,
                lecture_date=date.today(),
                punch_in_time=now_dt,
                punch_in_face_verified=True,
                created_at=now_dt,
            )
            db.add(lec_att)
        else:
            lec_att.punch_in_time = now_dt
            lec_att.punch_out_time = None
        db.commit()
        db.refresh(lec_att)

        # Re-query dashboard: verify in_progress status and punch_in_time populated
        dash4 = faculty_dashboard(user=faculty_user, db=db)
        in_prog_lec = next(l for l in dash4["today_lectures"] if l["schedule_id"] == test_dow_lec.id)
        assert in_prog_lec["status"] == "in_progress", f"Expected 'in_progress', got '{in_prog_lec['status']}'"
        assert in_prog_lec["punch_in_time"] is not None, "Punch-in time should be populated"
        print(f"  -> State Transition: Punch-In registered at {in_prog_lec['punch_in_time']} -> Status='{in_prog_lec['status']}'")

        # Simulate Lecture Punch-Out in DB
        lec_att.punch_out_time = now_dt + timedelta(minutes=90)
        db.commit()
        db.refresh(lec_att)

        # Re-query dashboard: verify completed status and completed_lectures count increment
        dash5 = faculty_dashboard(user=faculty_user, db=db)
        comp_lec = next(l for l in dash5["today_lectures"] if l["schedule_id"] == test_dow_lec.id)
        assert comp_lec["status"] == "completed", f"Expected 'completed', got '{comp_lec['status']}'"
        assert comp_lec["punch_out_time"] is not None, "Punch-out time should be populated"
        assert dash5["today_stats"]["completed_lectures"] >= 1, "Completed lectures count should be at least 1"
        print(f"  -> State Transition: Punch-Out registered at {comp_lec['punch_out_time']} -> Status='{comp_lec['status']}' | Completed Count={dash5['today_stats']['completed_lectures']}")

        print("\n" + "=" * 75)
        print("  ALL 6 STEPS PASSED (100%): VISITING FACULTY DASHBOARD FULLY VERIFIED")
        print("=" * 75)

    finally:
        db.close()

if __name__ == "__main__":
    run_tests()
