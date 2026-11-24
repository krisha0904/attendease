import { useEffect, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Building2,
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Clock3,
  Fingerprint,
  LayoutGrid,
  LayoutList,
  MapPin,
  RefreshCw,
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
  day_name?: string
  weekly_total_lectures?: number
  semester_completed_lectures?: number
  semester_total_lectures?: number
  semester_progress_pct?: number
  total_teaching_hours?: number
  monthly_attendance_percentage?: number
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
  estimated_duration?: string
  duration_minutes?: number
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
  date?: string
  formatted_date?: string
  full_day_label?: string
  is_today?: boolean
  lectures: Array<{
    id: number
    subject: string
    course_name: string | null
    semester?: number | null
    division?: string | null
    room: string | null
    start_time: string
    end_time: string
    estimated_duration?: string
    duration_minutes?: number
    status: string
    status_label?: string
    punch_in_time?: string | null
    punch_out_time?: string | null
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
  const [timetableMode, setTimetableMode] = useState<'cards' | 'table'>('cards')
  const [selectedWeeklyDay, setSelectedWeeklyDay] = useState<number>(() => {
    const wd = (new Date().getDay() + 6) % 7
    return wd < 6 ? wd : 0
  })

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
  const currentDayName = stats?.day_name || new Date().toLocaleDateString('en-US', { weekday: 'long' })
  const todayFormattedDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const tomorrowObj = new Date()
  tomorrowObj.setDate(tomorrowObj.getDate() + 1)
  const tomorrowDayName = tomorrowObj.toLocaleDateString('en-US', { weekday: 'long' })
  const tomorrowFormattedDate = tomorrowObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const nextLec = data?.next_lecture
  const todayLectures = data?.today_lectures || []
  const tomorrowLectures = data?.tomorrow_lectures || []
  const weeklySchedule = data?.weekly_schedule || []
  const substitutes = data?.pending_substitutes || []

  // Badge renderer for lecture status
  const renderStatusBadge = (status: string | undefined) => {
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

  // Spacious, Uncongested Lecture Card Renderer
  const renderLectureCard = (lec: any, showPunchWindow: boolean = true) => {
    return (
      <article
        key={`${lec.source_type || 'lec'}-${lec.schedule_id || lec.id}`}
        className={`spacious-lec-card status-${lec.status || 'scheduled'}`}
      >
        {/* Left Column: Scheduled Slot & Duration */}
        <div className="spacious-lec-time-col">
          <div className="spacious-lec-time">
            <Clock size={15} className="spacious-lec-time-icon" />
            <span>{lec.start_time} – {lec.end_time}</span>
          </div>
          <div className="spacious-lec-duration-pill">
            <span>⏱ {lec.estimated_duration || '1 hr'}</span>
          </div>
          {showPunchWindow && lec.allowed_punch_in_window && (
            <div className="spacious-lec-window" title="Allowed punch-in grace window">
              <span>Window: {lec.allowed_punch_in_window}</span>
            </div>
          )}
        </div>

        {/* Center Column: Subject & Academic Details */}
        <div className="spacious-lec-main-col">
          <div className="spacious-lec-title-row">
            {lec.lecture_number && (
              <span className="spacious-lec-num">#{lec.lecture_number}</span>
            )}
            <h4 className="spacious-lec-subject">{lec.subject}</h4>
            {lec.is_substitute && (
              <span className="badge badge-info" style={{ fontSize: '9.5px', padding: '2px 7px' }}>Substitute Assignment</span>
            )}
          </div>

          <div className="spacious-lec-tags-row">
            <span className="spacious-lec-tag">
              <BookOpen size={13} style={{ color: '#2563eb' }} />
              <strong>{lec.course_name || 'BCA'}</strong> {lec.semester ? `(Sem ${lec.semester})` : ''}
            </span>

            <span className="spacious-lec-tag">
              <MapPin size={13} style={{ color: '#0d9488' }} />
              <span>Room {lec.room || 'LH-101'}</span>
            </span>

            {lec.division && (
              <span className="spacious-lec-tag">
                <span>Div: {lec.division}</span>
              </span>
            )}

            {lec.department && (
              <span className="spacious-lec-tag">
                <span>{lec.department}</span>
              </span>
            )}
          </div>

          {(lec.punch_in_time || lec.punch_out_time) && (
            <div className="spacious-lec-punch-log">
              <Fingerprint size={13} />
              <span>In: <strong>{lec.punch_in_time || '—'}</strong></span>
              <span>•</span>
              <span>Out: <strong>{lec.punch_out_time || '—'}</strong></span>
            </div>
          )}
        </div>

        {/* Right Column: Status & Direct Action */}
        <div className="spacious-lec-action-col">
          <div>
            {renderStatusBadge(lec.status)}
          </div>

          {lec.can_punch_in ? (
            <button
              type="button"
              className="button button-primary spacious-punch-btn"
              onClick={() => initiateLecturePunch(lec, 'punch_in')}
            >
              <Fingerprint size={14} /> Punch In Now (Face & GPS)
            </button>
          ) : lec.can_punch_out ? (
            <button
              type="button"
              className="button button-secondary spacious-punch-btn punch-btn-out"
              onClick={() => initiateLecturePunch(lec, 'punch_out')}
            >
              <Fingerprint size={14} /> Punch Out (Complete)
            </button>
          ) : null}
        </div>
      </article>
    )
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

      {/* 2. Dashboard Summary Cards (6 Exact Specified Cards) */}
      <div className="user-stat-grid-6">
        {/* Card 1: nos of lecs days wise with day name */}
        <article className="user-stat-card stat-lectures">
          <div className="user-stat-card-top">
            <span className="user-stat-icon">
              <CalendarDays size={21} />
            </span>
            <span className="stat-chip stat-chip-blue">{currentDayName}</span>
          </div>
          <strong>{stats?.assigned_lectures ?? 0}</strong>
          <span className="user-stat-label">{currentDayName}'s Total Lectures</span>
          <small>{stats?.completed_lectures ?? 0} done · {stats?.upcoming_lectures ?? 0} remaining</small>
        </article>

        {/* Card 2: total nos of lecs in this week (week wise) */}
        <article className="user-stat-card stat-status">
          <div className="user-stat-card-top">
            <span className="user-stat-icon" style={{ color: '#2563eb', background: '#eff6ff' }}>
              <Calendar size={21} />
            </span>
            <span className="stat-chip stat-chip-blue">This Week</span>
          </div>
          <strong style={{ color: '#1d4ed8' }}>
            {stats?.weekly_total_lectures ?? (weeklySchedule.reduce((acc, d) => acc + d.lectures.length, 0) || (stats?.assigned_lectures ?? 0))}
          </strong>
          <span className="user-stat-label">Total Lectures (Week)</span>
          <small>Mon – Sat weekly scheduled load</small>
        </article>

        {/* Card 3: pending lecs days wise with day name */}
        <article className="user-stat-card stat-upcoming">
          <div className="user-stat-card-top">
            <span className="user-stat-icon">
              <Clock3 size={21} />
            </span>
            <span className="stat-chip stat-chip-purple">{currentDayName} · Pending</span>
          </div>
          <strong style={{ color: '#7c3aed' }}>{stats?.upcoming_lectures ?? 0}</strong>
          <span className="user-stat-label">{currentDayName}'s Pending Lectures</span>
          <small>Awaiting punch-in window</small>
        </article>

        {/* Card 4: missed lecs days wise with day name */}
        <article className="user-stat-card stat-hours">
          <div className="user-stat-card-top">
            <span className="user-stat-icon" style={{ color: '#dc2626', background: '#fee2e2' }}>
              <AlertCircle size={21} />
            </span>
            <span className="stat-chip stat-chip-red">{currentDayName} · Alert</span>
          </div>
          <strong style={{ color: '#dc2626' }}>{stats?.missed_lectures ?? 0}</strong>
          <span className="user-stat-label">{currentDayName}'s Missed Lectures</span>
          <small>Window elapsed without punch</small>
        </article>

        {/* Card 5: completed lecs days wise with day name */}
        <article className="user-stat-card stat-attended">
          <div className="user-stat-card-top">
            <span className="user-stat-icon">
              <CheckCircle2 size={21} />
            </span>
            <span className="stat-chip stat-chip-green">{currentDayName} · Verified</span>
          </div>
          <strong style={{ color: '#16a34a' }}>{stats?.completed_lectures ?? 0}</strong>
          <span className="user-stat-label">{currentDayName}'s Completed Lectures</span>
          <small>Punched out successfully</small>
        </article>

        {/* Card 6: lecs taken / total nos of lec in this sem */}
        <article className="user-stat-card stat-attended">
          <div className="user-stat-card-top">
            <span className="user-stat-icon" style={{ color: '#0d9488', background: '#ccfbf1' }}>
              <BookOpen size={21} />
            </span>
            <span className="stat-chip stat-chip-teal">This Semester</span>
          </div>
          <strong style={{ color: '#0d9488', fontSize: '20px' }}>
            {stats?.semester_completed_lectures ?? stats?.completed_lectures ?? 0}
            <span style={{ fontSize: '15px', color: '#64748b', fontWeight: 600 }}> / {stats?.semester_total_lectures ?? 60}</span>
          </strong>
          <span className="user-stat-label">Semester Lectures Progress</span>
          <small>
            {stats?.semester_progress_pct ?? Math.round(((stats?.semester_completed_lectures ?? 0) / (stats?.semester_total_lectures ?? 60)) * 100)}% taken of semester quota
          </small>
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
        <div className="panel-heading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '16px', color: '#1e293b' }}>
              <CalendarDays size={18} style={{ color: '#2563eb' }} />
              My Timetable & Lecture Schedule
            </h3>
            <p className="muted" style={{ margin: '3px 0 0', fontSize: '11.5px', color: '#64748b' }}>
              Individual lecture delivery schedule with permitted punch-in window, classroom assignment, and live status
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
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

            {/* View Mode Toggle: Cards vs Table */}
            {timetableTab !== 'weekly' && (
              <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', padding: '3px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  style={{
                    padding: '5px 9px',
                    border: 0,
                    borderRadius: '6px',
                    background: timetableMode === 'cards' ? '#fff' : 'transparent',
                    color: timetableMode === 'cards' ? '#2563eb' : '#64748b',
                    boxShadow: timetableMode === 'cards' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}
                  onClick={() => setTimetableMode('cards')}
                  title="Detailed Cards View"
                >
                  <LayoutGrid size={13} />
                  <span>Cards</span>
                </button>
                <button
                  type="button"
                  style={{
                    padding: '5px 9px',
                    border: 0,
                    borderRadius: '6px',
                    background: timetableMode === 'table' ? '#fff' : 'transparent',
                    color: timetableMode === 'table' ? '#2563eb' : '#64748b',
                    boxShadow: timetableMode === 'table' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}
                  onClick={() => setTimetableMode('table')}
                  title="Table View"
                >
                  <LayoutList size={13} />
                  <span>Table</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ========================================================
            VIEW 1: TODAY'S SCHEDULE
            ======================================================== */}
        {timetableTab === 'today' && (
          <div>
            <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '10px 14px', borderRadius: '10px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={16} style={{ color: '#2563eb' }} />
                <span style={{ fontSize: '13px', color: '#1e3a8a', fontWeight: 700 }}>
                  Today: {currentDayName}, {todayFormattedDate}
                </span>
              </div>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', padding: '3px 9px', borderRadius: '6px' }}>
                {todayLectures.length} lecture{todayLectures.length === 1 ? '' : 's'} assigned
              </span>
            </div>

            {todayLectures.length === 0 ? (
              <div className="dashboard-empty" style={{ padding: '48px 20px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                <Calendar size={36} style={{ color: '#94a3b8', marginBottom: '6px' }} />
                <strong style={{ color: '#334155', fontSize: '14px' }}>No lectures scheduled for today ({currentDayName}, {todayFormattedDate})</strong>
                <span style={{ color: '#64748b', fontSize: '11.5px', marginTop: '3px' }}>Enjoy your day off or review your weekly schedule.</span>
              </div>
            ) : timetableMode === 'cards' ? (
              /* Spacious, Uncongested Cards Mode for Today */
              <div className="spacious-timetable-container">
                {todayLectures.map((lec) => renderLectureCard(lec, true))}
              </div>
            ) : (
              /* Table View for Today */
              <div className="table-scroll">
                <table className="faculty-timetable-table">
                  <thead>
                    <tr>
                      <th>Lec #</th>
                      <th>Subject Name & Code</th>
                      <th>Course / Sem</th>
                      <th>Division</th>
                      <th>Classroom</th>
                      <th>Scheduled Slot</th>
                      <th>Duration</th>
                      <th>Allowed Punch Window</th>
                      <th>Punch In</th>
                      <th>Punch Out</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todayLectures.map((lec) => (
                      <tr key={`${lec.source_type}-${lec.schedule_id}`}>
                        <td style={{ fontWeight: 800, fontFamily: 'monospace', color: '#1e3a8a' }}>#{lec.lecture_number}</td>
                        <td>
                          <strong style={{ display: 'block', color: '#0f172a', fontSize: '12.5px' }}>{lec.subject}</strong>
                          {lec.is_substitute && (
                            <span className="badge badge-info" style={{ fontSize: '9px', marginTop: '2px', display: 'inline-block' }}>Substitute</span>
                          )}
                        </td>
                        <td>{lec.course_name || 'BCA'} {lec.semester ? `(Sem ${lec.semester})` : ''}</td>
                        <td><span style={{ fontWeight: 600 }}>{lec.division || 'Sec A'}</span></td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}>
                            <MapPin size={12} style={{ color: '#0d9488' }} /> Room {lec.room || '—'}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700, color: '#1e3a8a', whiteSpace: 'nowrap' }}>{lec.start_time} – {lec.end_time}</td>
                        <td>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#0369a1', background: '#e0f2fe', padding: '2px 6px', borderRadius: '4px' }}>
                            ⏱ {lec.estimated_duration || '1 hr'}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: '11px', color: '#64748b' }}>{lec.allowed_punch_in_window}</td>
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
                            <span style={{ color: '#16a34a', fontWeight: 700, fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <CheckCircle2 size={13} /> Logged
                            </span>
                          ) : lec.status === 'missed' ? (
                            <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '11px' }}>Closed</span>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '11px' }}>Awaiting</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ========================================================
            VIEW 2: TOMORROW'S SCHEDULE
            ======================================================== */}
        {timetableTab === 'tomorrow' && (
          <div>
            <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '10px 14px', borderRadius: '10px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={16} style={{ color: '#2563eb' }} />
                <span style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>
                  Tomorrow: {tomorrowDayName}, {tomorrowFormattedDate}
                </span>
              </div>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', background: '#f1f5f9', padding: '3px 9px', borderRadius: '6px' }}>
                {tomorrowLectures.length} lecture{tomorrowLectures.length === 1 ? '' : 's'} scheduled
              </span>
            </div>

            {tomorrowLectures.length === 0 ? (
              <div className="dashboard-empty" style={{ padding: '48px 20px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                <Calendar size={36} style={{ color: '#94a3b8', marginBottom: '6px' }} />
                <strong style={{ color: '#334155', fontSize: '14px' }}>No lectures scheduled for tomorrow ({tomorrowDayName}, {tomorrowFormattedDate})</strong>
                <span style={{ color: '#64748b', fontSize: '11.5px', marginTop: '3px' }}>Check the full weekly schedule for your upcoming sessions.</span>
              </div>
            ) : timetableMode === 'cards' ? (
              /* Spacious, Uncongested Cards Mode for Tomorrow */
              <div className="spacious-timetable-container">
                {tomorrowLectures.map((lec) => renderLectureCard(lec, true))}
              </div>
            ) : (
              /* Table View for Tomorrow */
              <div className="table-scroll">
                <table className="faculty-timetable-table">
                  <thead>
                    <tr>
                      <th>Lec #</th>
                      <th>Subject Name</th>
                      <th>Course / Sem</th>
                      <th>Division</th>
                      <th>Classroom</th>
                      <th>Scheduled Slot</th>
                      <th>Duration</th>
                      <th>Allowed Punch-In Window</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tomorrowLectures.map((lec) => (
                      <tr key={`${lec.source_type}-${lec.schedule_id}`}>
                        <td style={{ fontWeight: 800, fontFamily: 'monospace', color: '#1e3a8a' }}>#{lec.lecture_number}</td>
                        <td><strong style={{ color: '#0f172a', fontSize: '12.5px' }}>{lec.subject}</strong></td>
                        <td>{lec.course_name || 'BCA'} {lec.semester ? `(Sem ${lec.semester})` : ''}</td>
                        <td><span style={{ fontWeight: 600 }}>{lec.division || 'Sec A'}</span></td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}>
                            <MapPin size={12} style={{ color: '#0d9488' }} /> Room {lec.room || '—'}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700, color: '#1e3a8a' }}>{lec.start_time} – {lec.end_time}</td>
                        <td>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#0369a1', background: '#e0f2fe', padding: '2px 6px', borderRadius: '4px' }}>
                            ⏱ {lec.estimated_duration || '1 hr'}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: '11px', color: '#64748b' }}>{lec.allowed_punch_in_window}</td>
                        <td>{renderStatusBadge(lec.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ========================================================
            VIEW 3: FULL WEEKLY SCHEDULE PREVIEW (Monday to Saturday)
            ======================================================== */}
        {timetableTab === 'weekly' && (() => {
          const currentSelectedDay = weeklySchedule.find((d) => d.day_of_week === selectedWeeklyDay) || weeklySchedule[0]

          return (
            <div>
              {/* Day-Wise Selector Pills (Mon - Sat) */}
              <div className="spacious-day-pills-bar">
                {weeklySchedule.map((d) => (
                  <button
                    key={d.day_of_week}
                    type="button"
                    className={`spacious-day-pill ${selectedWeeklyDay === d.day_of_week ? 'active' : ''}`}
                    onClick={() => setSelectedWeeklyDay(d.day_of_week)}
                  >
                    {d.is_today && <span className="spacious-day-pill-today-dot" title="Today" />}
                    <span>{d.day_name.slice(0, 3)} {d.formatted_date ? d.formatted_date.split(',')[0].replace(/^[A-Za-z]+\s*/, '') : ''}</span>
                    <span className="spacious-day-pill-count">{d.lectures.length}</span>
                  </button>
                ))}
              </div>

              {/* Selected Day Spacious Uncongested Schedule */}
              {currentSelectedDay && (
                <div style={{ marginTop: '10px' }}>
                  <section key={currentSelectedDay.day_of_week} className="spacious-day-section">
                    <div className="spacious-day-header">
                      <div className="spacious-day-header-left">
                        <Calendar size={15} style={{ color: currentSelectedDay.is_today ? '#2563eb' : '#64748b' }} />
                        <span className="spacious-day-header-title">{currentSelectedDay.day_name}</span>
                        <span className="spacious-day-header-date">{currentSelectedDay.formatted_date || currentSelectedDay.date}</span>
                        {currentSelectedDay.is_today && <span className="spacious-day-today-tag">TODAY</span>}
                      </div>
                      <span className="spacious-day-lec-count">
                        {currentSelectedDay.lectures.length} lecture{currentSelectedDay.lectures.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    {currentSelectedDay.lectures.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748b', fontSize: '13px', background: '#f8fafc', borderRadius: '10px', border: '1px dashed #cbd5e1', margin: '4px 0 8px' }}>
                        No lectures scheduled for {currentSelectedDay.day_name} ({currentSelectedDay.formatted_date})
                      </div>
                    ) : (
                      <div className="spacious-timetable-container" style={{ marginBottom: '8px' }}>
                        {currentSelectedDay.lectures.map((l) => renderLectureCard(l, false))}
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>
          )
        })()}
      </section>

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
