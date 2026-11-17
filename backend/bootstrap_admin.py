import hmac
from getpass import getpass

import models
from database import SessionLocal
from password_service import hash_password


def main() -> None:
    college_name = input("College name: ").strip()
    college_code = input("Unique college code: ").strip().upper()
    admin_name = input("Administrator name: ").strip()
    admin_employee_id = input("Administrator employee ID: ").strip()
    admin_email = input("Administrator college email: ").strip().lower()
    password = getpass("Administrator password (minimum 12 characters): ")
    password_confirmation = getpass("Confirm administrator password: ")

    if not all((college_name, college_code, admin_name, admin_employee_id, admin_email, password)):
        raise ValueError("All values are required.")
    if len(password) < 12:
        raise ValueError("Password must contain at least 12 characters.")
    if len(password) > 128:
        raise ValueError("Password must not exceed 128 characters.")
    if not hmac.compare_digest(password, password_confirmation):
        raise ValueError("Passwords do not match.")

    with SessionLocal() as db:
        if db.query(models.User.id).filter(models.User.role == models.UserRole.SUPER_ADMIN).first():
            raise RuntimeError("A super administrator already exists; refusing to create another bootstrap account.")
        if db.query(models.College.id).filter(models.College.code == college_code).first():
            raise ValueError("That college code is already registered.")

        college = models.College(name=college_name, code=college_code)
        db.add(college)
        db.flush()
        db.add(
            models.User(
                college_id=college.id,
                employee_id=admin_employee_id,
                full_name=admin_name,
                email=admin_email,
                password_hash=hash_password(password),
                role=models.UserRole.SUPER_ADMIN,
                is_active=True,
            )
        )
        db.commit()
        print(f"Created the first administrator for {college_name} ({college_code}).")
        print("The administrator can now sign in with email and password.")


if __name__ == "__main__":
    main()
