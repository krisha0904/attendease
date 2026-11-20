import React, { useEffect, useState } from 'react'
import {
  AlertCircle, ArrowUpDown, Check, CheckCircle2, ChevronLeft, ChevronRight,
  Clock3, CreditCard, Download, Edit3, Eye, Lock, Mail, MapPin,
  Phone, RefreshCw, School, Search, ShieldCheck, Trash2,
  UserCheck, UserMinus, UserPlus, Users, X
} from 'lucide-react'
import { api, errorMessage, fetchJson } from './api'

interface FacultyItem {
  id: number
  employee_id: string
  full_name: string
  email: string
  phone: string | null
  gender: string | null
  department_id: number | null
  department_name: string | null
  designation: string | null
  qualification: string | null
  specialization: string | null
  experience_years: number | null
  date_of_joining: string | null
  is_active: boolean
  account_status: string
  face_enrolled: boolean
  face_enrollment_status: string
  profile_photo: string | null
  created_at: string | null
}

interface Department {
  id: number
  name: string
  code: string
}

interface FacultyProfileData {
  id: number
  personal_info: {
    full_name: string
    employee_id: string
    email: string
    phone: string | null
    gender: string | null
    address: string | null
    profile_photo: string | null
  }
  professional_info: {
    qualification: string | null
    specialization: string | null
    experience_years: number | null
    designation: string | null
    department_id: number | null
    department_name: string
    date_of_joining: string | null
    account_status: string
    is_active: boolean
  }
  assigned_subjects: Array<{
    id: number
    subject_id: number
    subject_name: string
    subject_code: string
    credits: number
    assigned_at: string | null
  }>
  lecture_schedule: Array<{
    id: number
    day_of_week: number
    day_name: string
    subject_name: string
    room_number: string
    start_time: string
    end_time: string
  }>
  attendance_history: Array<{
    id: number
    date: string
    status: string
    punch_in_time: string | null
    punch_out_time: string | null
    is_late: boolean
    late_by_minutes: number
    net_working_minutes: number
    face_verified: boolean
    geofence_verified: boolean
  }>
  leave_history: Array<{
    id: number
    start_date: string
    end_date: string
    leave_type: string
    days_count: number
    reason: string
    status: string
    review_remarks: string | null
    created_at: string | null
  }>
  availability: Array<{
    id: number
    day_of_week: number
    day_name: string
    start_time: string
    end_time: string
    is_available: boolean
    status: string
    notes: string | null
  }>
  face_registration: {
    face_enrolled: boolean
    enrollment_status: string
    recent_verifications: Array<{
      timestamp: string | null
      action: string
      result: string
      confidence_score: number | null
      liveness_score: number | null
    }>
  }
  workload_summary: {
    assigned_lectures_per_week: number
    total_completed_lectures: number
    total_teaching_hours: number
    payment_rate_per_hour: number
    estimated_earnings: number
  }
  account_activity: Array<{
    id: number
    login_time: string | null
    ip_address: string | null
    device_info: string | null
    is_active: boolean
  }>
}

