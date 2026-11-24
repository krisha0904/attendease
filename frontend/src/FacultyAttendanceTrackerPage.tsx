import { useEffect, useState, useMemo } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coffee,
  DoorOpen,
  Fingerprint,
  Hourglass,
  LogOut,
  MapPin,
  RefreshCw,
} from 'lucide-react'
import { api, errorMessage } from './api'
import { type User } from './App'

interface LectureAttendanceItem {
  record_id: number
  schedule_id: number
  source_type: 'weekly' | 'additional'
  date: string
  subject: string
  course_name: string
  room: string
  scheduled_start: string | null
  scheduled_end: string | null
  punch_in_time: string | null
  punch_out_time: string | null
  duration_minutes: number
  scheduled_minutes?: number
  status: 'completed' | 'in_progress' | 'missed' | 'scheduled' | 'upcoming'
  face_verified: boolean
  gps_verified: boolean
  can_punch_in?: boolean
  can_punch_out?: boolean
}

interface CalendarDayItem {
  date: string
  status: 'attended' | 'missed' | 'Absent' | 'no_lecture'
  scheduled_lectures: number
  attended_lectures: number
  missed_lectures: number
  lectures?: LectureAttendanceItem[]
}

interface TrackerMetrics {
  total_scheduled_hours: number
  total_scheduled_time: string
  total_taught_hours: number
  remaining_hours: number
  teaching_days: number
  conducted_days: number
  approved_leaves: number
  additional_sessions: number
  scheduled_lectures: number
  completed_lectures: number
  upcoming_lectures: number
  missed_lectures: number
  late_in: number
  missing_punchout: number
  biometric_compliance_pct: number
  geofence_compliance_pct: number
  holidays: number
  week_offs: number
}

