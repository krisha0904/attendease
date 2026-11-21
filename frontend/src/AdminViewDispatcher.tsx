import React, { useState } from 'react'
import {
  Activity, Building2,
  CheckCircle2, Clock3, CreditCard, Database, Download,
  FileSpreadsheet, Fingerprint, Megaphone,
  ScrollText, Settings, ShieldAlert,
  ShieldCheck, UserCheck, UserPlus, Users, AlertCircle
} from 'lucide-react'
import { AdminPageScaffold } from './AdminComponents'
import { AdminDashboardPage } from './AdminDashboardPage'
import { VisitingFacultyPage } from './VisitingFacultyPage'
import { FaceRegistrationPage } from './FaceRegistrationPage'
import { DepartmentManagementPage } from './DepartmentManagementPage'
import { CourseSubjectManagementPage } from './CourseSubjectManagementPage'
import { AcademicYearPage } from './AcademicYearPage'
import { LectureTimetablePage } from './LectureTimetablePage'
import { ClassroomManagementPage } from './ClassroomManagementPage'
import { HolidayManagementPage } from './HolidayManagementPage'
import { AttendanceManagementPage } from './AttendanceManagementPage'
import { AttendanceCorrectionsPage } from './AttendanceCorrectionsPage'
import { AvailabilityManagementPage } from './AvailabilityManagementPage'
import { LeaveManagementPage } from './LeaveManagementPage'

interface AdminViewProps {
  page: string
  user?: any
  onNavigate: (page: string) => void
  existingComponents?: {
    dashboard?: React.ReactNode
    timetable?: React.ReactNode
    attendance?: React.ReactNode
    leave?: React.ReactNode
    approvals?: React.ReactNode
    reports?: React.ReactNode
    people?: React.ReactNode
    directory?: React.ReactNode
    notifications?: React.ReactNode
  }
}

