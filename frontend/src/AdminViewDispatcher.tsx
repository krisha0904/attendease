import React from 'react'
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
import { SubstituteManagementPage } from './SubstituteManagementPage'
import { NotificationHubPage } from './NotificationHubPage'
import { ReportsAnalyticsPage } from './ReportsAnalyticsPage'
import { InstitutionSettingsPage } from './InstitutionSettingsPage'
import { AdminRolesPage } from './AdminRolesPage'
import { AuditLogsPage } from './AuditLogsPage'
import { LoginMonitoringPage } from './LoginMonitoringPage'
import { BackupRestorePage } from './BackupRestorePage'
import { ImportExportPage } from './ImportExportPage'

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
      return <SubstituteManagementPage onNavigateToTimetable={() => onNavigate('timetable')} />

    case 'notifications':
      return <NotificationHubPage />

    case 'reports':
    case 'attendance_reports':
    case 'attendance_report':
    case 'workload_payment':
      return <ReportsAnalyticsPage />

    case 'import_export':
      return <ImportExportPage />

    case 'institution_settings':
      return <InstitutionSettingsPage />

    case 'roles_permissions':
      return <AdminRolesPage />

    case 'audit_logs':
      return <AuditLogsPage />

    case 'login_monitoring':
      return <LoginMonitoringPage />

    case 'backup_restore':
      return <BackupRestorePage />

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
