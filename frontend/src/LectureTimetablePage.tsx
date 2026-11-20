import React, { useEffect, useState } from 'react'
import {
  AlertCircle, AlertTriangle, CalendarCheck, CheckCircle2,
  Clock, Clock3, DoorOpen, Edit3,
  LayoutGrid, List, Plus, Power, RefreshCw, School, Search, ShieldAlert,
  Trash2, UserCheck, UserPlus, Users, X
} from 'lucide-react'
import { api, errorMessage, fetchJson } from './api'

interface LectureItem {
  id: number
  user_id: number
  faculty_name: string
  employee_id: string
  faculty_email: string
  department_id: number | null
  department_name: string | null
  subject_id: number | null
  subject: string
  subject_code: string | null
  course_id: number | null
  course_name: string | null
  course_code: string | null
  academic_year_id: number | null
  academic_year_name: string | null
  classroom_id: number | null
  room: string | null
  room_number: string
  building: string | null
  floor: string | null
  semester: number | null
  lecture_type: string
  day_of_week: number
  day_name: string
  start_time: string
  end_time: string
  status: string
  cancellation_reason: string | null
  substitute_faculty_id: number | null
  substitute_faculty_name: string | null
  substitute_employee_id: string | null
  is_active: boolean
  created_at: string | null
}

interface SummaryKPIs {
  total_lectures: number
  today_lectures: number
  assigned_faculty_count: number
  classrooms_allocated: number
  substitute_count: number
  cancelled_count: number
}

interface LookupDepartment {
  id: number
  name: string
  code: string
}

interface LookupCourse {
  id: number
  name: string
  code: string
  department_id: number | null
}

interface LookupSubject {
  id: number
  name: string
  code: string
  department_id: number | null
  course_id: number | null
  semester: number
  subject_type: string
}

interface LookupClassroom {
  id: number
  room_number: string
  building: string
  floor: string
  capacity: number
  room_type: string
}

interface LookupFaculty {
  id: number
  full_name: string
  employee_id: string
  department: string | null
  department_id: number | null
}

interface LookupAcademicYear {
  id: number
  name: string
  is_current: boolean
}

const WEEKDAYS = [
  { index: 0, label: 'Monday' },
  { index: 1, label: 'Tuesday' },
  { index: 2, label: 'Wednesday' },
  { index: 3, label: 'Thursday' },
  { index: 4, label: 'Friday' },
  { index: 5, label: 'Saturday' },
  { index: 6, label: 'Sunday' },
]