export function AdminViewDispatcher({
  page,
  user: _user,
  onNavigate,
  existingComponents = {},
}: AdminViewProps) {
  // Common search and filter states
  const [_searchTerm, _setSearchTerm] = useState('')
  const [_deptFilter, _setDeptFilter] = useState('all')

  switch (page) {
    case 'dashboard':
      return <AdminDashboardPage onNavigate={onNavigate} />

    case 'visiting_faculty':
      return <VisitingFacultyPage onNavigateToBiometrics={() => onNavigate('face_registration')} />

    case 'face_registration':
      return <FaceRegistrationPage />

    case 'departments':
      return <DepartmentManagementPage />

    case 'courses_subjects':
      return <CourseSubjectManagementPage />

    case 'academic_years':
      return <AcademicYearPage />

    case 'timetable':
      return <LectureTimetablePage />

    case 'classrooms':
      return <ClassroomManagementPage />

    case 'holidays':
      return <HolidayManagementPage />

    case 'attendance':
      return <AttendanceManagementPage />

    case 'attendance_corrections':
      return <AttendanceCorrectionsPage />

    case 'availability':
      return <AvailabilityManagementPage />

    case 'leave':
      return <LeaveManagementPage onNavigateToTimetable={() => onNavigate('timetable')} />

    case 'substitute_faculty':
      return (
        <AdminPageScaffold
          title="Substitute Faculty Management"
          eyebrow="CONTINGENCY REPLACEMENTS"
          description="Find subject-qualified faculty, check availability conflicts, and assign authorized replacements."
          actions={
            <button className="button button-primary" onClick={() => alert('Assign substitute')}>
              <UserPlus size={15} /> New Replacement Assignment
            </button>
          }
          stats={[
            { label: 'Pending Substitutions', value: '1', note: 'Affects lecture today', icon: AlertCircle },
            { label: 'Completed Substitutions', value: '14', note: 'This semester', icon: CheckCircle2 },
            { label: 'Available Standby Faculty', value: '8', note: 'Qualified & unbooked', icon: UserCheck },
          ]}
        >
          <div className="panel">
            <div className="table-scroll">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>Lecture</th>
                    <th>Scheduled Date</th>
                    <th>Original Faculty</th>
                    <th>Subject</th>
                    <th>Assigned Substitute</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>LH-101 (11:00 AM)</td>
                    <td>Today (19 Nov)</td>
                    <td>Dr. Vikram Patel (On Leave)</td>
                    <td>Robotics & Automation</td>
                    <td><em>Pending Assignment</em></td>
                    <td><span className="badge badge-pending">Needs Substitute</span></td>
                    <td>
                      <button className="button button-primary" onClick={() => alert('Search eligible replacements')}>
                        Find Replacement
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </AdminPageScaffold>
      )

    case 'notifications':
      return existingComponents.notifications ? (
        <AdminPageScaffold
          title="Notifications & Announcements"
          eyebrow="INSTITUTION BROADCAST"
          description="Send individual alerts, department announcements, schedule change alerts, and push updates."
          actions={
            <button className="button button-primary" onClick={() => alert('Broadcast announcement')}>
              <Megaphone size={15} /> Broadcast Announcement
            </button>
          }
        >
          {existingComponents.notifications}
        </AdminPageScaffold>
      ) : (
        <AdminPageScaffold
          title="Notifications & Announcements"
          eyebrow="INSTITUTION BROADCAST"
          description="Send individual alerts, department announcements, schedule change alerts, and push updates."
        />
      )

    case 'reports':
      return existingComponents.reports ? (
        <AdminPageScaffold
          title="Reports & Analytics"
          eyebrow="ANALYTICS & EXPORTS"
          description="Generate daily, weekly, and monthly attendance reports, workload analytics, and compliance summaries."
        >
          {existingComponents.reports}
        </AdminPageScaffold>
      ) : (
        <AdminPageScaffold
          title="Reports & Analytics"
          eyebrow="ANALYTICS & EXPORTS"
          description="Generate daily, weekly, and monthly attendance reports, workload analytics, and compliance summaries."
        />
      )

    case 'workload_payment':
      return (
        <AdminPageScaffold
          title="Workload & Payment Summary"
          eyebrow="HONORARIUM & BILLING PREPARATION"
          description="Audit total taught hours, verified lecture completions, hourly billing rates, and monthly remuneration."
          actions={
            <div className="admin-actions-row">
              <button className="button button-primary" onClick={() => alert('Export honorarium statement')}>
                <Download size={15} /> Export Honorarium Sheet (CSV)
              </button>
              <button className="button button-secondary" onClick={() => alert('Configure rates')}>
                <Settings size={15} /> Configure Rates
              </button>
            </div>
          }
          stats={[
            { label: 'Completed Lectures', value: '312', note: 'November Month', icon: Clock3 },
            { label: 'Total Teaching Hours', value: '468 hrs', note: 'Face & GPS Verified', icon: Activity },
            { label: 'Estimated Payable', value: '₹ 4,68,000', note: 'Based on ₹1,000 / hr default', icon: CreditCard },
          ]}
        >
          <div className="panel">
            <div className="table-scroll">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>Faculty ID</th>
                    <th>Faculty Name</th>
                    <th>Department</th>
                    <th>Lectures Done</th>
                    <th>Taught Hours</th>
                    <th>Rate / Hr</th>
                    <th>Estimated Amount</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>VF-2025-001</strong></td>
                    <td>Dr. Rajesh Sharma</td>
                    <td>Computer Engineering</td>
                    <td>24</td>
                    <td>36 hrs</td>
                    <td>₹ 1,200</td>
                    <td><strong>₹ 43,200</strong></td>
                    <td><button className="button button-secondary">Audit Sheet</button></td>
                  </tr>
                  <tr>
                    <td><strong>VF-2025-002</strong></td>
                    <td>Prof. Anita Desai</td>
                    <td>Information Technology</td>
                    <td>28</td>
                    <td>42 hrs</td>
                    <td>₹ 1,000</td>
                    <td><strong>₹ 42,000</strong></td>
                    <td><button className="button button-secondary">Audit Sheet</button></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </AdminPageScaffold>
      )

    case 'import_export':
      return (
        <AdminPageScaffold
          title="Import & Export Management"
          eyebrow="BULK DATA OPERATIONS"
          description="Batch import visiting faculty, departments, subject maps, and export attendance records."
          stats={[
            { label: 'Faculty Records Exportable', value: '48', note: 'Full demographic schema', icon: Users },
            { label: 'Historical Attendance', value: '2,480', note: 'All-time verified logs', icon: FileSpreadsheet },
            { label: 'Last Export Batch', value: 'Today, 10:15 AM', note: 'CSV Attendance Digest', icon: Download },
          ]}
        >
          <div className="admin-two-col-grid">
            <div className="panel">
              <div className="panel-heading">
                <div>
                  <h3>Import Master Data (CSV / Excel)</h3>
                  <p className="muted">Upload CSV with validation, duplicate checks, and preview.</p>
                </div>
              </div>
              <div className="import-box">
                <FileSpreadsheet size={36} className="text-muted" />
                <p>Drag and drop your faculty or schedule CSV file here, or browse.</p>
                <button className="button button-primary">Select File to Import</button>
              </div>
            </div>

            <div className="panel">
              <div className="panel-heading">
                <div>
                  <h3>Export Institutional Records</h3>
                  <p className="muted">Download authenticated data in Excel, CSV, or PDF format.</p>
                </div>
              </div>
              <div className="export-action-list">
                <button className="button button-secondary w-full" onClick={() => alert('Downloading Faculty CSV')}>
                  <Download size={14} /> Export Faculty Directory (CSV)
                </button>
                <button className="button button-secondary w-full" onClick={() => alert('Downloading Master Attendance')}>
                  <Download size={14} /> Export Monthly Attendance Master (CSV)
                </button>
                <button className="button button-secondary w-full" onClick={() => alert('Downloading Honorarium Export')}>
                  <Download size={14} /> Export Workload & Honorarium Audit (CSV)
                </button>
              </div>
            </div>
          </div>
        </AdminPageScaffold>
      )

    case 'institution_settings':
      return (
        <AdminPageScaffold
          title="Institution Settings"
          eyebrow="CAMPUS PROFILE & POLICIES"
          description="Configure institution profile, geofencing coordinates, punch-in windows, and biometric thresholds."
          actions={
            <button className="button button-primary" onClick={() => alert('Settings Saved')}>
              Save Changes
            </button>
          }
          stats={[
            { label: 'Campus Timezone', value: 'Asia/Kolkata', note: 'IANA Standard', icon: Clock3 },
            { label: 'Geofence Radius', value: '100 Metres', note: 'Haversine GPS Formula', icon: Building2 },
            { label: 'Face Match Threshold', value: '0.363 (SFace)', note: 'Strict Cosine Metric', icon: Fingerprint },
          ]}
        >
          <div className="panel">
            <div className="panel-heading">
              <h3>Campus Profile & Branding</h3>
            </div>
            <div className="form-grid">
              <label>College Name<input defaultValue="Govt. Engineering College" /></label>
              <label>Institution Code<input defaultValue="GEC-MAIN" disabled /></label>
              <label>Campus Address<input defaultValue="Academic Avenue, Tech Park Zone" /></label>
              <label>Contact Phone<input defaultValue="+91 79 2397 0000" /></label>
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading">
              <h3>Attendance & GPS Geofence Rules</h3>
            </div>
            <div className="form-grid">
              <label>Campus Latitude<input defaultValue="23.0225" /></label>
              <label>Campus Longitude<input defaultValue="72.5714" /></label>
              <label>Geofence Radius (meters)<input defaultValue="100" type="number" /></label>
              <label>Lecture Punch-in Window<input defaultValue="15 minutes before scheduled start" disabled /></label>
            </div>
          </div>
        </AdminPageScaffold>
      )

    case 'roles_permissions':
      return (
        <AdminPageScaffold
          title="Admin Roles & Permissions"
          eyebrow="ACCESS CONTROL LIST"
          description="Grant module permissions for Super Admin, College Admin, HOD, and Attendance Managers."
          actions={
            <button className="button button-primary" onClick={() => alert('New Admin User')}>
              <UserPlus size={15} /> Add Administrator
            </button>
          }
          stats={[
            { label: 'Super Admins', value: '2', note: 'Full Root Privileges', icon: ShieldCheck },
            { label: 'Department HODs', value: '6', note: 'Department-Scoped', icon: Users },
            { label: 'Attendance Managers', value: '3', note: 'Punch Audit Access', icon: CheckCircle2 },
          ]}
        >
          <div className="panel">
            <div className="table-scroll">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Department Scope</th>
                    <th>Status</th>
                    <th>Last Active</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>admin_super</strong></td>
                    <td>Campus Administrator</td>
                    <td><span className="badge badge-approved">Super Admin</span></td>
                    <td>Institutional (All)</td>
                    <td><span className="badge badge-approved">Active</span></td>
                    <td>Just now</td>
                    <td><button className="button button-secondary">Permissions</button></td>
                  </tr>
                  <tr>
                    <td><strong>hod_cs</strong></td>
                    <td>Dr. Arvind Mehta</td>
                    <td><span className="badge badge-approved">HOD</span></td>
                    <td>Computer Engineering</td>
                    <td><span className="badge badge-approved">Active</span></td>
                    <td>2 hours ago</td>
                    <td><button className="button button-secondary">Permissions</button></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </AdminPageScaffold>
      )

    case 'audit_logs':
      return (
        <AdminPageScaffold
          title="Audit Logs"
          eyebrow="IMMUTABLE SECURITY RECORDS"
          description="Audit trail of all administrative actions, timetable edits, attendance corrections, and biometric approvals."
          stats={[
            { label: 'Total Recorded Actions', value: '842', note: 'Protected from tampering', icon: ScrollText },
            { label: 'Actions Today', value: '19', note: 'Logged with Admin ID & IP', icon: Activity },
            { label: 'Security Severity', value: 'Clean', note: 'No integrity flags', icon: ShieldCheck },
          ]}
        >
          <div className="panel">
            <div className="table-scroll">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Administrator</th>
                    <th>Action</th>
                    <th>Resource Type</th>
                    <th>Resource ID</th>
                    <th>IP Address</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>19 Nov 2026, 17:15</td>
                    <td>admin_super</td>
                    <td>APPROVE_FACE_ENROLLMENT</td>
                    <td>BiometricTemplate</td>
                    <td>#42 (Dr. Rajesh Sharma)</td>
                    <td>127.0.0.1</td>
                  </tr>
                  <tr>
                    <td>19 Nov 2026, 16:40</td>
                    <td>hod_cs</td>
                    <td>APPROVE_ADDITIONAL_LECTURE</td>
                    <td>AdditionalLecture</td>
                    <td>#18 (Prof. Anita Desai)</td>
                    <td>127.0.0.1</td>
                  </tr>
                  <tr>
                    <td>19 Nov 2026, 14:22</td>
                    <td>admin_super</td>
                    <td>UPDATE_ATTENDANCE_CORRECTION</td>
                    <td>AttendanceCorrection</td>
                    <td>#09 (Accepted)</td>
                    <td>127.0.0.1</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </AdminPageScaffold>
      )

    case 'login_monitoring':
      return (
        <AdminPageScaffold
          title="Login & Activity Monitoring"
          eyebrow="ACTIVE SESSIONS & THREAT DETECTION"
          description="Real-time surveillance of user logins, failed attempts, IP addresses, and suspicious session revocation."
          stats={[
            { label: 'Active Sessions', value: '38', note: 'JWT Validated', icon: Activity },
            { label: 'Failed Attempts (24h)', value: '1', note: 'Rate-limited', icon: ShieldAlert },
            { label: 'Unique Devices', value: '44', note: 'Tracked Fingerprints', icon: ShieldCheck },
          ]}
        >
          <div className="panel">
            <div className="table-scroll">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Portal</th>
                    <th>IP Address</th>
                    <th>Device / User Agent</th>
                    <th>Login Time</th>
                    <th>Session Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>admin_super</strong> (Admin)</td>
                    <td>Admin Portal</td>
                    <td>127.0.0.1</td>
                    <td>Chrome / Windows 11</td>
                    <td>19 Nov 2026, 17:00</td>
                    <td><span className="badge badge-approved">Active Current</span></td>
                    <td><em>Current Session</em></td>
                  </tr>
                  <tr>
                    <td><strong>rajesh.sharma@college.edu</strong></td>
                    <td>User Portal</td>
                    <td>192.168.1.45</td>
                    <td>Safari / iOS Mobile</td>
                    <td>19 Nov 2026, 09:12</td>
                    <td><span className="badge badge-approved">Active</span></td>
                    <td>
                      <button className="button button-danger" onClick={() => alert('Session Revoked')}>
                        Revoke
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </AdminPageScaffold>
      )

    case 'backup_restore':
      return (
        <AdminPageScaffold
          title="Backup & Restore Management"
          eyebrow="DATA RESILIENCE & DISASTER RECOVERY"
          description="Automated database snapshot backups, file integrity verification, and authorized point-in-time recovery."
          actions={
            <button className="button button-primary" onClick={() => alert('Starting database snapshot...')}>
              <Database size={15} /> Create Backup Snapshot
            </button>
          }
          stats={[
            { label: 'Latest Backup', value: 'Today, 04:00 AM', note: 'Integrity: Verified PASS', icon: Database },
            { label: 'Backup Size', value: '42.8 MB', note: 'Encrypted SQL dump', icon: FileSpreadsheet },
            { label: 'Snapshot Retention', value: '30 Days', note: 'Automated pruning', icon: Clock3 },
          ]}
        >
          <div className="panel">
            <div className="panel-heading">
              <h3>Available Snapshots</h3>
            </div>
            <div className="table-scroll">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>Snapshot File</th>
                    <th>Date & Time</th>
                    <th>Size</th>
                    <th>Backup Type</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>attendease_db_20261119_0400.sql.gz</strong></td>
                    <td>19 Nov 2026, 04:00 AM</td>
                    <td>42.8 MB</td>
                    <td>Automated Daily</td>
                    <td><span className="badge badge-approved">Verified Clean</span></td>
                    <td>
                      <div className="admin-inline-actions">
                        <button className="button button-secondary"><Download size={13} /> Download</button>
                        <button className="button button-danger">Restore</button>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td><strong>attendease_db_20261118_0400.sql.gz</strong></td>
                    <td>18 Nov 2026, 04:00 AM</td>
                    <td>41.2 MB</td>
                    <td>Automated Daily</td>
                    <td><span className="badge badge-approved">Verified Clean</span></td>
                    <td>
                      <div className="admin-inline-actions">
                        <button className="button button-secondary"><Download size={13} /> Download</button>
                        <button className="button button-danger">Restore</button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </AdminPageScaffold>
      )

    default:
      return (
        <AdminPageScaffold
          title="Executive Dashboard"
          eyebrow="MAIN DASHBOARD"
          description="Institutional metrics and operations."
        >
          {existingComponents.dashboard}
        </AdminPageScaffold>
      )
  }
}
