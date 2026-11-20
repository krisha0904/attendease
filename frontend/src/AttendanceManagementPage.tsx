import React, { useEffect, useState } from 'react'
import {
  AlertCircle, AlertTriangle, Calendar, CheckCircle2,
  Clock, Clock3, Download, Edit3, Eye,
  FileText, Fingerprint, Layers, MapPin, RefreshCw,
  Search, ShieldCheck, Users, X
} from 'lucide-react'
import { api, errorMessage, fetchJson } from './api'

interface AttendanceItem {
  id: number
  date: string
  status: string
  punch_in_time: string | null
  punch_out_time: string | null
  punch_in_full: string | null
  punch_out_full: string | null
  total_working_minutes: number
  total_break_minutes: number
  net_working_minutes: number
  duration_str: string
  is_late: boolean
  late_by_minutes: number
  is_early_departure: boolean
  overtime_minutes: number
  active_break_started_at: string | null
  is_on_break: boolean
  punch_in_face_verified: boolean
  punch_out_face_verified: boolean
  punch_in_gps_verified: boolean
  punch_in_distance_m: number | null
  punch_out_gps_verified: boolean
  punch_out_distance_m: number | null
  is_manual_override: boolean
  override_reason: string | null
  overridden_by_id: number | null
  overridden_by_name: string | null
  overridden_at: string | null
  faculty: {
    id: number
    employee_id: string
    full_name: string
    email: string
    phone: string | null
    department_id: number | null
    department_name: string | null
    face_enrollment_status: string
  }
  lectures_summary: {
    scheduled_count: number
    attended_count: number
    completed_all: boolean
  }
}

interface SummaryKPIs {
  total_faculty: number
  recorded_today: number
  present_count: number
  absent_count: number
  late_count: number
  half_day_count: number
  currently_on_campus: number
  on_break_count: number
  biometric_pass_rate: number
}

interface LookupDepartment {
  id: number
  name: string
  code: string
}

interface LookupFaculty {
  id: number
  full_name: string
  employee_id: string
  department: string | null
}

interface SingleAttendanceDetails {
  record: AttendanceItem
  faculty: {
    id: number
    employee_id: string
    full_name: string
    email: string
    phone: string | null
    designation: string
    department: string | null
    face_enrollment_status: string
  }
  lectures_breakdown: Array<{
    lecture_id: number
    subject: string
    course_name: string | null
    room: string | null
    lecture_type: string
    start_time: string
    end_time: string
    status: string
    attended: boolean
    punch_in: string | null
    punch_out: string | null
    face_verified: boolean
  }>
  timeline: Array<{
    id: number
    event_type: string
    event_time: string | null
    face_verified: boolean
    gps_verified: boolean
    distance_m: number | null
    ip_address: string | null
  }>
  breaks: Array<{
    id: number
    break_start: string | null
    break_end: string | null
    duration_minutes: number | null
  }>
}

