import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type FormEvent, type ReactNode } from 'react'
import {
  Activity, ArrowDownToLine, Bell, Building2, CalendarDays, Camera, Check, ChevronRight,
  BookOpen, CalendarPlus, CircleHelp, Clock3, Fingerprint, FolderOpen, MapPin,
  KeyRound, LayoutDashboard, ListChecks, LogOut, Menu, Settings, ShieldCheck, UserRound, Users, X,
} from 'lucide-react'
import { api, clearTokens, errorMessage, fetchJson, getAccessToken, saveTokens } from './api'
import { useClock, useReloadable } from './hooks'
import { AdminSidebar, AdminTopBar, ADMIN_NAV_GROUPS } from './AdminComponents'
import { AdminViewDispatcher } from './AdminViewDispatcher'
import { FacultyDashboardPage } from './FacultyDashboardPage'
import { FacultyAttendanceTrackerPage } from './FacultyAttendanceTrackerPage'
import { FacultyBiometricsPage } from './FacultyBiometricsPage'

type Role = 'super_admin' | 'college_admin' | 'hod' | 'attendance_manager' | 'read_only_admin' | 'faculty' | 'staff'
type Portal = 'admin' | 'user'
export type User = {
  id: number
  employee_id: string
  full_name: string
  email: string
  username: string | null
  college_id: number
  department_id: number | null
  shift_id: number | null
  designation: string | null
  role: Role
  is_active: boolean
  face_enrollment_status: string
  college_name?: string | null
  college_code?: string | null
}
type Attendance = {
  id: number
  date: string
  status: string
  punch_in_time: string | null
  punch_out_time: string | null
  total_working_minutes: number
  total_break_minutes: number
  net_working_minutes: number
  is_late: boolean
  late_by_minutes: number
  is_early_departure: boolean
  overtime_minutes: number
  active_break_started_at: string | null
}
type Policy = {
  require_face_for_punch_in: boolean
  require_face_for_punch_out: boolean
  require_face_for_breaks: boolean
  require_gps_for_punch_in: boolean
  require_gps_for_punch_out: boolean
  require_gps_for_breaks: boolean
}
type Challenge = { challenge_token: string; instruction: string }
type CollegeOption = { id: number; name: string }
type WeeklyLecture = {
  id: number
  user_id: number
  user_name: string
  employee_id: string
  department_id: number | null
  department: string | null
  subject: string
  course_name: string | null
  day_of_week: number
  start_time: string
  end_time: string
  room: string | null
  is_active: boolean
}
type LectureScheduleItem = {
  source_type: 'weekly' | 'additional'
  schedule_id: number
  lecture_date: string
  subject: string
  course_name: string | null
  department: string | null
  room: string | null
  start_time: string
  end_time: string
  status: 'completed' | 'in_progress' | 'upcoming' | 'scheduled' | 'missed'
  punch_in_time: string | null
  punch_out_time: string | null
  scheduled_minutes: number
  worked_minutes: number
  not_worked_minutes: number
  can_punch_in: boolean
  can_punch_out: boolean
  punch_out_window_closed: boolean
}
type LectureCalendarDay = {
  date: string
  status: 'attended' | 'missed' | 'scheduled' | 'no_lecture'
  scheduled_lectures: number
  attended_lectures: number
  missed_lectures: number
}
type LectureAttendanceOverview = {
  today: {
    date: string
    assigned_lectures: number
    attended_lectures: number
    upcoming_lectures: number
    lectures: LectureScheduleItem[]
  }
  week: {
    scheduled_minutes: number
    worked_minutes: number
    not_worked_minutes: number
  }
  next_lecture: LectureScheduleItem | null
}
type NotificationEntry = {
  id: number
  title: string
  message: string
  type: string
  is_read: boolean
  action_url: string | null
  created_at: string
}
type AdditionalLectureRequest = {
  id: number
  user_id: number
  user_name: string
  employee_id: string
  department_id: number | null
  department: string | null
  lecture_date: string
  subject: string
  start_time: string
  end_time: string
  room: string | null
  reason: string
  status: string
  reviewed_at: string | null
  review_remarks: string | null
  created_at: string
}
type NavItem = { key: string; label: string; icon: typeof LayoutDashboard }

const staffNavigation: NavItem[] = [
  { key: 'Dasboard ', label: 'Dasboard ', icon: LayoutDashboard },
  { key: 'attendance_tracker', label: 'Attendance tracker', icon: Clock3 },
  { key: 'timetable', label: 'Timetable', icon: CalendarDays },
  { key: 'additional_lectures', label: 'Additional lectures', icon: CalendarPlus },
  { key: 'leave', label: 'Leave requests', icon: CalendarDays },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'profile', label: 'Profile & Settings', icon: Settings },
  { key: 'enrollment', label: 'Face verification', icon: Fingerprint },
  { key: 'tasks', label: 'My tasks', icon: ListChecks },
  { key: 'projects', label: 'Projects', icon: FolderOpen },
  { key: 'directory', label: 'Faculty directory', icon: Users },
]
const managerNavigation: NavItem[] = [
  { key: 'Dasboard ', label: 'Dasboard ', icon: LayoutDashboard },
  { key: 'timetable', label: 'Timetable', icon: CalendarDays },
  { key: 'additional_lectures', label: 'Additional lectures', icon: CalendarPlus },
  { key: 'attendance', label: 'Attendance', icon: Clock3 },
  { key: 'enrollment', label: 'Face verification', icon: Fingerprint },
  { key: 'tasks', label: 'Tasks', icon: ListChecks },
  { key: 'projects', label: 'Projects', icon: FolderOpen },
  { key: 'leave', label: 'Leave', icon: CalendarDays },
  { key: 'approvals', label: 'Approvals', icon: ShieldCheck },
  { key: 'reports', label: 'Reports', icon: Activity },
  { key: 'directory', label: 'Faculty directory', icon: Users },
]
const adminNavigation: NavItem[] = [
  ...managerNavigation,
  { key: 'people', label: 'People & setup', icon: Users },
  { key: 'notifications', label: 'Notifications', icon: Bell },
]

function isManager(role: Role) {
  return role === 'super_admin' || role === 'college_admin' || role === 'hod' || role === 'attendance_manager' || role === 'read_only_admin'
}

function needsAdminUsername(role: string) {
  return role === 'college_admin' || role === 'hod' || role === 'attendance_manager' || role === 'read_only_admin'
}

function portalForRole(role: Role): Portal {
  return isManager(role) ? 'admin' : 'user'
}

function portalFromPath(pathname: string): Portal {
  return pathname === '/admin' || pathname.startsWith('/admin/') ? 'admin' : 'user'
}

function loginPath(portal: Portal) {
  return portal === 'admin' ? '/admin/login' : '/user/login'
}

function localDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function formatDay(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

function dateTime(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function duration(minutes = 0) {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function statusLabel(status?: string | null) {
  return (status || 'not started').replaceAll('_', ' ')
}

function Login({ portal, onLogin }: { portal: Portal; onLogin: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'login-verify' | 'register' | 'verify'>('login')
  const [fullName, setFullName] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [phone, setPhone] = useState('')
  const [colleges, setColleges] = useState<CollegeOption[]>([])
  const [collegesLoading, setCollegesLoading] = useState(false)
  const [selectedCollegeId, setSelectedCollegeId] = useState('')
  const [collegeCode, setCollegeCode] = useState('')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [verificationDigits, setVerificationDigits] = useState(['', '', '', '', '', ''])
  const verificationCode = verificationDigits.join('')
  const verificationInputs = useRef<Array<HTMLInputElement | null>>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [resendSeconds, setResendSeconds] = useState(0)

  function clearVerificationCode() {
    setVerificationDigits(['', '', '', '', '', ''])
  }

  function updateVerificationDigit(index: number, value: string) {
    const digits = value.replace(/\D/g, '')
    const next = [...verificationDigits]
    if (digits.length > 1) {
      digits.slice(0, 6 - index).split('').forEach((digit, offset) => {
        next[index + offset] = digit
      })
      setVerificationDigits(next)
      verificationInputs.current[Math.min(index + digits.length, 5)]?.focus()
      return
    }

    next[index] = digits
    setVerificationDigits(next)
    if (digits && index < 5) verificationInputs.current[index + 1]?.focus()
  }

  function pasteVerificationCode(event: ClipboardEvent<HTMLInputElement>, index: number) {
    const digits = event.clipboardData.getData('text').replace(/\D/g, '')
    if (!digits) return
    event.preventDefault()
    updateVerificationDigit(index, digits)
  }

  useEffect(() => {
    if (resendSeconds <= 0) return
    const timer = window.setTimeout(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [resendSeconds])

  useEffect(() => {
    if (mode !== 'register') return
    let active = true
    api.get<CollegeOption[]>('/auth/colleges')
      .then(({ data }) => {
        if (!active) return
        setColleges(data)
        if (data.length === 0) setError('No active colleges are available for registration. Contact your college administrator.')
      })
      .catch((requestError: unknown) => {
        if (active) setError(errorMessage(requestError))
      })
      .finally(() => {
        if (active) setCollegesLoading(false)
      })
    return () => { active = false }
  }, [mode])

  async function requestSignInCode(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { data } = await api.post('/auth/otp/request', { email })
      setMessage(data.message)
      clearVerificationCode()
      setResendSeconds(60)
      setMode('login-verify')
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  async function signInAdmin(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { data } = await api.post('/auth/admin-login', { username, password })
      const signedInUser = data.user as User
      if (portalForRole(signedInUser.role) !== portal) {
        setError(`This account must use the ${portalForRole(signedInUser.role)} sign-in portal.`)
        return
      }
      saveTokens(data.access_token, data.refresh_token)
      onLogin(signedInUser)
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  async function verifySignInCode(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { data } = await api.post('/auth/otp/verify', { email, otp: verificationCode, portal })
      const signedInUser = data.user as User
      if (portalForRole(signedInUser.role) !== portal) {
        setError(`This account must use the ${portalForRole(signedInUser.role)} sign-in portal.`)
        return
      }
      saveTokens(data.access_token, data.refresh_token)
      onLogin(signedInUser)
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  async function resendSignInCode() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const { data } = await api.post('/auth/otp/request', { email })
      setMessage(data.message)
      clearVerificationCode()
      setResendSeconds(60)
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  async function register(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const { data } = await api.post('/auth/register', {
        college_id: Number(selectedCollegeId),
        college_code: collegeCode,
        full_name: fullName,
        employee_id: employeeId,
        phone,
        email,
        password,
      })
      setMessage(data.message)
      clearVerificationCode()
      setResendSeconds(60)
      setMode('verify')
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  async function verifyEmail(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { data } = await api.post('/auth/register/verify', {
        college_id: Number(selectedCollegeId),
        email,
        otp: verificationCode,
      })
      setMessage(data.message)
      setPassword('')
      clearVerificationCode()
      setResendSeconds(0)
      setMode('login')
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  async function resendVerification() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const { data } = await api.post('/auth/register/resend', { college_id: Number(selectedCollegeId), email })
      setMessage(data.message)
      setResendSeconds(60)
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  function changeMode(nextMode: 'login' | 'register') {
    setMode(nextMode)
    setError('')
    setMessage('')
    clearVerificationCode()
    setResendSeconds(0)
    if (nextMode === 'register') setCollegesLoading(true)
  }

  const isVerifyingLogin = mode === 'login-verify'
  const isVerifyingEmail = mode === 'verify'
  const isVerifying = isVerifyingLogin || isVerifyingEmail

  return (
    <main className={`login-page ${portal === 'admin' ? 'login-admin' : 'login-user'}`}>
      <div className="login-art">
        <div className="brand brand-light"><span className="brand-mark"><Activity size={21} /></span> AttendEase</div>
        <div className="login-art-copy">
          <div className="eyebrow">{portal === 'admin' ? 'ADMINISTRATOR PORTAL' : 'STAFF & FACULTY PORTAL'}</div>
          <h1>{portal === 'admin' ? <>Manage your<br />college workspace.</> : <>Every day,<br />accounted for.</>}</h1>
          <p>{portal === 'admin' ? 'Approvals, reports, staff, and college setup in one place.' : 'Attendance, tasks, leave, and projects for your college team.'}</p>
        </div>
        <div className="login-art-note"><ShieldCheck size={17} />{portal === 'admin' ? 'Authorized administrators only' : 'New staff can register with their College ID'}</div>
        <div className="art-shape art-shape-one" />
        <div className="art-shape art-shape-two" />
      </div>
      <section className="login-card">
        <div className="mobile-brand brand"><span className="brand-mark"><Activity size={20} /></span> AttendEase</div>
        <div className="eyebrow">{mode === 'login' ? (portal === 'admin' ? 'ADMIN SIGN-IN' : 'USER SIGN-IN') : isVerifying ? (isVerifyingLogin ? 'EMAIL SIGN-IN' : 'EMAIL VERIFICATION') : 'GET STARTED'}</div>
        <h2>{mode === 'login' ? (portal === 'admin' ? 'Admin portal sign in' : 'User portal sign in') : isVerifying ? (isVerifyingLogin ? 'Check your email' : 'Verify your email') : 'Create your account'}</h2>
        <p className="muted">{mode === 'login' ? (portal === 'admin' ? 'Enter your unique admin username and password. Your account is linked to your college.' : 'Enter your registered college email to receive a secure user sign-in code.') : isVerifying ? `Enter the six-digit code sent to ${email}.` : 'Join your existing college with the College ID provided by your administrator.'}</p>
        {message && <div className="notice notice-success"><Check size={16} />{message}</div>}
        <form onSubmit={(event) => void (mode === 'login' ? (portal === 'admin' ? signInAdmin(event) : requestSignInCode(event)) : isVerifyingLogin ? verifySignInCode(event) : mode === 'register' ? register(event) : verifyEmail(event))} className="form-stack">
          {mode === 'register' && <>
            <label>College name
              <select value={selectedCollegeId} onChange={(event) => setSelectedCollegeId(event.target.value)} required disabled={collegesLoading || colleges.length === 0}>
                <option value="">{collegesLoading ? 'Loading colleges…' : 'Select your college'}</option>
                {colleges.map((college) => <option key={college.id} value={college.id}>{college.name}</option>)}
              </select>
            </label>
            <label>College ID
              <input value={collegeCode} onChange={(event) => setCollegeCode(event.target.value.toUpperCase())} required minLength={3} maxLength={50} pattern="[A-Za-z0-9_-]+" autoCapitalize="characters" />
              <span className="table-subtext">Enter the unique ID provided by your college administrator.</span>
            </label>
            <label>Full name<input value={fullName} onChange={(event) => setFullName(event.target.value)} required maxLength={255} autoComplete="name" /></label>
            <label>Employee ID<input value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} required maxLength={50} /></label>
            <label>Phone number (optional)<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={20} autoComplete="tel" /></label>
          </>}
          {portal === 'admin' && mode === 'login' ? <>
            <label>Admin username<input value={username} onChange={(event) => setUsername(event.target.value)} required minLength={3} maxLength={150} autoComplete="username" /></label>
            <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          </> : portal === 'user' && <label>Email address
            <input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={isVerifying} placeholder="you@college.edu" />
          </label>}
          {mode === 'register' ? <label>Password
              <input type="password" autoComplete="new-password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} required />
              <span className="table-subtext">Use at least 12 characters.</span>
            </label> : isVerifying ? <label>Six-digit verification code
              <span className="otp-inputs" role="group" aria-label="Six-digit verification code">
                {verificationDigits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(element) => { verificationInputs.current[index] = element }}
                    type="text"
                    inputMode="numeric"
                    autoComplete={index === 0 ? 'one-time-code' : 'off'}
                    pattern="[0-9]"
                    maxLength={6}
                    aria-label={`Digit ${index + 1}`}
                    value={digit}
                    onChange={(event) => updateVerificationDigit(index, event.target.value)}
                    onPaste={(event) => pasteVerificationCode(event, index)}
                    onKeyDown={(event) => {
                      if (event.key === 'Backspace' && !digit && index > 0) verificationInputs.current[index - 1]?.focus()
                      if (event.key === 'ArrowLeft' && index > 0) verificationInputs.current[index - 1]?.focus()
                      if (event.key === 'ArrowRight' && index < 5) verificationInputs.current[index + 1]?.focus()
                    }}
                    required
                  />
                ))}
              </span>
            </label> : null}
          {error && <div className="notice notice-error">{error}</div>}
          <button className="button button-primary button-wide" disabled={busy || (mode === 'register' && (collegesLoading || colleges.length === 0))}>
            {busy ? (mode === 'login' ? (portal === 'admin' ? 'Signing in…' : 'Sending code…') : isVerifying ? 'Verifying…' : 'Registering…') : (mode === 'login' ? (portal === 'admin' ? 'Sign in' : 'Send sign-in code') : isVerifyingLogin ? 'Verify and sign in' : isVerifyingEmail ? 'Verify email' : 'Create account')}
            {!busy && <ChevronRight size={17} />}
          </button>
        </form>
        {isVerifying && <button className="button button-link auth-switch" type="button" disabled={busy || resendSeconds > 0} onClick={() => void (isVerifyingLogin ? resendSignInCode() : resendVerification())}>
          {resendSeconds > 0 ? `Resend code in 0:${String(resendSeconds).padStart(2, '0')}` : isVerifyingLogin ? 'Resend sign-in code' : 'Resend verification code'}
        </button>}
        <div className="login-foot"><ShieldCheck size={15} /> {mode === 'login' ? (portal === 'admin' ? 'Admin usernames are unique and linked to one college.' : 'Only active, verified email accounts can sign in.') : isVerifyingLogin ? 'Codes expire in 2–5 minutes based on your college’s settings and can only be used once.' : isVerifyingEmail ? 'Registration codes expire after five minutes and can only be used once.' : 'Only active colleges and matching College IDs are accepted.'}</div>
        {isVerifyingLogin && <button className="button button-link auth-switch" type="button" disabled={busy} onClick={() => changeMode('login')}>Use a different email</button>}
        {portal === 'user' && (mode === 'login' || mode === 'register') ? <button className="button button-link auth-switch" type="button" onClick={() => changeMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'New here? Register' : 'Already registered? Sign in'}
        </button> : null}
        <a className="button button-link auth-switch portal-switch" href={loginPath(portal === 'admin' ? 'user' : 'admin')}>
          {portal === 'admin' ? 'Staff / faculty sign in' : 'Administrator sign in'}
        </a>
      </section>
    </main>
  )
}

function MetricCard({ label, value, note, icon: Icon }: { label: string; value: string | number; note: string; icon: typeof Users }) {
  return <article className="metric-card"><div className="metric-icon"><Icon size={18} /></div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-note">{note}</div></article>
}

function Dasboard ({ user, navigate }: { user: User; navigate: (page: string) => void }) {
  const manager = isManager(user.role)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null)
  const [mine, setMine] = useState<{ today: Attendance | null; recent: Attendance[] } | null>(null)
  useEffect(() => {
    let active = true
    const path = manager ? '/admin/dashboard' : '/dashboard/mine'
    void fetchJson<Record<string, unknown> | { today: Attendance | null; recent: Attendance[] }>(path)
      .then((result) => {
        if (!active) return
        if (manager) setSummary(result as Record<string, unknown>)
        else setMine(result as { today: Attendance | null; recent: Attendance[] })
      })
      .catch((requestError: unknown) => {
        if (active) setLoadError(errorMessage(requestError))
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [manager])
  const dateLabel = manager
    ? summary?.date ? formatDay(String(summary.date)) : 'TODAY'
    : mine?.today?.date ? formatDay(mine.today.date) : 'TODAY'

  return (
    <div className="page-content">
      <PageHeading eyebrow={dateLabel} title={`Good day, ${user.full_name.split(' ')[0]}`} description={manager ? 'Here’s what’s happening across your department today.' : 'Your attendance and leave, all in one place.'} />
      {loadError && <ErrorBanner message={loadError} />}
      {loading ? <Loading /> : manager ? (
        <div className="metric-grid">
          <MetricCard label="Active employees" value={String(summary?.active_employees ?? 0)} note="In your scope" icon={Users} />
          <MetricCard label="Attendance records" value={String(summary?.attendance_record_count ?? 0)} note="Recorded today" icon={Clock3} />
          <MetricCard label="Leave approvals" value={String(summary?.pending_leave_applications ?? 0)} note="Waiting for review" icon={CalendarDays} />
          <MetricCard label="Present today" value={String((summary?.status_counts as Record<string, number> | undefined)?.present ?? 0)} note="Checked in today" icon={Check} />
          <section className="panel wide-panel">
            <div className="panel-heading"><div><h3>Today at a glance</h3><p className="muted">Attendance by current status</p></div><button className="button button-secondary" onClick={() => navigate('reports')}>View report <ChevronRight size={15} /></button></div>
            <div className="status-summary">{Object.entries((summary?.status_counts as Record<string, number>) || {}).map(([key, value]) => <div className="status-chip" key={key}><span className={`status-dot status-${key}`} />{statusLabel(key)}<strong>{value}</strong></div>)}</div>
          </section>
        </div>
      ) : (
        <>
          <div className="metric-grid staff-metrics">
            <MetricCard label="Today’s status" value={statusLabel(mine?.today?.status)} note={mine?.today?.is_late ? `Late by ${mine.today.late_by_minutes} min` : 'Attendance at a glance'} icon={Clock3} />
            <MetricCard label="Hours worked" value={duration(mine?.today?.net_working_minutes)} note="Net work time today" icon={Activity} />
            <MetricCard label="Breaks today" value={duration(mine?.today?.total_break_minutes)} note="Total break time" icon={CalendarDays} />
          </div>
          <div className="panel">
            <div className="panel-heading"><div><h3>Today</h3><p className="muted">Attendance status and shift activity</p></div><button className="button button-primary" onClick={() => navigate('attendance')}>Open attendance <ChevronRight size={15} /></button></div>
            {mine?.today ? <div className="today-strip"><div><span className="detail-label">Punch in</span><strong>{dateTime(mine.today.punch_in_time)}</strong></div><div><span className="detail-label">Punch out</span><strong>{dateTime(mine.today.punch_out_time)}</strong></div><div><span className="detail-label">Break time</span><strong>{duration(mine.today.total_break_minutes)}</strong></div><StatusBadge status={mine.today.status} /></div> : <div className="empty-state"><Clock3 size={24} /><strong>No attendance recorded yet</strong><span>When you’re on campus, start your day from the attendance page.</span></div>}
          </div>
          <div className="panel">
            <div className="panel-heading"><div><h3>Recent attendance</h3><p className="muted">Your latest recorded days</p></div></div>
            {mine?.recent?.length ? <div className="table-scroll"><table><thead><tr><th>Date</th><th>Status</th><th>Punch in</th><th>Punch out</th><th>Net time</th></tr></thead><tbody>{mine.recent.map((item) => <tr key={item.id}><td>{new Date(`${item.date}T12:00:00`).toLocaleDateString()}</td><td><StatusBadge status={item.status} /></td><td>{dateTime(item.punch_in_time)}</td><td>{dateTime(item.punch_out_time)}</td><td>{duration(item.net_working_minutes)}</td></tr>)}</tbody></table></div> : <p className="muted">Your attendance history will appear here.</p>}
          </div>
        </>
      )}
    </div>
  )
}

export function UserDashboard({ user, navigate }: { user: User; navigate: (page: string) => void }) {
  const selectedDate = localDate()
  const {
    data: notifications,
    error: notificationError,
    reload: reloadNotifications,
  } = useReloadable(
    () => fetchJson<NotificationEntry[]>('/notifications'),
    `dashboard-notifications:${user.id}`,
  )
  const {
    data: overview,
    error: scheduleError,
    reload: reloadOverview,
  } = useReloadable(
    () => fetchJson<LectureAttendanceOverview>('/lecture-attendance/overview'),
    `dashboard-lecture-attendance:${user.id}`,
  )
  const selectedLectures = overview?.today.lectures || null
  const nextLecture = overview?.next_lecture || null
  const notificationList: NotificationEntry[] = Array.isArray(notifications)
    ? notifications
    : ((notifications as unknown as { items?: NotificationEntry[] })?.items || [])
  const importantNotification = notificationList
    .filter((item) => !item.is_read)
    .sort((left, right) => {
      const priority = (type: string) => type === 'error' ? 2 : type === 'warning' ? 1 : 0
      return priority(right.type) - priority(left.type)
        || (right.created_at || '').localeCompare(left.created_at || '')
    })[0]
  const [lectureChallenge, setLectureChallenge] = useState<Challenge | null>(null)
  const [activeLectureAction, setActiveLectureAction] = useState<{
    schedule: LectureScheduleItem
    action: 'punch_in' | 'punch_out'
  } | null>(null)
  const [lectureActionBusy, setLectureActionBusy] = useState(false)
  const [lectureActionError, setLectureActionError] = useState('')
  const [lectureActionMessage, setLectureActionMessage] = useState('')
  const [notificationBusy, setNotificationBusy] = useState(false)
  const [notificationActionError, setNotificationActionError] = useState('')

  useEffect(() => {
    const timer = window.setInterval(reloadOverview, 30_000)
    return () => window.clearInterval(timer)
  }, [reloadOverview])

  async function dismissNotification(notificationId: number) {
    setNotificationBusy(true)
    setNotificationActionError('')
    try {
      await api.post(`/notifications/${notificationId}/read`)
      reloadNotifications()
    } catch (requestError) {
      setNotificationActionError(errorMessage(requestError))
    } finally {
      setNotificationBusy(false)
    }
  }

  async function beginLectureAction(schedule: LectureScheduleItem, action: 'punch_in' | 'punch_out') {
    setLectureActionError('')
    setLectureActionMessage('')
    setActiveLectureAction({ schedule, action })
    setLectureActionBusy(true)
    try {
      const { data: challenge } = await api.post<Challenge>('/biometrics/challenge', { action })
      setLectureChallenge(challenge)
    } catch (requestError) {
      setLectureActionError(errorMessage(requestError))
      setActiveLectureAction(null)
    } finally {
      setLectureActionBusy(false)
    }
  }

  async function submitLectureAction(frames: string[]) {
    if (!activeLectureAction || !lectureChallenge) return
    setLectureActionBusy(true)
    setLectureActionError('')
    try {
      await api.post(`/lecture-attendance/${activeLectureAction.action}`, {
        source_type: activeLectureAction.schedule.source_type,
        schedule_id: activeLectureAction.schedule.schedule_id,
        lecture_date: activeLectureAction.schedule.lecture_date,
        challenge_token: lectureChallenge.challenge_token,
        frames,
        face_image_base64: frames[frames.length - 1],
        idempotency_key: crypto.randomUUID(),
      })
      setLectureActionMessage(
        `${activeLectureAction.action === 'punch_in' ? 'Lecture punch in' : 'Lecture punch out'} recorded for ${activeLectureAction.schedule.subject}.`,
      )
      setActiveLectureAction(null)
      setLectureChallenge(null)
      reloadOverview()
    } catch (requestError) {
      setLectureActionError(errorMessage(requestError))
      setActiveLectureAction(null)
      setLectureChallenge(null)
    } finally {
      setLectureActionBusy(false)
    }
  }

  return (
    <div className="page-content user-dashboard">
      <div className="user-dashboard-welcome">
        <div>
          <div className="eyebrow">{formatDay(localDate())}</div>
          <h1>Welcome back, {user.full_name.split(' ')[0]}! <span aria-hidden="true">👋</span></h1>
          <p>Here’s your teaching schedule and lecture hours.</p>
        </div>
      </div>
      {notificationError && <ErrorBanner message={notificationError} />}
      <div className="user-stat-grid">
        <article className="user-stat-card stat-lectures">
          <div className="user-stat-card-top"><span className="user-stat-icon"><CalendarDays size={21} /></span><span className="stat-chip stat-chip-blue">Today</span></div>
          <strong>{overview?.today.assigned_lectures ?? '—'}</strong>
          <span className="user-stat-label">Assigned Lectures</span>
          <small>Today’s scheduled sessions</small>
        </article>
        <article className="user-stat-card stat-attended">
          <div className="user-stat-card-top"><span className="user-stat-icon"><Check size={21} /></span><span className="stat-chip stat-chip-green">Completed</span></div>
          <strong>{overview?.today.attended_lectures ?? '—'}</strong>
          <span className="user-stat-label">Attended Lectures</span>
          <small>Successfully completed</small>
        </article>
        <article className="user-stat-card stat-hours">
          <div className="user-stat-card-top"><span className="user-stat-icon"><Clock3 size={21} /></span></div>
          <strong>{overview ? `${(overview.week.scheduled_minutes / 60).toFixed(1)}` : '—'}</strong>
          <span className="user-stat-label">Teaching Hours</span>
          <small>Total scheduled this week</small>
          <small className="stat-hours-detail">{overview
            ? `${(overview.week.worked_minutes / 60).toFixed(1)} hrs worked · ${(overview.week.not_worked_minutes / 60).toFixed(1)} hrs not worked`
            : 'Loading weekly hours…'}</small>
        </article>
        <article className="user-stat-card stat-upcoming">
          <div className="user-stat-card-top"><span className="user-stat-icon"><CalendarPlus size={21} /></span></div>
          <strong>{overview?.today.upcoming_lectures ?? '—'}</strong>
          <span className="user-stat-label">Upcoming Lectures</span>
          <small>Remaining today</small>
        </article>
      </div>

      <div className="user-dashboard-bottom-grid">
        <section className="panel user-next-assigned-panel">
          <div className="panel-heading"><div><h3><Clock3 size={18} /> Next Assigned Lecture</h3></div>
            {nextLecture && <span className={`lecture-status ${nextLecture.status === 'in_progress' ? 'lecture-status-live' : ''}`}>{statusLabel(nextLecture.status)}</span>}
          </div>
          {scheduleError && !overview ? <ErrorBanner message={scheduleError} /> : nextLecture ? (
            <>
              <div className="next-lecture-time">{dateTime(`2000-01-01T${nextLecture.start_time}:00`)} – {dateTime(`2000-01-01T${nextLecture.end_time}:00`)}</div>
              <h4 className="next-lecture-subject">{nextLecture.subject}</h4>
              <div className="next-lecture-details">
                {nextLecture.course_name && <span><BookOpen size={15} />{nextLecture.course_name}</span>}
                {nextLecture.department && <span><Building2 size={15} />{nextLecture.department}</span>}
                {nextLecture.room && <span><MapPin size={15} />Room {nextLecture.room}</span>}
                <span><CalendarDays size={15} />{formatDay(nextLecture.lecture_date)}</span>
              </div>
              {nextLecture.can_punch_in
                ? <button className="button button-primary next-lecture-action" disabled={lectureActionBusy} onClick={() => void beginLectureAction(nextLecture, 'punch_in')}>Punch In</button>
                : nextLecture.can_punch_out
                  ? <button className="button button-secondary next-lecture-action" disabled={lectureActionBusy} onClick={() => void beginLectureAction(nextLecture, 'punch_out')}>Punch Out</button>
                  : <div className="next-lecture-window">Check-in opens 15 minutes before the scheduled start and requires live verification.</div>}
            </>
          ) : overview ? <div className="next-lecture-empty">No more assigned lectures today.</div> : <Loading />}
        </section>

        <section className="panel user-schedule-panel">
          <div className="panel-heading">
            <div><h3><CalendarDays size={18} /> Today’s Schedule</h3><p className="muted">{formatDay(selectedDate)}</p></div>
          </div>
          {scheduleError && <ErrorBanner message={scheduleError} />}
          {lectureActionError && <ErrorBanner message={lectureActionError} />}
          {lectureActionMessage && <div className="notice notice-success"><Check size={17} />{lectureActionMessage}</div>}
          {!selectedLectures && !scheduleError ? <Loading /> : selectedLectures?.length ? <div className="dashboard-lecture-list">{selectedLectures.map((lecture) => {
            const lectureStatus = lecture.status.replaceAll('_', ' ')
            const statusClass = lecture.status === 'completed'
              ? 'lecture-status-completed'
              : lecture.status === 'in_progress'
                ? 'lecture-status-live'
                : lecture.status === 'missed'
                  ? 'lecture-status-missed'
                  : ''
            return (
              <div className="dashboard-lecture-timeline-item" key={`${lecture.source_type}-${lecture.schedule_id}`}>
                <span className="lecture-timeline-dot" />
                <article className="dashboard-lecture">
                  <div className="dashboard-lecture-main">
                    <div className="dashboard-lecture-time">{dateTime(`2000-01-01T${lecture.start_time}:00`)} – {dateTime(`2000-01-01T${lecture.end_time}:00`)}</div>
                    <strong>{lecture.subject}</strong>
                    <small>{[
                      lecture.course_name ? `Course: ${lecture.course_name}` : null,
                      lecture.department ? `Dept: ${lecture.department}` : null,
                      lecture.room ? `Room: ${lecture.room}` : null,
                    ].filter(Boolean).join('  |  ') || 'Scheduled lecture'}</small>
                    {(lecture.punch_in_time || lecture.punch_out_time) && <small className="lecture-punch-times">In: {dateTime(lecture.punch_in_time)} · Out: {dateTime(lecture.punch_out_time)}</small>}
                    {lecture.punch_out_window_closed && <small className="lecture-window-closed">Punch-out window closed</small>}
                  </div>
                  <span className={`lecture-status ${statusClass}`}>
                    {lecture.status === 'completed' && <Check size={12} />}
                    {lecture.status === 'upcoming' && <Clock3 size={12} />}
                    {statusLabel(lectureStatus)}
                  </span>
                  {lecture.can_punch_in && <button className="button button-primary lecture-action-button" disabled={lectureActionBusy} onClick={() => void beginLectureAction(lecture, 'punch_in')}>Punch In</button>}
                  {lecture.can_punch_out && <button className="button button-secondary lecture-action-button" disabled={lectureActionBusy} onClick={() => void beginLectureAction(lecture, 'punch_out')}>Punch Out</button>}
                </article>
              </div>
            )
          })}</div> : selectedLectures && <div className="dashboard-empty"><BookOpen size={22} /><strong>No lectures scheduled today</strong><span>Your college timetable will appear here when it is set up.</span></div>}
        </section>
      </div>
      {importantNotification && <aside className={`dashboard-notification-popup notification-popup-${importantNotification.type}`} role="alert">
        <div className="dashboard-notification-popup-heading"><Bell size={16} /><strong>Important notification</strong><button type="button" aria-label="Dismiss notification" disabled={notificationBusy} onClick={() => void dismissNotification(importantNotification.id)}><X size={17} /></button></div>
        <h3>{importantNotification.title}</h3>
        <p>{importantNotification.message}</p>
        {notificationActionError && <span className="notification-popup-error">{notificationActionError}</span>}
        <div className="dashboard-notification-popup-actions">
          <button className="button button-link" onClick={() => navigate('notifications')}>View notifications</button>
          <button className="button button-secondary" disabled={notificationBusy} onClick={() => void dismissNotification(importantNotification.id)}>{notificationBusy ? 'Marking…' : 'Mark as read'}</button>
        </div>
      </aside>}
      {lectureChallenge && activeLectureAction && <CaptureDialog
        instruction={lectureChallenge.instruction}
        busy={lectureActionBusy}
        onCancel={() => { setActiveLectureAction(null); setLectureChallenge(null) }}
        onCapture={(frames) => void submitLectureAction(frames)}
      />}
    </div>
  )
}

function PageHeading({ eyebrow, title, description, children }: { eyebrow: string; title: string; description?: string; children?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p className="muted">{description}</p>}</div>{children}</div>
}

function ErrorBanner({ message }: { message: string }) {
  return <div className="notice notice-error"><CircleHelp size={17} />{message}</div>
}

function Loading() {
  return <div className="loading"><span className="spinner" /> Loading secure data…</div>
}

function StatusBadge({ status }: { status?: string | null }) {
  return <span className={`badge badge-${status || 'unknown'}`}><span className="status-dot" />{statusLabel(status)}</span>
}

export function CaptureDialog({ instruction, title, captureLabel, consent, onConsentChange, busy, onCancel, onCapture }: {
  instruction?: string
  title?: string
  captureLabel?: string
  consent?: boolean
  onConsentChange?: (consent: boolean) => void
  busy: boolean
  onCancel: () => void
  onCapture: (frames: string[]) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [captureState, setCaptureState] = useState<'ready' | 'capturing' | 'verifying'>('ready')
  const [capturedImage, setCapturedImage] = useState('')
  const [cameraError, setCameraError] = useState(() =>
    typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia
      ? 'Camera access is not available in this browser. Use a supported browser on localhost or HTTPS.'
      : '',
  )

  useEffect(() => {
    let active = true
    if (!navigator.mediaDevices?.getUserMedia) {
      return () => { active = false }
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
      .then((cameraStream) => {
        if (!active) {
          cameraStream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = cameraStream
        if (videoRef.current) videoRef.current.srcObject = cameraStream
      })
      .catch((error: unknown) => {
        if (active) setCameraError(error instanceof Error ? error.message : 'Camera access was denied.')
      })
    return () => {
      active = false
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  async function capture() {
    const video = videoRef.current
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError('The camera is not ready yet. Please wait a moment and try again.')
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context) {
      setCameraError('Could not access the camera image. Please try again.')
      return
    }
    const frames: string[] = []
    setCaptureState('capturing')
    try {
      for (let index = 0; index < 6; index += 1) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        frames.push(canvas.toDataURL('image/jpeg', 0.78))
        await new Promise((resolve) => window.setTimeout(resolve, 220))
      }
    } catch (error) {
      setCaptureState('ready')
      setCameraError(error instanceof Error ? error.message : 'Could not capture the camera image. Please try again.')
      return
    }
    setCapturedImage(frames[frames.length - 1])
    setCaptureState('verifying')
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    onCapture(frames)
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="capture-modal" role="dialog" aria-modal="true" aria-labelledby="capture-title">
        <div className="modal-top"><div><div className="eyebrow">{instruction ? 'LIVE VERIFICATION' : 'FACE REGISTRATION'}</div><h2 id="capture-title">{title || 'Complete your face check'}</h2></div><button className="icon-button" aria-label="Close camera" onClick={onCancel}><X size={19} /></button></div>
        <div className="camera-frame">{capturedImage ? <img className="captured-face" src={capturedImage} alt="Captured face" /> : <video ref={videoRef} autoPlay playsInline muted />}<div className="camera-guide" /></div>
        {instruction && <div className="challenge-instruction"><span className="challenge-icon"><Camera size={17} /></span><div><strong>Follow the instruction</strong><span>{instruction.replaceAll('_', ' ')}</span></div></div>}
        {onConsentChange && <label className="consent-check capture-consent"><input type="checkbox" checked={Boolean(consent)} onChange={(event) => onConsentChange(event.target.checked)} /><span>I agree to register my face for attendance verification.</span></label>}
        {cameraError && <ErrorBanner message={cameraError} />}
        {instruction && <p className="muted small-copy">Keep your face centered and allow camera access. A short camera sequence checks for a live face.</p>}
        {!instruction && <p className="muted small-copy">{captureState === 'capturing' ? 'Capturing face…' : captureState === 'verifying' || busy ? 'Photo captured. Verifying your face…' : 'Camera ready.'}</p>}
        <div className="modal-actions"><button className="button button-secondary" onClick={onCancel} disabled={busy || captureState !== 'ready'}>Cancel</button><button className="button button-primary" onClick={() => void capture()} disabled={busy || captureState !== 'ready' || Boolean(cameraError) || (onConsentChange !== undefined && !consent)}>{busy || captureState === 'verifying' ? 'Verifying…' : captureState === 'capturing' ? 'Capturing…' : captureLabel || 'Capture and verify'} {!busy && captureState === 'ready' && <ChevronRight size={16} />}</button></div>
      </section>
    </div>
  )
}

export function getLocation(): Promise<{ latitude: number; longitude: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location services are unavailable in this browser.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }),
      (error) => reject(new Error(error.message || 'Could not verify your location.')),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    )
  })
}

function AttendancePage() {
  const [record, setRecord] = useState<Attendance | null>(null)
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [activeAction, setActiveAction] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [message, setMessage] = useState('')

  const { data, error: loadError, loading } = useReloadable(async () => {
    const [policyResponse, dashboardResponse] = await Promise.all([
      api.get<Policy>('/attendance/policy'),
      api.get<{ today: Attendance | null }>('/dashboard/mine'),
    ])
    return { policy: policyResponse.data, record: dashboardResponse.data.today }
  }, 'attendance')
  const policy = data?.policy || null
  const shownRecord = record ?? data?.record ?? null
  const clockNow = useClock()

  function required(action: string, type: 'face' | 'gps') {
    if (!policy) return false
    if (action === 'punch_in') return policy.require_face_for_punch_in && type === 'face' || policy.require_gps_for_punch_in && type === 'gps'
    if (action === 'punch_out') return policy.require_face_for_punch_out && type === 'face' || policy.require_gps_for_punch_out && type === 'gps'
    return policy.require_face_for_breaks && type === 'face' || policy.require_gps_for_breaks && type === 'gps'
  }

  async function beginAction(action: string) {
    setActionError('')
    setMessage('')
    setActiveAction(action)
    try {
      if (required(action, 'face')) {
        const { data } = await api.post<Challenge>('/biometrics/challenge', { action })
        setChallenge(data)
      } else {
        setChallenge(null)
        await submitAction(action, [])
      }
    } catch (requestError) {
      setActionError(errorMessage(requestError))
      setActiveAction(null)
    }
  }

  async function submitAction(action: string, frames: string[]) {
    setBusy(true)
    setActionError('')
    try {
      const location = required(action, 'gps') ? await getLocation() : {}
      const faceFields = required(action, 'face') && challenge
        ? { challenge_token: challenge.challenge_token, frames, face_image_base64: frames[frames.length - 1] }
        : {}
      const { data } = await api.post<Attendance>(`/attendance/${action}`, {
        ...location,
        ...faceFields,
        idempotency_key: crypto.randomUUID(),
      })
      setRecord(data)
      setMessage(`${action.replaceAll('_', ' ')} recorded successfully.`)
      setActiveAction(null)
      setChallenge(null)
    } catch (requestError) {
      setActionError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  const actions = useMemo(() => {
    if (!shownRecord || shownRecord.status === 'absent') return [{ action: 'punch_in', label: 'Start my day', icon: Clock3 }]
    if (shownRecord.status === 'present') return [
      { action: 'break_start', label: 'Start a break', icon: Clock3 },
      { action: 'punch_out', label: 'End my day', icon: LogOut },
    ]
    if (shownRecord.status === 'on_break') return [{ action: 'break_end', label: 'End my break', icon: Clock3 }]
    return []
  }, [shownRecord])

  return (
    <div className="page-content">
      <PageHeading eyebrow="VISITING FACULTY ATTENDANCE" title="Your workday" description="Record your arrival, breaks, and departure for the college day." />
      {(loadError || actionError) && <ErrorBanner message={actionError || loadError} />}
      {message && <div className="notice notice-success"><Check size={17} />{message}</div>}
      {loading && !policy ? <Loading /> : !policy ? <ErrorBanner message={loadError || 'Attendance policy is unavailable.'} /> : (
        <>
          <section className="attendance-hero">
            <div className="attendance-hero-copy"><div className="eyebrow">{shownRecord?.date ? formatDay(shownRecord.date) : 'TODAY'}</div><h2>{shownRecord ? statusLabel(shownRecord.status) : 'Ready when you are'}</h2><p>{shownRecord?.punch_in_time ? `Checked in at ${dateTime(shownRecord.punch_in_time)}${shownRecord.is_late ? ` · ${shownRecord.late_by_minutes} minutes late` : ''}` : 'Record your attendance when you arrive on campus.'}</p></div>
            <div className="attendance-clock"><span>{clockNow ? dateTime(clockNow) : '—'}</span><small>LOCAL TIME</small></div>
          </section>
          <div className="metric-grid staff-metrics">
            <MetricCard label="Check in" value={dateTime(shownRecord?.punch_in_time)} note="Today's arrival time" icon={Clock3} />
            <MetricCard label="Breaks" value={duration(shownRecord?.total_break_minutes)} note={shownRecord?.active_break_started_at ? 'A break is in progress' : 'Total break time today'} icon={Activity} />
            <MetricCard label="Net working time" value={duration(shownRecord?.net_working_minutes)} note="Time worked excluding breaks" icon={CalendarDays} />
          </div>
          <section className="panel action-panel">
            <div className="panel-heading"><div><h3>Attendance actions</h3><p className="muted">Use the buttons to record your campus attendance.</p></div><span className="secure-label"><ShieldCheck size={15} /> Logged securely</span></div>
            {actions.length ? <div className="action-buttons">{actions.map(({ action, label, icon: Icon }) => <button key={action} className={`button ${action === 'punch_out' ? 'button-secondary' : 'button-primary'}`} disabled={busy || activeAction !== null} onClick={() => void beginAction(action)}><Icon size={17} />{label}</button>)}</div> : <div className="empty-state"><Check size={25} /><strong>Your attendance for today is complete</strong><span>Check your attendance history for recorded details.</span></div>}
          </section>
          {activeAction && challenge && <CaptureDialog instruction={challenge.instruction} busy={busy} onCancel={() => { setActiveAction(null); setChallenge(null) }} onCapture={(frames) => void submitAction(activeAction, frames)} />}
        </>
      )}
    </div>
  )
}

export function EnrollmentPage({ user, onUserUpdate, onComplete }: { user: User; onUserUpdate: (user: User) => void; onComplete: () => void }) {
  const [status, setStatus] = useState(user.face_enrollment_status)
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [consent, setConsent] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const autoOpened = useRef(false)

  async function openCapture() {
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const { data } = await api.post<Challenge>('/biometrics/challenge', { action: 'enrollment' })
      setChallenge(data)
      setCameraOpen(true)
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (status !== 'not_enrolled' || autoOpened.current) return
    autoOpened.current = true
    void openCapture()
  }, [status])

  async function submitEnrollment(frames: string[]) {
    if (!challenge) return
    if (!consent) {
      setError('Please agree before registering your face.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.post('/biometrics/enroll', {
        challenge_token: challenge.challenge_token,
        frames,
        face_image_base64: frames[frames.length - 1],
        consent: true,
      })
      setStatus('pending_approval')
      onUserUpdate({ ...user, face_enrollment_status: 'pending_approval' })
      setCameraOpen(false)
      setChallenge(null)
      onComplete()
    } catch (requestError) {
      setError(errorMessage(requestError))
      setCameraOpen(false)
      setChallenge(null)
    } finally {
      setBusy(false)
    }
  }

  async function withdrawConsent() {
    setBusy(true)
    setError('')
    try {
      await api.delete('/biometrics/enrollment')
      setStatus('revoked')
      setMessage('Your biometric template has been deleted and consent withdrawn.')
      onUserUpdate({ ...user, face_enrollment_status: 'revoked' })
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-content">
      <PageHeading eyebrow="BIOMETRIC ENROLLMENT" title="Face verification" description="An approved face enrollment is required for attendance actions that use biometric verification." />
      {error && <ErrorBanner message={error} />}{message && <div className="notice notice-success"><Check size={17} />{message}</div>}
      <section className="panel enrollment-panel">
        <div className="enrollment-icon"><Fingerprint size={27} /></div>
        <div className="enrollment-info"><div className="eyebrow">ENROLLMENT STATUS</div><h2><StatusBadge status={status} /></h2><p className="muted">Your enrollment is processed on the server. The system stores an encrypted face template, not the captured images.</p></div>
        <div className="privacy-callout"><ShieldCheck size={18} /><div><strong>Consent and privacy</strong><p>Face enrollment is required before attendance punches. You can withdraw consent at any time; doing so deletes your stored face template and disables face-verified attendance.</p></div></div>
        <div className="action-buttons">{status !== 'approved' && status !== 'pending_approval' && <button className="button button-primary" disabled={busy} onClick={() => void openCapture()}><Camera size={17} />{busy ? 'Preparing…' : 'Capture face'}</button>}{(status === 'approved' || status === 'pending_approval') && <button className="button button-danger" disabled={busy} onClick={() => void withdrawConsent()}><X size={17} />Withdraw consent and delete template</button>}</div>
      </section>
      {cameraOpen && challenge && <CaptureDialog title="Capture your face" captureLabel="Capture face" consent={consent} onConsentChange={setConsent} busy={busy} onCancel={() => { setCameraOpen(false); setChallenge(null) }} onCapture={(frames) => void submitEnrollment(frames)} />}
    </div>
  )
}

type LeaveType = { id: number; name: string; code: string; max_days_per_year: number; requires_document: boolean }
type LeaveApplication = {
  id: number
  employee: { id: number; name: string; employee_id: string }
  leave_type: { id: number; name: string }
  start_date: string
  end_date: string
  total_days: number
  reason: string
  status: string
  review_remarks: string | null
  created_at: string
}

export function AttendanceTrackerPage({ user }: { user: User }) {
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear())
  const [showDetails, setShowDetails] = useState(false)
  const today = localDate()
  const monthStart = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`
  const monthEnd = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(new Date(selectedYear, selectedMonth + 1, 0).getDate()).padStart(2, '0')}`
  const { data, error, loading } = useReloadable(async () => {
    const [attendanceResponse, leaveResponse, calendarResponse] = await Promise.all([
      api.get<Attendance[]>('/attendance/mine', { params: { start_date: monthStart, end_date: monthEnd } }),
      api.get<LeaveApplication[]>('/leave/applications'),
      api.get<LectureCalendarDay[]>('/lecture-attendance/calendar', { params: { start_date: monthStart, end_date: monthEnd } }),
    ])
    return {
      attendance: attendanceResponse.data,
      applications: leaveResponse.data,
      lectureCalendar: calendarResponse.data,
    }
  }, `attendance-tracker:${user.id}:${monthStart}`)
  const attendance = data?.attendance || []
  const applications = (data?.applications || []).filter(
    (item) => item.start_date <= monthEnd && item.end_date >= monthStart,
  )
  const punchedInDays = attendance.filter((item) => item.punch_in_time).length
  const approvedLeaves = applications.filter((item) => item.status === 'approved').length
  const lateArrivals = attendance.filter((item) => item.is_late).length
  const earlyDepartures = attendance.filter((item) => item.is_early_departure).length
  const halfDays = attendance.filter((item) => item.status === 'half_day').length
  const pendingLeaves = applications.filter((item) => item.status === 'pending').length
  const rejectedLeaves = applications.filter((item) => item.status === 'rejected').length
  const workedMinutes = attendance.reduce((total, item) => total + item.net_working_minutes, 0)
  const overtimeMinutes = attendance.reduce((total, item) => total + item.overtime_minutes, 0)
  const currentMonth = new Date(selectedYear, selectedMonth, 1)
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate()
  const calendarDays: Array<number | null> = [
    ...Array.from({ length: currentMonth.getDay() }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ]
  const lectureCalendarByDate = new Map((data?.lectureCalendar || []).map((item) => [item.date, item]))
  const yearOptions = Array.from({ length: 7 }, (_, index) => new Date().getFullYear() - 5 + index)

  function displayCount(value: number) {
    return data ? value : '—'
  }

  return (
    <div className="page-content attendance-tracker-page">
      <PageHeading eyebrow="PERSONAL ATTENDANCE" title="Attendance tracker" description="Review your workday attendance, leave requests, and monthly activity." />
      {error && <ErrorBanner message={error} />}
      <div className="attendance-tracker-filters">
        <label>Month<select value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))}>
          {Array.from({ length: 12 }, (_, month) => <option key={month} value={month}>{new Date(2000, month, 1).toLocaleString(undefined, { month: 'long' })}</option>)}
        </select></label>
        <label>Year<select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
          {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
        </select></label>
      </div>

      <div className="attendance-tracker-dashboard-grid">
        <div className="attendance-tracker-main-column">
      <section className="panel attendance-tracker-summary">
        <div className="attendance-total-time">
          <span>Total working time</span>
          <strong>{data ? duration(workedMinutes) : '—'}</strong>
          <small>{new Date(selectedYear, selectedMonth, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' })}</small>
        </div>
        <div className="attendance-tracker-kpis">
          <article><span className="tracker-kpi-icon tracker-icon-blue"><CalendarDays size={18} /></span><strong>{displayCount(punchedInDays)}</strong><small>Punched-in days</small></article>
          <article><span className="tracker-kpi-icon tracker-icon-green"><Check size={18} /></span><strong>{displayCount(approvedLeaves)}</strong><small>Approved leave requests</small></article>
          <article><span className="tracker-kpi-icon tracker-icon-orange"><Clock3 size={18} /></span><strong>{displayCount(lateArrivals)}</strong><small>Late arrivals</small></article>
          <article><span className="tracker-kpi-icon tracker-icon-gray"><LogOut size={18} /></span><strong>{displayCount(earlyDepartures)}</strong><small>Early departures</small></article>
        </div>
        <button className="button button-secondary attendance-tracker-details-toggle" type="button" aria-expanded={showDetails} onClick={() => setShowDetails((shown) => !shown)}>
          {showDetails ? 'Hide Details' : 'View Details'}
        </button>
      </section>

      <div className="attendance-tracker-metrics">
        <article className="tracker-metric-card tracker-metric-purple"><strong>{displayCount(halfDays)}</strong><span>Half days</span><Clock3 size={21} /></article>
        <article className="tracker-metric-card tracker-metric-blue"><strong>{data ? duration(overtimeMinutes) : '—'}</strong><span>Extra working hours</span><Activity size={21} /></article>
        <article className="tracker-metric-card tracker-metric-orange"><strong>{displayCount(pendingLeaves)}</strong><span>Pending leave requests</span><CalendarDays size={21} /></article>
        <article className="tracker-metric-card tracker-metric-red"><strong>{displayCount(rejectedLeaves)}</strong><span>Rejected leave requests</span><X size={21} /></article>
      </div>

      {showDetails && <section className="panel attendance-tracker-details">
        <div className="panel-heading"><div><h3>Attendance details</h3><p className="muted">{attendance.length} attendance record{attendance.length === 1 ? '' : 's'} this month</p></div></div>
        {attendance.length ? <div className="table-scroll"><table><thead><tr><th>Date</th><th>Status</th><th>Punch in</th><th>Punch out</th><th>Net worked</th><th>Notes</th></tr></thead><tbody>
          {[...attendance].sort((left, right) => right.date.localeCompare(left.date)).map((item) => <tr key={item.id}>
            <td>{formatDay(item.date)}</td><td><StatusBadge status={item.status} /></td><td>{dateTime(item.punch_in_time)}</td><td>{dateTime(item.punch_out_time)}</td><td>{duration(item.net_working_minutes)}</td>
            <td>{[item.is_late ? `Late by ${item.late_by_minutes} min` : '', item.is_early_departure ? 'Early departure' : ''].filter(Boolean).join(' · ') || '—'}</td>
          </tr>)}
        </tbody></table></div> : <div className="empty-state"><Clock3 size={22} /><strong>No attendance records for this month</strong><span>Your workday punches will appear here.</span></div>}
      </section>}

        </div>
      <section className="panel attendance-tracker-calendar-panel">
        <div className="attendance-calendar-heading"><h3>{currentMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</h3></div>
        {loading && !data ? <Loading /> : <div className="attendance-calendar-grid" role="grid" aria-label="Monthly attendance calendar">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => <span className="attendance-calendar-weekday" role="columnheader" key={day}>{day}</span>)}
          {calendarDays.map((day, index) => {
            if (day === null) return <span className="attendance-calendar-empty" role="gridcell" key={`empty-${index}`} />
            const dateKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const lectureDay = lectureCalendarByDate.get(dateKey)
            const isToday = dateKey === today
            const classes = [
              'attendance-calendar-day',
              `attendance-calendar-${lectureDay?.status || 'no_lecture'}`,
              isToday ? 'attendance-calendar-today' : '',
            ].filter(Boolean).join(' ')
            const statusText = !lectureDay || lectureDay.status === 'no_lecture'
              ? 'No lecture scheduled'
              : `${lectureDay.attended_lectures} of ${lectureDay.scheduled_lectures} lectures attended${lectureDay.missed_lectures ? `, ${lectureDay.missed_lectures} missed` : ''}`
            return <span className={classes} role="gridcell" aria-label={`${dateKey}${statusText ? `, ${statusText}` : ''}`} title={statusText || dateKey} key={dateKey}>{day}</span>
          })}
        </div>}
        <div className="attendance-calendar-legend">
          <span><i className="legend-attended" />Lectures attended</span>
          <span><i className="legend-missed" />Missed lecture</span>
          <span><i className="legend-scheduled" />Scheduled</span>
          <span><i className="legend-no-lecture" />No lecture</span>
          <span><i className="legend-today" />Today</span>
        </div>
      </section>
      </div>
    </div>
  )
}

function LeavePage({ user }: { user: User }) {
  const [typeId, setTypeId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const manager = isManager(user.role)

  const { data: leaveData, error: loadError, reload } = useReloadable(async () => {
    const [typeResponse, applicationResponse] = await Promise.all([
      api.get<LeaveType[]>('/leave/types'),
      api.get<LeaveApplication[]>('/leave/applications'),
    ])
    return { types: typeResponse.data, applications: applicationResponse.data }
  }, 'leave')
  const types = leaveData?.types || []
  const applications = leaveData?.applications || []
  const shownError = error || loadError

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await api.post('/leave/applications', { leave_type_id: Number(typeId), start_date: startDate, end_date: endDate, reason })
      setMessage('Your leave application was submitted.')
      setReason('')
      await reload()
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  async function cancel(id: number) {
    setError('')
    try {
      await api.post(`/leave/applications/${id}/cancel`)
      await reload()
    } catch (requestError) {
      setError(errorMessage(requestError))
    }
  }

  return (
    <div className="page-content">
      <PageHeading eyebrow="LEAVE MANAGEMENT" title={manager ? 'Leave requests' : 'Your leave'} description={manager ? 'Review and track leave applications in your scope.' : 'Submit a request and follow its status.'} />
      {shownError && <ErrorBanner message={shownError} />}{message && <div className="notice notice-success"><Check size={17} />{message}</div>}
      {!manager && <section className="panel"><div className="panel-heading"><div><h3>New leave request</h3><p className="muted">Working days exclude weekends and college holidays.</p></div></div><form onSubmit={(event) => void submit(event)} className="form-grid"><label>Leave type<select value={typeId} onChange={(event) => setTypeId(event.target.value)} required><option value="" disabled>Select leave type</option>{types.map((item) => <option key={item.id} value={item.id}>{item.name} · up to {item.max_days_per_year} days/year</option>)}</select></label><label>Start date<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required /></label><label>End date<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} required /></label><label className="full-field">Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} required maxLength={4000} placeholder="Add a brief reason for your request" /></label><div className="full-field"><button className="button button-primary" disabled={busy || !types.length}>{busy ? 'Submitting…' : 'Submit application'} <ChevronRight size={16} /></button></div></form>{types.some((item) => item.requires_document) && <p className="muted small-copy">Some leave types need supporting documents; secure document upload is not yet available.</p>}</section>}
      <section className="panel"><div className="panel-heading"><div><h3>Applications</h3><p className="muted">{applications.length} recent request{applications.length === 1 ? '' : 's'}</p></div></div>{applications.length ? <div className="table-scroll"><table><thead><tr>{manager && <th>Employee</th>}<th>Leave type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th><th /></tr></thead><tbody>{applications.map((item) => <tr key={item.id}>{manager && <td><strong>{item.employee.name}</strong><span className="table-subtext">{item.employee.employee_id}</span></td>}<td>{item.leave_type.name}</td><td>{item.start_date}{item.start_date !== item.end_date ? ` – ${item.end_date}` : ''}</td><td>{item.total_days}</td><td className="reason-cell">{item.reason}</td><td><StatusBadge status={item.status} /></td><td>{!manager && item.status === 'pending' && <button className="button button-link button-compact" onClick={() => void cancel(item.id)}>Cancel</button>}</td></tr>)}</tbody></table></div> : <div className="empty-state"><CalendarDays size={23} /><strong>No leave applications yet</strong><span>Your requests will show up here.</span></div>}</section>
    </div>
  )
}

function AdditionalLecturesPage({ user }: { user: User }) {
  const manager = isManager(user.role)
  const [lectureDate, setLectureDate] = useState(localDate())
  const [subject, setSubject] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [room, setRoom] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const { data: requests, error: loadError, loading, reload } = useReloadable(
    () => fetchJson<AdditionalLectureRequest[]>(manager ? '/admin/additional-lectures' : '/additional-lectures/mine'),
    `additional-lectures:${user.id}:${manager}`,
  )

  async function submitRequest(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await api.post('/additional-lectures', {
        lecture_date: lectureDate,
        subject,
        start_time: startTime,
        end_time: endTime,
        room: room || null,
        reason,
      })
      setMessage('Your additional lecture request was sent for approval.')
      setSubject('')
      setStartTime('')
      setEndTime('')
      setRoom('')
      setReason('')
      await reload()
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  async function reviewRequest(item: AdditionalLectureRequest, approved: boolean) {
    setBusy(true)
    setError('')
    try {
      await api.post(`/admin/additional-lectures/${item.id}/review`, { approved })
      await reload()
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-content">
      <PageHeading eyebrow="ADDITIONAL CLASSES" title={manager ? 'Additional lecture requests' : 'Request an additional lecture'} description={manager ? 'Review extra teaching requests from your college or department.' : 'Request approval for a class outside your regular timetable.'} />
      {(error || loadError) && <ErrorBanner message={error || loadError} />}
      {message && <div className="notice notice-success"><Check size={17} />{message}</div>}
      {!manager && <section className="panel">
        <div className="panel-heading"><div><h3>New lecture request</h3><p className="muted">Your request is sent to your HOD and college administrator.</p></div><CalendarPlus size={19} className="panel-icon" /></div>
        <form className="form-grid" onSubmit={(event) => void submitRequest(event)}>
          <label>Lecture date<input type="date" value={lectureDate} min={localDate()} onChange={(event) => setLectureDate(event.target.value)} required /></label>
          <label>Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} required maxLength={200} /></label>
          <label>Start time<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required /></label>
          <label>End time<input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} required /></label>
          <label>Room (optional)<input value={room} onChange={(event) => setRoom(event.target.value)} maxLength={100} /></label>
          <label className="full-field">Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} required maxLength={2000} /></label>
          <div className="full-field"><button className="button button-primary" disabled={busy}>{busy ? 'Sending…' : 'Submit request'} <ChevronRight size={15} /></button></div>
        </form>
      </section>}
      <section className="panel">
        <div className="panel-heading"><div><h3>{manager ? 'Requests for review' : 'My requests'}</h3><p className="muted">{requests?.length || 0} request{requests?.length === 1 ? '' : 's'}</p></div></div>
        {loading ? <Loading /> : requests?.length ? <div className="additional-lecture-list">{requests.map((item) => (
          <article className="additional-lecture-card" key={item.id}>
            <div className="additional-lecture-copy">
              <div className="additional-lecture-title"><strong>{item.subject}</strong><StatusBadge status={item.status} /></div>
              <span>{manager ? `${item.user_name} · ${item.employee_id}` : new Date(`${item.lecture_date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</span>
              {manager && <span>{new Date(`${item.lecture_date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}{item.department ? ` · ${item.department}` : ''}</span>}
              <span>{item.start_time} – {item.end_time}{item.room ? ` · Room: ${item.room}` : ''}</span>
              <p>{item.reason}</p>
              {item.review_remarks && <small>Review note: {item.review_remarks}</small>}
            </div>
            {manager && item.status === 'pending' && <div className="additional-lecture-actions">
              <button className="button button-primary" disabled={busy} onClick={() => void reviewRequest(item, true)}>Approve</button>
              <button className="button button-secondary" disabled={busy} onClick={() => void reviewRequest(item, false)}>Reject</button>
            </div>}
          </article>
        ))}</div> : <EmptyState icon={CalendarPlus} title={manager ? 'No lecture requests to review' : 'No additional lecture requests yet'} detail={manager ? 'New requests from faculty and staff will appear here.' : 'Requests you submit will appear here with their approval status.'} />}
      </section>
    </div>
  )
}

function ApprovalsPage() {
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [remarks, setRemarks] = useState<Record<number, string>>({})

  const { data: approvalData, error: loadError, reload } = useReloadable(async () => {
    const [leaveResponse, biometricResponse] = await Promise.all([
      api.get<LeaveApplication[]>('/leave/applications'),
      api.get<BiometricReviewEntry[]>('/admin/biometrics/pending'),
    ])
    return {
      leaves: leaveResponse.data.filter((item) => item.status === 'pending'),
      biometrics: biometricResponse.data,
    }
  }, 'approvals')
  const leaves = approvalData?.leaves || []
  const biometrics = approvalData?.biometrics || []

  async function reviewLeave(item: LeaveApplication, approved: boolean) {
    setBusyId(item.id)
    setError('')
    try {
      await api.post(`/leave/applications/${item.id}/review`, { approved })
      await reload()
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusyId(null)
    }
  }

  async function reviewBiometric(item: BiometricReviewEntry, approved: boolean) {
    setBusyId(item.enrollment_id)
    setError('')
    try {
      await api.post(`/admin/biometrics/${item.enrollment_id}/review`, {
        approved,
        remarks: remarks[item.enrollment_id] || null,
      })
      await reload()
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="page-content">
      <PageHeading eyebrow="REVIEW QUEUE" title="Approvals" description="Review requests for employees in your college or department." />
      {(error || loadError) && <ErrorBanner message={error || loadError} />}
      <section className="panel"><div className="panel-heading"><div><h3>Face enrollments <span className="count-pill">{biometrics.length}</span></h3><p className="muted">Approve enrollment before faculty can record face-verified attendance.</p></div><Fingerprint size={18} className="panel-icon" /></div>{biometrics.length ? <div className="review-list">{biometrics.map((item) => <article className="review-card" key={item.enrollment_id}><div className="review-main"><div className="avatar">{item.user.full_name.slice(0, 1)}</div><div><strong>{item.user.full_name}</strong><span className="table-subtext">{item.user.employee_id} · {item.user.email}</span><p className="muted">Submitted {new Date(item.created_at).toLocaleString()}</p></div></div><label>Review note<input value={remarks[item.enrollment_id] || ''} onChange={(event) => setRemarks({ ...remarks, [item.enrollment_id]: event.target.value })} maxLength={2000} placeholder="Optional note for the faculty member" /></label><div className="review-actions"><button className="button button-secondary" disabled={busyId === item.enrollment_id} onClick={() => void reviewBiometric(item, false)}>Reject</button><button className="button button-primary" disabled={busyId === item.enrollment_id} onClick={() => void reviewBiometric(item, true)}><Check size={15} />Approve</button></div></article>)}</div> : <EmptyState icon={Fingerprint} title="No face enrollments awaiting review" detail="Submitted enrollments will appear here." />}</section>
      <section className="panel"><div className="panel-heading"><div><h3>Leave requests <span className="count-pill">{leaves.length}</span></h3><p className="muted">Pending review</p></div></div>{leaves.length ? <div className="review-list">{leaves.map((item) => <article className="review-card" key={item.id}><div className="review-main"><div className="avatar">{item.employee.name.slice(0, 1)}</div><div><strong>{item.employee.name}</strong><span className="table-subtext">{item.employee.employee_id} · {item.leave_type.name}</span><p>{item.start_date}{item.start_date !== item.end_date ? ` – ${item.end_date}` : ''} · {item.total_days} working day(s)</p><p className="muted">{item.reason}</p></div></div><div className="review-actions"><button className="button button-secondary" disabled={busyId === item.id} onClick={() => void reviewLeave(item, false)}>Decline</button><button className="button button-primary" disabled={busyId === item.id} onClick={() => void reviewLeave(item, true)}><Check size={15} />Approve</button></div></article>)}</div> : <EmptyState icon={CalendarDays} title="No leave requests awaiting review" detail="New requests will appear here." />}</section>
    </div>
  )
}

type BiometricReviewEntry = {
  enrollment_id: number
  user: User
  created_at: string
}

type Department = { id: number; name: string; code: string | null }
type Shift = { id: number; name: string; start_time: string; end_time: string; is_active: boolean }

function AttendanceNote() {
  return (
    <section className="panel">
      <div className="panel-heading"><div><h3>Face-verified attendance</h3><p className="muted">Approve faculty enrollment before enabling attendance punches.</p></div><ShieldCheck size={18} className="panel-icon" /></div>
      <p className="muted">Faculty must verify their email, enroll their face, and receive administrator approval. Class-period schedules and GPS geofencing are not implemented yet.</p>
    </section>
  )
}

function PeoplePage() {
  const [pageError, setPageError] = useState('')
  const [pageMessage, setPageMessage] = useState('')
  const [employee, setEmployee] = useState({ employee_id: '', full_name: '', email: '', username: '', phone: '', password: '', department_id: '', role: 'faculty', shift_id: '' })
  const [shift, setShift] = useState({ name: '', start_time: '09:00', end_time: '17:00', grace_period_minutes: '15', half_day_minutes: '240', full_day_minutes: '360', max_break_minutes: '60', is_overnight: false })
  const [newDepartment, setNewDepartment] = useState({ name: '', code: '' })
  const [busy, setBusy] = useState(false)
  const [setupKey, setSetupKey] = useState(0)

  const { data: setupData, error: loadError, reload } = useReloadable(async () => {
    const [departmentResponse, shiftResponse, userResponse] = await Promise.all([
      api.get<Department[]>('/admin/departments'),
      api.get<Shift[]>('/admin/shifts'),
      api.get<User[]>('/admin/users'),
    ])
    return {
      departments: departmentResponse.data,
      shifts: shiftResponse.data,
      users: userResponse.data,
    }
  }, String(setupKey))
  const departments = setupData?.departments || []
  const shifts = setupData?.shifts || []
  const users = setupData?.users || []
  const error = pageError || loadError
  const message = pageMessage
  async function submitForm(event: FormEvent, path: string, data: unknown, success: string): Promise<boolean> {
    event.preventDefault()
    setBusy(true)
    setPageError('')
    setPageMessage('')
    try {
      await api.post(path, data)
      setPageMessage(success)
      setSetupKey((key) => key + 1)
      reload()
      return true
    } catch (requestError) {
      setPageError(errorMessage(requestError))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function createEmployee(event: FormEvent) {
    const created = await submitForm(event, '/admin/users', {
      ...employee,
      username: needsAdminUsername(employee.role) ? employee.username : null,
      department_id: employee.department_id ? Number(employee.department_id) : null,
      shift_id: employee.shift_id ? Number(employee.shift_id) : null,
    }, 'Employee account created.')
    if (created) setEmployee({ employee_id: '', full_name: '', email: '', username: '', phone: '', password: '', department_id: '', role: 'faculty', shift_id: '' })
  }

  async function assignShift(userId: number, shiftId: string) {
    setPageError('')
    try {
      await api.put(`/admin/users/${userId}/shift`, { shift_id: shiftId ? Number(shiftId) : null })
      setPageMessage('Employee shift assignment updated.')
      setSetupKey((key) => key + 1)
      reload()
    } catch (requestError) {
      setPageError(errorMessage(requestError))
    }
  }

  return (
    <div className="page-content">
      <PageHeading eyebrow="COLLEGE ADMINISTRATION" title="People & setup" description="Configure the college, departments, shifts, and staff access." />
      {error && <ErrorBanner message={error} />}{message && <div className="notice notice-success"><Check size={17} />{message}</div>}
      <div className="two-column">
        <AttendanceNote />
        <section className="panel"><div className="panel-heading"><div><h3>Create faculty, staff, or admin account</h3><p className="muted">Share the initial password with the new account holder securely.</p></div><Users size={18} className="panel-icon" /></div><form onSubmit={(event) => void createEmployee(event)} className="form-stack"><label>Employee ID<input value={employee.employee_id} onChange={(event) => setEmployee({ ...employee, employee_id: event.target.value })} required /></label><label>Full name<input value={employee.full_name} onChange={(event) => setEmployee({ ...employee, full_name: event.target.value })} required /></label><label>College email<input type="email" value={employee.email} onChange={(event) => setEmployee({ ...employee, email: event.target.value })} required /></label><label>Phone number<input type="tel" value={employee.phone} onChange={(event) => setEmployee({ ...employee, phone: event.target.value })} /></label><label>Initial password<input type="password" autoComplete="new-password" minLength={12} value={employee.password} onChange={(event) => setEmployee({ ...employee, password: event.target.value })} required /><span className="table-subtext">Use at least 12 characters.</span></label><div className="form-grid"><label>Department<select value={employee.department_id} onChange={(event) => setEmployee({ ...employee, department_id: event.target.value })}><option value="">No department</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Role<select value={employee.role} onChange={(event) => setEmployee({ ...employee, role: event.target.value, username: needsAdminUsername(event.target.value) ? employee.username : '' })}><option value="faculty">Visiting faculty</option><option value="staff">Staff</option><option value="college_admin">College Admin</option><option value="hod">HOD</option><option value="attendance_manager">Attendance Manager</option><option value="read_only_admin">Read-only Admin</option></select></label></div>{needsAdminUsername(employee.role) && <label>Admin username<input value={employee.username} onChange={(event) => setEmployee({ ...employee, username: event.target.value.toLowerCase() })} required minLength={3} maxLength={150} pattern="[A-Za-z0-9._-]+" autoComplete="username" /><span className="table-subtext">Must be unique across all colleges and is used to sign in to the admin portal.</span></label>}<label>Working shift<select value={employee.shift_id} onChange={(event) => setEmployee({ ...employee, shift_id: event.target.value })}><option value="">Assign later</option>{shifts.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.start_time}–{item.end_time}</option>)}</select></label><button className="button button-primary" disabled={busy}>Create account <ChevronRight size={15} /></button></form></section>
        <section className="panel"><div className="panel-heading"><div><h3>Departments</h3><p className="muted">Organize employees for HOD access.</p></div><Building2 size={18} className="panel-icon" /></div><form className="form-grid compact-grid" onSubmit={(event) => void submitForm(event, '/admin/departments', newDepartment, 'Department created.')}><label>Name<input value={newDepartment.name} onChange={(event) => setNewDepartment({ ...newDepartment, name: event.target.value })} required /></label><label>Code<input value={newDepartment.code} onChange={(event) => setNewDepartment({ ...newDepartment, code: event.target.value })} /></label><div className="full-field"><button className="button button-secondary" disabled={busy}>Add department</button></div></form><div className="mini-list">{departments.map((item) => <span key={item.id}>{item.name}<small>{item.code || '—'}</small></span>)}</div></section>
        <section className="panel"><div className="panel-heading"><div><h3>Working shifts</h3><p className="muted">Set work hours and assign employees.</p></div><Clock3 size={18} className="panel-icon" /></div><form className="form-grid compact-grid" onSubmit={(event) => void submitForm(event, '/admin/shifts', { ...shift, grace_period_minutes: Number(shift.grace_period_minutes), half_day_minutes: Number(shift.half_day_minutes), full_day_minutes: Number(shift.full_day_minutes), max_break_minutes: Number(shift.max_break_minutes) }, 'Working shift created.')}><label>Shift name<input value={shift.name} onChange={(event) => setShift({ ...shift, name: event.target.value })} required /></label><label>Start time<input type="time" value={shift.start_time} onChange={(event) => setShift({ ...shift, start_time: event.target.value })} required /></label><label>End time<input type="time" value={shift.end_time} onChange={(event) => setShift({ ...shift, end_time: event.target.value })} required /></label><label>Grace minutes<input type="number" min="0" max="240" value={shift.grace_period_minutes} onChange={(event) => setShift({ ...shift, grace_period_minutes: event.target.value })} /></label><label>Half day (min)<input type="number" min="1" value={shift.half_day_minutes} onChange={(event) => setShift({ ...shift, half_day_minutes: event.target.value })} /></label><label>Full day (min)<input type="number" min="1" value={shift.full_day_minutes} onChange={(event) => setShift({ ...shift, full_day_minutes: event.target.value })} /></label><label className="check-inline"><input type="checkbox" checked={shift.is_overnight} onChange={(event) => setShift({ ...shift, is_overnight: event.target.checked })} /> Overnight</label><div className="full-field"><button className="button button-secondary" disabled={busy}>Add shift</button></div></form></section>
      </div>
      <section className="panel"><div className="panel-heading"><div><h3>Employee directory</h3><p className="muted">{users.length} accounts in this college</p></div></div><div className="table-scroll"><table><thead><tr><th>Employee</th><th>Department</th><th>Role</th><th>Shift assignment</th></tr></thead><tbody>{users.map((item) => <tr key={item.id}><td><strong>{item.full_name}</strong><span className="table-subtext">{item.employee_id} · {item.email}{item.username ? ` · Admin username: ${item.username}` : ''}</span></td><td>{departments.find((department) => department.id === item.department_id)?.name || '—'}</td><td>{item.role === 'faculty' ? 'Visiting faculty' : statusLabel(item.role)}</td><td><select className="table-select" aria-label={`Shift for ${item.full_name}`} value={item.shift_id || ''} onChange={(event) => void assignShift(item.id, event.target.value)}><option value="">No shift</option>{shifts.filter((entry) => entry.is_active).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></td></tr>)}</tbody></table></div></section>
    </div>
  )
}

function ReportsPage({ user }: { user: User }) {
  const [reportDate, setReportDate] = useState('')
  const [error, setError] = useState('')
  const { data: rows, error: loadError, loading, reload } = useReloadable(
    () => fetchJson<Array<Attendance & { employee: { id: number; employee_id: string; full_name: string; department_id: number | null } }>>(
      '/admin/attendance',
      { report_date: reportDate || localDate() },
    ),
    reportDate || 'today',
  )

  async function downloadCsv() {
    setError('')
    try {
      const { data } = await api.get('/admin/reports/attendance.csv', { params: { report_date: reportDate || localDate() }, responseType: 'blob' })
      const url = URL.createObjectURL(data as Blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `attendance-${reportDate}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch (requestError) {
      setError(errorMessage(requestError))
    }
  }

  return (
    <div className="page-content">
      <PageHeading eyebrow="REPORTING" title={user.role === 'hod' ? 'Department report' : 'Attendance report'} description="Review daily attendance records and export a CSV for your authorized scope." />
      {(error || loadError) && <ErrorBanner message={error || loadError} />}
      <section className="panel"><div className="report-controls"><label>Report date<input type="date" value={reportDate || localDate()} onChange={(event) => setReportDate(event.target.value)} /></label><button className="button button-secondary" onClick={() => void reload()} disabled={loading}>Refresh</button><button className="button button-primary" onClick={() => void downloadCsv()}><ArrowDownToLine size={16} />Download CSV</button></div>{loading ? <Loading /> : rows?.length ? <div className="table-scroll"><table><thead><tr><th>Employee</th><th>Status</th><th>Punch in</th><th>Punch out</th><th>Net working time</th><th>Late</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.employee.full_name}</strong><span className="table-subtext">{row.employee.employee_id}</span></td><td><StatusBadge status={row.status} /></td><td>{dateTime(row.punch_in_time)}</td><td>{dateTime(row.punch_out_time)}</td><td>{duration(row.net_working_minutes)}</td><td>{row.is_late ? `${row.late_by_minutes} min` : '—'}</td></tr>)}</tbody></table></div> : <EmptyState icon={CalendarDays} title="No attendance records for this date" detail="Try another date or check back after attendance begins." />}</section>
      <p className="muted small-copy">Reports include recorded attendance only. They do not generate or infer absent records.</p>
    </div>
  )
}

function NotificationsPage() {
  const [error, setError] = useState('')
  const { data: rawItems, error: loadError, reload } = useReloadable(
    () => fetchJson<Array<{ id: number; title: string; message: string; type: string; is_read: boolean; created_at: string }> | { items: Array<{ id: number; title: string; message: string; type: string; is_read: boolean; created_at: string }> }>('/notifications'),
    'notifications',
  )
  const items = Array.isArray(rawItems) ? rawItems : (rawItems?.items || [])
  async function markRead(id: number) {
    setError('')
    try {
      await api.post(`/notifications/${id}/read`)
      await reload()
    } catch (requestError) {
      setError(errorMessage(requestError))
    }
  }
  return <div className="page-content"><PageHeading eyebrow="UPDATES" title="Notifications" description="Important attendance and leave updates from your college." />{(error || loadError) && <ErrorBanner message={error || loadError} />}<section className="panel">{items?.length ? <div className="notification-list">{items.map((item) => <article className={`notification-item ${item.is_read ? '' : 'notification-unread'}`} key={item.id}><div className="notification-mark"><Bell size={17} /></div><div className="notification-copy"><strong>{item.title}</strong><p>{item.message}</p><span>{new Date(item.created_at).toLocaleString()}</span></div>{!item.is_read && <button className="button button-link button-compact" onClick={() => void markRead(item.id)}>Mark read</button>}</article>)}</div> : <EmptyState icon={Bell} title="You’re all caught up" detail="New notifications will appear here." />}</section></div>
}

type DirectoryEntry = {
  id: number
  employee_id: string
  full_name: string
  email: string
  phone: string | null
  designation: string | null
  role: Role
  department_id: number | null
  department: string | null
}

function DirectoryPage() {
  const [query, setQuery] = useState('')
  const { data: colleagues, error, loading } = useReloadable(
    () => fetchJson<DirectoryEntry[]>('/directory'),
    'directory',
  )
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filtered = (colleagues || []).filter((person) =>
    [person.full_name, person.employee_id, person.email, person.phone, person.department]
      .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery)),
  )

  return (
    <div className="page-content">
      <PageHeading eyebrow="COLLEGE PEOPLE" title="Faculty directory" description="Find visiting faculty and staff in your college." />
      {error && <ErrorBanner message={error} />}
      <section className="panel">
        <label className="directory-search">Search by name, ID, email, phone, or department
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Start typing to search…" />
        </label>
        {loading ? <Loading /> : filtered.length ? <div className="directory-grid">
          {filtered.map((person) => (
            <article className="directory-card" key={person.id}>
              <div className="avatar">{person.full_name.slice(0, 1)}</div>
              <div className="directory-info">
                <strong>{person.full_name}</strong>
                <span>{person.designation || (person.role === 'faculty' ? 'Visiting faculty' : statusLabel(person.role))}</span>
                <small>{person.department || 'No department'} · {person.employee_id}</small>
                <a href={`mailto:${person.email}`}>{person.email}</a>
                {person.phone && <a href={`tel:${person.phone}`}>{person.phone}</a>}
              </div>
            </article>
          ))}
        </div> : <EmptyState icon={Users} title={query ? 'No matching people found' : 'No directory entries yet'} detail={query ? 'Try another name, email, or department.' : 'Active college accounts will appear here.'} />}
      </section>
    </div>
  )
}

function ProfilePage({ user }: { user: User }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const { data: colleagues } = useReloadable(
    () => fetchJson<DirectoryEntry[]>('/directory'),
    `profile-directory:${user.id}`,
  )
  const department = colleagues?.find((person) => person.id === user.id)?.department

  async function changePassword(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await api.post('/auth/password/change', {
        current_password: currentPassword,
        new_password: newPassword,
      })
      setMessage('Password changed. You will be signed out shortly.')
      window.setTimeout(() => {
        clearTokens()
        window.location.replace(loginPath(portalForRole(user.role)))
      }, 1500)
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-content">
      <PageHeading eyebrow="ACCOUNT" title="Profile & settings" description="Review your account details and secure your sign-in." />
      {error && <ErrorBanner message={error} />}
      {message && <div className="notice notice-success"><Check size={17} />{message}</div>}
      <section className="panel profile-summary-panel">
        <div className="profile-summary-avatar">{user.full_name.slice(0, 1)}</div>
        <div className="profile-summary-info"><h2>{user.full_name}</h2><p>{user.designation || statusLabel(user.role)} · {user.employee_id}</p><StatusBadge status={user.face_enrollment_status} /></div>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><h3><UserRound size={17} /> Personal details</h3><p className="muted">Your registered college account</p></div></div>
        <div className="profile-details-grid">
          <div><span>Email address</span><strong>{user.email}</strong></div>
          <div><span>Employee ID</span><strong>{user.employee_id}</strong></div>
          <div><span>Department</span><strong>{department || 'Not assigned'}</strong></div>
          <div><span>Role</span><strong>{statusLabel(user.role)}</strong></div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><h3><KeyRound size={17} /> Change password</h3><p className="muted">You will need to sign in again after changing your password.</p></div></div>
        <form className="form-grid" onSubmit={(event) => void changePassword(event)}>
          <label>Current password<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
          <label>New password<input type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /><span className="table-subtext">Use at least 12 characters.</span></label>
          <div className="full-field"><button className="button button-primary" disabled={busy}>{busy ? 'Updating…' : 'Update password'} <ChevronRight size={15} /></button></div>
        </form>
      </section>
    </div>
  )
}

const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function TimetablePage({ user }: { user: User }) {
  const manager = isManager(user.role)
  const [teacherId, setTeacherId] = useState('')
  const [subject, setSubject] = useState('')
  const [courseName, setCourseName] = useState('')
  const [dayOfWeek, setDayOfWeek] = useState('0')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [room, setRoom] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { data: lectures, error: loadError, loading, reload } = useReloadable(
    () => fetchJson<WeeklyLecture[]>(manager ? '/admin/timetable' : '/timetable/mine'),
    `timetable:${user.id}:${manager}`,
  )
  const { data: directory } = useReloadable(
    () => manager ? fetchJson<DirectoryEntry[]>('/directory') : Promise.resolve([]),
    `timetable-people:${manager}`,
  )
  const teachers = (directory || []).filter((person) => person.role === 'faculty' || person.role === 'staff')

  async function addLecture(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('/admin/timetable', {
        user_id: Number(teacherId),
        subject,
        course_name: courseName || null,
        day_of_week: Number(dayOfWeek),
        start_time: startTime,
        end_time: endTime,
        room: room || null,
      })
      setSubject('')
      setCourseName('')
      setStartTime('')
      setEndTime('')
      setRoom('')
      await reload()
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  async function removeLecture(id: number) {
    setBusy(true)
    setError('')
    try {
      await api.delete(`/admin/timetable/${id}`)
      await reload()
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-content">
      <PageHeading eyebrow={manager ? 'TIMETABLE SETUP' : 'YOUR WEEK'} title={manager ? 'Manage timetable' : 'My timetable'} description={manager ? 'Set recurring weekly lectures for faculty and staff.' : 'Your recurring weekly lecture schedule.'} />
      {(error || loadError) && <ErrorBanner message={error || loadError} />}
      {manager && <section className="panel">
        <div className="panel-heading"><div><h3>Add a weekly lecture</h3><p className="muted">The selected teacher will see this entry on their dashboard.</p></div><CalendarPlus size={19} className="panel-icon" /></div>
        <form className="form-grid" onSubmit={(event) => void addLecture(event)}>
          <label>Faculty or staff<select value={teacherId} onChange={(event) => setTeacherId(event.target.value)} required><option value="" disabled>Select person</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name} · {teacher.department || 'No department'}</option>)}</select></label>
          <label>Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} required maxLength={200} /></label>
          <label>Course / class<input value={courseName} onChange={(event) => setCourseName(event.target.value)} maxLength={200} /></label>
          <label>Day<select value={dayOfWeek} onChange={(event) => setDayOfWeek(event.target.value)}>{weekdayNames.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>
          <label>Start time<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required /></label>
          <label>End time<input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} required /></label>
          <label>Room<input value={room} onChange={(event) => setRoom(event.target.value)} maxLength={100} /></label>
          <div className="full-field"><button className="button button-primary" disabled={busy || teachers.length === 0}>{busy ? 'Saving…' : 'Add to timetable'} <ChevronRight size={15} /></button></div>
        </form>
      </section>}
      {loading ? <Loading /> : <div className="timetable-week">
        {weekdayNames.map((day, dayIndex) => {
          const rawList: any = lectures
          const lectureList: WeeklyLecture[] = Array.isArray(rawList) ? rawList : rawList?.items || []
          const dayLectures = lectureList.filter((lecture) => lecture.day_of_week === dayIndex)
          return (
            <section className={`panel timetable-day ${dayLectures.length ? '' : 'timetable-day-empty'}`} key={day}>
              <div className="timetable-day-heading"><strong>{day}</strong><span>{dayLectures.length} lecture{dayLectures.length === 1 ? '' : 's'}</span></div>
              {dayLectures.length ? <div className="timetable-day-list">{dayLectures.map((lecture) => (
                <article className="timetable-entry" key={lecture.id}>
                  <div className="timetable-entry-time">{lecture.start_time} – {lecture.end_time}</div>
                  <div className="timetable-entry-copy"><strong>{lecture.subject}</strong><span>{[lecture.course_name, lecture.department, lecture.room ? `Room: ${lecture.room}` : null, manager ? lecture.user_name : null].filter(Boolean).join(' · ') || 'Lecture'}</span></div>
                  {manager && <button className="button button-link button-compact" disabled={busy} onClick={() => void removeLecture(lecture.id)}>Remove</button>}
                </article>
              ))}</div> : <p className="muted">No lectures scheduled</p>}
            </section>
          )
        })}
      </div>}
    </div>
  )
}

type ProjectEntry = {
  id: number
  name: string
  description: string | null
  status: string
  department: string | null
  owner: string | null
  can_manage: boolean
}
type TaskStatus = 'todo' | 'in_progress' | 'completed'
type TaskEntry = {
  id: number
  title: string
  description: string | null
  project_id: number | null
  project_name: string | null
  assignee_id: number
  assignee_name: string
  assigned_by_name: string | null
  due_date: string | null
  status: TaskStatus
  progress: number
}

function ProjectsPage({ user, navigate }: { user: User; navigate: (page: string, projectId?: number) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { data: projects, error: loadError, loading, reload } = useReloadable(
    () => fetchJson<ProjectEntry[]>('/projects'),
    'projects',
  )

  async function createProject(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('/projects', { name, description })
      setName('')
      setDescription('')
      await reload()
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  async function updateProjectStatus(projectId: number, status: 'active' | 'on_hold' | 'completed') {
    setError('')
    try {
      await api.patch(`/projects/${projectId}`, { status })
      await reload()
    } catch (requestError) {
      setError(errorMessage(requestError))
      await reload()
    }
  }

  return (
    <div className="page-content">
      <PageHeading eyebrow="COLLEGE WORK" title="Projects" description="Keep faculty initiatives and their assigned tasks together." />
      {(error || loadError) && <ErrorBanner message={error || loadError} />}
      {isManager(user.role) && <section className="panel">
        <div className="panel-heading"><div><h3>New project</h3><p className="muted">HOD projects are automatically assigned to your department.</p></div><FolderOpen size={18} className="panel-icon" /></div>
        <form className="form-grid" onSubmit={(event) => void createProject(event)}>
          <label>Project name<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={200} /></label>
          <label>Description<input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={4000} /></label>
          <div className="full-field"><button className="button button-primary" disabled={busy}>{busy ? 'Creating…' : 'Create project'} <ChevronRight size={15} /></button></div>
        </form>
      </section>}
      <section className="panel">
        <div className="panel-heading"><div><h3>College projects</h3><p className="muted">{projects?.length || 0} projects</p></div></div>
        {loading ? <Loading /> : projects?.length ? <div className="project-grid">
          {projects.map((project) => <article className="project-card" key={project.id}>
            <div className="project-card-top"><span className="project-icon"><FolderOpen size={18} /></span>{project.can_manage ? <select aria-label={`Status for ${project.name}`} value={project.status} onChange={(event) => void updateProjectStatus(project.id, event.target.value as 'active' | 'on_hold' | 'completed')}><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option></select> : <StatusBadge status={project.status} />}</div>
            <h3>{project.name}</h3>
            <p>{project.description || 'No description provided.'}</p>
            <div className="project-meta"><span>{project.department || 'College-wide'}</span><span>Owner: {project.owner || '—'}</span></div>
            <button className="button button-link button-compact" onClick={() => navigate('tasks', project.id)}>View linked tasks</button>
          </article>)}
        </div> : <EmptyState icon={FolderOpen} title="No projects yet" detail="Projects created by your college will appear here." />}
      </section>
    </div>
  )
}

function TaskRow({ task, onSave }: { task: TaskEntry; onSave: (id: number, status: TaskStatus, progress: number) => Promise<{ status: TaskStatus; progress: number } | null> }) {
  const [status, setStatus] = useState<TaskStatus>(task.status)
  const [progress, setProgress] = useState(task.progress)
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    try {
      const saved = await onSave(task.id, status, progress)
      if (saved) {
        setStatus(saved.status)
        setProgress(saved.progress)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="task-card">
      <div className="task-card-main">
        <div className="task-card-title"><strong>{task.title}</strong><StatusBadge status={task.status} /></div>
        <p>{task.description || 'No details provided.'}</p>
        <div className="task-meta"><span>{task.project_name || 'No project'}</span><span>Assigned to {task.assignee_name}</span><span>{task.due_date ? `Due ${new Date(`${task.due_date}T12:00:00`).toLocaleDateString()}` : 'No due date'}</span></div>
        <div className="task-progress"><div className="task-progress-label"><span>Progress</span><strong>{progress}%</strong></div><input aria-label={`Progress for ${task.title}`} type="range" min="0" max="100" step="5" value={progress} onChange={(event) => setProgress(Number(event.target.value))} /></div>
      </div>
      <div className="task-card-actions">
        <select aria-label={`Status for ${task.title}`} value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)}>
          <option value="todo">To do</option><option value="in_progress">In progress</option><option value="completed">Completed</option>
        </select>
        <button className="button button-secondary" disabled={busy || (status === task.status && progress === task.progress)} onClick={() => void save()}>{busy ? 'Saving…' : 'Save update'}</button>
      </div>
    </article>
  )
}

function TasksPage({ user, selectedProjectId }: { user: User; selectedProjectId: number | null }) {
  const manager = isManager(user.role)
  const [scope, setScope] = useState<'assigned_to_me' | 'assigned_by_me' | 'all'>(manager ? 'all' : 'assigned_to_me')
  const [projectFilter, setProjectFilter] = useState(selectedProjectId ? String(selectedProjectId) : '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [newTask, setNewTask] = useState({ title: '', description: '', project_id: '', assignee_id: '', due_date: '' })
  const taskQueryKey = `${scope}:${projectFilter}`
  const { data: tasks, error: taskLoadError, loading, reload } = useReloadable(
    () => fetchJson<TaskEntry[]>('/tasks', projectFilter ? { scope, project_id: projectFilter } : { scope }),
    taskQueryKey,
  )
  const { data: projects } = useReloadable(() => fetchJson<ProjectEntry[]>('/projects'), 'task-projects')
  const { data: directory } = useReloadable(() => fetchJson<DirectoryEntry[]>('/directory'), 'task-directory')
  const assignablePeople = (directory || []).filter((person) =>
    user.role !== 'hod' || person.department_id === user.department_id,
  )

  async function createTask(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('/tasks', {
        title: newTask.title,
        description: newTask.description || null,
        project_id: newTask.project_id ? Number(newTask.project_id) : null,
        assignee_id: Number(newTask.assignee_id),
        due_date: newTask.due_date || null,
      })
      setNewTask({ title: '', description: '', project_id: '', assignee_id: '', due_date: '' })
      await reload()
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  async function updateTask(id: number, status: TaskStatus, progress: number): Promise<{ status: TaskStatus; progress: number } | null> {
    setError('')
    try {
      const { data } = await api.patch<{ status: TaskStatus; progress: number }>(`/tasks/${id}`, { status, progress })
      await reload()
      return data
    } catch (requestError) {
      setError(errorMessage(requestError))
      return null
    }
  }

  return (
    <div className="page-content">
      <PageHeading eyebrow="COLLEGE WORK" title={manager ? 'Task management' : 'My tasks'} description="See assignments, due dates, linked projects, and progress." />
      {(error || taskLoadError) && <ErrorBanner message={error || taskLoadError} />}
      {manager && <section className="panel">
        <div className="panel-heading"><div><h3>Assign a task</h3><p className="muted">Choose a faculty or staff member in your authorized scope.</p></div><ListChecks size={18} className="panel-icon" /></div>
        <form className="form-grid" onSubmit={(event) => void createTask(event)}>
          <label>Task name<input value={newTask.title} onChange={(event) => setNewTask({ ...newTask, title: event.target.value })} required maxLength={255} /></label>
          <label>Assigned to<select value={newTask.assignee_id} onChange={(event) => setNewTask({ ...newTask, assignee_id: event.target.value })} required><option value="" disabled>Select person</option>{assignablePeople.map((person) => <option key={person.id} value={person.id}>{person.full_name} · {person.department || 'No department'}</option>)}</select></label>
          <label>Project<select value={newTask.project_id} onChange={(event) => setNewTask({ ...newTask, project_id: event.target.value })}><option value="">No linked project</option>{(projects || []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          <label>Due date<input type="date" value={newTask.due_date} onChange={(event) => setNewTask({ ...newTask, due_date: event.target.value })} /></label>
          <label className="full-field">Task details<textarea rows={2} value={newTask.description} onChange={(event) => setNewTask({ ...newTask, description: event.target.value })} maxLength={4000} /></label>
          <div className="full-field"><button className="button button-primary" disabled={busy || !assignablePeople.length}>{busy ? 'Assigning…' : 'Assign task'} <ChevronRight size={15} /></button></div>
        </form>
      </section>}
      <section className="panel">
        <div className="task-list-heading">
          <div><h3>{scope === 'assigned_to_me' ? 'Assigned to me' : scope === 'assigned_by_me' ? 'Assigned by me' : 'All department tasks'}</h3><p className="muted">{tasks?.length || 0} tasks</p></div>
          <div className="task-filters"><label className="scope-select">Show<select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="assigned_to_me">Assigned to me</option>{manager && <><option value="assigned_by_me">Assigned by me</option><option value="all">All tasks in scope</option></>}</select></label><label className="scope-select">Project<select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}><option value="">All projects</option>{(projects || []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label></div>
        </div>
        {loading ? <Loading /> : tasks?.length ? <div className="task-list">{tasks.map((task) => <TaskRow key={task.id} task={task} onSave={updateTask} />)}</div> : <EmptyState icon={ListChecks} title="No tasks found" detail="New assignments will appear here." />}
      </section>
    </div>
  )
}

function EmptyState({ icon: Icon, title, detail }: { icon: typeof Bell; title: string; detail: string }) {
  return <div className="empty-state"><Icon size={24} /><strong>{title}</strong><span>{detail}</span></div>
}

function App() {
  const requestedPortal = portalFromPath(window.location.pathname)
  const [user, setUser] = useState<User | null>(null)
  const [page, setPage] = useState('Dasboard ')
  const [pageMessage, setPageMessage] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [checking, setChecking] = useState(Boolean(getAccessToken()))
  const [mobileMenu, setMobileMenu] = useState(false)
  const [logoutError, setLogoutError] = useState('')

  useEffect(() => {
    if (!getAccessToken()) return
    api.get<User>('/auth/me')
      .then(({ data }) => {
        const correctPortal = portalForRole(data.role)
        if (correctPortal !== requestedPortal) {
          const targetPath = correctPortal === 'admin' ? '/admin' : '/'
          if (window.location.pathname !== targetPath) {
            window.history.replaceState(null, '', targetPath)
          }
        }
        setUser(data)
        if (data.face_enrollment_status === 'not_enrolled') setPage('enrollment')
      })
      .catch(() => clearTokens())
      .finally(() => setChecking(false))
  }, [requestedPortal])

  useEffect(() => {
    const logout = () => setUser(null)
    window.addEventListener('attendease:logout', logout)
    return () => window.removeEventListener('attendease:logout', logout)
  }, [])

  const navigation = user?.role === 'super_admin' ? adminNavigation : user && isManager(user.role) ? managerNavigation : staffNavigation

  function acceptUser(nextUser: User) {
    setUser(nextUser)
    setPage(nextUser.face_enrollment_status === 'not_enrolled' ? 'enrollment' : 'Dasboard ')
  }

  function completeEnrollment() {
    setPage('Dasboard ')
    setPageMessage('Your face has been successfully registered! It is pending administrator approval for face-verified attendance.')
  }

  async function signOut() {
    setLogoutError('')
    try {
      await api.post('/auth/logout')
    } catch (error) {
      setLogoutError(errorMessage(error))
    } finally {
      clearTokens()
      setUser(null)
      setPageMessage('')
    }
  }

  function selectPage(key: string, projectId?: number) {
    if (user && user.face_enrollment_status === 'not_enrolled' && key !== 'enrollment') {
      setPage('enrollment')
      setMobileMenu(false)
      return
    }
    setPage(key)
    setPageMessage('')
    setSelectedProjectId(key === 'tasks' ? projectId || null : null)
    setMobileMenu(false)
  }

  if (checking) return <div className="boot-screen"><span className="spinner" />Checking your secure session…</div>
  if (!user) return <><Login portal={requestedPortal} onLogin={acceptUser} />{logoutError && <div className="toast-error">{logoutError}</div>}</>

  if (isManager(user.role)) {
    const adminPage = page === 'Dasboard ' ? 'dashboard' : page
    let activeLabel = 'Dashboard'
    let activeCategory = 'Main Dashboard'
    for (const group of ADMIN_NAV_GROUPS) {
      const match = group.items.find((item) => item.key === adminPage)
      if (match) {
        activeLabel = match.label
        activeCategory = group.title
        break
      }
    }

    return (
      <div className="admin-portal-shell">
        <AdminSidebar
          currentPage={adminPage}
          onSelectPage={selectPage}
          onSignOut={() => void signOut()}
          userRole={user.role}
          userName={user.full_name}
          collegeName={user.college_name}
          mobileOpen={mobileMenu}
          onCloseMobile={() => setMobileMenu(false)}
        />
        <main className="admin-main-wrapper">
          <AdminTopBar
            currentPageTitle={activeLabel}
            currentCategory={activeCategory}
            userName={user.full_name}
            userEmail={user.email}
            onOpenMobile={() => setMobileMenu(true)}
            onSignOut={() => void signOut()}
            onSelectPage={selectPage}
          />
          {logoutError && <div className="logout-warning">{logoutError}</div>}
          {pageMessage && <div className="notice notice-success"><Check size={17} />{pageMessage}</div>}

          <AdminViewDispatcher
            page={adminPage}
            user={user}
            onNavigate={selectPage}
            existingComponents={{
              dashboard: <Dasboard user={user} navigate={selectPage} />,
              timetable: <TimetablePage user={user} />,
              attendance: <AttendancePage />,
              leave: <LeavePage user={user} />,
              approvals: <ApprovalsPage />,
              reports: <ReportsPage user={user} />,
              people: <PeoplePage />,
              directory: <DirectoryPage />,
              notifications: <NotificationsPage />,
            }}
          />
          <footer className="app-footer">
            <span>AttendEase Enterprise · Multi-Tenant Campus Node</span>
            <span><ShieldCheck size={14} /> Encrypted Session Active</span>
          </footer>
        </main>
      </div>
    )
  }

  return (
    <div className={`app-shell ${isManager(user.role) ? 'admin-portal-shell' : 'user-portal-shell'}`}>
      <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
        <div className="brand"><span className="brand-mark"><Activity size={20} /></span> AttendEase</div>
        <div className="sidebar-label">{requestedPortal === 'admin' ? 'ADMIN PORTAL' : 'USER PORTAL'}</div>
        <nav>{navigation.map(({ key, label, icon: Icon }) => <button key={key} className={`nav-item ${page === key ? 'nav-active' : ''}`} onClick={() => selectPage(key)}><Icon size={18} /><span>{label}</span>{page === key && <span className="nav-indicator" />}</button>)}</nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-footer"><div className="college-mark"><Building2 size={17} /></div><div><strong>College workspace</strong><span>{user.role.replaceAll('_', ' ')}</span></div></div>
        <button className="sidebar-logout" onClick={() => void signOut()}><LogOut size={17} /><span>Log out</span></button>
      </aside>
      {mobileMenu && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileMenu(false)} />}
      <main className="main-area">
        <header className="topbar"><button className="icon-button mobile-menu-button" onClick={() => setMobileMenu(true)} aria-label="Open navigation"><Menu size={20} /></button><div className="breadcrumbs"><span>AttendEase</span><ChevronRight size={14} /><strong>{navigation.find((item) => item.key === page)?.label || 'Dasboard '}</strong></div><div className="topbar-user"><div className="topbar-avatar">{user.full_name.slice(0, 1)}</div><div className="topbar-user-copy"><strong>{user.full_name}</strong><span>{user.employee_id}</span></div><button className="icon-button" title="Sign out" onClick={() => void signOut()}><LogOut size={17} /></button></div></header>
        {logoutError && <div className="logout-warning">{logoutError}</div>}
        {pageMessage && <div className="notice notice-success"><Check size={17} />{pageMessage}</div>}
        {page === 'Dasboard ' && (isManager(user.role) ? <Dasboard  user={user} navigate={selectPage} /> : <FacultyDashboardPage user={user} navigate={selectPage} />)}
        {page === 'timetable' && <TimetablePage user={user} />}
        {page === 'attendance' && <FacultyAttendanceTrackerPage user={user} />}
        {page === 'attendance_tracker' && <FacultyAttendanceTrackerPage user={user} />}
        {page === 'additional_lectures' && <AdditionalLecturesPage user={user} />}
        {page === 'tasks' && <TasksPage user={user} selectedProjectId={selectedProjectId} />}
        {page === 'projects' && <ProjectsPage user={user} navigate={selectPage} />}
        {page === 'enrollment' && <FacultyBiometricsPage user={user} onUserUpdate={setUser} onComplete={completeEnrollment} />}
        {page === 'leave' && <LeavePage user={user} />}
        {page === 'directory' && <DirectoryPage />}
        {page === 'notifications' && <NotificationsPage />}
        {page === 'profile' && <ProfilePage user={user} />}
        {!navigation.some((item) => item.key === page) && <FacultyDashboardPage user={user} navigate={selectPage} />}
        <footer className="app-footer"><span>AttendEase · College attendance</span><span><ShieldCheck size={14} /> Secure session</span></footer>
      </main>
    </div>
  )
}

export default App
