import os
import sys
from datetime import date, datetime, timedelta

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
    raise ValueError(f"Route {method} {path} not found")

def run():
    db = SessionLocal()
    try:
        users = db.query(models.User).filter(models.User.role == models.UserRole.FACULTY).all()
        for faculty in users:
            print("=" * 60)
            print(f"Testing for Faculty: {faculty.full_name} ({faculty.employee_id}), ID={faculty.id}")

            tracker_fn = get_route("/faculty/attendance/tracker", "GET")
            cal_fn = get_route("/lecture-attendance/calendar", "GET")

            # Test tracker
            res = tracker_fn(month=11, year=2026, user=faculty, db=db)
            metrics = res["metrics"]
            print("Tracker Metrics:", metrics)
            print(f"Lectures count returned: {len(res['lectures'])}")

            # Test calendar
            cal_res = cal_fn(start_date=date(2026, 11, 1), end_date=date(2026, 11, 30), user=faculty, db=db)
            day24 = next((d for d in cal_res if str(d["date"]).startswith("2026-11-24")), None)
            if day24:
                print(f"Day 2026-11-24 lectures count: {len(day24.get('lectures', []))}")
                for l in day24.get("lectures", []):
                    print(f"  - {l['scheduled_start']}-{l['scheduled_end']}: {l['subject']} ({l['status']})")
    finally:
        db.close()

if __name__ == "__main__":
    run()