export function VisitingFacultyPage({
  onNavigateToBiometrics,
}: {
  onNavigateToBiometrics?: () => void
}) {
  const [facultyList, setFacultyList] = useState<FacultyItem[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [faceFilter, setFaceFilter] = useState('all')
  const [sortBy, setSortBy] = useState('full_name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  // Modals
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState<FacultyItem | null>(null)
  const [viewingProfileId, setViewingProfileId] = useState<number | null>(null)
  const [profileData, setProfileData] = useState<FacultyProfileData | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [activeProfileTab, setActiveProfileTab] = useState<number>(1)

  // Add Faculty Form State
  const [formData, setFormData] = useState({
    auto_generate_id: true,
    employee_id: '',
    full_name: '',
    email: '',
    phone: '',
    gender: 'Male',
    department_id: '',
    designation: 'Visiting Faculty',
    qualification: '',
    specialization: '',
    experience_years: '2',
    date_of_joining: new Date().toISOString().split('T')[0],
    address: '',
    password: '',
  })
  const [formBusy, setFormBusy] = useState(false)
  const [formError, setFormError] = useState('')

  // Load Departments
  useEffect(() => {
    fetchJson<Department[]>('/admin/departments')
      .then((data) => setDepartments(data))
      .catch(() => {})
  }, [])

  // Load Faculty with filters
  const loadFaculty = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (searchTerm.trim()) params.set('search', searchTerm.trim())
      if (departmentFilter !== 'all') params.set('department_id', departmentFilter)
      if (statusFilter !== 'all') params.set('status_filter', statusFilter)
      if (faceFilter !== 'all') params.set('face_status', faceFilter)
      params.set('sort_by', sortBy)
      params.set('sort_order', sortOrder)
      params.set('page', String(page))
      params.set('limit', '10')

      const res = await fetchJson<{
        items: FacultyItem[]
        total: number
        page: number
        pages: number
      }>(`/admin/faculty?${params.toString()}`)

      setFacultyList(res.items)
      setTotal(res.total)
      setPages(res.pages)
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadFaculty()
  }, [searchTerm, departmentFilter, statusFilter, faceFilter, sortBy, sortOrder, page])

  // Open Full Profile View
  const handleViewProfile = async (id: number) => {
    setViewingProfileId(id)
    setProfileLoading(true)
    setActiveProfileTab(1)
    try {
      const data = await fetchJson<FacultyProfileData>(`/admin/faculty/${id}/profile`)
      setProfileData(data)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setProfileLoading(false)
    }
  }

  // Handle Add Faculty
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormBusy(true)
    setFormError('')
    try {
      const payload = {
        auto_generate_id: formData.auto_generate_id,
        employee_id: formData.auto_generate_id ? null : formData.employee_id.trim(),
        full_name: formData.full_name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim() || null,
        gender: formData.gender,
        department_id: formData.department_id ? Number(formData.department_id) : null,
        designation: formData.designation || 'Visiting Faculty',
        qualification: formData.qualification.trim() || null,
        specialization: formData.specialization.trim() || null,
        experience_years: formData.experience_years ? parseFloat(formData.experience_years) : 0,
        date_of_joining: formData.date_of_joining || null,
        address: formData.address.trim() || null,
        password: formData.password || null,
      }

      await api.post('/admin/faculty', payload)
      setActionSuccess('Visiting faculty registered successfully!')
      setShowAddModal(false)
      // Reset form
      setFormData({
        auto_generate_id: true,
        employee_id: '',
        full_name: '',
        email: '',
        phone: '',
        gender: 'Male',
        department_id: '',
        designation: 'Visiting Faculty',
        qualification: '',
        specialization: '',
        experience_years: '2',
        date_of_joining: new Date().toISOString().split('T')[0],
        address: '',
        password: '',
      })
      void loadFaculty()
    } catch (err) {
      setFormError(errorMessage(err))
    } finally {
      setFormBusy(false)
    }
  }

  // Handle Edit Faculty
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!showEditModal) return
    setFormBusy(true)
    setFormError('')
    try {
      await api.put(`/admin/faculty/${showEditModal.id}`, {
        full_name: showEditModal.full_name,
        phone: showEditModal.phone,
        gender: showEditModal.gender,
        department_id: showEditModal.department_id,
        qualification: showEditModal.qualification,
        specialization: showEditModal.specialization,
        experience_years: showEditModal.experience_years,
        date_of_joining: showEditModal.date_of_joining,
        address: '',
        designation: showEditModal.designation,
      })
      setActionSuccess('Faculty profile updated successfully!')
      setShowEditModal(null)
      void loadFaculty()
    } catch (err) {
      setFormError(errorMessage(err))
    } finally {
      setFormBusy(false)
    }
  }

  // Status Toggles
  const handleToggleStatus = async (faculty: FacultyItem, action: 'activate' | 'deactivate' | 'suspend') => {
    try {
      await api.post(`/admin/faculty/${faculty.id}/${action}`)
      setActionSuccess(`Faculty account status changed to ${action}d.`)
      void loadFaculty()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  // Safe Delete with historical records check
  const handleDelete = async (faculty: FacultyItem) => {
    if (!window.confirm(`Are you sure you want to delete ${faculty.full_name} (${faculty.employee_id})? If they have attendance records, deletion will be blocked.`)) {
      return
    }
    try {
      await api.delete(`/admin/faculty/${faculty.id}`)
      setActionSuccess(`Faculty record deleted successfully.`)
      void loadFaculty()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const profileTabs = [
    '1. Personal Info',
    '2. Professional Info',
    '3. Assigned Subjects',
    '4. Lecture Schedule',
    '5. Attendance History',
    '6. Leave History',
    '7. Availability',
    '8. Face Registration',
    '9. Workload Summary',
    '10. Account Activity',
  ]

  return (
    <div className="admin-page-container">
      {/* Page Header */}
      <div className="admin-page-header">
        <div className="admin-page-titles">
          <span className="admin-eyebrow">FACULTY DIRECTORY & PROFILES</span>
          <h1>Visiting Faculty Management</h1>
          <p className="admin-page-desc">
            Complete institutional roster of visiting faculty, credentials, subject mapping, and attendance history.
          </p>
        </div>
        <div className="admin-header-actions">
          <button
            type="button"
            className="button button-primary"
            onClick={() => setShowAddModal(true)}
          >
            <UserPlus size={15} /> Add Visiting Faculty
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => alert('Exporting directory to CSV...')}
          >
            <Download size={15} /> Export CSV
          </button>
        </div>
      </div>

      {actionSuccess && (
        <div className="notice notice-success mb-4">
          <Check size={16} />
          <span>{actionSuccess}</span>
          <button className="button-link ml-auto" onClick={() => setActionSuccess('')}><X size={14} /></button>
        </div>
      )}

      {error && (
        <div className="notice notice-error mb-4">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button className="button-link ml-auto" onClick={() => setError('')}><X size={14} /></button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="panel p-4 mb-4">
        <div className="admin-filters-flex">
          <div className="admin-search-box flex-1">
            <Search size={15} className="text-muted" />
            <input
              type="text"
              placeholder="Search by faculty name, ID, email, or phone..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1) }}
            />
          </div>

          <div className="admin-filter-group">
            <select
              value={departmentFilter}
              onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1) }}
              className="admin-select"
            >
              <option value="all">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
              className="admin-select"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>

            <select
              value={faceFilter}
              onChange={(e) => { setFaceFilter(e.target.value); setPage(1) }}
              className="admin-select"
            >
              <option value="all">All Biometric Status</option>
              <option value="approved">Face Approved</option>
              <option value="pending_approval">Pending Review</option>
              <option value="not_enrolled">Not Registered</option>
              <option value="rejected">Rejected</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value); setPage(1) }}
              className="admin-select"
            >
              <option value="full_name">Sort: Name</option>
              <option value="employee_id">Sort: Faculty ID</option>
              <option value="date_of_joining">Sort: Joining Date</option>
              <option value="created_at">Sort: Registration</option>
            </select>

            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
              }}
              title={`Sort ${sortOrder === 'asc' ? 'Descending' : 'Ascending'}`}
            >
              <ArrowUpDown size={14} />
              <span>{sortOrder === 'asc' ? 'A-Z' : 'Z-A'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Faculty Table */}
      <div className="panel admin-table-panel">
        <div className="table-scroll">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>Faculty</th>
                <th>Department</th>
                <th>Specialisation</th>
                <th>Contact Details</th>
                <th>Biometrics</th>
                <th>Account Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 muted">
                    <RefreshCw className="admin-spin inline-block mr-2" size={16} />
                    Loading visiting faculty...
                  </td>
                </tr>
              ) : facultyList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 muted">
                    <Users size={32} className="mx-auto mb-2 text-muted" />
                    <strong>No faculty records found matching your filters.</strong>
                    <div className="mt-2">
                      <button className="button button-primary" onClick={() => setShowAddModal(true)}>
                        <UserPlus size={14} /> Add First Faculty Member
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                facultyList.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <div className="faculty-row-identity">
                        <div className="faculty-avatar-circle">
                          {f.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <strong>{f.full_name}</strong>
                          <div className="faculty-code-tag">{f.employee_id}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="dept-tag">{f.department_name || 'Unassigned'}</span>
                    </td>
                    <td>
                      <div>{f.specialization || 'General'}</div>
                      <small className="muted">{f.qualification || 'Master’s / Ph.D.'}</small>
                    </td>
                    <td>
                      <div className="contact-meta">
                        <span><Mail size={12} className="inline mr-1 text-muted" />{f.email}</span>
                        {f.phone && <span><Phone size={12} className="inline mr-1 text-muted" />{f.phone}</span>}
                      </div>
                    </td>
                    <td>
                      {f.face_enrollment_status === 'approved' ? (
                        <span className="badge badge-approved"><CheckCircle2 size={12} /> Approved</span>
                      ) : f.face_enrollment_status === 'pending_approval' ? (
                        <span className="badge badge-pending"><Clock3 size={12} /> Review Pending</span>
                      ) : f.face_enrollment_status === 'rejected' ? (
                        <span className="badge badge-rejected"><X size={12} /> Rejected</span>
                      ) : (
                        <span className="badge badge-not_enrolled">Not Enrolled</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge badge-${f.account_status === 'active' ? 'approved' : f.account_status === 'suspended' ? 'rejected' : 'not_enrolled'}`}>
                        {f.account_status}
                      </span>
                    </td>
                    <td>
                      <div className="admin-inline-actions">
                        <button
                          type="button"
                          className="button button-secondary button-sm"
                          onClick={() => handleViewProfile(f.id)}
                          title="View complete 10-tab profile"
                        >
                          <Eye size={13} /> View
                        </button>
                        <button
                          type="button"
                          className="button button-secondary button-sm"
                          onClick={() => setShowEditModal(f)}
                          title="Edit details"
                        >
                          <Edit3 size={13} />
                        </button>

                        {/* Status Action Menu */}
                        {f.account_status === 'active' ? (
                          <>
                            <button
                              type="button"
                              className="button button-secondary button-sm"
                              onClick={() => handleToggleStatus(f, 'deactivate')}
                              title="Deactivate account"
                            >
                              <UserMinus size={13} />
                            </button>
                            <button
                              type="button"
                              className="button button-danger button-sm"
                              onClick={() => handleToggleStatus(f, 'suspend')}
                              title="Suspend account"
                            >
                              <Lock size={13} />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="button button-primary button-sm"
                            onClick={() => handleToggleStatus(f, 'activate')}
                            title="Activate account"
                          >
                            <UserCheck size={13} /> Activate
                          </button>
                        )}

                        <button
                          type="button"
                          className="button button-danger button-sm"
                          onClick={() => handleDelete(f)}
                          title="Delete faculty (protected if attendance records exist)"
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

        {/* Pagination Bar */}
        <div className="admin-pagination-bar">
          <span className="text-muted text-sm">
            Showing {facultyList.length} of {total} faculty members
          </span>
          <div className="pagination-controls">
            <button
              type="button"
              className="button button-secondary button-sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft size={14} /> Previous
            </button>
            <span className="pagination-page-indicator">
              Page {page} of {pages || 1}
            </span>
            <button
              type="button"
              className="button button-secondary button-sm"
              disabled={page >= pages}
              onClick={() => setPage(page + 1)}
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* 10-TAB FACULTY PROFILE MODAL */}
      {viewingProfileId !== null && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal admin-profile-modal">
            <div className="admin-modal-header">
              <div className="flex items-center gap-3">
                <div className="admin-avatar">
                  {profileData?.personal_info.full_name.charAt(0) || 'F'}
                </div>
                <div>
                  <h3 className="m-0 text-lg font-bold">
                    {profileData?.personal_info.full_name || 'Loading Profile...'}
                  </h3>
                  <span className="text-xs text-muted">
                    {profileData?.personal_info.employee_id} · {profileData?.professional_info.department_name}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setViewingProfileId(null)}
              >
                <X size={18} />
              </button>
            </div>

            {profileLoading || !profileData ? (
              <div className="p-8 text-center muted">
                <RefreshCw className="admin-spin inline mr-2" size={18} />
                Loading comprehensive faculty profile records...
              </div>
            ) : (
              <>
                {/* Profile Tabs Navigation */}
                <div className="admin-profile-tabs">
                  {profileTabs.map((tabLabel, idx) => {
                    const tabNumber = idx + 1
                    return (
                      <button
                        key={tabNumber}
                        type="button"
                        className={`profile-tab-button ${activeProfileTab === tabNumber ? 'tab-active' : ''}`}
                        onClick={() => setActiveProfileTab(tabNumber)}
                      >
                        {tabLabel}
                      </button>
                    )
                  })}
                </div>

                {/* Tab 1: Personal Info */}
                {activeProfileTab === 1 && (
                  <div className="profile-tab-content">
                    <div className="profile-grid">
                      <div className="profile-field">
                        <label>Full Name</label>
                        <strong>{profileData.personal_info.full_name}</strong>
                      </div>
                      <div className="profile-field">
                        <label>Faculty ID</label>
                        <strong>{profileData.personal_info.employee_id}</strong>
                      </div>
                      <div className="profile-field">
                        <label>Email Address</label>
                        <strong>{profileData.personal_info.email}</strong>
                      </div>
                      <div className="profile-field">
                        <label>Phone Number</label>
                        <strong>{profileData.personal_info.phone || '—'}</strong>
                      </div>
                      <div className="profile-field">
                        <label>Gender</label>
                        <strong>{profileData.personal_info.gender || '—'}</strong>
                      </div>
                      <div className="profile-field full-width">
                        <label>Residential / Contact Address</label>
                        <strong>{profileData.personal_info.address || 'No address registered on file.'}</strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 2: Professional Info */}
                {activeProfileTab === 2 && (
                  <div className="profile-tab-content">
                    <div className="profile-grid">
                      <div className="profile-field">
                        <label>Department</label>
                        <strong>{profileData.professional_info.department_name}</strong>
                      </div>
                      <div className="profile-field">
                        <label>Designation</label>
                        <strong>{profileData.professional_info.designation || 'Visiting Faculty'}</strong>
                      </div>
                      <div className="profile-field">
                        <label>Highest Qualification</label>
                        <strong>{profileData.professional_info.qualification || '—'}</strong>
                      </div>
                      <div className="profile-field">
                        <label>Area of Specialisation</label>
                        <strong>{profileData.professional_info.specialization || '—'}</strong>
                      </div>
                      <div className="profile-field">
                        <label>Teaching Experience</label>
                        <strong>{profileData.professional_info.experience_years ? `${profileData.professional_info.experience_years} Years` : '—'}</strong>
                      </div>
                      <div className="profile-field">
                        <label>Date of Joining</label>
                        <strong>{profileData.professional_info.date_of_joining || '—'}</strong>
                      </div>
                      <div className="profile-field">
                        <label>Account Status</label>
                        <span className={`badge badge-${profileData.professional_info.account_status === 'active' ? 'approved' : 'rejected'}`}>
                          {profileData.professional_info.account_status}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 3: Assigned Subjects */}
                {activeProfileTab === 3 && (
                  <div className="profile-tab-content">
                    {profileData.assigned_subjects.length === 0 ? (
                      <div className="p-6 text-center muted">No subjects currently assigned to this faculty member.</div>
                    ) : (
                      <table className="admin-data-table">
                        <thead>
                          <tr>
                            <th>Subject Code</th>
                            <th>Subject Title</th>
                            <th>Credits</th>
                            <th>Assigned Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profileData.assigned_subjects.map((sub) => (
                            <tr key={sub.id}>
                              <td><strong>{sub.subject_code}</strong></td>
                              <td>{sub.subject_name}</td>
                              <td>{sub.credits} Credits</td>
                              <td>{sub.assigned_at ? new Date(sub.assigned_at).toLocaleDateString() : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {/* Tab 4: Lecture Schedule */}
                {activeProfileTab === 4 && (
                  <div className="profile-tab-content">
                    {profileData.lecture_schedule.length === 0 ? (
                      <div className="p-6 text-center muted">No scheduled timetable lectures for this faculty.</div>
                    ) : (
                      <table className="admin-data-table">
                        <thead>
                          <tr>
                            <th>Day</th>
                            <th>Subject</th>
                            <th>Classroom</th>
                            <th>Time Window</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profileData.lecture_schedule.map((lec) => (
                            <tr key={lec.id}>
                              <td><strong>{lec.day_name}</strong></td>
                              <td>{lec.subject_name}</td>
                              <td>Room {lec.room_number}</td>
                              <td>{lec.start_time.slice(0, 5)} – {lec.end_time.slice(0, 5)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {/* Tab 5: Attendance History */}
                {activeProfileTab === 5 && (
                  <div className="profile-tab-content">
                    {profileData.attendance_history.length === 0 ? (
                      <div className="p-6 text-center muted">No historical attendance records logged yet.</div>
                    ) : (
                      <table className="admin-data-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Status</th>
                            <th>Punch In</th>
                            <th>Punch Out</th>
                            <th>Net Work Time</th>
                            <th>Verification</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profileData.attendance_history.map((att) => (
                            <tr key={att.id}>
                              <td><strong>{att.date}</strong></td>
                              <td><span className={`badge badge-${att.status}`}>{att.status}</span></td>
                              <td>{att.punch_in_time ? new Date(att.punch_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                              <td>{att.punch_out_time ? new Date(att.punch_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                              <td>{att.net_working_minutes ? `${Math.floor(att.net_working_minutes / 60)}h ${att.net_working_minutes % 60}m` : '—'}</td>
                              <td>
                                {att.face_verified && <span className="text-green mr-2" title="Face Verified"><ShieldCheck size={14} className="inline" /> Face</span>}
                                {att.geofence_verified && <span className="text-blue" title="GPS Verified"><MapPin size={14} className="inline" /> GPS</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {/* Tab 6: Leave History */}
                {activeProfileTab === 6 && (
                  <div className="profile-tab-content">
                    {profileData.leave_history.length === 0 ? (
                      <div className="p-6 text-center muted">No leave requests recorded for this faculty member.</div>
                    ) : (
                      <table className="admin-data-table">
                        <thead>
                          <tr>
                            <th>Leave Type</th>
                            <th>Date Range</th>
                            <th>Days</th>
                            <th>Reason</th>
                            <th>Status</th>
                            <th>Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profileData.leave_history.map((lv) => (
                            <tr key={lv.id}>
                              <td><strong>{lv.leave_type}</strong></td>
                              <td>{lv.start_date} to {lv.end_date}</td>
                              <td>{lv.days_count} Days</td>
                              <td>{lv.reason}</td>
                              <td><span className={`badge badge-${lv.status}`}>{lv.status}</span></td>
                              <td>{lv.review_remarks || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {/* Tab 7: Availability */}
                {activeProfileTab === 7 && (
                  <div className="profile-tab-content">
                    {profileData.availability.length === 0 ? (
                      <div className="p-6 text-center muted">No availability preferences registered yet.</div>
                    ) : (
                      <table className="admin-data-table">
                        <thead>
                          <tr>
                            <th>Day</th>
                            <th>Available Window</th>
                            <th>Status</th>
                            <th>Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profileData.availability.map((av) => (
                            <tr key={av.id}>
                              <td><strong>{av.day_name}</strong></td>
                              <td>{av.start_time.slice(0, 5)} – {av.end_time.slice(0, 5)}</td>
                              <td><span className={`badge badge-${av.status === 'approved' ? 'approved' : 'pending'}`}>{av.status}</span></td>
                              <td>{av.notes || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {/* Tab 8: Face Registration */}
                {activeProfileTab === 8 && (
                  <div className="profile-tab-content">
                    <div className="biometric-overview-box mb-4">
                      <div>
                        <strong>Enrollment Status:</strong>
                        <span className={`badge ml-2 badge-${profileData.face_registration.enrollment_status === 'approved' ? 'approved' : 'pending'}`}>
                          {profileData.face_registration.enrollment_status}
                        </span>
                        {onNavigateToBiometrics && (
                          <button
                            type="button"
                            className="button button-secondary button-sm ml-4"
                            onClick={() => {
                              setViewingProfileId(null)
                              onNavigateToBiometrics()
                            }}
                          >
                            Review in Face Approvals
                          </button>
                        )}
                      </div>
                      <div className="text-sm muted mt-1">
                        Encrypted MiniFASNet anti-spoofing and SFace facial embedding template.
                      </div>
                    </div>

                    <h4>Recent Biometric Verifications</h4>
                    {profileData.face_registration.recent_verifications.length === 0 ? (
                      <p className="muted">No biometric verification attempts logged.</p>
                    ) : (
                      <table className="admin-data-table">
                        <thead>
                          <tr>
                            <th>Timestamp</th>
                            <th>Action</th>
                            <th>Result</th>
                            <th>Confidence</th>
                            <th>Liveness Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profileData.face_registration.recent_verifications.map((v, i) => (
                            <tr key={i}>
                              <td>{v.timestamp ? new Date(v.timestamp).toLocaleString() : '—'}</td>
                              <td>{v.action}</td>
                              <td>
                                <span className={`badge badge-${v.result === 'pass' ? 'approved' : 'rejected'}`}>
                                  {v.result}
                                </span>
                              </td>
                              <td>{v.confidence_score !== null ? `${(v.confidence_score * 100).toFixed(1)}%` : '—'}</td>
                              <td>{v.liveness_score !== null ? `${(v.liveness_score * 100).toFixed(1)}%` : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {/* Tab 9: Workload Summary */}
                {activeProfileTab === 9 && (
                  <div className="profile-tab-content">
                    <div className="admin-kpi-grid">
                      <div className="admin-kpi-card">
                        <div className="admin-kpi-icon-wrap bg-blue-subtle text-blue">
                          <School size={18} />
                        </div>
                        <div className="admin-kpi-content">
                          <span className="admin-kpi-label">Assigned / Week</span>
                          <strong className="admin-kpi-value">{profileData.workload_summary.assigned_lectures_per_week}</strong>
                          <span className="admin-kpi-note">Weekly Timetable</span>
                        </div>
                      </div>

                      <div className="admin-kpi-card">
                        <div className="admin-kpi-icon-wrap bg-green-subtle text-green">
                          <CheckCircle2 size={18} />
                        </div>
                        <div className="admin-kpi-content">
                          <span className="admin-kpi-label">Completed Lectures</span>
                          <strong className="admin-kpi-value">{profileData.workload_summary.total_completed_lectures}</strong>
                          <span className="admin-kpi-note">Punch Verified</span>
                        </div>
                      </div>

                      <div className="admin-kpi-card">
                        <div className="admin-kpi-icon-wrap bg-indigo-subtle text-indigo">
                          <Clock3 size={18} />
                        </div>
                        <div className="admin-kpi-content">
                          <span className="admin-kpi-label">Total Teaching Hours</span>
                          <strong className="admin-kpi-value">{profileData.workload_summary.total_teaching_hours} hrs</strong>
                          <span className="admin-kpi-note">Calculated Work</span>
                        </div>
                      </div>

                      <div className="admin-kpi-card">
                        <div className="admin-kpi-icon-wrap bg-amber-subtle text-amber">
                          <CreditCard size={18} />
                        </div>
                        <div className="admin-kpi-content">
                          <span className="admin-kpi-label">Estimated Honorarium</span>
                          <strong className="admin-kpi-value">₹ {profileData.workload_summary.estimated_earnings.toLocaleString()}</strong>
                          <span className="admin-kpi-note">@ ₹{profileData.workload_summary.payment_rate_per_hour}/hr</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 10: Account Activity */}
                {activeProfileTab === 10 && (
                  <div className="profile-tab-content">
                    <h4>Recent Login Sessions & Security Events</h4>
                    {profileData.account_activity.length === 0 ? (
                      <p className="muted">No login sessions recorded on file.</p>
                    ) : (
                      <table className="admin-data-table">
                        <thead>
                          <tr>
                            <th>Login Timestamp</th>
                            <th>IP Address</th>
                            <th>Device / Browser Agent</th>
                            <th>Session Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profileData.account_activity.map((act) => (
                            <tr key={act.id}>
                              <td>{act.login_time ? new Date(act.login_time).toLocaleString() : '—'}</td>
                              <td>{act.ip_address || '127.0.0.1'}</td>
                              <td>{act.device_info || 'Browser User Agent'}</td>
                              <td>
                                <span className={`badge badge-${act.is_active ? 'approved' : 'not_enrolled'}`}>
                                  {act.is_active ? 'Active' : 'Closed'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                <div className="admin-modal-footer">
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setViewingProfileId(null)}
                  >
                    Close Profile
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ADD VISITING FACULTY MODAL */}
      {showAddModal && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal">
            <div className="admin-modal-header">
              <h3 className="m-0 text-lg font-bold flex items-center gap-2">
                <UserPlus size={18} /> Register New Visiting Faculty
              </h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowAddModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddSubmit}>
              <div className="admin-modal-body">
                {formError && (
                  <div className="notice notice-error mb-4">
                    <AlertCircle size={15} />
                    <span>{formError}</span>
                  </div>
                )}

                <div className="form-grid">
                  <div className="full-field">
                    <label className="checkbox-label mb-2">
                      <input
                        type="checkbox"
                        checked={formData.auto_generate_id}
                        onChange={(e) => setFormData({ ...formData, auto_generate_id: e.target.checked })}
                      />
                      <span>Automatically generate unique Faculty ID (e.g., VF-2026-0001)</span>
                    </label>
                  </div>

                  {!formData.auto_generate_id && (
                    <label>
                      Faculty ID (Unique) *
                      <input
                        type="text"
                        value={formData.employee_id}
                        onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                        required={!formData.auto_generate_id}
                        placeholder="e.g. VF-2026-0042"
                      />
                    </label>
                  )}

                  <label>
                    Full Name *
                    <input
                      type="text"
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      required
                      placeholder="Dr. Full Name"
                    />
                  </label>

                  <label>
                    Email Address *
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                      placeholder="faculty@college.edu"
                    />
                  </label>

                  <label>
                    Phone Number
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="+91 98765 43210"
                    />
                  </label>

                  <label>
                    Gender
                    <select
                      value={formData.gender}
                      onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                      className="admin-select w-full"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other / Not Specified</option>
                    </select>
                  </label>

                  <label>
                    Department
                    <select
                      value={formData.department_id}
                      onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
                      className="admin-select w-full"
                    >
                      <option value="">Select Department</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Highest Qualification
                    <input
                      type="text"
                      value={formData.qualification}
                      onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
                      placeholder="e.g. Ph.D. in Computer Science"
                    />
                  </label>

                  <label>
                    Specialisation
                    <input
                      type="text"
                      value={formData.specialization}
                      onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                      placeholder="e.g. Artificial Intelligence, VLSI"
                    />
                  </label>

                  <label>
                    Teaching Experience (Years)
                    <input
                      type="number"
                      step="0.5"
                      value={formData.experience_years}
                      onChange={(e) => setFormData({ ...formData, experience_years: e.target.value })}
                    />
                  </label>

                  <label>
                    Date of Joining
                    <input
                      type="date"
                      value={formData.date_of_joining}
                      onChange={(e) => setFormData({ ...formData, date_of_joining: e.target.value })}
                    />
                  </label>

                  <label className="full-field">
                    Address / Contact Residence
                    <textarea
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      rows={2}
                      placeholder="Residential address"
                    />
                  </label>
                </div>
              </div>

              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={formBusy}
                >
                  {formBusy ? 'Registering...' : 'Register Faculty Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT FACULTY MODAL */}
      {showEditModal && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal">
            <div className="admin-modal-header">
              <h3 className="m-0 text-lg font-bold flex items-center gap-2">
                <Edit3 size={18} /> Edit Faculty Profile
              </h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowEditModal(null)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit}>
              <div className="admin-modal-body">
                {formError && (
                  <div className="notice notice-error mb-4">
                    <AlertCircle size={15} />
                    <span>{formError}</span>
                  </div>
                )}

                <div className="form-grid">
                  <label>
                    Faculty ID
                    <input type="text" value={showEditModal.employee_id} disabled />
                  </label>

                  <label>
                    Full Name *
                    <input
                      type="text"
                      value={showEditModal.full_name}
                      onChange={(e) => setShowEditModal({ ...showEditModal, full_name: e.target.value })}
                      required
                    />
                  </label>

                  <label>
                    Phone Number
                    <input
                      type="tel"
                      value={showEditModal.phone || ''}
                      onChange={(e) => setShowEditModal({ ...showEditModal, phone: e.target.value })}
                    />
                  </label>

                  <label>
                    Department
                    <select
                      value={showEditModal.department_id || ''}
                      onChange={(e) => setShowEditModal({ ...showEditModal, department_id: Number(e.target.value) || null })}
                      className="admin-select w-full"
                    >
                      <option value="">Select Department</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Highest Qualification
                    <input
                      type="text"
                      value={showEditModal.qualification || ''}
                      onChange={(e) => setShowEditModal({ ...showEditModal, qualification: e.target.value })}
                    />
                  </label>

                  <label>
                    Specialisation
                    <input
                      type="text"
                      value={showEditModal.specialization || ''}
                      onChange={(e) => setShowEditModal({ ...showEditModal, specialization: e.target.value })}
                    />
                  </label>
                </div>
              </div>

              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setShowEditModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={formBusy}
                >
                  {formBusy ? 'Saving...' : 'Save Profile Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
