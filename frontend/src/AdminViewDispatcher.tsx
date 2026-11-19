import React, { useState } from 'react'
import {
  Activity, BookOpen, Building2, Calendar, CalendarDays,
  CheckCircle2, Clock3, CreditCard, Database, Download, FileEdit,
  FileSpreadsheet, Fingerprint, GraduationCap, Megaphone, Palmtree,
  Plus, School, ScrollText, Search, Settings, ShieldAlert,
  ShieldCheck, Sliders, UserCheck, UserPlus, Users, AlertCircle
} from 'lucide-react'
import { AdminPageScaffold } from './AdminComponents'

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
  const [searchTerm, setSearchTerm] = useState('')
  const [deptFilter, setDeptFilter] = useState('all')

  switch (page) {
    case 'dashboard':
      return existingComponents.dashboard ? (
        <>{existingComponents.dashboard}</>
      ) : (
        <AdminPageScaffold
          title="Executive Dashboard"
          eyebrow="CAMPUS REAL-TIME MONITOR"
          description="Live attendance, timetable execution, and operational KPIs across the institution."
          stats={[
            { label: 'Visiting Faculty', value: '48', note: '42 Active, 6 On Leave', icon: Users },
            { label: 'Present Today', value: '38', note: '90.5% Attendance', icon: CheckCircle2 },
            { label: 'On Campus Now', value: '29', note: 'Active geo-verified session', icon: Building2 },
            { label: 'Today’s Lectures', value: '64', note: '52 Completed, 4 In-flight', icon: Clock3 },
          ]}
        >
          <div className="admin-card-placeholder">
            <h3>Live Activity Feed</h3>
            <p className="muted">Detailed dashboard analytics are configured for Phase 2.</p>
          </div>
        </AdminPageScaffold>
      )

    case 'visiting_faculty':
      return (
        <AdminPageScaffold
          title="Visiting Faculty Management"
          eyebrow="FACULTY DIRECTORY & PROFILES"
          description="Manage visiting faculty profiles, subject mapping, credentials, and institutional status."
          actions={
            <div className="admin-actions-row">
              <button className="button button-primary" onClick={() => alert('Faculty Registration modal opens in Phase 2')}>
                <UserPlus size={15} /> Add Visiting Faculty
              </button>
              <button className="button button-secondary" onClick={() => onNavigate('import_export')}>
                <Download size={15} /> Export Directory
              </button>
            </div>
          }
          stats={[
            { label: 'Total Visiting Faculty', value: '48', note: 'Across 6 Departments', icon: Users },
            { label: 'Active Status', value: '44', note: 'Available for scheduling', icon: CheckCircle2 },
            { label: 'Face Enrolled', value: '41', note: '85.4% Verified', icon: Fingerprint },
            { label: 'Pending Face Reviews', value: '3', note: 'Requires Admin approval', icon: AlertCircle },
          ]}
        >
          <div className="admin-table-filter-bar">
            <div className="admin-search-box">
              <Search size={15} />
              <input
                type="text"
                placeholder="Search faculty by name, ID, qualification..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="admin-select">
              <option value="all">All Departments</option>
              <option value="cs">Computer Engineering</option>
              <option value="it">Information Technology</option>
              <option value="mech">Mechanical Engineering</option>
              <option value="mgmt">Business & Management</option>
            </select>
          </div>

          <div className="panel admin-table-panel">
            <div className="table-scroll">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>Faculty ID</th>
                    <th>Name</th>
                    <th>Department</th>
                    <th>Specialisation</th>
                    <th>Contact</th>
                    <th>Biometrics</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>VF-2025-001</strong></td>
                    <td>Dr. Rajesh Sharma</td>
                    <td>Computer Engineering</td>
                    <td>Machine Learning & AI</td>
                    <td>rajesh.sharma@college.edu</td>
                    <td><span className="badge badge-approved">Approved</span></td>
                    <td><span className="badge badge-approved">Active</span></td>
                    <td>
                      <button className="button button-secondary" onClick={() => alert('Viewing profile: Rajesh Sharma')}>
                        View Profile
                      </button>
                    </td>
                  </tr>
                  <tr>
                    <td><strong>VF-2025-002</strong></td>
                    <td>Prof. Anita Desai</td>
                    <td>Information Technology</td>
                    <td>Cloud Computing & DevOps</td>
                    <td>anita.desai@college.edu</td>
                    <td><span className="badge badge-approved">Approved</span></td>
                    <td><span className="badge badge-approved">Active</span></td>
                    <td>
                      <button className="button button-secondary" onClick={() => alert('Viewing profile: Anita Desai')}>
                        View Profile
                      </button>
                    </td>
                  </tr>
                  <tr>
                    <td><strong>VF-2025-003</strong></td>
                    <td>Dr. Vikram Patel</td>
                    <td>Mechanical Engineering</td>
                    <td>Thermodynamics & Robotics</td>
                    <td>vikram.patel@college.edu</td>
                    <td><span className="badge badge-pending">Pending Review</span></td>
                    <td><span className="badge badge-approved">Active</span></td>
                    <td>
                      <button className="button button-secondary" onClick={() => onNavigate('face_registration')}>
                        Review Face
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </AdminPageScaffold>
      )

    case 'face_registration':
      return existingComponents.approvals ? (
        <AdminPageScaffold
          title="Face Registration & Biometrics"
          eyebrow="BIOMETRIC ACCESS CONTROL"
          description="Review submitted facial enrollments, verify silent anti-spoofing scores, and manage re-registrations."
          stats={[
            { label: 'Pending Approvals', value: '3', note: 'Requires Admin verification', icon: Fingerprint },
            { label: 'Approved Templates', value: '41', note: 'Fernet Encrypted (Local)', icon: CheckCircle2 },
            { label: 'Rejected / Revoked', value: '2', note: 'Spoof or poor lighting', icon: AlertCircle },
          ]}
        >
          {existingComponents.approvals}
        </AdminPageScaffold>
      ) : (
        <AdminPageScaffold
          title="Face Registration & Biometrics"
          eyebrow="BIOMETRIC ACCESS CONTROL"
          description="Review submitted facial enrollments, verify silent anti-spoofing scores, and manage re-registrations."
        >
          <div className="panel">
            <p className="muted">Biometric approval workflows are connected to the approvals service.</p>
          </div>
        </AdminPageScaffold>
      )

    case 'departments':
      return (
        <AdminPageScaffold
          title="Department Management"
          eyebrow="ACADEMIC STRUCTURE"
          description="Configure institution departments, academic units, HOD assignments, and faculty allocations."
          actions={
            <button className="button button-primary" onClick={() => alert('Add Department')}>
              <Plus size={15} /> Add Department
            </button>
          }
          stats={[
            { label: 'Total Departments', value: '6', note: 'All Active', icon: Building2 },
            { label: 'Department Heads', value: '6', note: 'Assigned HOD Accounts', icon: Users },
            { label: 'Mapped Subjects', value: '42', note: 'Current Semester', icon: BookOpen },
          ]}
        >
          {existingComponents.people ? (
            <div className="panel">{existingComponents.people}</div>
          ) : (
            <div className="panel">
              <p className="muted">Department directory and setup loaded.</p>
            </div>
          )}
        </AdminPageScaffold>
      )

    case 'courses_subjects':
      return (
        <AdminPageScaffold
          title="Course & Subject Management"
          eyebrow="CURRICULUM & SYLLABUS"
          description="Define academic degree courses, semesters, subjects, credits, and faculty allocations."
          actions={
            <div className="admin-actions-row">
              <button className="button button-primary" onClick={() => alert('Add Subject')}>
                <Plus size={15} /> Add Subject
              </button>
              <button className="button button-secondary" onClick={() => alert('Add Course')}>
                <Plus size={15} /> Add Course
              </button>
            </div>
          }
          stats={[
            { label: 'Offered Courses', value: '8', note: 'B.Tech, M.Tech, MBA', icon: GraduationCap },
            { label: 'Active Subjects', value: '54', note: 'Theory & Practicals', icon: BookOpen },
            { label: 'Assigned Faculty', value: '42', note: '100% Curriculum coverage', icon: Users },
          ]}
        >
          <div className="panel">
            <div className="table-scroll">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>Subject Code</th>
                    <th>Subject Name</th>
                    <th>Course & Sem</th>
                    <th>Department</th>
                    <th>Credits</th>
                    <th>Assigned Faculty</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>CS501</strong></td>
                    <td>Artificial Intelligence & Expert Systems</td>
                    <td>B.Tech (Sem 5)</td>
                    <td>Computer Engineering</td>
                    <td>4</td>
                    <td>Dr. Rajesh Sharma</td>
                    <td><button className="button button-secondary">Edit</button></td>
                  </tr>
                  <tr>
                    <td><strong>IT402</strong></td>
                    <td>Cloud Computing Architecture</td>
                    <td>B.Tech (Sem 4)</td>
                    <td>Information Technology</td>
                    <td>4</td>
                    <td>Prof. Anita Desai</td>
                    <td><button className="button button-secondary">Edit</button></td>
                  </tr>
                  <tr>
                    <td><strong>ME603</strong></td>
                    <td>Advanced Robotics & Automation</td>
                    <td>B.Tech (Sem 6)</td>
                    <td>Mechanical Engineering</td>
                    <td>3</td>
                    <td>Dr. Vikram Patel</td>
                    <td><button className="button button-secondary">Edit</button></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </AdminPageScaffold>
      )

    case 'academic_years':
      return (
        <AdminPageScaffold
          title="Academic Year Management"
          eyebrow="INSTITUTIONAL CALENDAR"
          description="Manage academic cycles, terms, semesters, and archival of historical records."
          actions={
            <button className="button button-primary" onClick={() => alert('New Academic Year')}>
              <Plus size={15} /> Create Academic Cycle
            </button>
          }
          stats={[
            { label: 'Current Academic Year', value: '2025-2026', note: 'Active Cycle (Term 1)', icon: CalendarDays },
            { label: 'Cycle Duration', value: 'Jul 2025 – Jun 2026', note: 'In Progress', icon: Clock3 },
            { label: 'Archived Cycles', value: '3', note: 'Fully Preserved Data', icon: Database },
          ]}
        >
          <div className="panel">
            <div className="table-scroll">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>Academic Year</th>
                    <th>Start Date</th>
                    <th>End Date</th>
                    <th>Status</th>
                    <th>Enrolled Faculty</th>
                    <th>Total Lectures</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="row-highlight">
                    <td><strong>2025-2026</strong></td>
                    <td>01 Jul 2025</td>
                    <td>30 Jun 2026</td>
                    <td><span className="badge badge-approved">Active Current</span></td>
                    <td>48</td>
                    <td>1,240</td>
                    <td><span className="badge badge-approved">Default</span></td>
                  </tr>
                  <tr>
                    <td><strong>2024-2025</strong></td>
                    <td>01 Jul 2024</td>
                    <td>30 Jun 2025</td>
                    <td><span className="badge badge-revoked">Archived</span></td>
                    <td>45</td>
                    <td>2,480</td>
                    <td><button className="button button-secondary">View Records</button></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </AdminPageScaffold>
      )

    case 'timetable':
      return existingComponents.timetable ? (
        <AdminPageScaffold
          title="Lecture & Timetable Management"
          eyebrow="MASTER SCHEDULE"
          description="Configure weekly timetables, classroom allocations, prevent schedule conflicts, and notify faculty."
          actions={
            <button className="button button-primary" onClick={() => alert('Add lecture session')}>
              <Plus size={15} /> Add Lecture
            </button>
          }
        >
          {existingComponents.timetable}
        </AdminPageScaffold>
      ) : (
        <AdminPageScaffold
          title="Lecture & Timetable Management"
          eyebrow="MASTER SCHEDULE"
          description="Configure weekly timetables, classroom allocations, prevent schedule conflicts, and notify faculty."
        />
      )

    case 'classrooms':
      return (
        <AdminPageScaffold
          title="Classroom Management"
          eyebrow="CAMPUS INFRASTRUCTURE"
          description="Classroom listings, lab capacities, smart board setups, and room collision prevention."
          actions={
            <button className="button button-primary" onClick={() => alert('Add Classroom')}>
              <Plus size={15} /> Add Classroom
            </button>
          }
          stats={[
            { label: 'Total Classrooms', value: '32', note: 'Across 3 Blocks', icon: School },
            { label: 'Lecture Theatres', value: '8', note: '120+ Capacity', icon: Building2 },
            { label: 'Specialized Labs', value: '14', note: 'Computer & Hardware Labs', icon: Sliders },
          ]}
        >
          <div className="panel">
            <div className="table-scroll">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>Room Number</th>
                    <th>Building / Block</th>
                    <th>Floor</th>
                    <th>Capacity</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>LH-101</strong></td>
                    <td>Aryabhata Block</td>
                    <td>1st Floor</td>
                    <td>120 Seats</td>
                    <td>Smart Lecture Theatre</td>
                    <td><span className="badge badge-approved">Active</span></td>
                    <td><button className="button button-secondary">Schedule</button></td>
                  </tr>
                  <tr>
                    <td><strong>CS-LAB-3</strong></td>
                    <td>Turing Computing Centre</td>
                    <td>2nd Floor</td>
                    <td>60 Workstations</td>
                    <td>High-Performance Computing Lab</td>
                    <td><span className="badge badge-approved">Active</span></td>
                    <td><button className="button button-secondary">Schedule</button></td>
                  </tr>
                  <tr>
                    <td><strong>ME-WS-2</strong></td>
                    <td>Mechanical Workshop</td>
                    <td>Ground Floor</td>
                    <td>40 Stations</td>
                    <td>Robotics & Mechatronics Lab</td>
                    <td><span className="badge badge-approved">Active</span></td>
                    <td><button className="button button-secondary">Schedule</button></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </AdminPageScaffold>
      )

    case 'holidays':
      return (
        <AdminPageScaffold
          title="Holiday Management"
          eyebrow="CALENDAR & NON-WORKING DAYS"
          description="Configure national holidays, institutional gazetted breaks, and department-specific holidays."
          actions={
            <button className="button button-primary" onClick={() => alert('Add Holiday')}>
              <Plus size={15} /> Add Holiday
            </button>
          }
          stats={[
            { label: 'Institutional Holidays', value: '18', note: 'Academic Year 2025-26', icon: Palmtree },
            { label: 'Upcoming Holiday', value: 'Republic Day', note: '26 Jan 2026', icon: Calendar },
            { label: 'Protected Lectures', value: '0 Conflicting', note: 'Timetable check clean', icon: CheckCircle2 },
          ]}
        >
          <div className="panel">
            <div className="table-scroll">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>Holiday Name</th>
                    <th>Date</th>
                    <th>Day</th>
                    <th>Applicability</th>
                    <th>Description</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Republic Day</strong></td>
                    <td>26 Jan 2026</td>
                    <td>Monday</td>
                    <td>All Institutional Departments</td>
                    <td>National Holiday</td>
                    <td><button className="button button-secondary">Edit</button></td>
                  </tr>
                  <tr>
                    <td><strong>Maha Shivratri</strong></td>
                    <td>17 Feb 2026</td>
                    <td>Tuesday</td>
                    <td>All Institutional Departments</td>
                    <td>Gazetted Holiday</td>
                    <td><button className="button button-secondary">Edit</button></td>
                  </tr>
                  <tr>
                    <td><strong>Holi</strong></td>
                    <td>04 Mar 2026</td>
                    <td>Wednesday</td>
                    <td>All Institutional Departments</td>
                    <td>Festival Break</td>
                    <td><button className="button button-secondary">Edit</button></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </AdminPageScaffold>
      )

    case 'attendance':
      return existingComponents.attendance ? (
        <AdminPageScaffold
          title="Attendance Management"
          eyebrow="REAL-TIME MONITORING"
          description="Inspect workday punch-ins, lecture punches, face verification results, and GPS geofence checks."
        >
          {existingComponents.attendance}
        </AdminPageScaffold>
      ) : (
        <AdminPageScaffold
          title="Attendance Management"
          eyebrow="REAL-TIME MONITORING"
          description="Inspect workday punch-ins, lecture punches, face verification results, and GPS geofence checks."
        />
      )

    case 'attendance_corrections':
      return (
        <AdminPageScaffold
          title="Attendance Corrections"
          eyebrow="PUNCH DISCREPANCY WORKFLOW"
          description="Review faculty manual adjustment requests, original punch timestamps, and maintain immutable audit trails."
          stats={[
            { label: 'Pending Requests', value: '2', note: 'Awaiting Administrator Review', icon: FileEdit },
            { label: 'Approved This Month', value: '7', note: 'Audit logged with admin ID', icon: CheckCircle2 },
            { label: 'Rejected', value: '1', note: 'Missing justification remarks', icon: AlertCircle },
          ]}
        >
          <div className="panel">
            <div className="table-scroll">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>Request ID</th>
                    <th>Faculty Name</th>
                    <th>Date</th>
                    <th>Original Punch</th>
                    <th>Requested Punch</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>CR-2025-101</strong></td>
                    <td>Dr. Rajesh Sharma</td>
                    <td>18 Nov 2026</td>
                    <td>Punch Out: Missed</td>
                    <td>Punch Out: 04:30 PM</td>
                    <td>Exam invigilation duty in hall 3 without phone</td>
                    <td><span className="badge badge-pending">Pending Review</span></td>
                    <td>
                      <div className="admin-inline-actions">
                        <button className="button button-primary" onClick={() => alert('Approve Correction')}>Approve</button>
                        <button className="button button-danger" onClick={() => alert('Reject Correction')}>Reject</button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </AdminPageScaffold>
      )

    case 'availability':
      return (
        <AdminPageScaffold
          title="Availability Management"
          eyebrow="FACULTY WORK PREFERENCES"
          description="Review visiting faculty working slot preferences and approved availability windows for timetable scheduling."
          stats={[
            { label: 'Submitted Preferences', value: '46', note: '95.8% Faculty Response', icon: UserCheck },
            { label: 'Approved Windows', value: '44', note: 'Locked into Master Timetable', icon: CheckCircle2 },
            { label: 'Changes Pending', value: '2', note: 'Requires Admin approval', icon: Clock3 },
          ]}
        >
          <div className="panel">
            <div className="table-scroll">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>Faculty</th>
                    <th>Department</th>
                    <th>Day of Week</th>
                    <th>Available Window</th>
                    <th>Max Hours / Wk</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Dr. Rajesh Sharma</td>
                    <td>Computer Engineering</td>
                    <td>Mon, Wed, Fri</td>
                    <td>09:00 AM – 02:00 PM</td>
                    <td>15 Hours</td>
                    <td><span className="badge badge-approved">Approved</span></td>
                    <td><button className="button button-secondary">Adjust</button></td>
                  </tr>
                  <tr>
                    <td>Prof. Anita Desai</td>
                    <td>Information Technology</td>
                    <td>Tue, Thu, Sat</td>
                    <td>10:00 AM – 04:00 PM</td>
                    <td>18 Hours</td>
                    <td><span className="badge badge-approved">Approved</span></td>
                    <td><button className="button button-secondary">Adjust</button></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </AdminPageScaffold>
      )

    case 'leave':
      return existingComponents.leave ? (
        <AdminPageScaffold
          title="Leave Management"
          eyebrow="FACULTY ABSENCE & EXCUSAL"
          description="Review leave applications, identify affected lectures, and assign substitute visiting faculty."
        >
          {existingComponents.leave}
        </AdminPageScaffold>
      ) : (
        <AdminPageScaffold
          title="Leave Management"
          eyebrow="FACULTY ABSENCE & EXCUSAL"
          description="Review leave applications, identify affected lectures, and assign substitute visiting faculty."
        />
      )

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