export function AttendanceManagementPage() {
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Data states
  const [records, setRecords] = useState<AttendanceItem[]>([])
  const [summary, setSummary] = useState<SummaryKPIs>({
    total_faculty: 0,
    recorded_today: 0,
    present_count: 0,
    absent_count: 0,
    late_count: 0,
    half_day_count: 0,
    currently_on_campus: 0,
    on_break_count: 0,
    biometric_pass_rate: 0,
  })

  // Lookups
  const [departments, setDepartments] = useState<LookupDepartment[]>([])
  const [facultyMembers, setFacultyMembers] = useState<LookupFaculty[]>([])

  // Filter states
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = new Date()
    return d.toISOString().split('T')[0]
  })
  const [deptFilter, setDeptFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [verifFilter, setVerifFilter] = useState('all')
  const [search, setSearch] = useState('')

  // Modals
  const [inspectRecordId, setInspectRecordId] = useState<number | null>(null)
  const [inspectDetails, setInspectDetails] = useState<SingleAttendanceDetails | null>(null)
  const [inspectLoading, setInspectLoading] = useState(false)
  const [inspectTab, setInspectTab] = useState<'workday' | 'lectures' | 'timeline'>('workday')

  // Manual Override Modal
  const [showOverrideModal, setShowOverrideModal] = useState(false)
  const [overrideUserId, setOverrideUserId] = useState<number | ''>('')
  const [overrideDate, setOverrideDate] = useState<string>(selectedDate)
  const [overrideStatus, setOverrideStatus] = useState<string>('present')
  const [overridePunchIn, setOverridePunchIn] = useState<string>('09:00')
  const [overridePunchOut, setOverridePunchOut] = useState<string>('17:00')
  const [overrideReason, setOverrideReason] = useState<string>('')
  const [overrideBusy, setOverrideBusy] = useState(false)

  // Load Main Attendance List
  const loadAttendance = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedDate) params.append('report_date', selectedDate)
      if (deptFilter !== 'all') params.append('department_id', deptFilter)
      if (statusFilter !== 'all') params.append('status_filter', statusFilter)
      if (verifFilter !== 'all') params.append('verification_filter', verifFilter)
      if (search.trim()) params.append('search', search.trim())

      const res = await fetchJson<{ items: AttendanceItem[]; summary: SummaryKPIs }>(
        `/admin/attendance?${params.toString()}`
      )
      setRecords(res.items || [])
      setSummary(res.summary || {
        total_faculty: 0,
        recorded_today: 0,
        present_count: 0,
        absent_count: 0,
        late_count: 0,
        half_day_count: 0,
        currently_on_campus: 0,
        on_break_count: 0,
        biometric_pass_rate: 0,
      })
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setLoading(false)
    }
  }

  // Load Lookups on mount
  useEffect(() => {
    const loadLookups = async () => {
      try {
        const [deptsRes, facRes] = await Promise.all([
          fetchJson<{ items: LookupDepartment[] }>('/admin/academic/departments').catch(() => ({ items: [] })),
          fetchJson<LookupFaculty[]>('/directory').catch(() => []),
        ])
        setDepartments(deptsRes.items || [])
        setFacultyMembers((facRes || []).filter((f: any) => f.role === 'faculty' || f.designation?.includes('Faculty') || f.designation?.includes('Professor')))
      } catch (err) {
        console.error('Failed to load lookups', err)
      }
    }
    void loadLookups()
  }, [])

  useEffect(() => {
    void loadAttendance()
  }, [selectedDate, deptFilter, statusFilter, verifFilter, search])

  // Open Inspection Details
  const handleInspect = async (recordId: number) => {
    setInspectRecordId(recordId)
    setInspectLoading(true)
    setInspectTab('workday')
    try {
      const details = await fetchJson<SingleAttendanceDetails>(`/admin/attendance/${recordId}/details`)
      setInspectDetails(details)
    } catch (err) {
      alert(`Failed to load attendance details: ${errorMessage(err)}`)
      setInspectRecordId(null)
    } finally {
      setInspectLoading(false)
    }
  }

  // Open Manual Override Modal for a specific faculty or new
  const openOverrideModal = (facultyId?: number, dateStr?: string) => {
    setOverrideUserId(facultyId || facultyMembers[0]?.id || '')
    setOverrideDate(dateStr || selectedDate)
    setOverrideStatus('present')
    setOverridePunchIn('09:00')
    setOverridePunchOut('17:00')
    setOverrideReason('')
    setShowOverrideModal(true)
  }

  // Submit Manual Override
  const handleSubmitOverride = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!overrideUserId) {
      alert('Please select a faculty member.')
      return
    }
    if (!overrideReason.trim()) {
      alert('A justification reason is mandatory for manual administrative attendance adjustments.')
      return
    }

    setOverrideBusy(true)
    try {
      const res = await api.post<{ message: string; record: any }>('/admin/attendance/manual-override', {
        user_id: Number(overrideUserId),
        date: overrideDate,
        status: overrideStatus,
        punch_in_time: overridePunchIn || null,
        punch_out_time: overridePunchOut || null,
        reason: overrideReason.trim(),
      })
      setFeedback({ type: 'success', message: res.data?.message || 'Attendance updated.' })
      setShowOverrideModal(false)
      loadAttendance()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setOverrideBusy(false)
    }
  }

  // Export CSV
  const handleExportCSV = () => {
    const params = new URLSearchParams()
    if (selectedDate) params.append('report_date', selectedDate)
    if (deptFilter !== 'all') params.append('department_id', deptFilter)
    if (statusFilter !== 'all') params.append('status_filter', statusFilter)
    window.open(`/api/admin/attendance/export?${params.toString()}`, '_blank')
  }

  // Quick Preset Dates
  const setQuickDate = (preset: 'today' | 'yesterday') => {
    const d = new Date()
    if (preset === 'yesterday') d.setDate(d.getDate() - 1)
    setSelectedDate(d.toISOString().split('T')[0])
  }

  // Render Status Badge
  const renderStatusBadge = (status: string, isLate: boolean) => {
    switch (status) {
      case 'present':
        return (
          <span className="badge badge-approved">
            <CheckCircle2 size={11} /> Present
            {isLate && <span style={{ color: '#d97706', fontWeight: 700, marginLeft: 4 }}>(Late)</span>}
          </span>
        )
      case 'punched_out':
        return (
          <span className="badge badge-approved" style={{ background: '#f0fdf4', color: '#166534' }}>
            <CheckCircle2 size={11} /> Workday Completed
          </span>
        )
      case 'half_day':
        return (
          <span className="badge badge-pending">
            <Clock size={11} /> Half Day
          </span>
        )
      case 'on_break':
        return (
          <span className="badge badge-pending" style={{ background: '#fffbeb', color: '#b45309' }}>
            <span className="pulse-indicator" style={{ width: 6, height: 6 }} /> On Break
          </span>
        )
      default:
        return (
          <span className="badge badge-rejected">
            <X size={11} /> Absent
          </span>
        )
    }
  }

  return (
    <div className="admin-page-container">
      {/* Header */}
      <div className="admin-page-header">
        <div className="admin-page-titles">
          <span className="admin-eyebrow">Real-Time Monitoring</span>
          <h1>Attendance Management</h1>
          <p className="admin-page-desc">
            Monitor faculty campus arrivals, lecture attendance compliance, facial biometric verification, and geofence validity.
          </p>
        </div>

        <div className="admin-header-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={handleExportCSV}
            title="Export filtered records to CSV"
          >
            <Download size={14} /> Export CSV
          </button>

          <button
            type="button"
            className="button button-secondary"
            onClick={loadAttendance}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'admin-spin mr-1' : 'mr-1'} />
            Refresh
          </button>

          <button
            type="button"
            className="button button-primary"
            onClick={() => openOverrideModal()}
          >
            <Edit3 size={15} /> Manual Override
          </button>
        </div>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div className={`notice notice-${feedback.type === 'success' ? 'success' : 'error'} mb-4`}>
          {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{feedback.message}</span>
          <button type="button" className="button-link ml-auto" onClick={() => setFeedback(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="admin-kpi-grid-6">
        <div className="admin-kpi-card kpi-border-green">
          <div className="admin-kpi-icon-wrap bg-green-subtle text-green">
            <CheckCircle2 size={18} />
          </div>
          <div className="admin-kpi-content">
            <span className="admin-kpi-label">Present</span>
            <span className="admin-kpi-value text-green">{summary.present_count}</span>
            <span className="admin-kpi-note">Recorded attendance</span>
          </div>
        </div>

        <div className="admin-kpi-card kpi-border-red">
          <div className="admin-kpi-icon-wrap bg-red-subtle text-red">
            <AlertCircle size={18} />
          </div>
          <div className="admin-kpi-content">
            <span className="admin-kpi-label">Absent</span>
            <span className="admin-kpi-value text-red">{summary.absent_count}</span>
            <span className="admin-kpi-note">Scheduled with no punch</span>
          </div>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-icon-wrap bg-blue-subtle text-blue">
            <Users size={18} />
          </div>
          <div className="admin-kpi-content">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="admin-kpi-label">On Campus Now</span>
              {summary.currently_on_campus > 0 && <span className="live-dot" />}
            </div>
            <span className="admin-kpi-value text-blue">{summary.currently_on_campus}</span>
            <span className="admin-kpi-note">Active on premises</span>
          </div>
        </div>

        <div className="admin-kpi-card kpi-border-amber">
          <div className="admin-kpi-icon-wrap bg-amber-subtle text-amber">
            <Clock3 size={18} />
          </div>
          <div className="admin-kpi-content">
            <span className="admin-kpi-label">Late Arrivals</span>
            <span className="admin-kpi-value text-amber">{summary.late_count}</span>
            <span className="admin-kpi-note">Punched after grace time</span>
          </div>
        </div>

        <div className="admin-kpi-card kpi-border-purple">
          <div className="admin-kpi-icon-wrap bg-purple-subtle text-purple">
            <Clock size={18} />
          </div>
          <div className="admin-kpi-content">
            <span className="admin-kpi-label">Half Day</span>
            <span className="admin-kpi-value text-purple">{summary.half_day_count}</span>
            <span className="admin-kpi-note">Partial working hours</span>
          </div>
        </div>

        <div className="admin-kpi-card kpi-border-slate">
          <div className="admin-kpi-icon-wrap" style={{ background: '#f1f5f9', color: '#475569' }}>
            <Fingerprint size={18} />
          </div>
          <div className="admin-kpi-content">
            <span className="admin-kpi-label">Biometric Pass</span>
            <span className="admin-kpi-value">{summary.biometric_pass_rate}%</span>
            <span className="admin-kpi-note">Face verified punches</span>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="panel mb-4">
        <div className="admin-filters-flex" style={{ gap: 14 }}>
          {/* Date Picker & Presets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={15} style={{ color: '#2563eb' }} />
            <input
              type="date"
              className="admin-input"
              style={{ width: 'auto', padding: '6px 10px', fontSize: 12.5 }}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
            <button
              type="button"
              className="button button-secondary button-compact"
              onClick={() => setQuickDate('today')}
            >
              Today
            </button>
            <button
              type="button"
              className="button button-secondary button-compact"
              onClick={() => setQuickDate('yesterday')}
            >
              Yesterday
            </button>
          </div>

          {/* Search Box */}
          <div className="admin-search-box" style={{ flex: 1, minWidth: 200 }}>
            <Search size={15} />
            <input
              type="text"
              placeholder="Search faculty name, employee ID, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button type="button" className="search-clear-btn" onClick={() => setSearch('')}>
                <X size={13} />
              </button>
            )}
          </div>

          {/* Department Filter */}
          <select
            className="admin-select"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
          >
            <option value="all">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.code})
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            className="admin-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="present">Present</option>
            <option value="half_day">Half Day</option>
            <option value="late">Late Arrival</option>
            <option value="absent">Absent</option>
            <option value="on_break">On Break</option>
          </select>

          {/* Verification Method Filter */}
          <select
            className="admin-select"
            value={verifFilter}
            onChange={(e) => setVerifFilter(e.target.value)}
          >
            <option value="all">All Verification</option>
            <option value="face_verified">Face Biometric Verified</option>
            <option value="gps_verified">GPS Geofence Verified</option>
            <option value="manual_override">Admin Manual Override</option>
            <option value="unverified">Unverified / Fallback</option>
          </select>
        </div>
      </div>

      {/* Attendance Data Table */}
      <div className="panel">
        <div className="table-scroll">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>Faculty Identity</th>
                <th>Workday Timestamps</th>
                <th>Working Hours</th>
                <th>Verification Audit</th>
                <th>Lecture Attendance</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center p-6 text-muted">
                    <RefreshCw size={20} className="admin-spin mb-1" style={{ display: 'inline', color: '#2563eb' }} />
                    <p style={{ margin: 0, fontSize: 12 }}>Loading attendance logs & biometrics...</p>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center p-6 text-muted">
                    No attendance records found for the selected date and filters.
                  </td>
                </tr>
              ) : (
                records.map((rec) => (
                  <tr key={rec.id}>
                    {/* Faculty Identity */}
                    <td>
                      <div className="faculty-row-identity">
                        <div className="faculty-avatar-circle">
                          {rec.faculty.full_name.charAt(0)}
                        </div>
                        <div className="faculty-row-meta">
                          <strong>{rec.faculty.full_name}</strong>
                          <span>
                            {rec.faculty.employee_id} · {rec.faculty.department_name || 'General Dept'}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Punch Timestamps */}
                    <td>
                      <div style={{ fontSize: 12, color: '#0f172a' }}>
                        In: <strong>{rec.punch_in_time || '--:--'}</strong>
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                        Out: {rec.punch_out_time || 'On Campus'}
                      </div>
                      {rec.is_late && (
                        <span style={{ fontSize: 10, color: '#d97706', fontWeight: 700 }}>
                          Late by {rec.late_by_minutes} mins
                        </span>
                      )}
                    </td>

                    {/* Hours */}
                    <td>
                      <strong style={{ fontSize: 13, color: '#0f172a' }}>{rec.duration_str}</strong>
                      {rec.total_break_minutes > 0 && (
                        <div style={{ fontSize: 10.5, color: '#64748b' }}>
                          Break: {rec.total_break_minutes}m
                        </div>
                      )}
                    </td>

                    {/* Verification Method Badges */}
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {rec.is_manual_override ? (
                          <span className="badge badge-pending" title={`Overridden by ${rec.overridden_by_name || 'Admin'}`}>
                            <Edit3 size={10} /> Override: {rec.overridden_by_name || 'Admin'}
                          </span>
                        ) : (
                          <>
                            {rec.punch_in_face_verified ? (
                              <span className="badge badge-approved" style={{ width: 'fit-content' }}>
                                <ShieldCheck size={10} /> Face PASS
                              </span>
                            ) : (
                              <span className="badge badge-not_enrolled" style={{ width: 'fit-content' }}>
                                <Fingerprint size={10} /> Face Not Verified
                              </span>
                            )}
                            {rec.punch_in_gps_verified && (
                              <span className="badge badge-approved" style={{ width: 'fit-content', background: '#eff6ff', color: '#1d4ed8' }}>
                                <MapPin size={10} /> Geofence PASS
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </td>

                    {/* Lecture Attendance Breakdown */}
                    <td>
                      {rec.lectures_summary.scheduled_count === 0 ? (
                        <span style={{ fontSize: 11, color: '#64748b' }}>No scheduled lectures</span>
                      ) : (
                        <div>
                          <span
                            className="dept-tag"
                            style={{
                              background: rec.lectures_summary.completed_all ? '#f0fdf4' : '#fffbeb',
                              color: rec.lectures_summary.completed_all ? '#166534' : '#b45309',
                              borderColor: rec.lectures_summary.completed_all ? '#bbf7d0' : '#fde68a',
                              fontWeight: 700,
                            }}
                          >
                            {rec.lectures_summary.attended_count} of {rec.lectures_summary.scheduled_count} Attended
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td>{renderStatusBadge(rec.status, rec.is_late)}</td>

                    {/* Actions */}
                    <td style={{ textAlign: 'right' }}>
                      <div className="admin-inline-actions" style={{ justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="button button-secondary button-compact"
                          onClick={() => handleInspect(rec.id)}
                          title="Inspect detailed punch logs & lectures"
                        >
                          <Eye size={13} /> Inspect
                        </button>
                        <button
                          type="button"
                          className="button button-secondary button-compact"
                          onClick={() => openOverrideModal(rec.faculty.id, rec.date)}
                          title="Adjust attendance manually"
                        >
                          <Edit3 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ================= MODAL: INSPECT RECORD DETAILS ================= */}
      {inspectRecordId && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal admin-profile-modal">
            <div className="admin-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Eye size={19} style={{ color: '#2563eb' }} />
                <h3>Faculty Attendance Inspection</h3>
              </div>
              <button
                type="button"
                className="button-link"
                onClick={() => setInspectRecordId(null)}
              >
                <X size={18} />
              </button>
            </div>

            {inspectLoading || !inspectDetails ? (
              <div className="p-6 text-center text-muted">
                <RefreshCw size={24} className="admin-spin mb-2" style={{ color: '#2563eb' }} />
                <p>Loading biometric logs, geofence check, and lecture sessions...</p>
              </div>
            ) : (
              <>
                {/* Faculty Identity Strip */}
                <div style={{ padding: '16px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="faculty-avatar-circle" style={{ width: 40, height: 40, fontSize: 15 }}>
                      {inspectDetails.faculty.full_name.charAt(0)}
                    </div>
                    <div>
                      <strong style={{ fontSize: 15, color: '#0f172a' }}>{inspectDetails.faculty.full_name}</strong>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        {inspectDetails.faculty.employee_id} · {inspectDetails.faculty.department || 'Department of CS'} · {inspectDetails.faculty.email}
                      </div>
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: 12, color: '#475569', marginRight: 10 }}>Date: <strong>{inspectDetails.record.date}</strong></span>
                    {renderStatusBadge(inspectDetails.record.status, inspectDetails.record.is_late)}
                  </div>
                </div>

                {/* Inspection Tabs */}
                <div className="admin-profile-tabs">
                  <button
                    type="button"
                    className={`profile-tab-button ${inspectTab === 'workday' ? 'tab-active' : ''}`}
                    onClick={() => setInspectTab('workday')}
                  >
                    <Clock size={13} style={{ display: 'inline', marginRight: 5 }} />
                    Workday & Biometrics
                  </button>
                  <button
                    type="button"
                    className={`profile-tab-button ${inspectTab === 'lectures' ? 'tab-active' : ''}`}
                    onClick={() => setInspectTab('lectures')}
                  >
                    <Layers size={13} style={{ display: 'inline', marginRight: 5 }} />
                    Lecture Sessions ({inspectDetails.lectures_breakdown.length})
                  </button>
                  <button
                    type="button"
                    className={`profile-tab-button ${inspectTab === 'timeline' ? 'tab-active' : ''}`}
                    onClick={() => setInspectTab('timeline')}
                  >
                    <FileText size={13} style={{ display: 'inline', marginRight: 5 }} />
                    Event Timeline Log ({inspectDetails.timeline.length})
                  </button>
                </div>

                {/* Tab Content */}
                <div className="admin-modal-body">
                  {inspectTab === 'workday' && (
                    <div style={{ display: 'grid', gap: 18 }}>
                      {/* Workday Metrics Box */}
                      <div className="profile-grid">
                        <div className="biometric-overview-box">
                          <label style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                            Campus Punch In
                          </label>
                          <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
                            {inspectDetails.record.punch_in_time || '--:--'}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                            Face Biometric:{' '}
                            <strong style={{ color: inspectDetails.record.punch_in_face_verified ? '#16a34a' : '#64748b' }}>
                              {inspectDetails.record.punch_in_face_verified ? 'Verified PASS' : 'No Face Match'}
                            </strong>
                          </div>
                          {inspectDetails.record.punch_in_distance_m !== null && (
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                              GPS Distance: <strong>{inspectDetails.record.punch_in_distance_m}m from campus</strong>
                            </div>
                          )}
                        </div>

                        <div className="biometric-overview-box">
                          <label style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                            Campus Punch Out
                          </label>
                          <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
                            {inspectDetails.record.punch_out_time || 'On Campus'}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                            Net Working Duration:{' '}
                            <strong>{inspectDetails.record.duration_str}</strong>
                          </div>
                          {inspectDetails.record.total_break_minutes > 0 && (
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                              Breaks Taken: <strong>{inspectDetails.record.total_break_minutes} minutes</strong>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Manual Override Audit Banner */}
                      {inspectDetails.record.is_manual_override && (
                        <div className="conflict-warning-box" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e40af' }}>
                          <ShieldCheck size={18} style={{ flexShrink: 0, marginTop: 2, color: '#2563eb' }} />
                          <div>
                            <strong>Administrative Manual Override Record:</strong>
                            <p style={{ margin: '4px 0 0', fontSize: 12 }}>
                              Reason: "{inspectDetails.record.override_reason}"
                            </p>
                            <small style={{ color: '#60a5fa', display: 'block', marginTop: 2 }}>
                              Adjusted by {inspectDetails.record.overridden_by_name || 'Administrator'} at {inspectDetails.record.overridden_at}
                            </small>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {inspectTab === 'lectures' && (
                    <div style={{ display: 'grid', gap: 12 }}>
                      {inspectDetails.lectures_breakdown.length === 0 ? (
                        <div className="empty-state">
                          <Clock size={24} style={{ color: '#94a3b8' }} />
                          <p style={{ fontSize: 12, color: '#64748b' }}>No lectures were scheduled for this faculty on this day.</p>
                        </div>
                      ) : (
                        inspectDetails.lectures_breakdown.map((lec) => (
                          <div
                            key={lec.lecture_id}
                            style={{
                              padding: '14px 18px',
                              borderRadius: 10,
                              border: '1px solid #e2e8f0',
                              background: lec.attended ? '#f0fdf4' : '#fff7ed',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <div>
                              <strong style={{ fontSize: 13.5, color: '#0f172a' }}>{lec.subject}</strong>
                              <div style={{ fontSize: 11.5, color: '#475569', marginTop: 2 }}>
                                {lec.start_time} – {lec.end_time} · Room: {lec.room || 'TBA'} · [{lec.lecture_type}]
                              </div>
                            </div>

                            <div style={{ textAlign: 'right' }}>
                              {lec.attended ? (
                                <div>
                                  <span className="badge badge-approved">
                                    <CheckCircle2 size={11} /> Lecture Attended
                                  </span>
                                  <div style={{ fontSize: 10.5, color: '#166534', marginTop: 3 }}>
                                    In: {lec.punch_in} · Out: {lec.punch_out || 'Active'}
                                    {lec.face_verified && ' (Face PASS)'}
                                  </div>
                                </div>
                              ) : (
                                <span className="badge badge-rejected">
                                  <X size={11} /> Missed Session
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {inspectTab === 'timeline' && (
                    <div style={{ display: 'grid', gap: 10 }}>
                      {inspectDetails.timeline.length === 0 ? (
                        <p className="text-muted text-center p-4">No granular event logs recorded.</p>
                      ) : (
                        inspectDetails.timeline.map((ev) => (
                          <div
                            key={ev.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '10px 14px',
                              borderRadius: 8,
                              background: '#f8fafc',
                              border: '1px solid #e2e8f0',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span className="dept-tag" style={{ textTransform: 'uppercase', fontWeight: 700 }}>
                                {ev.event_type}
                              </span>
                              <span style={{ fontSize: 12, color: '#334155' }}>
                                IP: {ev.ip_address || 'Internal Network'}
                              </span>
                            </div>
                            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
                              {ev.event_time ? new Date(ev.event_time).toLocaleTimeString() : '--'}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <div className="admin-modal-footer">
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setInspectRecordId(null)}
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ================= MODAL: MANUAL ATTENDANCE OVERRIDE ================= */}
      {showOverrideModal && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal" style={{ width: 'min(580px, 100%)' }}>
            <div className="admin-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Edit3 size={18} style={{ color: '#2563eb' }} />
                <h3>Manual Attendance Override & Marking</h3>
              </div>
              <button
                type="button"
                className="button-link"
                onClick={() => setShowOverrideModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitOverride}>
              <div className="admin-modal-body">
                <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#475569' }}>
                  Administrators can manually adjust faculty attendance status and timestamps. All adjustments are permanently logged for audit compliance.
                </p>

                <div className="profile-grid">
                  {/* Faculty Member */}
                  <div className="admin-form-group">
                    <label className="admin-form-label">
                      Faculty Member <span className="text-red">*</span>
                    </label>
                    <select
                      className="admin-select"
                      value={overrideUserId}
                      onChange={(e) => setOverrideUserId(Number(e.target.value))}
                      required
                    >
                      <option value="" disabled>
                        Select Faculty
                      </option>
                      {facultyMembers.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.full_name} ({f.employee_id}) · {f.department || 'Faculty'}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Date */}
                  <div className="admin-form-group">
                    <label className="admin-form-label">
                      Attendance Date <span className="text-red">*</span>
                    </label>
                    <input
                      type="date"
                      className="admin-input"
                      value={overrideDate}
                      onChange={(e) => setOverrideDate(e.target.value)}
                      required
                    />
                  </div>

                  {/* Status */}
                  <div className="admin-form-group">
                    <label className="admin-form-label">Attendance Status</label>
                    <select
                      className="admin-select"
                      value={overrideStatus}
                      onChange={(e) => setOverrideStatus(e.target.value)}
                    >
                      <option value="present">Present (Full Day)</option>
                      <option value="half_day">Half Day</option>
                      <option value="absent">Absent</option>
                      <option value="on_leave">Excused / On Leave</option>
                    </select>
                  </div>

                  {/* Punch In & Punch Out */}
                  <div className="admin-form-group">
                    <label className="admin-form-label">Adjusted Timestamps (In - Out)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="time"
                        className="admin-input"
                        value={overridePunchIn}
                        onChange={(e) => setOverridePunchIn(e.target.value)}
                      />
                      <span>to</span>
                      <input
                        type="time"
                        className="admin-input"
                        value={overridePunchOut}
                        onChange={(e) => setOverridePunchOut(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Mandatory Justification */}
                <div className="admin-form-group" style={{ marginTop: 12 }}>
                  <label className="admin-form-label">
                    Mandatory Administrative Reason <span className="text-red">*</span>
                  </label>
                  <textarea
                    className="admin-textarea"
                    rows={3}
                    placeholder="Provide justification (e.g. Biometric scanner power loss at Gate 1; Verified via manual physical logbook)..."
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setShowOverrideModal(false)}
                  disabled={overrideBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={overrideBusy}
                >
                  {overrideBusy ? 'Submitting Override...' : 'Apply Manual Override'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
