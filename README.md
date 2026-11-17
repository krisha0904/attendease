# AttendEase

AttendEase is a college attendance web app for visiting faculty and staff. It uses a React/TypeScript website and a FastAPI/Python backend.

## What works in this college-project MVP

- Email-verified, college-ID-validated registration for existing colleges, plus email OTP sign-in.
- Face enrollment with local passive liveness checking and administrator approval.
- Daily check-in, break start/end, and check-out; punch-in and punch-out require approved face enrollment and live face verification.
- Visiting faculty and staff accounts, departments, and working shifts.
- A searchable college faculty directory with email and phone links.
- College projects and assigned tasks with due dates, project links, and progress updates.
- Leave requests, approvals, notifications, and daily attendance CSV reports.
- Role-based screens for faculty/staff, HODs, and the college administrator.

Class-period timetables and GPS geofencing are not implemented yet. Email delivery requires SMTP configuration. Face liveness runs locally with the bundled MiniFASNet ONNX models; the model has not been independently validated for this application's cameras or deployment and this college project is not production-hardened.

## Prerequisites

- Python 3.12
- Node.js LTS and npm
- XAMPP with MySQL/MariaDB
- Windows PowerShell
- An SMTP account for verification emails

## Start the project (Windows PowerShell)

Open XAMPP Control Panel and start **MySQL**. Open `http://localhost/phpmyadmin`, select the **SQL** tab, and create the app database and account (replace the sample password with your own):

```sql
CREATE DATABASE IF NOT EXISTS attendease_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'attendease_app'@'localhost' IDENTIFIED BY 'YOUR_DB_PASSWORD';
CREATE USER IF NOT EXISTS 'attendease_app'@'127.0.0.1' IDENTIFIED BY 'YOUR_DB_PASSWORD';
ALTER USER 'attendease_app'@'localhost' IDENTIFIED BY 'YOUR_DB_PASSWORD';
ALTER USER 'attendease_app'@'127.0.0.1' IDENTIFIED BY 'YOUR_DB_PASSWORD';
GRANT ALL PRIVILEGES ON attendease_db.* TO 'attendease_app'@'localhost';
GRANT ALL PRIVILEGES ON attendease_db.* TO 'attendease_app'@'127.0.0.1';
FLUSH PRIVILEGES;
```

Open two PowerShell windows. In both, start from the project folder containing `backend` and `frontend`.

### 1. Prepare and start the backend

```powershell
Set-Location .\backend
if (-not (Test-Path .\.venv-py312\Scripts\python.exe)) { py -3.12 -m venv .venv-py312 }
.\.venv-py312\Scripts\python.exe -m pip install -r requirements.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

In `backend\.env`, set `DATABASE_URL` to use the same password from the SQL query:

```text
DATABASE_URL=mysql+pymysql://attendease_app:YOUR_DB_PASSWORD@127.0.0.1:3306/attendease_db?charset=utf8mb4
```

Also set `SECRET_KEY` to a unique random value of at least 32 characters. Generate one with:

```powershell
.\.venv-py312\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(48))"
```

For Gmail OTP delivery, set these values in `backend\.env`:

```text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-sender@gmail.com
SMTP_PASSWORD=your-16-character-Google-App-Password
SMTP_FROM=your-sender@gmail.com
```

`SMTP_FROM` is the sender address recipients see in Gmail; if left blank, it uses `SMTP_USERNAME`. To create the SMTP password, enable 2-Step Verification on the sender's Google account, then generate an App Password in Google Account security settings. Use that app-specific password, not the normal Gmail password. Keep it private and only in `backend\.env`; never paste it into source code or chat. Login codes are sent to the registered address and should appear in that account's Gmail inbox on the phone (check Spam if they do not). For face enrollment and attendance, set `BIOMETRIC_ENCRYPTION_KEY`. Liveness inference uses bundled MiniFASNet models locally; no face images are sent to an external liveness service. An optional custom in-process provider can override it with `LIVENESS_PROVIDER`.

The bundled anti-spoof models are from [Silent-Face-Anti-Spoofing ONNX](https://github.com/QingHeYang/Silent-Face-Anti-Spoofing-onnx), based on [MiniVision Silent-Face-Anti-Spoofing](https://github.com/minivision-ai/Silent-Face-Anti-Spoofing), and are distributed under Apache-2.0. The license is in `backend\assets\face_models\MINIFASNET-APACHE-2.0-LICENSE.txt`. Validate performance with your camera, lighting, and users before relying on biometric decisions.

Create the database tables:

```powershell
.\.venv-py312\Scripts\python.exe -m alembic upgrade head
```

Provision the first college and its administrator from the backend terminal:

```powershell
.\.venv-py312\Scripts\python.exe .\bootstrap_admin.py
```

Enter the college name and its unique College ID when prompted. The bootstrap command is for the initial administrator; additional active colleges must be provisioned by an authorized database administrator with a unique `colleges.code`. The registration dropdown displays active colleges, and the entered College ID is checked against that college's code.

Start the API:

```powershell
.\.venv-py312\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

The API is available at `http://127.0.0.1:8000`; interactive API documentation is at `http://127.0.0.1:8000/docs`.

### 2. Start the website

In the second PowerShell window:

```powershell
Set-Location .\frontend
if (-not (Test-Path .\node_modules)) { & 'C:\Program Files\nodejs\npm.cmd' ci }
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
& 'C:\Program Files\nodejs\npm.cmd' run dev
```

Open the local address printed by Vite (usually `http://localhost:5173`) and select **New here? Register**. Colleges and their unique IDs must be provisioned by an administrator before users can register; the registration page only lists active colleges. The user selects a college, enters the College ID supplied by its administrator, and receives an email OTP. The permanent user account is created only after the OTP is verified. Sign in with the registered email; the sign-in code is sent to that email, expires in 2–5 minutes based on the college's policy (five minutes by default), and can be resent once per minute. Complete face enrollment and wait for an administrator to approve it before using punch-in or punch-out.

Share the college code only with people who should join the college. Use **People & setup** to create departments and working shifts, and **Approvals** to review face enrollments. This build records daily attendance rather than timetable-specific class periods.

## Tests

From `backend`:

```powershell
.\.venv-py312\Scripts\python.exe -m pytest -q
.\.venv-py312\Scripts\python.exe -m alembic check
```

From `frontend`:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run build
& 'C:\Program Files\nodejs\npm.cmd' run lint
```

## Notes

Without a MySQL `DATABASE_URL`, the backend falls back to `backend\attendease_dev.db` (SQLite). Keep `.env` files, database files, virtual environment, and `frontend\node_modules` when cleaning project files. Do not use this MVP for production attendance enforcement without appropriate security, privacy, accessibility, email verification, backup, and operational reviews.
