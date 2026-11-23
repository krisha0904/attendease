"""
Direct Test Script for Visiting Faculty User Module:
- Phase 8: Faculty Availability (Preferred Slots & Blackout Windows)
- Phase 7: Attendance Corrections (Manual Correction Requests & Justifications)
Directly tests route handlers and database persistence.
"""

import os
import sys
import asyncio
from datetime import date, time

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

async def run_tests():
    print("=" * 75)
    print("  VISITING FACULTY MODULE: AVAILABILITY & ATTENDANCE CORRECTIONS")
    print("=" * 75)

    db = SessionLocal()

    try:
        # Step 1: Query Faculty User
        print("\n[STEP 1] Fetching Visiting Faculty user...")
        faculty = db.query(models.User).filter(models.User.email == "rajesh.sharma@apex.edu").first()
        if not faculty:
            faculty = db.query(models.User).filter(models.User.role.in_([models.Role.faculty, models.Role.staff])).first()
        assert faculty is not None, "Faculty user not found!"
        print(f"  -> Faculty User ID: {faculty.id}, Name: {faculty.full_name}, Email: {faculty.email}")

        # Step 2: Test Create Availability (Preferred Slot)
        print("\n[STEP 2] Testing POST /faculty-availability (Preferred Slot)...")
        create_avail_handler = get_route("/faculty-availability", "POST")
        avail_payload = main.FacultyAvailabilityCreate(
            day_of_week=1, # Tuesday
            start_time="10:00",
            end_time="13:00",
            is_available=True,
            notes="Available for morning Computer Networks lectures"
        )
        created_avail = create_avail_handler(avail_payload, current_user=faculty, db=db)
        print(f"  -> Created Availability ID: {created_avail.id}, Day: {created_avail.day_of_week}, Available: {created_avail.is_available}")
        assert created_avail.day_of_week == 1
        assert created_avail.faculty_id == faculty.id

        # Step 3: Test Create Availability (Blackout Window)
        print("\n[STEP 3] Testing POST /faculty-availability (Blackout Window)...")
        blackout_payload = main.FacultyAvailabilityCreate(
            day_of_week=4, # Friday
            start_time="14:00",
            end_time="18:00",
            is_available=False,
            notes="External industry consulting - unavailable"
        )
        created_blackout = create_avail_handler(blackout_payload, current_user=faculty, db=db)
        print(f"  -> Created Blackout ID: {created_blackout.id}, Day: {created_blackout.day_of_week}, Available: {created_blackout.is_available}")
        assert created_blackout.is_available is False

        # Step 4: Test GET /faculty-availability/mine
        print("\n[STEP 4] Testing GET /faculty-availability/mine...")
        get_avail_handler = get_route("/faculty-availability/mine", "GET")
        my_avail_list = get_avail_handler(current_user=faculty, db=db)
        print(f"  -> Retrieved {len(my_avail_list)} availability records for faculty.")
        assert len(my_avail_list) >= 2
        avail_ids = [a.id for a in my_avail_list]
        assert created_avail.id in avail_ids
        assert created_blackout.id in avail_ids

        # Step 5: Test DELETE /faculty-availability/{avail_id}
        print(f"\n[STEP 5] Testing DELETE /faculty-availability/{created_blackout.id}...")
        del_avail_handler = get_route("/faculty-availability/{avail_id}", "DELETE")
        del_result = del_avail_handler(created_blackout.id, current_user=faculty, db=db)
        print(f"  -> Result: {del_result}")
        assert del_result.get("status") == "deleted"

        # Verify deletion in DB
        check_db = db.query(models.FacultyAvailability).filter_by(id=created_blackout.id).first()
        assert check_db is None, "Blackout record should have been deleted from DB!"
        print("  -> Confirmed deleted from database.")

        # Step 6: Test POST /attendance-corrections
        print("\n[STEP 6] Testing POST /attendance-corrections (Submit correction request)...")
        create_corr_handler = get_route("/attendance-corrections", "POST")
        corr_payload = main.AttendanceCorrectionCreate(
            target_date=date(2026, 11, 20),
            requested_punch_in="09:15:00",
            requested_punch_out="11:45:00",
            reason="Face biometric device had camera driver timeout on campus terminal. Lecture delivered in Room 402."
        )
        created_corr = create_corr_handler(corr_payload, current_user=faculty, db=db)
        print(f"  -> Created Correction ID: {created_corr.id}, Status: {created_corr.status.value}, Target Date: {created_corr.target_date}")
        assert created_corr.status == models.ApprovalStatus.pending
        assert created_corr.user_id == faculty.id

        # Step 7: Test GET /attendance-corrections/mine
        print("\n[STEP 7] Testing GET /attendance-corrections/mine...")
        get_corr_handler = get_route("/attendance-corrections/mine", "GET")
        my_corr_list = get_corr_handler(current_user=faculty, db=db)
        print(f"  -> Retrieved {len(my_corr_list)} correction requests.")
        assert len(my_corr_list) >= 1
        assert any(c.id == created_corr.id for c in my_corr_list)

        # Step 8: Test DELETE /attendance-corrections/{correction_id} (Cancel pending request)
        print(f"\n[STEP 8] Testing DELETE /attendance-corrections/{created_corr.id}...")
        del_corr_handler = get_route("/attendance-corrections/{correction_id}", "DELETE")
        del_corr_res = del_corr_handler(created_corr.id, current_user=faculty, db=db)
        print(f"  -> Result: {del_corr_res}")
        assert del_corr_res.get("status") == "cancelled"

        # Verify deletion in DB
        check_corr = db.query(models.AttendanceCorrection).filter_by(id=created_corr.id).first()
        assert check_corr is None, "Correction record should have been cancelled/removed from DB!"
        print("  -> Confirmed cancelled and removed from database.")

        print("\n" + "=" * 75)
        print("  ALL 8 TESTS PASSED SUCCESSFULLY! (100% Verified against SQLite & DB)")
        print("=" * 75)

    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(run_tests())
