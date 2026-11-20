import { useEffect, useState } from 'react'
import {
  Activity, AlertCircle, Calendar, CheckCircle2, ChevronRight, Clock3,
  FileEdit, Fingerprint, MapPin, RefreshCw, School, ShieldAlert, ShieldCheck,
  UserCheck, Users
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer,
  Tooltip, XAxis, YAxis
} from 'recharts'
import { errorMessage, fetchJson } from './api'

interface DashboardData {
  date: string
  statistics: {
    total_visiting_faculty: number
    active_faculty: number
    inactive_faculty: number
    present_today: number
    absent_today: number
    faculty_currently_on_campus: number
    late_arrivals: number
    today_scheduled_lectures: number
    completed_lectures: number
    cancelled_lectures: number
    pending_leave_requests: number
    pending_availability_requests: number
    pending_attendance_corrections: number
    pending_biometric_enrollments: number
  }
  visualisations: {
    daily_overview: {
      present: number
      late: number
      absent: number
      on_campus: number
      on_leave: number
    }
    weekly_trends: Array<{
      date: string
      day_name: string
      present: number
      late: number
      records: number
    }>
    department_attendance: Array<{
      department_id: number
      department_name: string
      department_code: string
      total_faculty: number
      present_today: number
      attendance_percentage: number
    }>
    teaching_hours: {
      scheduled_hours: number
      completed_hours: number
    }
  }
  feeds: {
    today_lectures: Array<{
      id: number
      subject: string
      faculty_name: string
      room: string
      start_time: string
      end_time: string
      is_completed: boolean
      is_upcoming: boolean
    }>
    upcoming_lectures: Array<{
      id: number
      subject: string
      faculty_name: string
      room: string
      start_time: string
      end_time: string
    }>
    recent_activity: Array<{
      id: number
      faculty_name: string
      employee_id: string
      date: string
      status: string
      punch_in: string
      punch_out: string
      face_verified: boolean
      geofence_verified: boolean
    }>
    recent_registrations: Array<{
      id: number
      employee_id: string
      full_name: string
      department: string
      created_at: string
      status: string
    }>
    recent_admin_activities: Array<{
      id: number
      action: string
      resource_type: string
      resource_id: number
      timestamp: string
    }>
    verification_alerts: Array<{
      id: number
      faculty_name: string
      action: string
      result: string
      timestamp: string
      confidence_score: number | null
    }>
  }
}

