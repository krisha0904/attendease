import React, { useEffect, useState } from 'react'
import {
  AlertCircle, BookOpen, Check, CheckCircle2, ChevronRight,
  Clock, Edit3, Eye, FileText, GraduationCap, Layers, Plus, Power,
  RefreshCw, Search, Trash2, UserMinus, UserPlus, Users, X
} from 'lucide-react'
import { api, errorMessage, fetchJson } from './api'

interface CourseItem {
  id: number
  name: string
  code: string
  department_id: number | null
  department_name: string
  duration_years: number
  total_semesters: number
  description: string
  is_active: boolean
  subject_count: number
}

interface SubjectItem {
  id: number
  name: string
  code: string
  department_id: number | null
  department_name: string
  course_id: number | null
  course_name: string
  semester: number
  credits: number
  subject_type: string
  is_active: boolean
  assigned_faculty: Array<{ id: number; full_name: string; employee_id: string }>
}

interface Department {
  id: number
  name: string
  code: string
}

export function CourseSubjectManagementPage() {
  const [activeTab, setActiveTab] = useState<'courses' | 'subjects'>('courses')
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Data lists
  const [departments, setDepartments] = useState<Department[]>([])
  const [allFaculty, setAllFaculty] = useState<Array<{ id: number; full_name: string; employee_id: string }>>([])
  const [courses, setCourses] = useState<CourseItem[]>([])
  const [courseSummary, setCourseSummary] = useState({
    total_courses: 0,
    active_courses: 0,
    total_departments_covered: 0,
  })
  const [subjects, setSubjects] = useState<SubjectItem[]>([])
  const [subjectSummary, setSubjectSummary] = useState({
    total_subjects: 0,
    theory_count: 0,
    lab_count: 0,
    unassigned_count: 0,
  })

  // Filters
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState<string>('all')
  const [courseFilter, setCourseFilter] = useState<string>('all')
  const [semesterFilter, setSemesterFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Course Modals
  const [showCourseModal, setShowCourseModal] = useState(false)
  const [editingCourse, setEditingCourse] = useState<CourseItem | null>(null)
  const [courseName, setCourseName] = useState('')
  const [courseCode, setCourseCode] = useState('')
  const [courseDeptId, setCourseDeptId] = useState<number | ''>('')
  const [courseDuration, setCourseDuration] = useState(4)
  const [courseSemesters, setCourseSemesters] = useState(8)
  const [courseDesc, setCourseDesc] = useState('')
  const [courseIsActive, setCourseIsActive] = useState(true)

  // Subject Modals
  const [showSubjectModal, setShowSubjectModal] = useState(false)
  const [editingSubject, setEditingSubject] = useState<SubjectItem | null>(null)
  const [subName, setSubName] = useState('')
  const [subCode, setSubCode] = useState('')
  const [subDeptId, setSubDeptId] = useState<number | ''>('')
  const [subCourseId, setSubCourseId] = useState<number | ''>('')
  const [subSemester, setSubSemester] = useState(1)
  const [subCredits, setSubCredits] = useState(4)
  const [subType, setSubType] = useState('Theory')
  const [subIsActive, setSubIsActive] = useState(true)

  // Assign Faculty to Subject Modal
  const [assigningSubject, setAssigningSubject] = useState<SubjectItem | null>(null)
  const [selectedFacultyId, setSelectedFacultyId] = useState<number | ''>('')

  const [busy, setBusy] = useState(false)

  // Load Departments & Faculty
  useEffect(() => {
    fetchJson<{ items: Department[] }>('/admin/academic/departments')
      .then((res) => setDepartments(res.items || []))
      .catch(() => { })
    fetchJson<{ items: Array<{ id: number; full_name: string; employee_id: string }> }>('/admin/faculty?limit=200')
      .then((res) => setAllFaculty(res.items || []))
      .catch(() => { })
  }, [])

  // Load Courses
  const loadCourses = async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = { status_filter: statusFilter }
      if (search.trim()) params.search = search.trim()
      if (deptFilter !== 'all') params.department_id = deptFilter
      const res = await fetchJson<{ summary: any; items: CourseItem[] }>('/admin/academic/courses', params)
      setCourses(res.items)
      setCourseSummary(res.summary)
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setLoading(false)
    }
  }

  // Load Subjects
  const loadSubjects = async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = { status_filter: statusFilter }
      if (search.trim()) params.search = search.trim()
      if (deptFilter !== 'all') params.department_id = deptFilter
      if (courseFilter !== 'all') params.course_id = courseFilter
      if (semesterFilter !== 'all') params.semester = semesterFilter
      if (typeFilter !== 'all') params.subject_type = typeFilter
      const res = await fetchJson<{ summary: any; items: SubjectItem[] }>('/admin/academic/subjects', params)
      setSubjects(res.items)
      setSubjectSummary(res.summary)
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'courses') {
      loadCourses()
    } else {
      loadSubjects()
    }
  }, [activeTab, deptFilter, courseFilter, semesterFilter, typeFilter, statusFilter])

  // Course Handlers
  const openAddCourse = () => {
    setEditingCourse(null)
    setCourseName('')
    setCourseCode('')
    setCourseDeptId('')
    setCourseDuration(4)
    setCourseSemesters(8)
    setCourseDesc('')
    setCourseIsActive(true)
    setShowCourseModal(true)
  }

  const openEditCourse = (c: CourseItem) => {
    setEditingCourse(c)
    setCourseName(c.name)
    setCourseCode(c.code)
    setCourseDeptId(c.department_id || '')
    setCourseDuration(c.duration_years)
    setCourseSemesters(c.total_semesters)
    setCourseDesc(c.description)
    setCourseIsActive(c.is_active)
    setShowCourseModal(true)
  }

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!courseName.trim() || !courseCode.trim()) {
      alert('Please fill in Course Name and Code.')
      return
    }
    setBusy(true)
    try {
      if (editingCourse) {
        await api.put(`/admin/academic/courses/${editingCourse.id}`, {
          name: courseName.trim(),
          code: courseCode.trim().toUpperCase(),
          department_id: courseDeptId === '' ? null : Number(courseDeptId),
          duration_years: Number(courseDuration),
          total_semesters: Number(courseSemesters),
          description: courseDesc.trim() || null,
          is_active: courseIsActive,
        })
        setFeedback({ type: 'success', message: `Course '${courseName}' updated.` })
      } else {
        await api.post('/admin/academic/courses', {
          name: courseName.trim(),
          code: courseCode.trim().toUpperCase(),
          department_id: courseDeptId === '' ? null : Number(courseDeptId),
          duration_years: Number(courseDuration),
          total_semesters: Number(courseSemesters),
          description: courseDesc.trim() || null,
          is_active: courseIsActive,
        })
        setFeedback({ type: 'success', message: `Course '${courseName}' created successfully.` })
      }
      setShowCourseModal(false)
      loadCourses()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const handleToggleCourseStatus = async (c: CourseItem) => {
    try {
      const res = await api.patch<{ is_active: boolean }>(`/admin/academic/courses/${c.id}/status`)
      setFeedback({
        type: 'success',
        message: `Course '${c.code}' is now ${res.data.is_active ? 'Active' : 'Inactive'}.`,
      })
      loadCourses()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    }
  }

  const handleDeleteCourse = async (c: CourseItem) => {
    if (!confirm(`Delete degree course '${c.name}' (${c.code})?`)) return
    try {
      await api.delete(`/admin/academic/courses/${c.id}`)
      setFeedback({ type: 'success', message: `Course '${c.name}' removed.` })
      loadCourses()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    }
  }

  // Subject Handlers
  const openAddSubject = () => {
    setEditingSubject(null)
    setSubName('')
    setSubCode('')
    setSubDeptId('')
    setSubCourseId('')
    setSubSemester(1)
    setSubCredits(4)
    setSubType('Theory')
    setSubIsActive(true)
    setShowSubjectModal(true)
  }

  const openEditSubject = (s: SubjectItem) => {
    setEditingSubject(s)
    setSubName(s.name)
    setSubCode(s.code)
    setSubDeptId(s.department_id || '')
    setSubCourseId(s.course_id || '')
    setSubSemester(s.semester)
    setSubCredits(s.credits)
    setSubType(s.subject_type)
    setSubIsActive(s.is_active)
    setShowSubjectModal(true)
  }

  const handleSaveSubject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subName.trim() || !subCode.trim()) {
      alert('Please fill in Subject Name and Code.')
      return
    }
    setBusy(true)
    try {
      if (editingSubject) {
        await api.put(`/admin/academic/subjects/${editingSubject.id}`, {
          name: subName.trim(),
          code: subCode.trim().toUpperCase(),
          department_id: subDeptId === '' ? null : Number(subDeptId),
          course_id: subCourseId === '' ? null : Number(subCourseId),
          semester: Number(subSemester),
          credits: Number(subCredits),
          subject_type: subType,
          is_active: subIsActive,
        })
        setFeedback({ type: 'success', message: `Subject '${subName}' updated.` })
      } else {
        await api.post('/admin/academic/subjects', {
          name: subName.trim(),
          code: subCode.trim().toUpperCase(),
          department_id: subDeptId === '' ? null : Number(subDeptId),
          course_id: subCourseId === '' ? null : Number(subCourseId),
          semester: Number(subSemester),
          credits: Number(subCredits),
          subject_type: subType,
          is_active: subIsActive,
        })
        setFeedback({ type: 'success', message: `Subject '${subName}' created successfully.` })
      }
      setShowSubjectModal(false)
      loadSubjects()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const handleToggleSubjectStatus = async (s: SubjectItem) => {
    try {
      const res = await api.patch<{ is_active: boolean }>(`/admin/academic/subjects/${s.id}/status`)
      setFeedback({
        type: 'success',
        message: `Subject '${s.code}' is now ${res.data.is_active ? 'Active' : 'Inactive'}.`,
      })
      loadSubjects()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    }
  }

  const handleDeleteSubject = async (s: SubjectItem) => {
    if (!confirm(`Are you sure you want to delete '${s.name}' (${s.code})?`)) return
    try {
      await api.delete(`/admin/academic/subjects/${s.id}`)
      setFeedback({ type: 'success', message: `Subject '${s.name}' removed.` })
      loadSubjects()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    }
  }

  const handleAssignFacultySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!assigningSubject || !selectedFacultyId) return
    setBusy(true)
    try {
      await api.post(`/admin/academic/subjects/${assigningSubject.id}/assign-faculty`, {
        faculty_ids: [Number(selectedFacultyId)],
      })
      setFeedback({ type: 'success', message: 'Visiting faculty assigned to subject.' })
      setAssigningSubject(null)
      setSelectedFacultyId('')
      loadSubjects()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const handleUnassignFaculty = async (subId: number, facId: number, name: string) => {
    if (!confirm(`Remove ${name} from this subject assignment?`)) return
    try {
      await api.delete(`/admin/academic/subjects/${subId}/faculty/${facId}`)
      setFeedback({ type: 'success', message: `${name} unassigned from subject.` })
      loadSubjects()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    }
  }

  return (
    <div className="admin-page-container">
      {/* Page Header */}
      <div className="admin-page-header">
        <div className="admin-page-titles">
          <span className="admin-eyebrow">CURRICULUM & SYLLABUS MANAGEMENT</span>
          <h1>Course & Subject Management</h1>
          <p className="admin-page-desc">
            Organize degree programs, semesters, modular subjects, credit hours, and assign qualified visiting faculty.
          </p>
        </div>
        <div className="admin-header-actions">
          {activeTab === 'courses' ? (
            <button type="button" className="button button-primary" onClick={openAddCourse}>
              <Plus size={15} /> Add Degree Course
            </button>
          ) : (
            <button type="button" className="button button-primary" onClick={openAddSubject}>
              <Plus size={15} /> Add Subject
            </button>
          )}
          <button
            type="button"
            className="button button-secondary"
            onClick={activeTab === 'courses' ? loadCourses : loadSubjects}
          >
            <RefreshCw size={14} className={loading ? 'admin-spin mr-1' : 'mr-1'} /> Refresh
          </button>
        </div>
      </div>

      {/* Feedback Notice */}
      {feedback && (
        <div className={`notice notice-${feedback.type === 'success' ? 'success' : 'error'} mb-4`}>
          {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{feedback.message}</span>
          <button type="button" className="button-link ml-auto" onClick={() => setFeedback(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Profile Tabs Navigation */}
      <div
        className="admin-profile-tabs mb-4"
        style={{
          borderRadius: '10px 10px 0 0',
          border: '1px solid #e2e8f0',
          borderBottom: '2px solid #e2e8f0',
        }}
      >
        <button
          type="button"
          onClick={() => {
            setActiveTab('courses')
            setSearch('')
          }}
          className={`profile-tab-button ${activeTab === 'courses' ? 'tab-active' : ''}`}
        >
          <GraduationCap size={15} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />
          Degree Courses Directory
          <span className="nav-tab-counter">{courseSummary.total_courses}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('subjects')
            setSearch('')
          }}
          className={`profile-tab-button ${activeTab === 'subjects' ? 'tab-active' : ''}`}
        >
          <BookOpen size={15} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />
          Subjects & Faculty Allocations
          <span className="nav-tab-counter">{subjectSummary.total_subjects}</span>
        </button>
      </div>

      {/* TAB 1: COURSES DIRECTORY */}
      {activeTab === 'courses' && (
        <>
          {/* KPI Cards */}
          <div className="admin-kpi-grid mb-4">
            <div className="admin-kpi-card">
              <div className="admin-kpi-icon-wrap">
                <GraduationCap size={18} />
              </div>
              <div className="admin-kpi-content">
                <span className="admin-kpi-label">Offered Programs</span>
                <span className="admin-kpi-value">{courseSummary.total_courses}</span>
                <span className="admin-kpi-note">Degree / Diploma</span>
              </div>
            </div>

            <div className="admin-kpi-card kpi-border-green">
              <div className="admin-kpi-icon-wrap bg-green-subtle text-green">
                <CheckCircle2 size={18} />
              </div>
              <div className="admin-kpi-content">
                <span className="admin-kpi-label">Active Courses</span>
                <span className="admin-kpi-value text-green">{courseSummary.active_courses}</span>
                <span className="admin-kpi-note">Enrolling students</span>
              </div>
            </div>

            <div className="admin-kpi-card kpi-border-purple">
              <div className="admin-kpi-icon-wrap bg-purple-subtle text-purple">
                <Layers size={18} />
              </div>
              <div className="admin-kpi-content">
                <span className="admin-kpi-label">Departments Covered</span>
                <span className="admin-kpi-value text-purple">{courseSummary.total_departments_covered}</span>
                <span className="admin-kpi-note">Academic faculties</span>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="panel p-4 mb-4">
            <div className="admin-filters-flex">
              <div className="admin-search-box flex-1">
                <Search size={15} className="text-muted" />
                <input
                  type="text"
                  placeholder="Search courses by name or code..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadCourses()}
                />
              </div>

              <div className="admin-filter-group">
                <select
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  className="admin-select"
                >
                  <option value="all">All Departments</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="admin-select"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive Only</option>
                </select>

                <button type="button" className="button button-primary" onClick={loadCourses}>
                  Filter
                </button>
              </div>
            </div>
          </div>

          {/* Courses Table */}
          <div className="panel admin-table-panel">
            <div className="table-scroll">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>Degree Program</th>
                    <th>Code</th>
                    <th>Department</th>
                    <th>Duration</th>
                    <th>Semesters</th>
                    <th>Subjects</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="text-center py-8 muted">
                        <RefreshCw className="admin-spin inline mr-2" size={16} />
                        Loading degree courses...
                      </td>
                    </tr>
                  ) : courses.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-10 muted">
                        <GraduationCap size={32} className="mx-auto mb-2 text-muted" />
                        <strong>No degree courses found matching your criteria.</strong>
                        <div className="mt-2">
                          <button type="button" className="button button-primary button-sm" onClick={openAddCourse}>
                            <Plus size={13} /> Add First Course
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    courses.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.name}</strong>
                          {c.description && <div className="text-xs text-muted">{c.description}</div>}
                        </td>
                        <td>
                          <span className="faculty-code-tag" style={{ fontWeight: 700 }}>
                            {c.code}
                          </span>
                        </td>
                        <td>
                          <span className="dept-tag">{c.department_name}</span>
                        </td>
                        <td style={{ fontSize: 12 }}>{c.duration_years} Years</td>
                        <td style={{ fontSize: 12 }}>{c.total_semesters} Semesters</td>
                        <td>
                          <span style={{ fontSize: 12, fontWeight: 700 }}>{c.subject_count} Subjects</span>
                        </td>
                        <td>
                          <span className={`badge ${c.is_active ? 'badge-approved' : 'badge-not_enrolled'}`}>
                            {c.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="admin-inline-actions" style={{ justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="button button-secondary button-sm"
                              onClick={() => openEditCourse(c)}
                              title="Edit course details"
                            >
                              <Edit3 size={13} /> Edit
                            </button>
                            <button
                              type="button"
                              className={`button ${c.is_active ? 'button-secondary' : 'button-primary'} button-sm`}
                              onClick={() => handleToggleCourseStatus(c)}
                              title={c.is_active ? 'Deactivate course' : 'Activate course'}
                            >
                              <Power size={13} />
                            </button>
                            <button
                              type="button"
                              className="button button-danger button-sm"
                              onClick={() => handleDeleteCourse(c)}
                              title="Delete course"
                            >
                              <Trash2 size={13} />
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
        </>
      )}

      {/* TAB 2: SUBJECTS & CURRICULUM */}
      {activeTab === 'subjects' && (
        <>
          {/* KPI Cards */}
          <div className="admin-kpi-grid mb-4">
            <div className="admin-kpi-card">
              <div className="admin-kpi-icon-wrap">
                <BookOpen size={18} />
              </div>
              <div className="admin-kpi-content">
                <span className="admin-kpi-label">Active Subjects</span>
                <span className="admin-kpi-value">{subjectSummary.total_subjects}</span>
                <span className="admin-kpi-note">Curriculum units</span>
              </div>
            </div>

            <div className="admin-kpi-card kpi-border-green">
              <div className="admin-kpi-icon-wrap bg-green-subtle text-green">
                <FileText size={18} />
              </div>
              <div className="admin-kpi-content">
                <span className="admin-kpi-label">Theory Modules</span>
                <span className="admin-kpi-value text-green">{subjectSummary.theory_count}</span>
                <span className="admin-kpi-note">Lecture courses</span>
              </div>
            </div>

            <div className="admin-kpi-card kpi-border-purple">
              <div className="admin-kpi-icon-wrap bg-purple-subtle text-purple">
                <Clock size={18} />
              </div>
              <div className="admin-kpi-content">
                <span className="admin-kpi-label">Labs / Practicals</span>
                <span className="admin-kpi-value text-purple">{subjectSummary.lab_count}</span>
                <span className="admin-kpi-note">Hands-on courses</span>
              </div>
            </div>

            <div className="admin-kpi-card kpi-border-amber">
              <div className="admin-kpi-icon-wrap bg-amber-subtle text-amber">
                <AlertCircle size={18} />
              </div>
              <div className="admin-kpi-content">
                <span className="admin-kpi-label">Unassigned</span>
                <span className="admin-kpi-value text-amber">{subjectSummary.unassigned_count}</span>
                <span className="admin-kpi-note">Needs visiting faculty</span>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="panel p-4 mb-4">
            <div className="admin-filters-flex">
              <div className="admin-search-box flex-1">
                <Search size={15} className="text-muted" />
                <input
                  type="text"
                  placeholder="Search subjects by name or code..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadSubjects()}
                />
              </div>

              <div className="admin-filter-group">
                <select
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  className="admin-select"
                >
                  <option value="all">All Departments</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>

                <select
                  value={courseFilter}
                  onChange={(e) => setCourseFilter(e.target.value)}
                  className="admin-select"
                >
                  <option value="all">All Courses</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>

                <select
                  value={semesterFilter}
                  onChange={(e) => setSemesterFilter(e.target.value)}
                  className="admin-select"
                >
                  <option value="all">All Semesters</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                    <option key={s} value={s}>
                      Semester {s}
                    </option>
                  ))}
                </select>

                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="admin-select"
                >
                  <option value="all">All Types</option>
                  <option value="Theory">Theory</option>
                  <option value="Practical / Lab">Practical / Lab</option>
                  <option value="Seminar">Seminar</option>
                </select>

                <button type="button" className="button button-primary" onClick={loadSubjects}>
                  Filter
                </button>
              </div>
            </div>
          </div>

          {/* Subjects Table */}
          <div className="panel admin-table-panel">
            <div className="table-scroll">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Code</th>
                    <th>Course & Semester</th>
                    <th>Department</th>
                    <th>Credits</th>
                    <th>Type</th>
                    <th>Assigned Visiting Faculty</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="text-center py-8 muted">
                        <RefreshCw className="admin-spin inline mr-2" size={16} />
                        Loading subject catalog...
                      </td>
                    </tr>
                  ) : subjects.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-10 muted">
                        <BookOpen size={32} className="mx-auto mb-2 text-muted" />
                        <strong>No subjects found matching your filters.</strong>
                        <div className="mt-2">
                          <button type="button" className="button button-primary button-sm" onClick={openAddSubject}>
                            <Plus size={13} /> Add First Subject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    subjects.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <strong>{s.name}</strong>
                        </td>
                        <td>
                          <span className="faculty-code-tag" style={{ fontWeight: 700 }}>
                            {s.code}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontSize: 12 }}>
                            <strong>{s.course_name}</strong>
                            <div className="text-muted text-xs">Semester {s.semester}</div>
                          </div>
                        </td>
                        <td>
                          <span className="dept-tag">{s.department_name}</span>
                        </td>
                        <td style={{ fontSize: 12, fontWeight: 700 }}>{s.credits} Credits</td>
                        <td>
                          <span
                            className="dept-tag"
                            style={{
                              background: s.subject_type.includes('Lab') ? '#f5f3ff' : '#eff6ff',
                              color: s.subject_type.includes('Lab') ? '#7c3aed' : '#2563eb',
                              fontWeight: 600,
                            }}
                          >
                            {s.subject_type}
                          </span>
                        </td>
                        <td>
                          {s.assigned_faculty.length === 0 ? (
                            <span className="text-red" style={{ fontSize: 11, fontWeight: 600 }}>
                              Unassigned
                            </span>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {s.assigned_faculty.map((f) => (
                                <span
                                  key={f.id}
                                  className="dept-tag"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    fontSize: 10.5,
                                    padding: '2px 6px',
                                  }}
                                >
                                  {f.full_name}
                                  <button
                                    type="button"
                                    onClick={() => handleUnassignFaculty(s.id, f.id, f.full_name)}
                                    title="Unassign"
                                    style={{
                                      border: 'none',
                                      background: 'transparent',
                                      cursor: 'pointer',
                                      color: '#dc2626',
                                      padding: 0,
                                      display: 'grid',
                                      placeItems: 'center',
                                    }}
                                  >
                                    <X size={10} />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${s.is_active ? 'badge-approved' : 'badge-not_enrolled'}`}>
                            {s.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="admin-inline-actions" style={{ justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="button button-primary button-sm"
                              onClick={() => {
                                setAssigningSubject(s)
                                setSelectedFacultyId('')
                              }}
                              title="Assign visiting faculty"
                            >
                              <UserPlus size={12} /> Assign
                            </button>
                            <button
                              type="button"
                              className="button button-secondary button-sm"
                              onClick={() => openEditSubject(s)}
                              title="Edit subject"
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              type="button"
                              className={`button ${s.is_active ? 'button-secondary' : 'button-primary'} button-sm`}
                              onClick={() => handleToggleSubjectStatus(s)}
                              title={s.is_active ? 'Deactivate' : 'Activate'}
                            >
                              <Power size={13} />
                            </button>
                            <button
                              type="button"
                              className="button button-danger button-sm"
                              onClick={() => handleDeleteSubject(s)}
                              title="Delete subject"
                            >
                              <Trash2 size={13} />
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
        </>
      )}

      {/* Modal: Add / Edit Course */}
      {showCourseModal && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal" style={{ maxWidth: 540 }}>
            <form onSubmit={handleSaveCourse}>
              <div className="admin-modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="admin-avatar">
                    <GraduationCap size={18} />
                  </div>
                  <div>
                    <h3 className="m-0 text-base font-bold">
                      {editingCourse ? 'Edit Degree Course' : 'Add Degree Course'}
                    </h3>
                    <span className="text-xs text-muted">Academic curriculum program</span>
                  </div>
                </div>
                <button type="button" className="icon-button" onClick={() => setShowCourseModal(false)}>
                  <X size={16} />
                </button>
              </div>

              <div className="admin-modal-body">
                <div className="admin-form-group">
                  <label className="admin-form-label">Course Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Bachelor of Technology in Computer Science"
                    value={courseName}
                    onChange={(e) => setCourseName(e.target.value)}
                    className="admin-textarea"
                    style={{ minHeight: 38, resize: 'none' }}
                  />
                </div>

                <div className="admin-form-group">
                  <label className="admin-form-label">Course Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. BTECH-CSE, MBA, BSC-DS"
                    value={courseCode}
                    onChange={(e) => setCourseCode(e.target.value.toUpperCase())}
                    className="admin-textarea"
                    style={{ minHeight: 38, resize: 'none', textTransform: 'uppercase', fontFamily: 'monospace' }}
                  />
                </div>

                <div className="admin-form-group">
                  <label className="admin-form-label">Managing Department</label>
                  <select
                    value={courseDeptId}
                    onChange={(e) => setCourseDeptId(e.target.value === '' ? '' : Number(e.target.value))}
                    className="admin-select"
                    style={{ width: '100%' }}
                  >
                    <option value="">— Select Department —</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div className="admin-form-group">
                    <label className="admin-form-label">Duration (Years)</label>
                    <input
                      type="number"
                      min={1}
                      max={6}
                      value={courseDuration}
                      onChange={(e) => setCourseDuration(Number(e.target.value))}
                      className="admin-textarea"
                      style={{ minHeight: 38, resize: 'none' }}
                    />
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">Total Semesters</label>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={courseSemesters}
                      onChange={(e) => setCourseSemesters(Number(e.target.value))}
                      className="admin-textarea"
                      style={{ minHeight: 38, resize: 'none' }}
                    />
                  </div>
                </div>

                <div className="admin-form-group">
                  <label className="admin-form-label">Description (Optional)</label>
                  <textarea
                    rows={2}
                    placeholder="Program highlights or degree objective..."
                    value={courseDesc}
                    onChange={(e) => setCourseDesc(e.target.value)}
                    className="admin-textarea"
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  <input
                    type="checkbox"
                    id="courseIsActive"
                    checked={courseIsActive}
                    onChange={(e) => setCourseIsActive(e.target.checked)}
                  />
                  <label htmlFor="courseIsActive" style={{ fontSize: 12.5, fontWeight: 600, color: '#334155' }}>
                    Active degree program (permits timetable lecture allocations)
                  </label>
                </div>
              </div>

              <div className="admin-modal-footer">
                <button type="button" className="button button-secondary" onClick={() => setShowCourseModal(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={busy} className="button button-primary">
                  {busy ? 'Saving...' : editingCourse ? 'Save Changes' : 'Create Course'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add / Edit Subject */}
      {showSubjectModal && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal" style={{ maxWidth: 560 }}>
            <form onSubmit={handleSaveSubject}>
              <div className="admin-modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="admin-avatar">
                    <BookOpen size={18} />
                  </div>
                  <div>
                    <h3 className="m-0 text-base font-bold">
                      {editingSubject ? 'Edit Curriculum Subject' : 'Add New Subject'}
                    </h3>
                    <span className="text-xs text-muted">Modular semester course</span>
                  </div>
                </div>
                <button type="button" className="icon-button" onClick={() => setShowSubjectModal(false)}>
                  <X size={16} />
                </button>
              </div>

              <div className="admin-modal-body">
                <div className="admin-form-group">
                  <label className="admin-form-label">Subject Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Distributed Database Systems"
                    value={subName}
                    onChange={(e) => setSubName(e.target.value)}
                    className="admin-textarea"
                    style={{ minHeight: 38, resize: 'none' }}
                  />
                </div>

                <div className="admin-form-group">
                  <label className="admin-form-label">Subject Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CS501, IT302"
                    value={subCode}
                    onChange={(e) => setSubCode(e.target.value.toUpperCase())}
                    className="admin-textarea"
                    style={{ minHeight: 38, resize: 'none', textTransform: 'uppercase', fontFamily: 'monospace' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div className="admin-form-group">
                    <label className="admin-form-label">Course</label>
                    <select
                      value={subCourseId}
                      onChange={(e) => setSubCourseId(e.target.value === '' ? '' : Number(e.target.value))}
                      className="admin-select"
                      style={{ width: '100%' }}
                    >
                      <option value="">— Select Course —</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">Department</label>
                    <select
                      value={subDeptId}
                      onChange={(e) => setSubDeptId(e.target.value === '' ? '' : Number(e.target.value))}
                      className="admin-select"
                      style={{ width: '100%' }}
                    >
                      <option value="">— Select Department —</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div className="admin-form-group">
                    <label className="admin-form-label">Semester</label>
                    <select
                      value={subSemester}
                      onChange={(e) => setSubSemester(Number(e.target.value))}
                      className="admin-select"
                      style={{ width: '100%' }}
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                        <option key={s} value={s}>
                          Sem {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">Credits</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={subCredits}
                      onChange={(e) => setSubCredits(Number(e.target.value))}
                      className="admin-textarea"
                      style={{ minHeight: 38, resize: 'none' }}
                    />
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">Subject Type</label>
                    <select
                      value={subType}
                      onChange={(e) => setSubType(e.target.value)}
                      className="admin-select"
                      style={{ width: '100%' }}
                    >
                      <option value="Theory">Theory</option>
                      <option value="Practical / Lab">Practical / Lab</option>
                      <option value="Seminar">Seminar</option>
                      <option value="Project">Project</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  <input
                    type="checkbox"
                    id="subIsActive"
                    checked={subIsActive}
                    onChange={(e) => setSubIsActive(e.target.checked)}
                  />
                  <label htmlFor="subIsActive" style={{ fontSize: 12.5, fontWeight: 600, color: '#334155' }}>
                    Active Subject (available for semester timetable scheduling)
                  </label>
                </div>
              </div>

              <div className="admin-modal-footer">
                <button type="button" className="button button-secondary" onClick={() => setShowSubjectModal(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={busy} className="button button-primary">
                  {busy ? 'Saving...' : editingSubject ? 'Save Changes' : 'Create Subject'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Assign Faculty to Subject */}
      {assigningSubject && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal" style={{ maxWidth: 480 }}>
            <form onSubmit={handleAssignFacultySubmit}>
              <div className="admin-modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="admin-avatar">
                    <UserPlus size={18} />
                  </div>
                  <div>
                    <h3 className="m-0 text-base font-bold">Assign Visiting Faculty</h3>
                    <span className="text-xs text-muted">
                      {assigningSubject.name} ({assigningSubject.code})
                    </span>
                  </div>
                </div>
                <button type="button" className="icon-button" onClick={() => setAssigningSubject(null)}>
                  <X size={16} />
                </button>
              </div>

              <div className="admin-modal-body">
                <div className="admin-form-group">
                  <label className="admin-form-label">Select Faculty Member *</label>
                  <select
                    required
                    value={selectedFacultyId}
                    onChange={(e) => setSelectedFacultyId(e.target.value === '' ? '' : Number(e.target.value))}
                    className="admin-select"
                    style={{ width: '100%' }}
                  >
                    <option value="">— Choose Visiting Faculty —</option>
                    {allFaculty.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.full_name} ({f.employee_id})
                      </option>
                    ))}
                  </select>
                  <small className="text-muted" style={{ fontSize: 10.5 }}>
                    Faculty member will be authorized to punch attendance for lectures of this subject.
                  </small>
                </div>

                {assigningSubject.assigned_faculty.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                      Currently Assigned:
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      {assigningSubject.assigned_faculty.map((af) => (
                        <span key={af.id} className="dept-tag">
                          {af.full_name} ({af.employee_id})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="admin-modal-footer">
                <button type="button" className="button button-secondary" onClick={() => setAssigningSubject(null)}>
                  Cancel
                </button>
                <button type="submit" disabled={busy || !selectedFacultyId} className="button button-primary">
                  {busy ? 'Assigning...' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

