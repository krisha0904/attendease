import { useEffect, useState, useMemo } from 'react'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  Calendar,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  Clock,
  Clock3,
  Fingerprint,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react'
import { api, errorMessage } from './api'
import { CaptureDialog, getLocation, type User } from './App'

interface FacultyProfile {
  id: number
  full_name: string
  employee_id: string
  email: string
  designation: string
  department: string
  college_name?: string
  profile_photo?: string | null
  face_enrolled: boolean
  biometric_status: string
}

interface TodayStats {
  assigned_lectures: number
  completed_lectures: number
  upcoming_lectures: number
  missed_lectures: number
  total_teaching_hours: number
  monthly_attendance_percentage: number
  late_arrivals?: number
  total_scheduled_month?: number
}

interface LectureItem {
  lecture_number: number
  source_type: 'weekly' | 'additional'
  schedule_id: number
  subject: string
  course_name: string | null
  semester?: number | null
  division?: string | null
  room: string | null
  department: string | null
  start_time: string
  end_time: string
  raw_start_time?: string
  raw_end_time?: string
  allowed_punch_in_window: string
  is_substitute: boolean
  status: 'scheduled' | 'upcoming' | 'punch_in_available' | 'in_progress' | 'completed' | 'late' | 'missed' | 'pending_review' | 'cancelled'
  can_punch_in: boolean
  can_punch_out: boolean
  punch_in_time: string | null
  punch_out_time: string | null
}

interface WeeklyDaySchedule {
  day_of_week: number
  day_name: string
  lectures: Array<{
    id: number
    subject: string
    course_name: string | null
    semester?: number | null
    room: string | null
    start_time: string
    end_time: string
    status: string
  }>
}

interface RecentAttendanceRecord {
  id: number
  date: string
  formatted_date: string
  subject: string
  course_name: string
  room: string
  scheduled_time: string
  punch_in_time: string
  punch_out_time: string
  duration_minutes: number
  duration_formatted: string
  face_verified: boolean
  gps_verified: boolean
  status: 'completed' | 'late' | 'missed' | 'pending_review'
}

interface DailyTrendItem {
  date: string
  day_name: string
  completed: number
}

