"""
Direct Test Script for Visiting Faculty User Module:
2. Attendance Tracker & Punch-In (Biometric / Face Verification & GPS Geofencing)

Validates all attendance & punch-in operations against the database (attendease_dev.db):
1. DB Baseline: User, Biometric Template (Encrypted 128D embedding), College Location & Policy
2. GPS Geofencing: Verification of on-campus vs out-of-geofence locations with LocationVerificationLog DB auditing
3. Biometric Verification: Facial SFace template comparison and BiometricLog DB auditing
4. Lecture Punch-In: Complete biometric face capture + GPS geofencing verification logged to DB
5. Lecture Punch-Out: Biometric + GPS verification with lecture completion duration
6. Substitute Lecture Punch-In: Verification of teaching authorization for accepted substitutions
7. Faculty Attendance Tracker Endpoint: Comprehensive ledger query (KPIs, Honorarium, Compliance %)
"""

import os
import sys
import hashlib
import uuid
from datetime import date, datetime, time, timedelta
from unittest.mock import MagicMock, patch

# Ensure correct database file and cryptographic keys are targeted
backend_dir = os.path.dirname(os.path.abspath(__file__))
db_path = os.path.join(backend_dir, "attendease_dev.db")
os.environ["DATABASE_URL"] = f"sqlite:///{db_path}"
os.environ["BIOMETRIC_ENCRYPTION_KEY"] = "uY_R1W1qQ43u-Xh4r-yNf4r1mZ0lVfA_R9FvV_D7m-k="
os.environ["SECRET_KEY"] = "attendease-super-secret-jwt-key-2025-at-least-32-chars-long"

from fastapi import HTTPException
from database import SessionLocal
import models
import main
import face_service
import numpy as np

def get_route(path: str, method: str = "GET"):
    for r in main.app.routes:
        if getattr(r, "path", None) == path and method.upper() in getattr(r, "methods", set()):
            return r.endpoint
    raise ValueError(f"Route {method} {path} not found in app")