export function LectureTimetablePage() {
  const [viewMode, setViewMode] = useState<'matrix' | 'table'>('matrix')
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Data
  const [lectures, setLectures] = useState<LectureItem[]>([])
  const [summary, setSummary] = useState<SummaryKPIs>({
    total_lectures: 0,
    today_lectures: 0,
    assigned_faculty_count: 0,
    classrooms_allocated: 0,
    substitute_count: 0,
    cancelled_count: 0,
  })

  // Lookups
  const [departments, setDepartments] = useState<LookupDepartment[]>([])
  const [courses, setCourses] = useState<LookupCourse[]>([])
  const [subjects, setSubjects] = useState<LookupSubject[]>([])
  const [classrooms, setClassrooms] = useState<LookupClassroom[]>([])
  const [facultyMembers, setFacultyMembers] = useState<LookupFaculty[]>([])
  const [academicYears, setAcademicYears] = useState<LookupAcademicYear[]>([])

  // Filters
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('all')
  const [courseFilter, setCourseFilter] = useState('all')
  const [dayFilter, setDayFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  // Modals
  const [showAddEditModal, setShowAddEditModal] = useState(false)
  const [editingLecture, setEditingLecture] = useState<LectureItem | null>(null)
  const [formUserId, setFormUserId] = useState<number | ''>('')
  const [formDeptId, setFormDeptId] = useState<number | ''>('')
  const [formCourseId, setFormCourseId] = useState<number | ''>('')
  const [formSubjectId, setFormSubjectId] = useState<number | ''>('')
  const [formCustomSubject, setFormCustomSubject] = useState('')
  const [formClassroomId, setFormClassroomId] = useState<number | ''>('')
  const [formRoomStr, setFormRoomStr] = useState('')
  const [formAYId, setFormAYId] = useState<number | ''>('')
  const [formSemester, setFormSemester] = useState<number>(1)
  const [formType, setFormType] = useState('Theory')
  const [formDay, setFormDay] = useState<number>(0)
  const [formStartTime, setFormStartTime] = useState('09:00')
  const [formEndTime, setFormEndTime] = useState('10:30')
  const [formBusy, setFormBusy] = useState(false)

  // Real-time conflict feedback inside modal
  const [conflictWarning, setConflictWarning] = useState<string | null>(null)
  const [checkingConflict, setCheckingConflict] = useState(false)

  // Substitute Modal
  const [subModalLecture, setSubModalLecture] = useState<LectureItem | null>(null)
  const [selectedSubFacultyId, setSelectedSubFacultyId] = useState<number | ''>('')
  const [subModalBusy, setSubModalBusy] = useState(false)

  // Status Lifecycle Modal
  const [statusModalLecture, setStatusModalLecture] = useState<LectureItem | null>(null)
  const [targetStatus, setTargetStatus] = useState<string>('scheduled')
  const [cancelReason, setCancelReason] = useState<string>('')
  const [statusModalBusy, setStatusModalBusy] = useState(false)

  // Load Main Timetable Data
  const loadTimetable = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (deptFilter !== 'all') params.append('department_id', deptFilter)
      if (courseFilter !== 'all') params.append('course_id', courseFilter)
      if (dayFilter !== 'all') params.append('day_of_week', dayFilter)
      if (statusFilter !== 'all') params.append('status_filter', statusFilter)
      if (search.trim()) params.append('search', search.trim())

      const res = await fetchJson<{ items: LectureItem[]; summary: SummaryKPIs }>(
        `/admin/timetable?${params.toString()}`
      )
      setLectures(res.items || [])
      setSummary(res.summary || {
        total_lectures: 0,
        today_lectures: 0,
        assigned_faculty_count: 0,
        classrooms_allocated: 0,
        substitute_count: 0,
        cancelled_count: 0,
      })
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setLoading(false)
    }
  }

  // Load auxiliary lookup catalogs once
  useEffect(() => {
    const loadLookups = async () => {
      try {
        const [deptsRes, coursesRes, subsRes, roomsRes, facRes, aysRes] = await Promise.all([
          fetchJson<{ items: LookupDepartment[] }>('/admin/academic/departments').catch(() => ({ items: [] })),
          fetchJson<{ items: LookupCourse[] }>('/admin/academic/courses').catch(() => ({ items: [] })),
          fetchJson<{ items: LookupSubject[] }>('/admin/academic/subjects').catch(() => ({ items: [] })),
          fetchJson<{ items: LookupClassroom[] }>('/admin/academic/classrooms').catch(() => ({ items: [] })),
          fetchJson<LookupFaculty[]>('/directory').catch(() => []),
          fetchJson<LookupAcademicYear[]>('/admin/academic/academic-years').catch(() => []),
        ])

        setDepartments(deptsRes.items || [])
        setCourses(coursesRes.items || [])
        setSubjects(subsRes.items || [])
        setClassrooms(roomsRes.items || [])
        setFacultyMembers((facRes || []).filter((f: any) => f.role === 'faculty' || f.designation?.includes('Faculty') || f.designation?.includes('Professor')))
        setAcademicYears(aysRes || [])
      } catch (err) {
        console.error('Lookup load error', err)
      }
    }
    void loadLookups()
  }, [])

  useEffect(() => {
    void loadTimetable()
  }, [deptFilter, courseFilter, dayFilter, statusFilter, search])

  // Real-time pre-flight conflict check in Add/Edit modal
  useEffect(() => {
    if (!showAddEditModal || !formUserId || !formStartTime || !formEndTime) {
      setConflictWarning(null)
      return
    }

    const timer = setTimeout(async () => {
      setCheckingConflict(true)
      try {
        const checkRes = await api.post<{
          has_conflict: boolean
          conflict_type: string | null
          conflict_message: string | null
        }>('/admin/timetable/check-conflict', {
          user_id: Number(formUserId),
          classroom_id: formClassroomId ? Number(formClassroomId) : null,
          room: formRoomStr.trim() || null,
          day_of_week: Number(formDay),
          start_time: formStartTime,
          end_time: formEndTime,
          exclude_id: editingLecture ? editingLecture.id : null,
        })

        if (checkRes.data && checkRes.data.has_conflict) {
          setConflictWarning(checkRes.data.conflict_message)
        } else {
          setConflictWarning(null)
        }
      } catch {
        // silent fail on preflight
      } finally {
        setCheckingConflict(false)
      }
    }, 350)

    return () => clearTimeout(timer)
  }, [showAddEditModal, formUserId, formClassroomId, formRoomStr, formDay, formStartTime, formEndTime, editingLecture])

  // Open Add Modal
  const openAddModal = () => {
    setEditingLecture(null)
    setFormUserId(facultyMembers[0]?.id || '')
    setFormDeptId(departments[0]?.id || '')
    setFormCourseId(courses[0]?.id || '')
    setFormSubjectId(subjects[0]?.id || '')
    setFormCustomSubject('')
    setFormClassroomId(classrooms[0]?.id || '')
    setFormRoomStr('')
    const activeAY = academicYears.find(y => y.is_current)
    setFormAYId(activeAY ? activeAY.id : (academicYears[0]?.id || ''))
    setFormSemester(1)
    setFormType('Theory')
    setFormDay(0)
    setFormStartTime('09:00')
    setFormEndTime('10:30')
    setConflictWarning(null)
    setShowAddEditModal(true)
  }

  // Open Edit Modal
  const openEditModal = (lec: LectureItem) => {
    setEditingLecture(lec)
    setFormUserId(lec.user_id)
    setFormDeptId(lec.department_id || '')
    setFormCourseId(lec.course_id || '')
    setFormSubjectId(lec.subject_id || '')
    setFormCustomSubject(lec.subject)
    setFormClassroomId(lec.classroom_id || '')
    setFormRoomStr(lec.room || '')
    setFormAYId(lec.academic_year_id || '')
    setFormSemester(lec.semester || 1)
    setFormType(lec.lecture_type || 'Theory')
    setFormDay(lec.day_of_week)
    setFormStartTime(lec.start_time)
    setFormEndTime(lec.end_time)
    setConflictWarning(null)
    setShowAddEditModal(true)
  }

  // Handle Form Subject Select
  const handleSubjectChange = (subIdStr: string) => {
    const id = Number(subIdStr)
    setFormSubjectId(id)
    const subObj = subjects.find(s => s.id === id)
    if (subObj) {
      if (subObj.department_id) setFormDeptId(subObj.department_id)
      if (subObj.course_id) setFormCourseId(subObj.course_id)
      if (subObj.semester) setFormSemester(subObj.semester)
      if (subObj.subject_type) setFormType(subObj.subject_type)
    }
  }

  // Submit Add or Edit
  const handleSubmitAddEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formUserId) {
      alert('Please select a faculty member.')
      return
    }
    if (formEndTime <= formStartTime) {
      alert('Lecture end time must be after the start time.')
      return
    }

    setFormBusy(true)
    try {
      const payload: any = {
        user_id: Number(formUserId),
        department_id: formDeptId ? Number(formDeptId) : null,
        course_id: formCourseId ? Number(formCourseId) : null,
        subject_id: formSubjectId ? Number(formSubjectId) : null,
        subject: formCustomSubject.trim() || undefined,
        classroom_id: formClassroomId ? Number(formClassroomId) : null,
        room: formRoomStr.trim() || undefined,
        academic_year_id: formAYId ? Number(formAYId) : null,
        semester: Number(formSemester),
        lecture_type: formType,
        day_of_week: Number(formDay),
        start_time: formStartTime,
        end_time: formEndTime,
      }

      if (editingLecture) {
        await api.put(`/admin/timetable/${editingLecture.id}`, payload)
        setFeedback({ type: 'success', message: 'Lecture session updated successfully.' })
      } else {
        await api.post('/admin/timetable', payload)
        setFeedback({ type: 'success', message: 'New lecture timetable session created successfully.' })
      }
      setShowAddEditModal(false)
      loadTimetable()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setFormBusy(false)
    }
  }

  // Open Substitute Modal
  const openSubstituteModal = (lec: LectureItem) => {
    setSubModalLecture(lec)
    setSelectedSubFacultyId(lec.substitute_faculty_id || '')
  }

  // Submit Substitute Assignment
  const handleSaveSubstitute = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subModalLecture) return
    setSubModalBusy(true)
    try {
      await api.post(`/admin/timetable/${subModalLecture.id}/assign-substitute`, {
        substitute_faculty_id: selectedSubFacultyId ? Number(selectedSubFacultyId) : null,
      })
      setFeedback({
        type: 'success',
        message: selectedSubFacultyId
          ? 'Substitute faculty assigned successfully.'
          : 'Substitute faculty removed; primary faculty restored.',
      })
      setSubModalLecture(null)
      loadTimetable()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setSubModalBusy(false)
    }
  }

  // Open Status Lifecycle Modal
  const openStatusModal = (lec: LectureItem) => {
    setStatusModalLecture(lec)
    setTargetStatus(lec.status || 'scheduled')
    setCancelReason(lec.cancellation_reason || '')
  }

  // Submit Status Change
  const handleSaveStatus = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!statusModalLecture) return
    setStatusModalBusy(true)
    try {
      await api.patch(`/admin/timetable/${statusModalLecture.id}/status`, {
        status: targetStatus,
        cancellation_reason: targetStatus === 'cancelled' ? cancelReason.trim() || 'Cancelled by admin' : null,
      })
      setFeedback({ type: 'success', message: `Lecture status changed to ${targetStatus}.` })
      setStatusModalLecture(null)
      loadTimetable()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setStatusModalBusy(false)
    }
  }

  // Delete Lecture
  const handleDeleteLecture = async (lec: LectureItem) => {
    if (!confirm(`Are you sure you want to deactivate and remove lecture session "${lec.subject}" (${lec.day_name} ${lec.start_time}-${lec.end_time})?`)) return
    try {
      await api.delete(`/admin/timetable/${lec.id}`)
      setFeedback({ type: 'success', message: `Lecture session removed.` })
      loadTimetable()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    }
  }

  // Render Status Badge
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'in_progress':
        return (
          <span className="badge badge-approved" style={{ background: '#ecfdf5', color: '#047857' }}>
            <span className="live-dot" style={{ width: 6, height: 6 }} /> In Progress
          </span>
        )
      case 'completed':
        return (
          <span className="badge badge-approved">
            <CheckCircle2 size={11} /> Completed
          </span>
        )
      case 'cancelled':
        return (
          <span className="badge badge-rejected">
            <X size={11} /> Cancelled
          </span>
        )
      case 'rescheduled':
        return (
          <span className="badge badge-pending">
            <Clock size={11} /> Rescheduled
          </span>
        )
      default:
        return (
          <span className="badge badge-not_enrolled" style={{ background: '#f8fafc', color: '#334155' }}>
            <CalendarCheck size={11} /> Scheduled
          </span>
        )
    }
  }

  return (
    <div className="admin-page-container">
      {/* Page Header */}
      <div className="admin-page-header">
        <div className="admin-page-titles">
          <span className="admin-eyebrow">Academic Schedule & Timetable</span>
          <h1>Lecture & Timetable Management</h1>
          <p className="admin-page-desc">
            Configure weekly master schedules, prevent faculty & classroom collisions, manage room allocations, and handle substitute faculty.
          </p>
        </div>

        <div className="admin-header-actions">
          {/* View Mode Toggle */}
          <div className="timetable-view-toggle">
            <button
              type="button"
              className={`timetable-toggle-btn ${viewMode === 'matrix' ? 'toggle-active' : ''}`}
              onClick={() => setViewMode('matrix')}
              title="Interactive Weekly Matrix View"
            >
              <LayoutGrid size={14} /> Matrix View
            </button>
            <button
              type="button"
              className={`timetable-toggle-btn ${viewMode === 'table' ? 'toggle-active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Schedule Table Directory View"
            >
              <List size={14} /> Schedule List
            </button>
          </div>

          <button
            type="button"
            className="button button-secondary"
            onClick={loadTimetable}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'admin-spin mr-1' : 'mr-1'} />
            Refresh
          </button>

          <button
            type="button"
            className="button button-primary"
            onClick={openAddModal}
          >
            <Plus size={15} /> Add Lecture
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div className={`notice notice-${feedback.type === 'success' ? 'success' : 'error'} mb-4`}>
          {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{feedback.message}</span>
          <button type="button" className="button-link ml-auto" onClick={() => setFeedback(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="admin-kpi-grid-6">
        <div className="admin-kpi-card">
          <div className="admin-kpi-icon-wrap">
            <Clock3 size={18} />
          </div>
          <div className="admin-kpi-content">
            <span className="admin-kpi-label">Weekly Lectures</span>
            <span className="admin-kpi-value">{summary.total_lectures}</span>
            <span className="admin-kpi-note">Active Master Sessions</span>
          </div>
        </div>

        <div className="admin-kpi-card kpi-border-green">
          <div className="admin-kpi-icon-wrap bg-green-subtle text-green">
            <CalendarCheck size={18} />
          </div>
          <div className="admin-kpi-content">
            <span className="admin-kpi-label">Today's Lectures</span>
            <span className="admin-kpi-value text-green">{summary.today_lectures}</span>
            <span className="admin-kpi-note">Scheduled for today</span>
          </div>
        </div>

        <div className="admin-kpi-card kpi-border-amber">
          <div className="admin-kpi-icon-wrap bg-amber-subtle text-amber">
            <Users size={18} />
          </div>
          <div className="admin-kpi-content">
            <span className="admin-kpi-label">Assigned Faculty</span>
            <span className="admin-kpi-value text-amber">{summary.assigned_faculty_count}</span>
            <span className="admin-kpi-note">Teaching this week</span>
          </div>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-icon-wrap bg-indigo-subtle text-indigo">
            <School size={18} />
          </div>
          <div className="admin-kpi-content">
            <span className="admin-kpi-label">Allocated Rooms</span>
            <span className="admin-kpi-value text-indigo">{summary.classrooms_allocated}</span>
            <span className="admin-kpi-note">Campus Classrooms</span>
          </div>
        </div>

        <div className="admin-kpi-card kpi-border-purple">
          <div className="admin-kpi-icon-wrap bg-purple-subtle text-purple">
            <UserCheck size={18} />
          </div>
          <div className="admin-kpi-content">
            <span className="admin-kpi-label">Substitute Sessions</span>
            <span className="admin-kpi-value text-purple">{summary.substitute_count}</span>
            <span className="admin-kpi-note">Active substitutions</span>
          </div>
        </div>

        <div className="admin-kpi-card kpi-border-red">
          <div className="admin-kpi-icon-wrap bg-red-subtle text-red">
            <AlertCircle size={18} />
          </div>
          <div className="admin-kpi-content">
            <span className="admin-kpi-label">Cancelled</span>
            <span className="admin-kpi-value text-red">{summary.cancelled_count}</span>
            <span className="admin-kpi-note">Cancelled lectures</span>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="panel mb-4">
        <div className="admin-filters-flex">
          <div className="admin-search-box">
            <Search size={15} />
            <input
              type="text"
              placeholder="Search by subject, faculty, course, or room..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button type="button" className="search-clear-btn" onClick={() => setSearch('')}>
                <X size={13} />
              </button>
            )}
          </div>

          <div className="admin-filter-group">
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

            <select
              className="admin-select"
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
            >
              <option value="all">All Courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>

            <select
              className="admin-select"
              value={dayFilter}
              onChange={(e) => setDayFilter(e.target.value)}
            >
              <option value="all">All Days</option>
              {WEEKDAYS.map((w) => (
                <option key={w.index} value={w.index}>
                  {w.label}
                </option>
              ))}
            </select>

            <select
              className="admin-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Content: MATRIX VIEW vs TABLE VIEW */}
      {loading ? (
        <div className="panel text-center p-6">
          <RefreshCw size={24} className="admin-spin mb-2" style={{ color: '#2563eb' }} />
          <p className="admin-page-desc">Loading lecture timetable & room allocations...</p>
        </div>
      ) : viewMode === 'matrix' ? (
        /* ================= MATRIX VIEW ================= */
        <div className="admin-timetable-matrix">
          {WEEKDAYS.slice(0, 6).map((day) => {
            const isToday = new Date().getDay() === (day.index === 6 ? 0 : day.index + 1)
            const daySessions = lectures.filter((l) => l.day_of_week === day.index)

            return (
              <div key={day.index} className={`timetable-day-col ${isToday ? 'col-today' : ''}`}>
                <div className="timetable-col-header">
                  <strong>{day.label}</strong>
                  <span className="timetable-col-badge">
                    {daySessions.length} {daySessions.length === 1 ? 'lecture' : 'lectures'}
                  </span>
                </div>

                <div className="timetable-col-body">
                  {daySessions.length === 0 ? (
                    <div className="empty-state" style={{ minHeight: 140, padding: 12 }}>
                      <Clock size={20} style={{ color: '#94a3b8' }} />
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>No lectures scheduled</span>
                    </div>
                  ) : (
                    daySessions.map((lec) => (
                      <div
                        key={lec.id}
                        className={`timetable-session-card ${lec.status === 'cancelled' ? 'status-cancelled' : ''}`}
                      >
                        {/* Time & Duration */}
                        <div className="session-time-banner">
                          <span>
                            {lec.start_time} – {lec.end_time}
                          </span>
                          <span className="session-duration">{lec.lecture_type}</span>
                        </div>

                        {/* Subject & Code */}
                        <div className="session-title">
                          {lec.subject}
                          {lec.subject_code && (
                            <span style={{ fontSize: 10.5, color: '#64748b', marginLeft: 6, fontWeight: 500 }}>
                              ({lec.subject_code})
                            </span>
                          )}
                        </div>

                        {/* Course & Semester */}
                        <div className="session-meta-row">
                          <span style={{ fontSize: 10.5, color: '#475569' }}>
                            {lec.course_name ? lec.course_name : 'General'}
                            {lec.semester ? ` · Sem ${lec.semester}` : ''}
                          </span>
                        </div>

                        {/* Faculty Profile */}
                        <div className="session-teacher">
                          <div
                            className="faculty-avatar-circle"
                            style={{ width: 22, height: 22, fontSize: 9 }}
                          >
                            {lec.faculty_name.charAt(0)}
                          </div>
                          <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            {lec.faculty_name}
                          </span>
                        </div>

                        {/* Substitute Faculty if assigned */}
                        {lec.substitute_faculty_name && (
                          <div className="session-substitute-pill">
                            <UserCheck size={11} />
                            <span>Sub: {lec.substitute_faculty_name}</span>
                          </div>
                        )}

                        {/* Room Allocation */}
                        <div className="session-room-pill">
                          <DoorOpen size={11} />
                          <span>{lec.room || 'TBA'}</span>
                        </div>

                        {/* Status badge */}
                        <div style={{ marginTop: 2 }}>{renderStatusBadge(lec.status)}</div>

                        {/* Actions */}
                        <div className="session-actions-bar">
                          <button
                            type="button"
                            className="button-link"
                            title="Assign Substitute Faculty"
                            onClick={() => openSubstituteModal(lec)}
                            style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                          >
                            <UserPlus size={12} /> Substitute
                          </button>
                          <button
                            type="button"
                            className="button-link"
                            title="Update Status / Cancel"
                            onClick={() => openStatusModal(lec)}
                            style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                          >
                            <Power size={12} /> Status
                          </button>
                          <button
                            type="button"
                            className="button-link"
                            title="Edit Lecture"
                            onClick={() => openEditModal(lec)}
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            type="button"
                            className="button-link text-red"
                            title="Deactivate Lecture"
                            onClick={() => handleDeleteLecture(lec)}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* ================= TABLE DIRECTORY VIEW ================= */
        <div className="panel">
          <div className="table-scroll">
            <table className="admin-data-table">
              <thead>
                <tr>
                  <th>Day & Slot</th>
                  <th>Subject & Curriculum</th>
                  <th>Faculty & Substitute</th>
                  <th>Department & Course</th>
                  <th>Room Allocation</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {lectures.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center p-6 text-muted">
                      No lecture timetable records match the selected filters.
                    </td>
                  </tr>
                ) : (
                  lectures.map((lec) => (
                    <tr key={lec.id}>
                      <td>
                        <strong>{lec.day_name}</strong>
                        <div style={{ fontSize: 11, color: '#2563eb', fontWeight: 600 }}>
                          {lec.start_time} – {lec.end_time}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{lec.subject}</div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                          <span className="dept-tag">{lec.lecture_type}</span>
                          {lec.subject_code && (
                            <span style={{ fontSize: 11, color: '#64748b' }}>{lec.subject_code}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div className="faculty-avatar-circle" style={{ width: 24, height: 24, fontSize: 10 }}>
                            {lec.faculty_name.charAt(0)}
                          </div>
                          <div>
                            <strong style={{ fontSize: 12 }}>{lec.faculty_name}</strong>
                            <div style={{ fontSize: 10, color: '#64748b' }}>{lec.employee_id}</div>
                          </div>
                        </div>
                        {lec.substitute_faculty_name && (
                          <div className="session-substitute-pill" style={{ marginTop: 4 }}>
                            <UserCheck size={11} />
                            Sub: {lec.substitute_faculty_name}
                          </div>
                        )}
                      </td>
                      <td>
                        <div>{lec.department_name || 'General Dept'}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          {lec.course_name ? `${lec.course_name} (Sem ${lec.semester || 1})` : 'Core Subject'}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <DoorOpen size={13} style={{ color: '#64748b' }} />
                          <strong>{lec.room || 'TBA'}</strong>
                        </div>
                        {lec.building && (
                          <div style={{ fontSize: 10.5, color: '#64748b' }}>
                            {lec.building} {lec.floor ? `· ${lec.floor}` : ''}
                          </div>
                        )}
                      </td>
                      <td>
                        {renderStatusBadge(lec.status)}
                        {lec.cancellation_reason && (
                          <div style={{ fontSize: 10, color: '#dc2626', marginTop: 2 }}>
                            {lec.cancellation_reason}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="admin-inline-actions" style={{ justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="button button-secondary button-compact"
                            onClick={() => openSubstituteModal(lec)}
                            title="Assign Substitute Faculty"
                          >
                            <UserPlus size={12} />
                          </button>
                          <button
                            type="button"
                            className="button button-secondary button-compact"
                            onClick={() => openStatusModal(lec)}
                            title="Status Lifecycle"
                          >
                            <Power size={12} />
                          </button>
                          <button
                            type="button"
                            className="button button-secondary button-compact"
                            onClick={() => openEditModal(lec)}
                            title="Edit Lecture"
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            type="button"
                            className="button button-danger button-compact"
                            onClick={() => handleDeleteLecture(lec)}
                            title="Delete"
                          >
                            <Trash2 size={12} />
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
      )}

      {/* ================= MODAL: ADD / EDIT LECTURE ================= */}
      {showAddEditModal && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal" style={{ width: 'min(760px, 100%)' }}>
            <div className="admin-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Clock3 size={19} style={{ color: '#2563eb' }} />
                <h3>{editingLecture ? 'Edit Lecture Session' : 'Schedule New Weekly Lecture'}</h3>
              </div>
              <button
                type="button"
                className="button-link"
                onClick={() => setShowAddEditModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitAddEdit}>
              <div className="admin-modal-body">
                {/* Conflict warning banner */}
                {conflictWarning && (
                  <div className="conflict-warning-box">
                    <ShieldAlert size={18} style={{ flexShrink: 0, marginTop: 2, color: '#dc2626' }} />
                    <div>
                      <strong style={{ color: '#dc2626' }}>Schedule Collision Detected:</strong>
                      <p style={{ margin: '4px 0 0', color: '#991b1b' }}>{conflictWarning}</p>
                    </div>
                  </div>
                )}

                <div className="profile-grid">
                  {/* Faculty Member */}
                  <div className="admin-form-group">
                    <label className="admin-form-label">
                      Visiting Faculty Member <span className="text-red">*</span>
                    </label>
                    <select
                      className="admin-select"
                      value={formUserId}
                      onChange={(e) => setFormUserId(Number(e.target.value))}
                      required
                    >
                      <option value="" disabled>
                        Select Faculty Member
                      </option>
                      {facultyMembers.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.full_name} ({f.employee_id}) · {f.department || 'All Depts'}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Department */}
                  <div className="admin-form-group">
                    <label className="admin-form-label">Academic Department</label>
                    <select
                      className="admin-select"
                      value={formDeptId}
                      onChange={(e) => setFormDeptId(Number(e.target.value))}
                    >
                      <option value="">General / None</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Subject Catalog Mapping */}
                  <div className="admin-form-group">
                    <label className="admin-form-label">
                      Curriculum Subject <span className="text-red">*</span>
                    </label>
                    <select
                      className="admin-select"
                      value={formSubjectId}
                      onChange={(e) => handleSubjectChange(e.target.value)}
                    >
                      <option value="">Select from Course Subjects</option>
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code}) · Sem {s.semester} [{s.subject_type}]
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Custom Subject Name (if not in catalog) */}
                  <div className="admin-form-group">
                    <label className="admin-form-label">Or Custom Subject Title</label>
                    <input
                      type="text"
                      className="admin-input"
                      placeholder="e.g. Guest Seminar on Cyber Security"
                      value={formCustomSubject}
                      onChange={(e) => setFormCustomSubject(e.target.value)}
                    />
                  </div>

                  {/* Course / Degree */}
                  <div className="admin-form-group">
                    <label className="admin-form-label">Course / Degree Program</label>
                    <select
                      className="admin-select"
                      value={formCourseId}
                      onChange={(e) => setFormCourseId(Number(e.target.value))}
                    >
                      <option value="">Select Course</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Semester */}
                  <div className="admin-form-group">
                    <label className="admin-form-label">Semester</label>
                    <select
                      className="admin-select"
                      value={formSemester}
                      onChange={(e) => setFormSemester(Number(e.target.value))}
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => (
                        <option key={s} value={s}>
                          Semester {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Classroom Allocation */}
                  <div className="admin-form-group">
                    <label className="admin-form-label">Campus Classroom</label>
                    <select
                      className="admin-select"
                      value={formClassroomId}
                      onChange={(e) => {
                        const cid = Number(e.target.value)
                        setFormClassroomId(cid)
                        const cObj = classrooms.find(r => r.id === cid)
                        if (cObj) setFormRoomStr(cObj.room_number)
                      }}
                    >
                      <option value="">Select Campus Classroom</option>
                      {classrooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.building} - {r.room_number} (Cap: {r.capacity}, {r.room_type})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Custom Room if outside catalog */}
                  <div className="admin-form-group">
                    <label className="admin-form-label">Or Room Label</label>
                    <input
                      type="text"
                      className="admin-input"
                      placeholder="e.g. Auditorium Hall B"
                      value={formRoomStr}
                      onChange={(e) => setFormRoomStr(e.target.value)}
                    />
                  </div>

                  {/* Academic Year */}
                  <div className="admin-form-group">
                    <label className="admin-form-label">Academic Year</label>
                    <select
                      className="admin-select"
                      value={formAYId}
                      onChange={(e) => setFormAYId(Number(e.target.value))}
                    >
                      {academicYears.map((ay) => (
                        <option key={ay.id} value={ay.id}>
                          {ay.name} {ay.is_current ? '(Current Active)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Lecture Type */}
                  <div className="admin-form-group">
                    <label className="admin-form-label">Lecture Session Type</label>
                    <select
                      className="admin-select"
                      value={formType}
                      onChange={(e) => setFormType(e.target.value)}
                    >
                      <option value="Theory">Theory Lecture</option>
                      <option value="Lab">Laboratory / Practical</option>
                      <option value="Tutorial">Tutorial / Discussion</option>
                      <option value="Seminar">Seminar / Workshop</option>
                    </select>
                  </div>

                  {/* Day of the week */}
                  <div className="admin-form-group">
                    <label className="admin-form-label">Day of Week</label>
                    <select
                      className="admin-select"
                      value={formDay}
                      onChange={(e) => setFormDay(Number(e.target.value))}
                    >
                      {WEEKDAYS.map((w) => (
                        <option key={w.index} value={w.index}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Time slots */}
                  <div className="admin-form-group">
                    <label className="admin-form-label">Timing Slot (Start & End)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="time"
                        className="admin-input"
                        value={formStartTime}
                        onChange={(e) => setFormStartTime(e.target.value)}
                        required
                      />
                      <span>to</span>
                      <input
                        type="time"
                        className="admin-input"
                        value={formEndTime}
                        onChange={(e) => setFormEndTime(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="admin-modal-footer">
                {checkingConflict && (
                  <span style={{ fontSize: 11, color: '#64748b', marginRight: 'auto' }}>
                    <RefreshCw size={11} className="admin-spin" style={{ display: 'inline', marginRight: 4 }} />
                    Checking for faculty & room clashes...
                  </span>
                )}
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setShowAddEditModal(false)}
                  disabled={formBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={formBusy || !!conflictWarning}
                >
                  {formBusy ? 'Saving...' : editingLecture ? 'Update Lecture' : 'Save Timetable Slot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: ASSIGN SUBSTITUTE FACULTY ================= */}
      {subModalLecture && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal" style={{ width: 'min(540px, 100%)' }}>
            <div className="admin-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <UserCheck size={19} style={{ color: '#9333ea' }} />
                <h3>Assign Substitute Faculty</h3>
              </div>
              <button
                type="button"
                className="button-link"
                onClick={() => setSubModalLecture(null)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveSubstitute}>
              <div className="admin-modal-body">
                <div className="biometric-overview-box mb-4" style={{ background: '#faf5ff', borderColor: '#e9d5ff' }}>
                  <strong style={{ display: 'block', fontSize: 13, color: '#581c87' }}>
                    {subModalLecture.subject}
                  </strong>
                  <div style={{ fontSize: 11.5, color: '#6b21a8', marginTop: 4 }}>
                    {subModalLecture.day_name} {subModalLecture.start_time} - {subModalLecture.end_time} · Room: {subModalLecture.room || 'TBA'}
                  </div>
                  <div style={{ fontSize: 11, color: '#7e22ce', marginTop: 2 }}>
                    Primary Assigned: <strong>{subModalLecture.faculty_name}</strong>
                  </div>
                </div>

                <div className="admin-form-group">
                  <label className="admin-form-label">Select Substitute Faculty Member</label>
                  <select
                    className="admin-select"
                    value={selectedSubFacultyId}
                    onChange={(e) => setSelectedSubFacultyId(e.target.value ? Number(e.target.value) : '')}
                  >
                    <option value="">-- No Substitute (Restore Primary Faculty) --</option>
                    {facultyMembers
                      .filter((f) => f.id !== subModalLecture.user_id)
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.full_name} ({f.employee_id}) · {f.department || 'Faculty'}
                        </option>
                      ))}
                  </select>
                  <span style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                    The substitute will be authorized to punch in for this lecture session. Clash prevention ensures the substitute is free at this slot.
                  </span>
                </div>
              </div>

              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setSubModalLecture(null)}
                  disabled={subModalBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  style={{ background: '#7c3aed' }}
                  disabled={subModalBusy}
                >
                  {subModalBusy ? 'Saving...' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: STATUS LIFECYCLE ================= */}
      {statusModalLecture && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal" style={{ width: 'min(500px, 100%)' }}>
            <div className="admin-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Power size={18} style={{ color: '#2563eb' }} />
                <h3>Lecture Session Status</h3>
              </div>
              <button
                type="button"
                className="button-link"
                onClick={() => setStatusModalLecture(null)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveStatus}>
              <div className="admin-modal-body">
                <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#475569' }}>
                  Update lifecycle state for <strong>{statusModalLecture.subject}</strong> on{' '}
                  {statusModalLecture.day_name} ({statusModalLecture.start_time}-{statusModalLecture.end_time}).
                </p>

                <div className="admin-form-group">
                  <label className="admin-form-label">Session Status</label>
                  <select
                    className="admin-select"
                    value={targetStatus}
                    onChange={(e) => setTargetStatus(e.target.value)}
                  >
                    <option value="scheduled">Scheduled (Upcoming)</option>
                    <option value="in_progress">In Progress (Active now)</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="rescheduled">Rescheduled</option>
                  </select>
                </div>

                {targetStatus === 'cancelled' && (
                  <div className="admin-form-group">
                    <label className="admin-form-label">
                      Cancellation Reason <span className="text-red">*</span>
                    </label>
                    <textarea
                      className="admin-textarea"
                      rows={3}
                      placeholder="State reason for cancelling this lecture session..."
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      required
                    />
                  </div>
                )}
              </div>

              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setStatusModalLecture(null)}
                  disabled={statusModalBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={statusModalBusy}
                >
                  {statusModalBusy ? 'Updating...' : 'Update Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
