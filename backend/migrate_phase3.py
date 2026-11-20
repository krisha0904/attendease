import pymysql

conn = pymysql.connect(host='127.0.0.1', user='root', password='', database='attendease_db')
cursor = conn.cursor()
try:
    cursor.execute("""
        ALTER TABLE users 
        MODIFY COLUMN face_enrollment_status ENUM('NOT_ENROLLED','PENDING_APPROVAL','APPROVED','REJECTED','REVOKED','RE_ENROLLMENT_REQUIRED','not_enrolled','pending_approval','approved','rejected','revoked','re_enrollment_required') DEFAULT 'NOT_ENROLLED';
    """)
    cursor.execute("""
        ALTER TABLE biometric_templates 
        MODIFY COLUMN enrollment_status ENUM('NOT_ENROLLED','PENDING_APPROVAL','APPROVED','REJECTED','REVOKED','RE_ENROLLMENT_REQUIRED','not_enrolled','pending_approval','approved','rejected','revoked','re_enrollment_required') DEFAULT 'PENDING_APPROVAL';
    """)
    cursor.execute("""
        ALTER TABLE biometric_enrollments 
        MODIFY COLUMN status ENUM('NOT_ENROLLED','PENDING_APPROVAL','APPROVED','REJECTED','REVOKED','RE_ENROLLMENT_REQUIRED','not_enrolled','pending_approval','approved','rejected','revoked','re_enrollment_required') DEFAULT 'PENDING_APPROVAL';
    """)
    conn.commit()
    print("SUCCESS: Updated MySQL ENUM types for Phase 3 Biometric Status!")
except Exception as e:
    print("Notice / Error altering enums:", e)
finally:
    conn.close()