interface TrackerData {
  month: number
  year: number
  metrics?: TrackerMetrics
  kpis: {
    total_lectures_conducted: number
    total_hours_taught: number
    biometric_compliance_pct: number
    geofence_compliance_pct: number
  }
  lectures: LectureAttendanceItem[]
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

export function FacultyAttendanceTrackerPage({ user }: { user: User }) {
  const todayObj = new Date()
  const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`

  const [selectedMonth, setSelectedMonth] = useState<number>(todayObj.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState<number>(todayObj.getFullYear())
  const [selectedDate, setSelectedDate] = useState<string>(todayStr)

  const [trackerData, setTrackerData] = useState<TrackerData | null>(null)
  const [calendarDaysMap, setCalendarDaysMap] = useState<Record<string, CalendarDayItem>>({})

  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = async (month: number, year: number) => {
    setLoading(true)
    setError(null)
    try {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const lastDay = new Date(year, month, 0).getDate()
      const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

      const [trackerRes, calRes] = await Promise.all([
        api.get<TrackerData>('/faculty/attendance/tracker', {
          params: { month, year },
        }),
        api.get<CalendarDayItem[]>('/lecture-attendance/calendar', {
          params: { start_date: startDate, end_date: endDate },
        }),
      ])

      setTrackerData(trackerRes.data)

      const calMap: Record<string, CalendarDayItem> = {}
      for (const item of calRes.data) {
        calMap[item.date] = item
      }
      setCalendarDaysMap(calMap)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData(selectedMonth, selectedYear)
  }, [selectedMonth, selectedYear])

  // Month navigation helpers
  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12)
      setSelectedYear((y) => y - 1)
    } else {
      setSelectedMonth((m) => m - 1)
    }
  }

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1)
      setSelectedYear((y) => y + 1)
    } else {
      setSelectedMonth((m) => m + 1)
    }
  }

  // Calculations for summary & breakdown metrics
  const lectures = trackerData?.lectures || []
  const kpis = trackerData?.kpis

  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate()
  const firstDayOfWeek = new Date(selectedYear, selectedMonth - 1, 1).getDay() // 0 = Sunday

  // Metrics derived from backend API response
  const metrics = useMemo(() => {
    if (trackerData?.metrics) {
      const m = trackerData.metrics
      return {
        totalScheduledTime: m.total_scheduled_time || `${m.total_scheduled_hours} hr 0 min`,
        totalTaughtHours: `${m.total_taught_hours} hr`,
        remainingHours: `${m.remaining_hours} hr`,
        teachingDays: m.teaching_days,
        conductedDays: m.conducted_days,
        approvedLeaves: m.approved_leaves,
        additionalSessions: m.additional_sessions,
        scheduledLectures: m.scheduled_lectures,
        completedLectures: m.completed_lectures,
        upcomingLectures: m.upcoming_lectures,
        missedLectures: m.missed_lectures,
        lateIn: m.late_in,
        missingPunchout: m.missing_punchout,
        biometricCompliancePct: m.biometric_compliance_pct,
        geofenceCompliancePct: m.geofence_compliance_pct,
        holidays: m.holidays,
        weekOffs: m.week_offs,
      }
    }

    const taughtHours = kpis?.total_hours_taught || 0
    return {
      totalScheduledTime: '0 hr 0 min',
      totalTaughtHours: `${taughtHours} hr`,
      remainingHours: '0 hr',
      teachingDays: 0,
      conductedDays: kpis?.total_lectures_conducted || 0,
      approvedLeaves: 0,
      additionalSessions: 0,
      scheduledLectures: lectures.length,
      completedLectures: kpis?.total_lectures_conducted || 0,
      upcomingLectures: 0,
      missedLectures: 0,
      lateIn: 0,
      missingPunchout: 0,
      biometricCompliancePct: kpis?.biometric_compliance_pct || 100,
      geofenceCompliancePct: kpis?.geofence_compliance_pct || 100,
      holidays: 0,
      weekOffs: 0,
    }
  }, [trackerData, kpis, lectures])

  // Calendar cells array
  const calendarCells = useMemo(() => {
    const cells: Array<{
      dayNum: number | null
      dateStr: string | null
      isToday: boolean
      isSunday: boolean
      type: 'present' | 'absent' | 'holiday' | 'none'
    }> = []

    // Leading blanks
    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push({ dayNum: null, dateStr: null, isToday: false, isSunday: false, type: 'none' })
    }

    // Days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const dayOfWeek = new Date(selectedYear, selectedMonth - 1, d).getDay()
      const isSunday = dayOfWeek === 0
      const isToday = dateStr === todayStr

      const calInfo = calendarDaysMap[dateStr]
      const hasLectures = Boolean(calInfo && calInfo.scheduled_lectures > 0)
      const isAttended = Boolean(calInfo?.status === 'attended' || (calInfo?.attended_lectures || 0) > 0)
      const isMissed = Boolean(calInfo?.status === 'missed' || (calInfo && calInfo.missed_lectures > 0))

      // Change scheduled to absent with red colour
      let dayType: 'present' | 'absent' | 'holiday' | 'none' = 'none'
      if (isAttended) {
        dayType = 'present'
      } else if (hasLectures || isMissed) {
        dayType = 'absent'
      } else if (isSunday) {
        dayType = 'holiday'
      }

      cells.push({
        dayNum: d,
        dateStr,
        isToday,
        isSunday,
        type: dayType,
      })
    }

    return cells
  }, [firstDayOfWeek, daysInMonth, selectedYear, selectedMonth, todayStr, calendarDaysMap])

  return (
    <div className="page-content attendance-tracker-page" style={{ width: '100%', maxWidth: '100%', margin: '0', padding: '24px 32px 36px', boxSizing: 'border-box' }}>
      {/* Top Header & Month/Year Selector */}
      <div className="page-heading flex items-center justify-between flex-wrap gap-4" style={{ marginBottom: '16px' }}>
        <div>
          <div className="eyebrow" style={{ color: '#64748b', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px' }}>
            FACULTY ATTENDANCE
          </div>
          <h1 style={{ margin: '2px 0', fontSize: '22px', fontWeight: 800, color: '#162d50' }}>
            Attendance Tracker
          </h1>
          <p className="muted" style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
            Faculty: <strong style={{ color: '#1e293b' }}>{user.full_name}</strong> ({user.employee_id}) · Monthly attendance ledger and biometric metrics
          </p>
        </div>

        {/* Dropdown Selectors */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <select
            style={{
              padding: '7px 12px',
              minWidth: '120px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#fff',
              fontSize: '12px',
              fontWeight: 700,
              color: '#1e293b',
              cursor: 'pointer',
            }}
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
          >
            {MONTH_NAMES.map((m, idx) => (
              <option key={m} value={idx + 1}>
                {m}
              </option>
            ))}
          </select>

          <select
            style={{
              padding: '7px 12px',
              minWidth: '85px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#fff',
              fontSize: '12px',
              fontWeight: 700,
              color: '#1e293b',
              cursor: 'pointer',
            }}
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
          >
            {[todayObj.getFullYear() - 1, todayObj.getFullYear(), todayObj.getFullYear() + 1].map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="button button-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', fontSize: '12px' }}
            onClick={() => loadData(selectedMonth, selectedYear)}
            disabled={loading}
            title="Refresh records"
          >
            <RefreshCw size={13} className={loading ? 'admin-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Global Alerts */}
      {error && (
        <div className="banner banner-error mb-4" style={{ marginBottom: '14px', padding: '10px 14px' }}>
          <AlertCircle size={16} />
          <div style={{ fontSize: '12px' }}>{error}</div>
        </div>
      )}

      {/* 2-Column Side-by-Side Layout (Never Up and Down) */}
      <div
        className="attendance-tracker-layout-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '20px',
          alignItems: 'start',
          width: '100%',
        }}
      >

        {/* LEFT COLUMN: 12 Metric Cards */}
        <div>
          {/* 12 Visiting Faculty Metric Cards Grid */}
          <div className="mobile-tracker-grid">
            {/* Card 1: Scheduled Lectures */}
            <div className="mobile-tracker-card" style={{ background: '#e0f2fe', color: '#0284c7' }}>
              <strong>{metrics.scheduledLectures}</strong>
              <span>Scheduled Lectures</span>
              <Calendar size={15} className="card-icon" />
            </div>

            {/* Card 2: Completed Lectures */}
            <div className="mobile-tracker-card" style={{ background: '#dcfce7', color: '#16a34a' }}>
              <strong>{metrics.completedLectures}</strong>
              <span>Completed Lectures</span>
              <CheckCircle2 size={15} className="card-icon" />
            </div>

            {/* Card 3: Upcoming Lectures */}
            <div className="mobile-tracker-card" style={{ background: '#f3e8ff', color: '#7e22ce' }}>
              <strong>{metrics.upcomingLectures}</strong>
              <span>Upcoming Lectures</span>
              <Clock size={15} className="card-icon" />
            </div>

            {/* Card 4: Absent Lectures */}
            <div className="mobile-tracker-card" style={{ background: '#fee2e2', color: '#dc2626' }}>
              <strong>{metrics.missedLectures}</strong>
              <span>Absent Lectures</span>
              <AlertTriangle size={15} className="card-icon" />
            </div>

            {/* Card 5: Late Arrivals */}
            <div className="mobile-tracker-card" style={{ background: '#fef3c7', color: '#d97706' }}>
              <strong>{metrics.lateIn}</strong>
              <span>Late Arrivals</span>
              <Clock size={15} className="card-icon" />
            </div>

            {/* Card 6: Missing Punch-Out */}
            <div className="mobile-tracker-card" style={{ background: '#ffedd5', color: '#ea580c' }}>
              <strong>{metrics.missingPunchout}</strong>
              <span>Missing Punch-Out</span>
              <LogOut size={15} className="card-icon" />
            </div>

            {/* Card 7: Biometric Verified */}
            <div className="mobile-tracker-card" style={{ background: '#d1fae5', color: '#059669' }}>
              <strong>{metrics.biometricCompliancePct}%</strong>
              <span>Biometric Verified</span>
              <Fingerprint size={15} className="card-icon" />
            </div>

            {/* Card 8: Campus Geofence */}
            <div className="mobile-tracker-card" style={{ background: '#e0f2fe', color: '#0284c7' }}>
              <strong>{metrics.geofenceCompliancePct}%</strong>
              <span>Campus Geofence</span>
              <MapPin size={15} className="card-icon" />
            </div>

            {/* Card 9: Additional Sessions */}
            <div className="mobile-tracker-card" style={{ background: '#e0e7ff', color: '#4338ca' }}>
              <strong>{metrics.additionalSessions}</strong>
              <span>Additional Sessions</span>
              <DoorOpen size={15} className="card-icon" />
            </div>

            {/* Card 10: College Holidays */}
            <div className="mobile-tracker-card" style={{ background: '#ede9fe', color: '#6d28d9' }}>
              <strong>{metrics.holidays}</strong>
              <span>College Holidays</span>
              <Coffee size={15} className="card-icon" />
            </div>

            {/* Card 11: Weekly Offs */}
            <div className="mobile-tracker-card" style={{ background: '#f1f5f9', color: '#475569' }}>
              <strong>{metrics.weekOffs}</strong>
              <span>Weekly Offs</span>
              <CalendarDays size={15} className="card-icon" />
            </div>

            {/* Card 12: Remaining Hours */}
            <div className="mobile-tracker-card" style={{ background: '#fef9c3', color: '#ca8a04' }}>
              <strong>{metrics.remainingHours}</strong>
              <span>Remaining Hours</span>
              <Hourglass size={15} className="card-icon" />
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Calendar Widget Card */}
        <div>
          <div className="mobile-calendar-container">
            {/* Header: < November 2026 > */}
            <div className="mobile-calendar-nav">
              <button
                type="button"
                className="mobile-calendar-nav-btn"
                onClick={handlePrevMonth}
                title="Previous Month"
              >
                <ChevronLeft size={16} />
              </button>
              <h3>{MONTH_NAMES[selectedMonth - 1]} {selectedYear}</h3>
              <button
                type="button"
                className="mobile-calendar-nav-btn"
                onClick={handleNextMonth}
                title="Next Month"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Weekdays: Su Mo Tu We Th Fr Sa */}
            <div className="mobile-calendar-grid">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                <div key={d} className="mobile-calendar-weekday">
                  {d}
                </div>
              ))}

              {/* Day Cells */}
              {calendarCells.map((cell, idx) => {
                if (cell.dayNum === null) {
                  return <div key={`empty-${idx}`} className="mobile-calendar-cell empty" />
                }

                const isSelected = cell.dateStr === selectedDate
                let typeClass = ''
                if (cell.isToday) {
                  typeClass = 'cell-today'
                } else if (cell.type === 'present') {
                  typeClass = 'cell-present'
                } else if (cell.type === 'absent') {
                  typeClass = 'cell-absent'
                } else if (cell.type === 'holiday') {
                  typeClass = 'cell-holiday'
                }

                return (
                  <div
                    key={`day-${cell.dayNum}`}
                    className={`mobile-calendar-cell ${typeClass} ${isSelected ? 'cell-selected' : ''}`}
                    onClick={() => {
                      if (cell.dateStr) setSelectedDate(cell.dateStr)
                    }}
                    title={`${cell.dateStr} - ${cell.type.toUpperCase()}`}
                  >
                    {cell.dayNum}
                  </div>
                )
              })}
            </div>

            {/* Legend: Conducted, Absent (Red), Holiday, Today */}
            <div className="mobile-calendar-legend">
              <div className="mobile-legend-pill">
                <span className="mobile-legend-dot dot-present"></span>
                <span>Conducted</span>
              </div>
              <div className="mobile-legend-pill">
                <span className="mobile-legend-dot dot-absent"></span>
                <span>Absent</span>
              </div>
              <div className="mobile-legend-pill">
                <span className="mobile-legend-dot dot-holiday"></span>
                <span>Holiday</span>
              </div>
              <div className="mobile-legend-pill">
                <span className="mobile-legend-dot dot-today"></span>
                <span>Today</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