export function AdminDashboardPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const loadDashboard = async () => {
    try {
      setRefreshing(true)
      const res = await fetchJson<DashboardData>('/admin/dashboard')
      setData(res)
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadDashboard()
    // Auto-refresh every 60 seconds
    const interval = setInterval(() => void loadDashboard(), 60000)
    return () => clearInterval(interval)
  }, [])

  if (loading && !data) {
    return (
      <div className="admin-page-container">
        <div className="admin-loading-card">
          <RefreshCw className="admin-spin" size={24} />
          <span>Loading real-time institutional metrics...</span>
        </div>
      </div>
    )
  }

  const s = data?.statistics
  const v = data?.visualisations
  const f = data?.feeds

  return (
    <div className="admin-page-container">
      {/* Header */}
      <div className="admin-page-header">
        <div className="admin-page-titles">
          <span className="admin-eyebrow">CAMPUS REAL-TIME MONITOR</span>
          <h1>Executive Dashboard</h1>
          <p className="admin-page-desc">
            Live database records for faculty attendance, lecture execution, and campus operations.
          </p>
        </div>
        <div className="admin-header-actions">
          <span className="live-pulse-badge">
            <span className="live-dot" /> LIVE DATA
          </span>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => void loadDashboard()}
            disabled={refreshing}
          >
            <RefreshCw size={14} className={refreshing ? 'admin-spin' : ''} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="notice notice-error mb-4">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* 13 Key Dashboard Statistics */}
      <div className="admin-stats-overview">
        {/* Row 1: Faculty Demographics */}
        <div className="admin-kpi-grid">
          <div className="admin-kpi-card" onClick={() => onNavigate('visiting_faculty')} style={{ cursor: 'pointer' }}>
            <div className="admin-kpi-icon-wrap bg-blue-subtle text-blue">
              <Users size={18} />
            </div>
            <div className="admin-kpi-content">
              <span className="admin-kpi-label">Total Visiting Faculty</span>
              <strong className="admin-kpi-value">{s?.total_visiting_faculty ?? 0}</strong>
              <span className="admin-kpi-note">Institutional Roster</span>
            </div>
          </div>

          <div className="admin-kpi-card" onClick={() => onNavigate('visiting_faculty')} style={{ cursor: 'pointer' }}>
            <div className="admin-kpi-icon-wrap bg-green-subtle text-green">
              <CheckCircle2 size={18} />
            </div>
            <div className="admin-kpi-content">
              <span className="admin-kpi-label">Active Faculty</span>
              <strong className="admin-kpi-value text-green">{s?.active_faculty ?? 0}</strong>
              <span className="admin-kpi-note">{s?.inactive_faculty ?? 0} Inactive</span>
            </div>
          </div>

          <div className="admin-kpi-card" onClick={() => onNavigate('attendance')} style={{ cursor: 'pointer' }}>
            <div className="admin-kpi-icon-wrap bg-blue-subtle text-blue">
              <UserCheck size={18} />
            </div>
            <div className="admin-kpi-content">
              <span className="admin-kpi-label">Present Today</span>
              <strong className="admin-kpi-value">{s?.present_today ?? 0}</strong>
              <span className="admin-kpi-note">{s?.faculty_currently_on_campus ?? 0} on campus now</span>
            </div>
          </div>

          <div className="admin-kpi-card" onClick={() => onNavigate('attendance')} style={{ cursor: 'pointer' }}>
            <div className="admin-kpi-icon-wrap bg-red-subtle text-red">
              <AlertCircle size={18} />
            </div>
            <div className="admin-kpi-content">
              <span className="admin-kpi-label">Absent Today</span>
              <strong className="admin-kpi-value text-red">{s?.absent_today ?? 0}</strong>
              <span className="admin-kpi-note">Calculated on due lectures</span>
            </div>
          </div>
        </div>

        {/* Row 2: Campus & Lecture Operations */}
        <div className="admin-kpi-grid">
          <div className="admin-kpi-card">
            <div className="admin-kpi-icon-wrap bg-amber-subtle text-amber">
              <Clock3 size={18} />
            </div>
            <div className="admin-kpi-content">
              <span className="admin-kpi-label">Late Arrivals</span>
              <strong className="admin-kpi-value text-amber">{s?.late_arrivals ?? 0}</strong>
              <span className="admin-kpi-note">Recorded today</span>
            </div>
          </div>

          <div className="admin-kpi-card" onClick={() => onNavigate('timetable')} style={{ cursor: 'pointer' }}>
            <div className="admin-kpi-icon-wrap bg-blue-subtle text-blue">
              <School size={18} />
            </div>
            <div className="admin-kpi-content">
              <span className="admin-kpi-label">Today’s Lectures</span>
              <strong className="admin-kpi-value">{s?.today_scheduled_lectures ?? 0}</strong>
              <span className="admin-kpi-note">{s?.completed_lectures ?? 0} completed</span>
            </div>
          </div>

          <div className="admin-kpi-card">
            <div className="admin-kpi-icon-wrap bg-indigo-subtle text-indigo">
              <Activity size={18} />
            </div>
            <div className="admin-kpi-content">
              <span className="admin-kpi-label">Teaching Hours</span>
              <strong className="admin-kpi-value">{v?.teaching_hours.completed_hours ?? 0}h</strong>
              <span className="admin-kpi-note">of {v?.teaching_hours.scheduled_hours ?? 0}h scheduled</span>
            </div>
          </div>

          <div className="admin-kpi-card" onClick={() => onNavigate('face_registration')} style={{ cursor: 'pointer' }}>
            <div className="admin-kpi-icon-wrap bg-purple-subtle text-purple">
              <Fingerprint size={18} />
            </div>
            <div className="admin-kpi-content">
              <span className="admin-kpi-label">Pending Biometrics</span>
              <strong className="admin-kpi-value">{s?.pending_biometric_enrollments ?? 0}</strong>
              <span className="admin-kpi-note">Face reviews waiting</span>
            </div>
          </div>
        </div>

        {/* Row 3: Actionable Pending Counters */}
        <div className="admin-kpi-grid admin-kpi-grid-3">
          <div className="admin-kpi-card" onClick={() => onNavigate('leave')} style={{ cursor: 'pointer' }}>
            <div className="admin-kpi-icon-wrap bg-amber-subtle text-amber">
              <Calendar size={18} />
            </div>
            <div className="admin-kpi-content">
              <span className="admin-kpi-label">Pending Leave Requests</span>
              <strong className="admin-kpi-value">{s?.pending_leave_requests ?? 0}</strong>
              <span className="admin-kpi-note">Requires HOD / Admin approval</span>
            </div>
          </div>

          <div className="admin-kpi-card" onClick={() => onNavigate('availability')} style={{ cursor: 'pointer' }}>
            <div className="admin-kpi-icon-wrap bg-blue-subtle text-blue">
              <UserCheck size={18} />
            </div>
            <div className="admin-kpi-content">
              <span className="admin-kpi-label">Pending Availability</span>
              <strong className="admin-kpi-value">{s?.pending_availability_requests ?? 0}</strong>
              <span className="admin-kpi-note">Slot changes waiting review</span>
            </div>
          </div>

          <div className="admin-kpi-card" onClick={() => onNavigate('attendance_corrections')} style={{ cursor: 'pointer' }}>
            <div className="admin-kpi-icon-wrap bg-purple-subtle text-purple">
              <FileEdit size={18} />
            </div>
            <div className="admin-kpi-content">
              <span className="admin-kpi-label">Attendance Corrections</span>
              <strong className="admin-kpi-value">{s?.pending_attendance_corrections ?? 0}</strong>
              <span className="admin-kpi-note">Discrepancy adjustments</span>
            </div>
          </div>
        </div>
      </div>

      {/* Visualisations Section */}
      <div className="admin-two-col-grid mb-6">
        {/* Weekly Attendance Trend Chart */}
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h3>Weekly Attendance Trends</h3>
              <p className="muted">Last 7 days attendance verified in database</p>
            </div>
            <span className="badge badge-approved">7-Day Trend</span>
          </div>

          <div style={{ width: '100%', height: 260 }}>
            {v?.weekly_trends && v.weekly_trends.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={v.weekly_trends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="day_name" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0b1329', border: '1px solid #1e293b', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Bar dataKey="present" name="Present Faculty" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="late" name="Late Arrivals" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state">
                <Clock3 size={24} />
                <span>No attendance trend data recorded for this week.</span>
              </div>
            )}
          </div>
        </div>

        {/* Department-wise Attendance */}
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h3>Department-wise Attendance</h3>
              <p className="muted">Today’s faculty attendance rates across departments</p>
            </div>
            <button className="button button-link" onClick={() => onNavigate('departments')}>
              View all
            </button>
          </div>

          <div className="department-attendance-list">
            {v?.department_attendance && v.department_attendance.length > 0 ? (
              v.department_attendance.map((dept) => (
                <div key={dept.department_id} className="dept-attendance-row">
                  <div className="dept-attendance-info">
                    <strong>{dept.department_name}</strong>
                    <span className="muted">
                      {dept.present_today} of {dept.total_faculty} faculty present ({dept.attendance_percentage}%)
                    </span>
                  </div>
                  <div className="dept-progress-wrap">
                    <div className="dept-progress-bar">
                      <div
                        className="dept-progress-fill"
                        style={{ width: `${Math.min(100, dept.attendance_percentage)}%` }}
                      />
                    </div>
                    <span className="dept-pct">{dept.attendance_percentage}%</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">No departments configured yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Real-time Feeds: Lectures & Activities */}
      <div className="admin-two-col-grid mb-6">
        {/* Today's Lecture Schedule */}
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h3>Today’s Scheduled Lectures</h3>
              <p className="muted">Active timetable sessions for today</p>
            </div>
            <button className="button button-secondary" onClick={() => onNavigate('timetable')}>
              Full Timetable <ChevronRight size={14} />
            </button>
          </div>

          <div className="admin-lecture-feed">
            {f?.today_lectures && f.today_lectures.length > 0 ? (
              f.today_lectures.slice(0, 6).map((lec) => (
                <div key={lec.id} className="admin-lecture-card">
                  <div className="admin-lecture-time">
                    <Clock3 size={14} />
                    <span>{lec.start_time.slice(0, 5)} – {lec.end_time.slice(0, 5)}</span>
                  </div>
                  <div className="admin-lecture-details">
                    <strong>{lec.subject}</strong>
                    <span>{lec.faculty_name} · Room {lec.room}</span>
                  </div>
                  <div className="admin-lecture-badge">
                    {lec.is_completed ? (
                      <span className="badge badge-approved">Completed</span>
                    ) : lec.is_upcoming ? (
                      <span className="badge badge-pending">Upcoming</span>
                    ) : (
                      <span className="badge badge-present">In Progress</span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <School size={22} />
                <span>No lectures scheduled for today.</span>
              </div>
            )}
          </div>
        </div>

        {/* Recent Attendance Activity Stream */}
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h3>Recent Attendance Activity</h3>
              <p className="muted">Real-time punch records and biometric verification</p>
            </div>
            <button className="button button-secondary" onClick={() => onNavigate('attendance')}>
              View Log <ChevronRight size={14} />
            </button>
          </div>

          <div className="table-scroll">
            <table className="admin-data-table">
              <thead>
                <tr>
                  <th>Faculty</th>
                  <th>Punch In</th>
                  <th>Punch Out</th>
                  <th>Face ID</th>
                  <th>GPS</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {f?.recent_activity && f.recent_activity.length > 0 ? (
                  f.recent_activity.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.faculty_name}</strong>
                        <div className="muted" style={{ fontSize: '10.5px' }}>{item.employee_id}</div>
                      </td>
                      <td>{item.punch_in}</td>
                      <td>{item.punch_out}</td>
                      <td>
                        {item.face_verified ? (
                          <span className="text-green" title="Face verified"><ShieldCheck size={16} /></span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>
                        {item.geofence_verified ? (
                          <span className="text-green" title="Campus geofence verified"><MapPin size={16} /></span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge badge-${item.status}`}>
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="text-center muted py-4">
                      No attendance activity recorded today yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Bottom Feeds: Registrations, Alerts, & Admin Activity */}
      <div className="admin-three-col-grid">
        {/* Recent Registrations */}
        <div className="panel">
          <div className="panel-heading">
            <h3>Recent Faculty</h3>
            <button className="button button-link" onClick={() => onNavigate('visiting_faculty')}>
              Manage
            </button>
          </div>
          <div className="mini-feed-list">
            {f?.recent_registrations && f.recent_registrations.length > 0 ? (
              f.recent_registrations.map((r) => (
                <div key={r.id} className="mini-feed-item">
                  <div className="mini-feed-avatar">
                    {r.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="mini-feed-info">
                    <strong>{r.full_name}</strong>
                    <span>{r.employee_id} · {r.department}</span>
                  </div>
                  <span className={`badge badge-${r.status === 'active' ? 'approved' : 'rejected'}`}>
                    {r.status}
                  </span>
                </div>
              ))
            ) : (
              <p className="muted">No recent registrations.</p>
            )}
          </div>
        </div>

        {/* Verification Failure Alerts */}
        <div className="panel">
          <div className="panel-heading">
            <h3 className="text-red flex items-center gap-2">
              <ShieldAlert size={16} /> Verification Alerts
            </h3>
          </div>
          <div className="mini-feed-list">
            {f?.verification_alerts && f.verification_alerts.length > 0 ? (
              f.verification_alerts.map((al) => (
                <div key={al.id} className="mini-feed-item alert-item">
                  <div className="mini-feed-info">
                    <strong>{al.faculty_name}</strong>
                    <span className="text-red">Failed {al.action} ({al.result})</span>
                    <small className="muted">{al.timestamp}</small>
                  </div>
                </div>
              ))
            ) : (
              <div className="clean-alert-box">
                <ShieldCheck size={20} className="text-green" />
                <span>Zero biometric or spoof alerts in last 48 hours.</span>
              </div>
            )}
          </div>
        </div>

        {/* Recent Administrative Logs */}
        <div className="panel">
          <div className="panel-heading">
            <h3>Admin Activities</h3>
            <button className="button button-link" onClick={() => onNavigate('audit_logs')}>
              Audit Log
            </button>
          </div>
          <div className="mini-feed-list">
            {f?.recent_admin_activities && f.recent_admin_activities.length > 0 ? (
              f.recent_admin_activities.map((act) => (
                <div key={act.id} className="mini-feed-item">
                  <div className="mini-feed-info">
                    <strong>{act.action}</strong>
                    <span>{act.resource_type} #{act.resource_id}</span>
                    <small className="muted">{act.timestamp}</small>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">No recent administrative changes.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