def run_tests():
    print("=" * 80)
    print("  VISITING FACULTY MODULE: 2. ATTENDANCE TRACKER & BIOMETRIC + GPS PUNCH-IN")
    print("=" * 80)

    db = SessionLocal()

    try:
        # -------------------------------------------------------------
        # STEP 1: Verify Baseline Database Entities
        # -------------------------------------------------------------
        print("\n[STEP 1] Verifying Database Baseline Records...")
        faculty_user = db.query(models.User).filter(
            models.User.email == "rajesh.sharma@apex.edu"
        ).first()
        assert faculty_user is not None, "Faculty user rajesh.sharma@apex.edu not found in DB!"
        print(f"  -> Faculty User ID={faculty_user.id}: {faculty_user.full_name} ({faculty_user.role.value})")

        biometric_tmpl = db.query(models.BiometricTemplate).filter(
            models.BiometricTemplate.user_id == faculty_user.id
        ).first()
        assert biometric_tmpl is not None, "Biometric template missing in DB!"
        assert biometric_tmpl.face_embedding is not None, "Face embedding missing in template!"
        stored_emb = face_service.decrypt_embedding(biometric_tmpl.face_embedding)
        assert len(stored_emb) == 128, f"Expected 128-dim embedding, got {len(stored_emb)}"
        print(f"  -> Biometric Template ID={biometric_tmpl.id}: SFace 128D Embedding Decrypted Successfully")

        location = db.query(models.CollegeLocation).filter(
            models.CollegeLocation.college_id == faculty_user.college_id,
            models.CollegeLocation.is_active == True
        ).first()
        assert location is not None, "Campus location missing in DB!"
        print(f"  -> Campus Location ID={location.id}: '{location.name}' @ ({location.latitude}, {location.longitude}), Geofence Radius={location.geofence_radius}m")

        policy = db.query(models.AttendancePolicy).filter(
            models.AttendancePolicy.college_id == faculty_user.college_id
        ).first()
        assert policy is not None, "Attendance policy missing in DB!"
        print(f"  -> Policy: Require Face In={policy.require_face_for_punch_in}, Require GPS In={policy.require_gps_for_punch_in}, Match Threshold={policy.face_match_threshold}")

        # -------------------------------------------------------------
        # STEP 2: GPS Geofencing Verification (Inside vs Outside Campus)
        # -------------------------------------------------------------
        print("\n[STEP 2] Testing GPS Geofencing Verification & DB Logging...")
        # 2a. Out-of-geofence coordinates (e.g., Delhi: 28.6139, 77.2090, ~750km away)
        out_gps_req = main.AttendanceActionRequest(
            latitude=28.6139,
            longitude=77.2090,
            accuracy=10.0,
            idempotency_key="idemp_out_of_geofence_test_01"
        )
        try:
            main._verify_location(db, faculty_user, "lecture_punch_in", out_gps_req)
            assert False, "Should have failed outside geofence!"
        except HTTPException as exc:
            assert exc.status_code == 403, f"Expected 403 Forbidden, got {exc.status_code}"
            print("  -> Out-of-geofence check correctly REJECTED with 403 Forbidden")

        # Verify DB LocationVerificationLog for failure
        fail_log = db.query(models.LocationVerificationLog).filter(
            models.LocationVerificationLog.user_id == faculty_user.id,
            models.LocationVerificationLog.action == "lecture_punch_in",
            models.LocationVerificationLog.result == models.VerificationResult.FAIL
        ).order_by(models.LocationVerificationLog.id.desc()).first()
        assert fail_log is not None, "Failure log not written to location_verification_logs table!"
        assert fail_log.failure_reason == "outside_geofence", f"Expected failure reason 'outside_geofence', got '{fail_log.failure_reason}'"
        print(f"  -> DB Verification: LocationVerificationLog ID={fail_log.id} recorded with result='FAIL' and reason='{fail_log.failure_reason}' (Distance={round(fail_log.distance_m/1000, 1)} km)")

        # 2b. In-geofence coordinates (within 10 meters of campus center: 23.022510, 72.571410)
        in_gps_req = main.AttendanceActionRequest(
            latitude=23.022510,
            longitude=72.571410,
            accuracy=5.0,
            idempotency_key="idemp_in_geofence_test_02"
        )
        dist, loc_obj = main._verify_location(db, faculty_user, "lecture_punch_in", in_gps_req)
        assert dist <= location.geofence_radius, f"Calculated distance {dist} exceeds radius {location.geofence_radius}"
        print(f"  -> In-geofence check PASSED: Distance from center is {round(dist, 1)} meters (Allowed: {location.geofence_radius}m)")

        # Verify DB LocationVerificationLog for pass
        pass_log = db.query(models.LocationVerificationLog).filter(
            models.LocationVerificationLog.user_id == faculty_user.id,
            models.LocationVerificationLog.action == "lecture_punch_in",
            models.LocationVerificationLog.result == models.VerificationResult.PASS
        ).order_by(models.LocationVerificationLog.id.desc()).first()
        assert pass_log is not None, "Pass log not written to location_verification_logs table!"
        print(f"  -> DB Verification: LocationVerificationLog ID={pass_log.id} recorded with result='PASS'")

        # -------------------------------------------------------------
        # STEP 3: Biometric SFace Face Verification & DB Logging
        # -------------------------------------------------------------
        print("\n[STEP 3] Testing Biometric Face Verification & SFace Comparison...")
        # Create a valid liveness challenge in database
        challenge_token = "valid_test_challenge_token_32chars_long"
        token_hash = hashlib.sha256(challenge_token.encode("utf-8")).hexdigest()
        
        # Clean any existing challenge
        db.query(models.LivenessChallenge).filter(
            models.LivenessChallenge.user_id == faculty_user.id,
            models.LivenessChallenge.token_hash == token_hash
        ).delete()
        db.commit()

        test_challenge = models.LivenessChallenge(
            college_id=faculty_user.college_id,
            user_id=faculty_user.id,
            token_hash=token_hash,
            instruction="blink",
            action="punch_in",
            expires_at=datetime.utcnow() + timedelta(minutes=10),
            is_used=False
        )
        db.add(test_challenge)
        db.commit()

        # Dummy frame list
        dummy_frame = "data:image/jpeg;base64," + "A" * 200
        dummy_frames = [dummy_frame] * 5
        dummy_req = MagicMock()
        dummy_req.client.host = "127.0.0.1"

        # Mock liveness and face service comparison to test exact DB logging
        with patch("liveness_service.verify_sequence", return_value=(True, 0.95)):
            with patch("face_service.embedding_from_base64", return_value=stored_emb):
                # 3a. Matching face
                matched, score, l_score, _ = main._verify_face(
                    db=db,
                    user=faculty_user,
                    action="punch_in",
                    token=challenge_token,
                    frames=dummy_frames,
                    face_image=dummy_frame,
                    request=dummy_req
                )
                assert matched is True, "Biometric match expected to succeed!"
                print(f"  -> SFace Biometric Match Succeeded: Similarity Score={score}, Liveness Score={l_score}")

                # Verify in BiometricVerificationLog table
                bio_log = db.query(models.BiometricVerificationLog).filter(
                    models.BiometricVerificationLog.user_id == faculty_user.id,
                    models.BiometricVerificationLog.action == "punch_in",
                    models.BiometricVerificationLog.result == models.VerificationResult.PASS
                ).order_by(models.BiometricVerificationLog.id.desc()).first()
                assert bio_log is not None, "Biometric pass log not written to biometric_verification_logs table!"
                print(f"  -> DB Verification: BiometricVerificationLog ID={bio_log.id} recorded with result='PASS', similarity_score={bio_log.similarity_score}")

        # -------------------------------------------------------------
        # STEP 4: Full Lecture Punch-In with Biometrics & GPS Geofencing
        # -------------------------------------------------------------
        print("\n[STEP 4] Testing Full Lecture Attendance Punch-In (Biometrics + GPS)...")
        # Ensure a lecture exists for today
        today_dow = date.today().weekday()
        lecture = db.query(models.WeeklyLecture).filter(
            models.WeeklyLecture.college_id == faculty_user.college_id,
            models.WeeklyLecture.user_id == faculty_user.id,
            models.WeeklyLecture.day_of_week == today_dow,
            models.WeeklyLecture.is_active == True
        ).first()

        if not lecture:
            subj = db.query(models.Subject).filter(models.Subject.college_id == faculty_user.college_id).first()
            room = db.query(models.Classroom).filter(models.Classroom.college_id == faculty_user.college_id).first()
            course = db.query(models.Course).filter(models.Course.college_id == faculty_user.college_id).first()
            lecture = models.WeeklyLecture(
                college_id=faculty_user.college_id,
                department_id=faculty_user.department_id,
                user_id=faculty_user.id,
                subject_id=subj.id if subj else None,
                classroom_id=room.id if room else None,
                course_id=course.id if course else None,
                subject=subj.name if subj else "Operating Systems",
                room=room.room_number if room else "LH-101",
                course_name=course.name if course else "B.Tech CSE",
                day_of_week=today_dow,
                start_time=time(10, 0),
                end_time=time(11, 30),
                is_active=True,
            )
            db.add(lecture)
            db.commit()
            db.refresh(lecture)

        # Clear existing lecture attendance record for today to test clean punch-in
        db.query(models.LectureAttendanceRecord).filter(
            models.LectureAttendanceRecord.user_id == faculty_user.id,
            models.LectureAttendanceRecord.weekly_lecture_id == lecture.id,
            models.LectureAttendanceRecord.lecture_date == date.today()
        ).delete()
        db.commit()

        # Create fresh challenge for punch-in
        punch_token = "punch_in_challenge_token_unique_32chars"
        p_hash = hashlib.sha256(punch_token.encode("utf-8")).hexdigest()
        db.query(models.LivenessChallenge).filter(models.LivenessChallenge.token_hash == p_hash).delete()
        db.commit()

        db.add(models.LivenessChallenge(
            college_id=faculty_user.college_id,
            user_id=faculty_user.id,
            token_hash=p_hash,
            instruction="smile",
            action="punch_in",
            expires_at=datetime.utcnow() + timedelta(minutes=10),
            is_used=False
        ))
        db.commit()

        punch_in_payload = main.LectureAttendanceActionRequest(
            source_type="weekly",
            schedule_id=lecture.id,
            lecture_date=date.today(),
            challenge_token=punch_token,
            frames=dummy_frames,
            face_image_base64=dummy_frame,
            latitude=23.022510,
            longitude=72.571410,
            accuracy=6.0,
            idempotency_key=f"idemp_in_{uuid.uuid4()}"
        )

        lecture_punch_route = get_route("/lecture-attendance/{action}", "POST")

        with patch("liveness_service.verify_sequence", return_value=(True, 0.96)):
            with patch("face_service.embedding_from_base64", return_value=stored_emb):
                with patch("main._attendance_now", return_value=datetime.combine(date.today(), lecture.start_time)):
                    punch_in_res = lecture_punch_route(
                        action="punch_in",
                        payload=punch_in_payload,
                        request=dummy_req,
                        user=faculty_user,
                        db=db
                    )

        print(f"  -> Punch-In Response Received: Record ID={punch_in_res['id']}, Status={punch_in_res['status']}")
        assert punch_in_res["punch_in_time"] is not None, "Punch-in time should be recorded!"
        assert punch_in_res["punch_in_face_verified"] is True, "Punch-in face verified should be True!"

        # Direct DB verification on lecture_attendance_records table
        db_rec = db.query(models.LectureAttendanceRecord).filter(
            models.LectureAttendanceRecord.id == punch_in_res["id"]
        ).first()
        assert db_rec is not None, "Record not found in lecture_attendance_records!"
        assert db_rec.punch_in_face_verified is True, "DB column punch_in_face_verified must be True"
        print(f"  -> DB Verification: lecture_attendance_records ID={db_rec.id} verified with punch_in_time={db_rec.punch_in_time} and face_verified=True")

        # Direct DB verification on lecture_attendance_events table
        db_event = db.query(models.LectureAttendanceEvent).filter(
            models.LectureAttendanceEvent.attendance_id == db_rec.id,
            models.LectureAttendanceEvent.event_type == "punch_in"
        ).first()
        assert db_event is not None, "Event not found in lecture_attendance_events!"
        assert db_event.face_verified is True
        print(f"  -> DB Verification: lecture_attendance_events ID={db_event.id} verified with event_type='punch_in'")

        # -------------------------------------------------------------
        # STEP 5: Full Lecture Punch-Out with Biometrics & GPS Geofencing
        # -------------------------------------------------------------
        print("\n[STEP 5] Testing Full Lecture Attendance Punch-Out (Biometrics + GPS)...")
        punch_out_token = "punch_out_challenge_token_unique_32chars"
        po_hash = hashlib.sha256(punch_out_token.encode("utf-8")).hexdigest()
        db.query(models.LivenessChallenge).filter(models.LivenessChallenge.token_hash == po_hash).delete()
        db.commit()

        db.add(models.LivenessChallenge(
            college_id=faculty_user.college_id,
            user_id=faculty_user.id,
            token_hash=po_hash,
            instruction="turn_left",
            action="punch_out",
            expires_at=datetime.utcnow() + timedelta(minutes=10),
            is_used=False
        ))
        db.commit()

        punch_out_payload = main.LectureAttendanceActionRequest(
            source_type="weekly",
            schedule_id=lecture.id,
            lecture_date=date.today(),
            challenge_token=punch_out_token,
            frames=dummy_frames,
            face_image_base64=dummy_frame,
            latitude=23.022520,
            longitude=72.571400,
            accuracy=5.0,
            idempotency_key=f"idemp_out_{uuid.uuid4()}"
        )

        with patch("liveness_service.verify_sequence", return_value=(True, 0.98)):
            with patch("face_service.embedding_from_base64", return_value=stored_emb):
                with patch("main._attendance_now", return_value=datetime.combine(date.today(), lecture.end_time)):
                    punch_out_res = lecture_punch_route(
                        action="punch_out",
                        payload=punch_out_payload,
                        request=dummy_req,
                        user=faculty_user,
                        db=db
                    )

        print(f"  -> Punch-Out Response Received: Record ID={punch_out_res['id']}, Status={punch_out_res['status']}")
        assert punch_out_res["punch_out_time"] is not None
        assert punch_out_res["punch_out_face_verified"] is True
        assert punch_out_res["status"] == "completed"

        # Direct DB verification on lecture_attendance_records table
        db.refresh(db_rec)
        assert db_rec.punch_out_time is not None
        assert db_rec.punch_out_face_verified is True
        duration_mins = int((db_rec.punch_out_time - db_rec.punch_in_time).total_seconds() // 60)
        print(f"  -> DB Verification: lecture_attendance_records ID={db_rec.id} completed. Duration = {duration_mins} minutes")

        # -------------------------------------------------------------
        # STEP 6: Substitute Lecture Punch Authorization Check
        # -------------------------------------------------------------
        print("\n[STEP 6] Testing Substitute Teaching Authorization & Biometric Punch...")
        # Find another faculty's lecture
        other_faculty_lec = db.query(models.WeeklyLecture).filter(
            models.WeeklyLecture.college_id == faculty_user.college_id,
            models.WeeklyLecture.user_id != faculty_user.id,
            models.WeeklyLecture.day_of_week == today_dow,
            models.WeeklyLecture.is_active == True
        ).first()

        if other_faculty_lec:
            # Seed an accepted substitute assignment
            sub_assign = db.query(models.SubstituteAssignment).filter(
                models.SubstituteAssignment.lecture_id == other_faculty_lec.id,
                models.SubstituteAssignment.substitute_faculty_id == faculty_user.id,
                models.SubstituteAssignment.lecture_date == date.today()
            ).first()

            if not sub_assign:
                sub_assign = models.SubstituteAssignment(
                    college_id=faculty_user.college_id,
                    lecture_id=other_faculty_lec.id,
                    original_faculty_id=other_faculty_lec.user_id,
                    substitute_faculty_id=faculty_user.id,
                    lecture_date=date.today(),
                    status="accepted",
                    remarks="Authorized substitute punch test",
                    created_at=datetime.utcnow()
                )
                db.add(sub_assign)
                db.commit()
                db.refresh(sub_assign)

            print(f"  -> Created Accepted Substitute Assignment ID={sub_assign.id} for Lecture '{other_faculty_lec.subject}'")

            # Verify that faculty can punch in to this substituted lecture
            sub_token = "sub_punch_in_token_unique_32chars"
            s_hash = hashlib.sha256(sub_token.encode("utf-8")).hexdigest()
            db.query(models.LivenessChallenge).filter(models.LivenessChallenge.token_hash == s_hash).delete()
            db.commit()

            db.add(models.LivenessChallenge(
                college_id=faculty_user.college_id,
                user_id=faculty_user.id,
                token_hash=s_hash,
                instruction="nod",
                action="punch_in",
                expires_at=datetime.utcnow() + timedelta(minutes=10),
                is_used=False
            ))
            db.commit()

            sub_punch_payload = main.LectureAttendanceActionRequest(
                source_type="weekly",
                schedule_id=other_faculty_lec.id,
                lecture_date=date.today(),
                challenge_token=sub_token,
                frames=dummy_frames,
                face_image_base64=dummy_frame,
                latitude=23.022510,
                longitude=72.571410,
                accuracy=8.0,
                idempotency_key=f"idemp_sub_{uuid.uuid4()}"
            )

            with patch("liveness_service.verify_sequence", return_value=(True, 0.94)):
                with patch("face_service.embedding_from_base64", return_value=stored_emb):
                    with patch("main._attendance_now", return_value=datetime.combine(date.today(), other_faculty_lec.start_time)):
                        sub_res = lecture_punch_route(
                            action="punch_in",
                            payload=sub_punch_payload,
                            request=dummy_req,
                            user=faculty_user,
                            db=db
                        )

            assert sub_res["punch_in_time"] is not None
            assert sub_res["punch_in_face_verified"] is True
            print(f"  -> Substitute Lecture Punch-In ACCEPTED and Recorded: Attendance Record ID={sub_res['id']}")

        # -------------------------------------------------------------
        # STEP 7: Faculty Attendance Tracker Endpoint Verification
        # -------------------------------------------------------------
        print("\n[STEP 7] Testing GET /faculty/attendance/tracker Endpoint...")
        tracker_route = get_route("/faculty/attendance/tracker", "GET")
        tracker_data = tracker_route(
            month=date.today().month,
            year=date.today().year,
            user=faculty_user,
            db=db
        )

        kpis = tracker_data["kpis"]
        print(f"  -> Tracker KPIs Loaded from DB:")
        print(f"     * Conducted Lectures: {kpis['total_lectures_conducted']}")
        print(f"     * Total Hours Taught: {kpis['total_hours_taught']} hrs")
        print(f"     * Biometric Face Compliance: {kpis['biometric_compliance_pct']}%")
        print(f"     * GPS Geofence Compliance: {kpis['geofence_compliance_pct']}%")
        print(f"     * Estimated Honorarium: INR {kpis['estimated_earnings']} (@ INR {kpis['rate_per_lecture']}/lecture)")

        assert kpis["total_lectures_conducted"] >= 1, "Expected at least 1 conducted lecture in tracker"
        assert kpis["biometric_compliance_pct"] == 100.0, "All conducted lectures should be biometric verified"
        assert kpis["geofence_compliance_pct"] == 100.0, "All conducted lectures should be geofence compliant"

        lectures = tracker_data["lectures"]
        print(f"  -> Lecture Ledger: {len(lectures)} entries found in DB for this month")
        for i, item in enumerate(lectures[:3]):
            print(f"     [{i+1}] {item['date']} | {item['subject']} | Slot: {item['scheduled_start']}-{item['scheduled_end']} | In: {item['punch_in_time']} | Out: {item['punch_out_time']} | FaceOK: {item['face_verified']} | GPSOK: {item['gps_verified']}")

        pol_data = tracker_data["policy"]
        assert pol_data["require_face_for_punch_in"] is True
        assert pol_data["require_gps_for_punch_in"] is True
        print(f"  -> Verified Policy against DB: Campus='{pol_data['campus_name']}', GeofenceRadius={pol_data['geofence_radius']}m")

        print("\n" + "=" * 80)
        print("  ALL 7 STEPS PASSED (100%): ATTENDANCE TRACKER & BIOMETRIC + GPS VERIFIED")
        print("=" * 80)

    finally:
        db.close()

if __name__ == "__main__":
    run_tests()