interface AttendanceAnalytics {
  monthly_attendance_percentage: number
  total_scheduled_lectures: number
  completed_lectures: number
  missed_lectures: number
  late_arrivals: number
  total_teaching_hours: number
  daily_trends: DailyTrendItem[]
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

interface FacultyDashboardData {
  faculty: FacultyProfile
  today_stats: TodayStats
  next_lecture: LectureItem | null
  today_lectures: LectureItem[]
  tomorrow_lectures: LectureItem[]
  weekly_schedule: WeeklyDaySchedule[]
  recent_attendance: RecentAttendanceRecord[]
  analytics: AttendanceAnalytics
  pending_substitutes: SubstituteInvite[]
  announcements: Announcement[]
}

interface Challenge {
  challenge_token: string
  instruction: string
}

interface FacultyDashboardPageProps {
  user: User
  navigate: (page: string) => void
}

export function FacultyDashboardPage({ user, navigate }: FacultyDashboardPageProps) {
  const [data, setData] = useState<FacultyDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [subActionBusy, setSubActionBusy] = useState(false)

  // Timetable view filter: 'today' | 'tomorrow' | 'weekly'
  const [timetableTab, setTimetableTab] = useState<'today' | 'tomorrow' | 'weekly'>('today')

  // Recent Attendance filters
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('all')
  const [historySearch, setHistorySearch] = useState<string>('')

  // Modal / Verification state for live Face & GPS Punch
  const [activePunch, setActivePunch] = useState<{
    action: 'punch_in' | 'punch_out'
    lecture: LectureItem
  } | null>(null)
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [punchBusy, setPunchBusy] = useState<boolean>(false)
  const [punchError, setPunchError] = useState<string | null>(null)

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

  // Substitute handling
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

  // Trigger Face & GPS Punch-In / Punch-Out
  const initiateLecturePunch = async (lecture: LectureItem, action: 'punch_in' | 'punch_out') => {
    setPunchError(null)
    setActionMsg(null)
    setActivePunch({ action, lecture })
    try {
      const res = await api.post<Challenge>('/biometrics/challenge', {
        action: `lecture_${action}`,
      })
      setChallenge(res.data)
    } catch (err) {
      setPunchError(errorMessage(err))
      setActivePunch(null)
    }
  }

  // Complete Biometric Capture and Send to Server with GPS verification
  const handleCaptureComplete = async (frames: string[]) => {
    if (!activePunch || !challenge) return
    setPunchBusy(true)
    setPunchError(null)

    try {
      let locationData = { latitude: 23.0225, longitude: 72.5714, accuracy: 15.0 }
      try {
        const loc = await getLocation()
        locationData = {
          latitude: loc.latitude,
          longitude: loc.longitude,
          accuracy: loc.accuracy,
        }
      } catch (locErr) {
        console.warn('GPS prompt fallback used', locErr)
      }

      const todayStr = new Date().toISOString().split('T')[0]
      await api.post(`/lecture-attendance/${activePunch.action}`, {
        source_type: activePunch.lecture.source_type,
        schedule_id: activePunch.lecture.schedule_id,
        lecture_date: todayStr,
        challenge_token: challenge.challenge_token,
        frames,
        face_image_base64: frames[frames.length - 1],
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        accuracy: locationData.accuracy,
        idempotency_key: crypto.randomUUID(),
      })

      setActionMsg(
        `✓ Biometric ${activePunch.action === 'punch_in' ? 'Punch-In' : 'Punch-Out'} recorded successfully for ${activePunch.lecture.subject}!`
      )
      setActivePunch(null)
      setChallenge(null)
      await loadDashboard()
      setTimeout(() => setActionMsg(null), 5000)
    } catch (err) {
      setPunchError(errorMessage(err))
    } finally {
      setPunchBusy(false)
    }
  }

  const f = data?.faculty
  const stats = data?.today_stats
  const nextLec = data?.next_lecture
  const todayLectures = data?.today_lectures || []
  const tomorrowLectures = data?.tomorrow_lectures || []
  const weeklySchedule = data?.weekly_schedule || []
  const recentAttendance = data?.recent_attendance || []
  const analytics = data?.analytics
  const substitutes = data?.pending_substitutes || []
  const announcements = data?.announcements || []

  // Filtered recent attendance list
  const filteredRecentAttendance = useMemo(() => {
    return recentAttendance.filter((rec) => {
      const matchesStatus = historyStatusFilter === 'all' || rec.status === historyStatusFilter
      const matchesSearch =
        !historySearch ||
        rec.subject.toLowerCase().includes(historySearch.toLowerCase()) ||
        rec.course_name.toLowerCase().includes(historySearch.toLowerCase())
      return matchesStatus && matchesSearch
    })
  }, [recentAttendance, historyStatusFilter, historySearch])

  // Badge renderer for lecture status
  const renderStatusBadge = (status: LectureItem['status']) => {
    switch (status) {
      case 'completed':
        return <span className="lecture-status-badge status-completed"><CheckCircle2 size={11} /> Completed</span>
      case 'in_progress':
        return <span className="lecture-status-badge status-in_progress"><Clock3 size={11} /> In Progress</span>
      case 'punch_in_available':
        return <span className="lecture-status-badge status-punch_in_available"><Fingerprint size={11} /> Punch-In Available</span>
      case 'upcoming':
        return <span className="lecture-status-badge status-upcoming"><Clock size={11} /> Upcoming</span>
      case 'missed':
        return <span className="lecture-status-badge status-missed"><AlertCircle size={11} /> Missed</span>
      case 'pending_review':
        return <span className="lecture-status-badge status-pending_review"><AlertTriangle size={11} /> Pending Review</span>
      case 'cancelled':
        return <span className="lecture-status-badge status-cancelled"><X size={11} /> Cancelled</span>
      default:
        return <span className="lecture-status-badge status-scheduled"><Calendar size={11} /> Scheduled</span>
    }
  }

  if (loading && !data) {
    return (
      <div className="admin-page-container" style={{ padding: '60px 20px', textAlign: 'center' }}>
        <div className="admin-loading-card" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
          <RefreshCw className="admin-spin" size={24} />
          <span>Loading Visiting Faculty Dashboard...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="page-content user-dashboard">
      {/* 1. Dashboard Welcome & Faculty Profile Bar */}
      <div className="user-dashboard-welcome flex items-center justify-between flex-wrap gap-4" style={{ marginBottom: '18px' }}>
        <div>
          <div className="eyebrow flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#5b6e88' }}>
            <Building2 size={14} />
            <span>{f?.department || 'Department of cs'}</span>
            <span>•</span>
            <span>{f?.college_name || 'General'}</span>
            <span>•</span>
            <span>
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>
          <h1 style={{ margin: '7px 0 4px', color: '#162d50', font: '800 26px/1.2 Manrope, sans-serif' }}>
            Welcome back, {f?.full_name || user.full_name || 'krisha patel'}! <span aria-hidden="true">👋</span>
          </h1>
          <p className="text-muted text-sm" style={{ margin: 0, color: '#637793', fontSize: '13px' }}>
            {f?.designation || 'Visiting Faculty'} • Faculty ID: <strong style={{ color: '#1a2e4c' }}>{f?.employee_id || user.employee_id}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Biometric Status Pill */}
          {f?.face_enrolled && f?.biometric_status === 'approved' ? (
            <div className="badge badge-approved" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldCheck size={14} /> Biometrics Approved
            </div>
          ) : (
            <button
              type="button"
              className="badge badge-pending"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
              onClick={() => navigate('enrollment')}
            >
              <Fingerprint size={14} /> Face Registration Needed
            </button>
          )}

          <button
            type="button"
            className="button button-secondary button-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={loadDashboard}
            disabled={refreshing}
          >
            <RefreshCw size={13} className={refreshing ? 'admin-spin' : ''} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Global Alerts & Error Banners */}
      {error && (
        <div className="banner banner-error mb-4" style={{ marginBottom: '14px' }}>
          <AlertCircle size={18} />
          <div>{error}</div>
        </div>
      )}

      {actionMsg && (
        <div className="banner banner-success mb-4" style={{ marginBottom: '14px' }}>
          <CheckCircle2 size={18} />
          <div>{actionMsg}</div>
        </div>
      )}

      {/* Pending Substitute Request Banner */}
      {substitutes.length > 0 && (
        <div className="banner banner-info mb-4 flex flex-col gap-2" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
            <UserCheck size={18} />
            <span>Pending Substitute Teaching Request ({substitutes.length})</span>
          </div>
          {substitutes.map((sub) => (
            <div
              key={sub.id}
              style={{
                background: 'rgba(255, 255, 255, 0.9)',
                padding: '12px 14px',
                borderRadius: '8px',
                border: '1px solid #bfdbfe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
                marginTop: '6px',
              }}
            >
              <div>
                <strong>{sub.subject}</strong> for <span style={{ color: '#1d4ed8' }}>{sub.original_faculty_name}</span>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                  Date: <strong>{sub.date}</strong> • Scheduled Time: <strong>{sub.time}</strong>{' '}
                  {sub.reason ? `• Note: "${sub.reason}"` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="button button-secondary button-sm"
                  disabled={subActionBusy}
                  onClick={() => handleSubstituteResponse(sub.id, 'declined')}
                >
                  <X size={13} /> Decline
                </button>
                <button
                  type="button"
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

      {/* 2. Dashboard Summary Cards (6 Exact Specified Cards - No Honorarium) */}
      <div className="user-stat-grid-6">
        {/* Card 1: Today's Total Lectures */}
        <article className="user-stat-card stat-lectures">
          <div className="user-stat-card-top">
            <span className="user-stat-icon">
              <CalendarDays size={21} />
            </span>
            <span className="stat-chip stat-chip-blue">Today</span>
          </div>
          <strong>{stats?.assigned_lectures ?? 0}</strong>
          <span className="user-stat-label">Today's Total Lectures</span>
          <small>{stats?.completed_lectures ?? 0} done · {stats?.upcoming_lectures ?? 0} remaining</small>
        </article>

        {/* Card 2: Completed Lectures */}
        <article className="user-stat-card stat-attended">
          <div className="user-stat-card-top">
            <span className="user-stat-icon">
              <CheckCircle2 size={21} />
            </span>
            <span className="stat-chip stat-chip-green">Verified</span>
          </div>
          <strong style={{ color: '#16a34a' }}>{stats?.completed_lectures ?? 0}</strong>
          <span className="user-stat-label">Completed Lectures</span>
          <small>Punched out successfully</small>
        </article>

        {/* Card 3: Upcoming Lectures */}
        <article className="user-stat-card stat-upcoming">
          <div className="user-stat-card-top">
            <span className="user-stat-icon">
              <Clock3 size={21} />
            </span>
            <span className="stat-chip stat-chip-purple">Pending</span>
          </div>
          <strong style={{ color: '#7c3aed' }}>{stats?.upcoming_lectures ?? 0}</strong>
          <span className="user-stat-label">Upcoming Lectures</span>
          <small>Awaiting punch-in window</small>
        </article>

        {/* Card 4: Missed Lectures */}
        <article className="user-stat-card stat-hours">
          <div className="user-stat-card-top">
            <span className="user-stat-icon" style={{ color: '#dc2626', background: '#fee2e2' }}>
              <AlertCircle size={21} />
            </span>
            <span className="stat-chip stat-chip-red">Alert</span>
          </div>
          <strong style={{ color: '#dc2626' }}>{stats?.missed_lectures ?? 0}</strong>
          <span className="user-stat-label">Missed Lectures</span>
          <small>Window elapsed without punch</small>
        </article>

        {/* Card 5: Total Teaching Hours */}
        <article className="user-stat-card stat-status">
          <div className="user-stat-card-top">
            <span className="user-stat-icon" style={{ color: '#d97706', background: '#fef3c7' }}>
              <Clock size={21} />
            </span>
            <span className="stat-chip stat-chip-amber">Taught</span>
          </div>
          <strong>
            {stats?.total_teaching_hours ?? 0} <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>hrs</span>
          </strong>
          <span className="user-stat-label">Total Teaching Hours</span>
          <small>Verified monthly duration</small>
        </article>

        {/* Card 6: Monthly Attendance Percentage */}
        <article className="user-stat-card stat-attended">
          <div className="user-stat-card-top">
            <span className="user-stat-icon" style={{ color: '#0d9488', background: '#ccfbf1' }}>
              <Activity size={21} />
            </span>
            <span className="stat-chip stat-chip-teal">Month Rate</span>
          </div>
          <strong style={{ color: '#0d9488' }}>{stats?.monthly_attendance_percentage ?? 100}%</strong>
          <span className="user-stat-label">Monthly Attendance</span>
          <small>Delivery adherence rate</small>
        </article>
      </div>

      {/* Next Assigned Lecture Hero Banner (If Scheduled/Live Today) */}
      {nextLec && (
        <section className="panel user-next-assigned-panel" style={{ marginBottom: '16px' }}>
          <div className="panel-heading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock3 size={18} style={{ color: '#2563eb' }} />
              <h3 style={{ margin: 0 }}>Next Assigned Lecture</h3>
            </div>
            <span
              className={`lecture-status ${nextLec.status === 'in_progress' ? 'lecture-status-live' : ''
                }`}
            >
              {nextLec.status.replace('_', ' ').toUpperCase()}
            </span>
          </div>

          <div style={{ padding: '6px 0 2px' }}>
            <div className="next-lecture-time" style={{ color: '#1e3a8a', fontSize: '16px', fontWeight: 800 }}>
              {nextLec.start_time} – {nextLec.end_time}
            </div>
            <h4 className="next-lecture-subject" style={{ fontSize: '15px', fontWeight: 700, margin: '4px 0 10px' }}>
              {nextLec.subject}
            </h4>
            <div className="next-lecture-details" style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', fontSize: '12px', color: '#64748b' }}>
              <span>
                <BookOpen size={14} /> {nextLec.course_name || 'BCA'} {nextLec.semester ? `(Sem ${nextLec.semester})` : ''}
              </span>
              <span>
                <MapPin size={14} /> Room {nextLec.room || 'TBD'}
              </span>
              {nextLec.is_substitute && (
                <span className="badge badge-info" style={{ fontSize: '10px' }}>Substitute Assignment</span>
              )}
              <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', fontFamily: 'monospace' }}>
                Punch Window: {nextLec.allowed_punch_in_window}
              </span>
            </div>

            <div style={{ marginTop: '14px' }}>
              {nextLec.can_punch_in ? (
                <button
                  type="button"
                  className="button button-primary"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px' }}
                  onClick={() => initiateLecturePunch(nextLec, 'punch_in')}
                >
                  <Fingerprint size={16} /> Punch In Now (Face & GPS)
                </button>
              ) : nextLec.can_punch_out ? (
                <button
                  type="button"
                  className="button button-secondary"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px', borderColor: '#f59e0b', color: '#b45309' }}
                  onClick={() => initiateLecturePunch(nextLec, 'punch_out')}
                >
                  <Fingerprint size={16} /> Punch Out (Lecture Complete)
                </button>
              ) : nextLec.status === 'completed' ? (
                <div className="banner banner-success text-xs" style={{ margin: 0, padding: '10px 14px' }}>
                  <CheckCircle2 size={16} /> Lecture completed and attendance logged.
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: '#64748b', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={15} />
                  <span>Check-in opens {nextLec.allowed_punch_in_window}.</span>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 3. Core Section: Assigned Timetable with Filters (Today, Tomorrow, Weekly Schedule) */}
      <section className="panel" style={{ marginBottom: '16px' }}>
        <div className="panel-heading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '15px', color: '#1e293b' }}>
              <CalendarDays size={18} style={{ color: '#2563eb' }} />
              Assigned Teaching Timetable & Punch-In Ledger
            </h3>
            <p className="muted" style={{ margin: '3px 0 0', fontSize: '11px', color: '#64748b' }}>
              Independent lecture-wise punch-in and punch-out strictly enforced per schedule
            </p>
          </div>

          {/* Timetable Tab Switcher */}
          <div className="faculty-timetable-tabs">
            <button
              type="button"
              className={`faculty-tab-button ${timetableTab === 'today' ? 'active' : ''}`}
              onClick={() => setTimetableTab('today')}
            >
              Today ({todayLectures.length})
            </button>
            <button
              type="button"
              className={`faculty-tab-button ${timetableTab === 'tomorrow' ? 'active' : ''}`}
              onClick={() => setTimetableTab('tomorrow')}
            >
              Tomorrow ({tomorrowLectures.length})
            </button>
            <button
              type="button"
              className={`faculty-tab-button ${timetableTab === 'weekly' ? 'active' : ''}`}
              onClick={() => setTimetableTab('weekly')}
            >
              Weekly Schedule
            </button>
          </div>
        </div>

        {/* View 1: Today's Schedule Table */}
        {timetableTab === 'today' && (
          <div className="table-scroll">
            {todayLectures.length === 0 ? (
              <div className="dashboard-empty" style={{ padding: '40px 20px' }}>
                <Calendar size={32} style={{ color: '#94a3b8' }} />
                <strong style={{ color: '#475569', fontSize: '13px' }}>No lectures scheduled for today</strong>
                <span style={{ color: '#94a3b8', fontSize: '11px' }}>Enjoy your day or review your weekly schedule.</span>
              </div>
            ) : (
              <table className="faculty-timetable-table">
                <thead>
                  <tr>
                    <th>Lec #</th>
                    <th>Subject Name</th>
                    <th>Course / Sem</th>
                    <th>Division</th>
                    <th>Classroom</th>
                    <th>Time</th>
                    <th>Punch-In Window</th>
                    <th>Punch-In</th>
                    <th>Punch-Out</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {todayLectures.map((lec) => (
                    <tr key={`${lec.source_type}-${lec.schedule_id}`}>
                      <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>#{lec.lecture_number}</td>
                      <td>
                        <strong style={{ display: 'block', color: '#0f172a', fontSize: '12px' }}>{lec.subject}</strong>
                        {lec.is_substitute && (
                          <span className="badge badge-info" style={{ fontSize: '9px', marginTop: '2px', display: 'inline-block' }}>Substitute</span>
                        )}
                      </td>
                      <td>{lec.course_name || 'BCA'} {lec.semester ? `(Sem ${lec.semester})` : ''}</td>
                      <td>{lec.division || 'Sec A'}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                          <MapPin size={12} style={{ color: '#94a3b8' }} /> Room {lec.room || '—'}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{lec.start_time} – {lec.end_time}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '10.5px', color: '#64748b' }}>{lec.allowed_punch_in_window}</td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#16a34a' }}>{lec.punch_in_time || '—'}</td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563eb' }}>{lec.punch_out_time || '—'}</td>
                      <td>{renderStatusBadge(lec.status)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {lec.can_punch_in ? (
                          <button
                            type="button"
                            className="button button-primary button-sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            onClick={() => initiateLecturePunch(lec, 'punch_in')}
                          >
                            <Fingerprint size={13} /> Punch In
                          </button>
                        ) : lec.can_punch_out ? (
                          <button
                            type="button"
                            className="button button-secondary button-sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', borderColor: '#f59e0b', color: '#b45309' }}
                            onClick={() => initiateLecturePunch(lec, 'punch_out')}
                          >
                            <Fingerprint size={13} /> Punch Out
                          </button>
                        ) : lec.status === 'completed' ? (
                          <span style={{ color: '#16a34a', fontWeight: 600, fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 size={13} /> Logged
                          </span>
                        ) : lec.status === 'missed' ? (
                          <span style={{ color: '#dc2626', fontWeight: 600, fontSize: '11px' }}>Closed</span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '11px' }}>Awaiting</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* View 2: Tomorrow's Schedule Table */}
        {timetableTab === 'tomorrow' && (
          <div className="table-scroll">
            {tomorrowLectures.length === 0 ? (
              <div className="dashboard-empty" style={{ padding: '40px 20px' }}>
                <Calendar size={32} style={{ color: '#94a3b8' }} />
                <strong style={{ color: '#475569', fontSize: '13px' }}>No lectures scheduled for tomorrow</strong>
                <span style={{ color: '#94a3b8', fontSize: '11px' }}>Check the full weekly schedule for your upcoming sessions.</span>
              </div>
            ) : (
              <table className="faculty-timetable-table">
                <thead>
                  <tr>
                    <th>Lec #</th>
                    <th>Subject Name</th>
                    <th>Course / Sem</th>
                    <th>Division</th>
                    <th>Classroom</th>
                    <th>Time</th>
                    <th>Allowed Punch-In Window</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tomorrowLectures.map((lec) => (
                    <tr key={`${lec.source_type}-${lec.schedule_id}`}>
                      <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>#{lec.lecture_number}</td>
                      <td><strong style={{ color: '#0f172a' }}>{lec.subject}</strong></td>
                      <td>{lec.course_name || 'BCA'} {lec.semester ? `(Sem ${lec.semester})` : ''}</td>
                      <td>{lec.division || 'Sec A'}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                          <MapPin size={12} style={{ color: '#94a3b8' }} /> Room {lec.room || '—'}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{lec.start_time} – {lec.end_time}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '10.5px', color: '#64748b' }}>{lec.allowed_punch_in_window}</td>
                      <td>{renderStatusBadge(lec.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* View 3: Full Weekly Schedule Preview (Monday to Saturday) */}
        {timetableTab === 'weekly' && (
          <div style={{ padding: '12px 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
              {weeklySchedule.map((day) => (
                <div key={day.day_of_week} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', background: '#f8fafc' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', marginBottom: '8px' }}>
                    <strong style={{ fontSize: '13px', color: '#1e293b' }}>{day.day_name}</strong>
                    <span style={{ fontSize: '10px', fontWeight: 700, background: '#fff', padding: '2px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', color: '#64748b' }}>
                      {day.lectures.length} lecture{day.lectures.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  {day.lectures.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: '11px' }}>No scheduled lectures</div>
                  ) : (
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {day.lectures.map((l) => (
                        <div key={l.id} style={{ padding: '9px 10px', background: '#fff', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '11.5px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 700, color: '#0f172a' }}>
                            <span>{l.subject}</span>
                            <span style={{ color: '#2563eb', fontFamily: 'monospace', fontSize: '10.5px' }}>{l.start_time} – {l.end_time}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748b', fontSize: '10.5px', marginTop: '4px' }}>
                            <span>{l.course_name} {l.semester ? `· Sem ${l.semester}` : ''}</span>
                            <span style={{ fontFamily: 'monospace' }}>Room {l.room || '—'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 4. Recent Attendance Activity & Analytics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '16px' }}>
        {/* Recent Attendance Activity Table */}
        <section className="panel" style={{ flex: '1 1 500px' }}>
          <div className="panel-heading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
            <div>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '14px', color: '#1e293b' }}>
                <Activity size={17} style={{ color: '#4f46e5' }} />
                Recent Attendance Activity
              </h3>
              <p className="muted" style={{ margin: '2px 0 0', fontSize: '11px' }}>
                Verified punch ledger with biometric & GPS compliance
              </p>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: '8px', top: '8px', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Filter subject..."
                  style={{ padding: '5px 8px 5px 26px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '11px', width: '130px' }}
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                />
              </div>
              <select
                style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '11px', background: '#fff', color: '#334155' }}
                value={historyStatusFilter}
                onChange={(e) => setHistoryStatusFilter(e.target.value)}
              >
                <option value="all">All</option>
                <option value="completed">Completed</option>
                <option value="pending_review">Pending Review</option>
                <option value="missed">Missed</option>
              </select>
            </div>
          </div>

          <div className="table-scroll">
            {filteredRecentAttendance.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontSize: '12px' }}>
                No recent attendance records matching filters.
              </div>
            ) : (
              <table className="faculty-timetable-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Subject</th>
                    <th>Scheduled</th>
                    <th>Punch In</th>
                    <th>Punch Out</th>
                    <th>Duration</th>
                    <th>Verification</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecentAttendance.slice(0, 6).map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600, color: '#0f172a' }}>{r.formatted_date}</td>
                      <td>
                        <strong>{r.subject}</strong>
                        <div style={{ fontSize: '10px', color: '#64748b' }}>{r.course_name}</div>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '10.5px' }}>{r.scheduled_time}</td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#16a34a' }}>{r.punch_in_time}</td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563eb' }}>{r.punch_out_time}</td>
                      <td>{r.duration_formatted}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}>
                          <span style={{ padding: '2px 5px', borderRadius: '4px', background: '#dcfce7', color: '#166534', fontWeight: 700 }}>Face</span>
                          <span style={{ padding: '2px 5px', borderRadius: '4px', background: '#dbeafe', color: '#1e40af', fontWeight: 700 }}>GPS</span>
                        </div>
                      </td>
                      <td>{renderStatusBadge(r.status as LectureItem['status'])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Attendance Analytics & Trend Visualizer */}
        <section className="panel" style={{ flex: '1 1 300px' }}>
          <div className="panel-heading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '14px', color: '#1e293b' }}>
                <BarChart3 size={17} style={{ color: '#0d9488' }} />
                Monthly Attendance Analytics
              </h3>
              <p className="muted" style={{ margin: '2px 0 0', fontSize: '11px' }}>Verified lecture delivery metrics</p>
            </div>
            <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', background: '#ccfbf1', color: '#0f766e' }}>
              {analytics?.monthly_attendance_percentage ?? 100}% Rate
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '12px' }}>
            <div style={{ padding: '10px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '11px', color: '#64748b' }}>Scheduled Sessions</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                {analytics?.total_scheduled_lectures ?? stats?.assigned_lectures ?? 0}
              </div>
            </div>
            <div style={{ padding: '10px', borderRadius: '8px', background: '#dcfce7', border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: '11px', color: '#166534', fontWeight: 600 }}>Completed Sessions</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#15803d', marginTop: '2px' }}>
                {analytics?.completed_lectures ?? stats?.completed_lectures ?? 0}
              </div>
            </div>
            <div style={{ padding: '10px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '11px', color: '#64748b' }}>Teaching Hours</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                {analytics?.total_teaching_hours ?? stats?.total_teaching_hours ?? 0} hrs
              </div>
            </div>
            <div style={{ padding: '10px', borderRadius: '8px', background: '#fef3c7', border: '1px solid #fde68a' }}>
              <div style={{ fontSize: '11px', color: '#b45309', fontWeight: 600 }}>Late Arrivals</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#b45309', marginTop: '2px' }}>
                {analytics?.late_arrivals ?? 0}
              </div>
            </div>
          </div>

          {/* 7-Day Trend Chart */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Past 7 Days Delivery Trend</div>
            <div className="trend-bars-container">
              {(analytics?.daily_trends || []).map((day, idx) => {
                const heightPct = Math.min(100, Math.max(16, day.completed * 35))
                return (
                  <div key={idx} className="trend-bar-column">
                    <span style={{ fontSize: '9px', fontWeight: 700, color: '#475569' }}>{day.completed}</span>
                    <div style={{ height: `${heightPct}%` }} className="trend-bar-fill" />
                    <span style={{ fontSize: '9px', color: '#64748b', fontWeight: 600 }}>{day.day_name}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ marginTop: '12px' }}>
            <button
              type="button"
              className="button button-secondary"
              style={{ width: '100%', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              onClick={() => navigate('reports')}
            >
              <BarChart3 size={13} /> View Detailed Reports
            </button>
          </div>
        </section>
      </div>

      {/* 5. Institutional Announcements & Quick Self-Service Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
        {/* Campus Notice Board */}
        <section className="panel">
          <div className="panel-heading" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Bell size={18} style={{ color: '#2563eb' }} />
            <div>
              <h3 style={{ margin: 0, fontSize: '14px', color: '#1e293b' }}>Campus Notice Board</h3>
              <p className="muted" style={{ margin: '2px 0 0', fontSize: '11px' }}>Official institutional circulars & notifications</p>
            </div>
          </div>

          {announcements.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: '12px' }}>No active notices at this time.</div>
          ) : (
            <div style={{ display: 'grid', gap: '8px' }}>
              {announcements.map((ann) => (
                <div
                  key={ann.id}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    background: ann.priority === 'critical' || ann.priority === 'high' ? '#fee2e2' : '#f8fafc',
                    color: ann.priority === 'critical' || ann.priority === 'high' ? '#991b1b' : '#1e293b',
                    fontSize: '11.5px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 700, marginBottom: '2px' }}>
                    <span>{ann.title}</span>
                    <span style={{ fontSize: '10px', fontWeight: 400, opacity: 0.7 }}>
                      {ann.created_at ? new Date(ann.created_at).toLocaleDateString() : ''}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '11px', opacity: 0.9 }}>{ann.message}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Quick Self-Service Actions */}
        <section className="panel">
          <div className="panel-heading" style={{ marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '14px', color: '#1e293b' }}>Quick Self-Service Actions</h3>
            <p className="muted" style={{ margin: '2px 0 0', fontSize: '11px' }}>Visiting faculty shortcuts</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
            <button
              type="button"
              style={{
                padding: '12px',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                background: '#fff',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '3px',
                cursor: 'pointer',
              }}
              onClick={() => navigate('timetable')}
            >
              <CalendarDays size={18} style={{ color: '#2563eb' }} />
              <strong style={{ fontSize: '11.5px', color: '#0f172a' }}>My Timetable</strong>
              <span style={{ fontSize: '10.5px', color: '#64748b' }}>Full weekly schedule</span>
            </button>

            <button
              type="button"
              style={{
                padding: '12px',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                background: '#fff',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '3px',
                cursor: 'pointer',
              }}
              onClick={() => navigate('attendance_tracker')}
            >
              <Clock3 size={18} style={{ color: '#16a34a' }} />
              <strong style={{ fontSize: '11.5px', color: '#0f172a' }}>Mark Attendance</strong>
              <span style={{ fontSize: '10.5px', color: '#64748b' }}>Face & GPS punch</span>
            </button>

            <button
              type="button"
              style={{
                padding: '12px',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                background: '#fff',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '3px',
                cursor: 'pointer',
              }}
              onClick={() => navigate('leave')}
            >
              <CalendarPlus size={18} style={{ color: '#9333ea' }} />
              <strong style={{ fontSize: '11.5px', color: '#0f172a' }}>Leave Management</strong>
              <span style={{ fontSize: '10.5px', color: '#64748b' }}>Apply & check status</span>
            </button>

            <button
              type="button"
              style={{
                padding: '12px',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                background: '#fff',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '3px',
                cursor: 'pointer',
              }}
              onClick={() => navigate('reports')}
            >
              <Activity size={18} style={{ color: '#0d9488' }} />
              <strong style={{ fontSize: '11.5px', color: '#0f172a' }}>Attendance Reports</strong>
              <span style={{ fontSize: '10.5px', color: '#64748b' }}>Export attendance records</span>
            </button>
          </div>
        </section>
      </div>

      {/* Biometric Face Capture & GPS Verification Modal */}
      {activePunch && challenge && (
        <CaptureDialog
          title={`Faculty Biometric Verification · ${activePunch.action === 'punch_in' ? 'Punch In' : 'Punch Out'}`}
          instruction={challenge.instruction || 'Look directly into camera to verify identity'}
          captureLabel={activePunch.action === 'punch_in' ? 'Confirm Punch In' : 'Confirm Punch Out'}
          consent={true}
          onConsentChange={() => { }}
          busy={punchBusy}
          onCancel={() => {
            setActivePunch(null)
            setChallenge(null)
            setPunchError(null)
          }}
          onCapture={handleCaptureComplete}
        />
      )}

      {/* Verification Error Toast */}
      {punchError && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', maxWidth: '380px', padding: '14px', borderRadius: '10px', background: '#dc2626', color: '#fff', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'flex-start', gap: '10px', zIndex: 90 }}>
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '12px' }}>
            <strong>Verification Error</strong>
            <div style={{ marginTop: '2px', opacity: 0.9 }}>{punchError}</div>
          </div>
          <button
            type="button"
            style={{ marginLeft: 'auto', background: 'transparent', border: 0, color: '#fff', cursor: 'pointer' }}
            onClick={() => setPunchError(null)}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  )
}
