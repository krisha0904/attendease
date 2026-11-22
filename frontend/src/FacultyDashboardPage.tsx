import { useEffect, useState } from 'react'
import {
  AlertCircle,
  Bell,
  BookOpen,
  Building2,
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Clock3,
  DollarSign,
  Fingerprint,
  MapPin,
  RefreshCw,
  Send,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react'
import { api, errorMessage } from './api'

interface FacultyProfile {
  id: number
  full_name: string
  employee_id: string
  email: string
  designation: string
  department: string
  face_enrolled: boolean
  biometric_status: string
}

interface TodayStats {
  assigned_lectures: number
  completed_lectures: number
  upcoming_lectures: number
}

interface FinancialStats {
  month_completed_lectures: number
  month_taught_hours: number
  rate_per_lecture: number
  rate_per_hour: number
  estimated_monthly_earnings: number
}

interface LectureItem {
  source_type: string
  schedule_id: number
  subject: string
  course_name: string | null
  room: string | null
  department: string | null
  start_time: string
  end_time: string
  is_substitute: boolean
  status: string
  can_punch_in: boolean
  can_punch_out: boolean
  punch_in_time: string | null
  punch_out_time: string | null
}

interface SubstituteInvite {
  id: number
  date: string
  subject: string
  time: string
  original_faculty_name: string
  reason: string | null
}

interface Announcement {
  id: number
  title: string
  message: string
  type: string
  priority: string
  created_at: string | null
}

interface DayAttendance {
  punched_in: string | null
  punched_out: string | null
  status: string
}

interface FacultyDashboardData {
  faculty: FacultyProfile
  today_stats: TodayStats
  financial_stats: FinancialStats
  next_lecture: LectureItem | null
  today_lectures: LectureItem[]
  pending_substitutes: SubstituteInvite[]
  announcements: Announcement[]
  day_attendance: DayAttendance
}

interface FacultyDashboardPageProps {
  user: any
  navigate: (page: string) => void
}

export function FacultyDashboardPage({ user: _user, navigate }: FacultyDashboardPageProps) {
  const [data, setData] = useState<FacultyDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [subActionBusy, setSubActionBusy] = useState(false)

  const loadDashboard = async () => {
    try {
      setRefreshing(true)
      const res = await api.get<FacultyDashboardData>('/faculty/dashboard')
      setData(res.data)
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadDashboard()
    const timer = setInterval(loadDashboard, 30000)
    return () => clearInterval(timer)
  }, [])

  const handleSubstituteResponse = async (subId: number, status: 'accepted' | 'declined') => {
    setSubActionBusy(true)
    try {
      await api.post(`/substitutes/${subId}/respond`, { status })
      setActionMsg(`Substitute request has been ${status}.`)
      loadDashboard()
      setTimeout(() => setActionMsg(null), 4000)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSubActionBusy(false)
    }
  }

  if (loading && !data) {
    return (
      <div className="admin-page-container">
        <div className="admin-loading-card">
          <RefreshCw className="admin-spin" size={24} />
          <span>Loading faculty teaching dashboard...</span>
        </div>
      </div>
    )
  }

  const f = data?.faculty
  const stats = data?.today_stats
  const fin = data?.financial_stats
  const nextLec = data?.next_lecture
  const lectures = data?.today_lectures || []
  const substitutes = data?.pending_substitutes || []
  const announcements = data?.announcements || []

  return (
    <div className="page-content user-dashboard">
      {/* Welcome & Faculty Profile Bar */}
      <div className="user-dashboard-welcome flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="eyebrow flex items-center gap-2">
            <Building2 size={14} />
            <span>{f?.department || 'Department of Technology'}</span>
            <span>•</span>
            <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
          <h1>
            Welcome back, {f?.full_name || 'Faculty Member'}! <span aria-hidden="true">👋</span>
          </h1>
          <p className="text-muted text-sm">
            {f?.designation || 'Visiting Faculty'} • Employee ID: <strong>{f?.employee_id}</strong>
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Biometric Status Pill */}
          {f?.face_enrolled && f?.biometric_status === 'approved' ? (
            <div className="badge badge-approved flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold">
              <ShieldCheck size={14} /> Biometrics Approved
            </div>
          ) : (
            <button
              className="badge badge-pending flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold cursor-pointer"
              onClick={() => navigate('enrollment')}
            >
              <Fingerprint size={14} /> Face Enrollment Needed
            </button>
          )}

          <button
            type="button"
            className="button button-secondary button-sm"
            onClick={loadDashboard}
            disabled={refreshing}
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="banner banner-error mb-4">
          <AlertCircle size={18} />
          <div>{error}</div>
        </div>
      )}

      {actionMsg && (
        <div className="banner banner-success mb-4">
          <CheckCircle2 size={18} />
          <div>{actionMsg}</div>
        </div>
      )}

      {/* Pending Substitute Request Banner (Phase 10) */}
      {substitutes.length > 0 && (
        <div className="banner banner-info mb-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 font-semibold">
            <UserCheck size={18} />
            <span>Pending Substitute Teaching Request</span>
          </div>
          {substitutes.map((sub) => (
            <div
              key={sub.id}
              className="bg-white/80 p-3 rounded border border-blue-200 flex items-center justify-between flex-wrap gap-2"
            >
              <div>
                <strong>{sub.subject}</strong> for <em>{sub.original_faculty_name}</em>
                <div className="text-xs text-muted">
                  Date: {sub.date} • Scheduled Time: {sub.time} {sub.reason ? `• Note: "${sub.reason}"` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="button button-secondary button-sm"
                  disabled={subActionBusy}
                  onClick={() => handleSubstituteResponse(sub.id, 'declined')}
                >
                  <X size={13} /> Decline
                </button>
                <button
                  className="button button-primary button-sm"
                  disabled={subActionBusy}
                  onClick={() => handleSubstituteResponse(sub.id, 'accepted')}
                >
                  <Check size={13} /> Accept Lecture
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Key Metric Cards */}
      <div className="user-stat-grid mb-6">
        <article className="user-stat-card stat-lectures">
          <div className="user-stat-card-top">
            <span className="user-stat-icon">
              <CalendarDays size={21} />
            </span>
            <span className="stat-chip stat-chip-blue">Today</span>
          </div>
          <strong>{stats?.assigned_lectures ?? 0}</strong>
          <span className="user-stat-label">Assigned Lectures</span>
          <small>{stats?.completed_lectures ?? 0} completed · {stats?.upcoming_lectures ?? 0} remaining</small>
        </article>

        <article className="user-stat-card stat-attended">
          <div className="user-stat-card-top">
            <span className="user-stat-icon">
              <Check size={21} />
            </span>
            <span className="stat-chip stat-chip-green">This Month</span>
          </div>
          <strong>{fin?.month_completed_lectures ?? 0}</strong>
          <span className="user-stat-label">Delivered Lectures</span>
          <small>{fin?.month_taught_hours ?? 0} hrs verified teaching time</small>
        </article>

        <article className="user-stat-card stat-hours">
          <div className="user-stat-card-top">
            <span className="user-stat-icon">
              <DollarSign size={21} />
            </span>
            <span className="stat-chip stat-chip-purple">Honorarium</span>
          </div>
          <strong>₹ {(fin?.estimated_monthly_earnings ?? 0).toLocaleString('en-IN')}</strong>
          <span className="user-stat-label">Estimated Remuneration</span>
          <small>Rate: ₹{fin?.rate_per_lecture ?? 1500} / lecture (₹{fin?.rate_per_hour ?? 1000}/hr)</small>
        </article>

        <article className="user-stat-card stat-upcoming">
          <div className="user-stat-card-top">
            <span className="user-stat-icon">
              <Clock3 size={21} />
            </span>
            <span className="stat-chip stat-chip-amber">Campus Punch</span>
          </div>
          <strong>{data?.day_attendance.punched_in || '—'}</strong>
          <span className="user-stat-label">Workday Check-In</span>
          <small>
            {data?.day_attendance.punched_out
              ? `Punched out at ${data.day_attendance.punched_out}`
              : data?.day_attendance.punched_in
              ? 'On campus (Active)'
              : 'Not checked in today'}
          </small>
        </article>
      </div>

      {/* Two Column Layout: Next Lecture Hero & Today's Schedule */}
      <div className="user-dashboard-bottom-grid">
        {/* Next Assigned Lecture Card */}
        <section className="panel user-next-assigned-panel">
          <div className="panel-heading">
            <div>
              <h3>
                <Clock3 size={18} /> Next Assigned Lecture
              </h3>
            </div>
            {nextLec && (
              <span
                className={`lecture-status ${
                  nextLec.status === 'in_progress' ? 'lecture-status-live' : ''
                }`}
              >
                {nextLec.status.toUpperCase()}
              </span>
            )}
          </div>

          {nextLec ? (
            <div className="space-y-4">
              <div className="next-lecture-time">
                {nextLec.start_time} – {nextLec.end_time}
              </div>
              <h4 className="next-lecture-subject text-lg font-semibold text-primary">
                {nextLec.subject}
              </h4>
              <div className="next-lecture-details flex flex-wrap gap-3 text-xs text-muted">
                {nextLec.course_name && (
                  <span className="flex items-center gap-1">
                    <BookOpen size={14} /> {nextLec.course_name}
                  </span>
                )}
                {nextLec.department && (
                  <span className="flex items-center gap-1">
                    <Building2 size={14} /> {nextLec.department}
                  </span>
                )}
                {nextLec.room && (
                  <span className="flex items-center gap-1">
                    <MapPin size={14} /> Room {nextLec.room}
                  </span>
                )}
                {nextLec.is_substitute && (
                  <span className="badge badge-info text-xs">Substitute Assignment</span>
                )}
              </div>

              <div className="pt-2">
                {nextLec.can_punch_in ? (
                  <button
                    className="button button-primary w-full"
                    onClick={() => navigate('attendance_tracker')}
                  >
                    <Fingerprint size={16} /> Punch In Now (Face & GPS)
                  </button>
                ) : nextLec.can_punch_out ? (
                  <button
                    className="button button-secondary w-full"
                    onClick={() => navigate('attendance_tracker')}
                  >
                    <Fingerprint size={16} /> Punch Out (Lecture Complete)
                  </button>
                ) : nextLec.status === 'completed' ? (
                  <div className="banner banner-success text-xs">
                    <CheckCircle2 size={15} /> Lecture completed and attendance logged.
                  </div>
                ) : (
                  <div className="text-xs text-muted bg-gray-50 p-3 rounded border border-gray-100 flex items-center gap-2">
                    <Clock size={14} />
                    <span>Check-in opens 15 minutes before scheduled start time.</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="next-lecture-empty py-8 text-center text-muted">
              <BookOpen size={28} className="mx-auto mb-2 opacity-40" />
              <strong>No upcoming lectures remaining today</strong>
              <p className="text-xs mt-1">Check your weekly timetable or apply for additional lectures.</p>
            </div>
          )}
        </section>

        {/* Today's Full Schedule Timeline */}
        <section className="panel user-schedule-panel">
          <div className="panel-heading">
            <div>
              <h3>
                <CalendarDays size={18} /> Today’s Schedule Timeline
              </h3>
              <p className="muted">Chronological lecture sessions for today</p>
            </div>
          </div>

          {lectures.length === 0 ? (
            <div className="dashboard-empty py-8 text-center text-muted">
              <Calendar size={28} className="mx-auto mb-2 opacity-40" />
              <strong>No lectures scheduled for today</strong>
              <span className="text-xs block mt-1">Enjoy your day or update your weekly availability.</span>
            </div>
          ) : (
            <div className="dashboard-lecture-list space-y-3">
              {lectures.map((lec) => {
                const statusClass =
                  lec.status === 'completed'
                    ? 'lecture-status-completed'
                    : lec.status === 'in_progress'
                    ? 'lecture-status-live'
                    : lec.status === 'missed'
                    ? 'lecture-status-missed'
                    : ''

                return (
                  <div
                    key={`${lec.source_type}-${lec.schedule_id}`}
                    className="p-3 border border-gray-100 rounded-lg hover:border-gray-200 transition"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-primary">
                          {lec.start_time} – {lec.end_time}
                        </span>
                        {lec.is_substitute && (
                          <span className="badge badge-info text-xs">Substitute</span>
                        )}
                      </div>
                      <span className={`lecture-status ${statusClass} text-xs`}>
                        {lec.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>

                    <strong className="text-sm block">{lec.subject}</strong>
                    <div className="text-xs text-muted flex items-center gap-3 mt-1">
                      {lec.course_name && <span>{lec.course_name}</span>}
                      {lec.room && (
                        <span className="flex items-center gap-1">
                          <MapPin size={12} /> {lec.room}
                        </span>
                      )}
                      {lec.punch_in_time && (
                        <span>
                          In: {lec.punch_in_time} {lec.punch_out_time ? `· Out: ${lec.punch_out_time}` : ''}
                        </span>
                      )}
                    </div>

                    {(lec.can_punch_in || lec.can_punch_out) && (
                      <div className="mt-2 pt-2 border-t border-gray-100 flex justify-end">
                        <button
                          className="button button-primary button-sm"
                          onClick={() => navigate('attendance_tracker')}
                        >
                          <Fingerprint size={13} />{' '}
                          {lec.can_punch_in ? 'Punch In' : 'Punch Out'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {/* Institutional Announcements & Quick Actions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        {/* Active Campus Announcements (Phase 11) */}
        <div className="panel">
          <div className="panel-heading">
            <div className="flex items-center gap-2">
              <Bell size={18} className="text-primary" />
              <div>
                <h3>Campus Notice Board</h3>
                <p className="muted">Institutional notices and operational circulars</p>
              </div>
            </div>
          </div>
          {announcements.length === 0 ? (
            <p className="text-xs text-muted py-4">No active notices at this moment.</p>
          ) : (
            <div className="space-y-3">
              {announcements.map((ann) => (
                <div
                  key={ann.id}
                  className={`p-3 rounded border text-xs ${
                    ann.priority === 'critical' || ann.priority === 'high'
                      ? 'bg-red-50 border-red-200 text-red-900'
                      : 'bg-gray-50 border-gray-200 text-gray-800'
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold mb-1">
                    <span>{ann.title}</span>
                    <span className="text-muted text-xs">
                      {ann.created_at ? new Date(ann.created_at).toLocaleDateString() : ''}
                    </span>
                  </div>
                  <p>{ann.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Self-Service Actions */}
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h3>Quick Self-Service Actions</h3>
              <p className="muted">Visiting faculty administrative shortcuts</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              className="p-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition text-left flex flex-col gap-1"
              onClick={() => navigate('timetable')}
            >
              <CalendarDays size={18} className="text-blue-600" />
              <strong className="text-xs">Weekly Timetable</strong>
              <span className="text-xs text-muted">View full lecture schedule</span>
            </button>
            <button
              className="p-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition text-left flex flex-col gap-1"
              onClick={() => navigate('attendance_tracker')}
            >
              <Clock3 size={18} className="text-emerald-600" />
              <strong className="text-xs">Attendance Tracker</strong>
              <span className="text-xs text-muted">Face & GPS punch-in</span>
            </button>
            <button
              className="p-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition text-left flex flex-col gap-1"
              onClick={() => navigate('leave')}
            >
              <Send size={18} className="text-purple-600" />
              <strong className="text-xs">Apply for Leave</strong>
              <span className="text-xs text-muted">Submit absence request</span>
            </button>
            <button
              className="p-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition text-left flex flex-col gap-1"
              onClick={() => navigate('directory')}
            >
              <UserCheck size={18} className="text-amber-600" />
              <strong className="text-xs">Faculty Directory</strong>
              <span className="text-xs text-muted">Colleague roster & contacts</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
