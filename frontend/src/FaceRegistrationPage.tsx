import React, { useEffect, useState } from 'react'
import {
  AlertCircle, AlertTriangle, Check, CheckCircle2, ChevronLeft, ChevronRight,
  Eye, Fingerprint, History, Info, RefreshCw, RotateCcw,
  Search, Shield, ShieldAlert, ShieldCheck, Users, X
} from 'lucide-react'
import { api, errorMessage, fetchJson } from './api'

interface EnrollmentItem {
  faculty_id: number
  faculty_name: string
  employee_id: string
  department: string
  department_id: number | null
  email: string
  phone: string | null
  enrollment_status: string
  has_template: boolean
  registration_date: string | null
  approval_status: string
  approved_by_name: string | null
  review_reason: string | null
  last_verification_date: string | null
  last_verification_result: string | null
  last_liveness_score: number | null
}

interface SummaryKPIs {
  total_faculty: number
  approved_count: number
  pending_count: number
  rejected_count: number
  re_enrollment_count: number
  not_enrolled_count: number
}

interface VerificationLogItem {
  id: number
  faculty_name: string
  employee_id: string
  department: string
  action: string
  result: string
  similarity_score: number | null
  liveness_score: number | null
  liveness_passed: boolean | null
  failure_reason: string | null
  ip_address: string | null
  created_at: string | null
}

interface SingleFacultyBiometricDetails {
  faculty: {
    id: number
    full_name: string
    employee_id: string
    department: string
    designation: string
    email: string
    phone: string | null
    face_enrollment_status: string
    face_enrolled: boolean
  }
  template: {
    id: number | null
    has_embedding: boolean
    enrollment_status: string
    enrolled_at: string | null
    approved_at: string | null
    approved_by_name: string | null
    revoke_reason: string | null
  }
  statistics: {
    total_attempts: number
    pass_count: number
    fail_count: number
    spoof_failures: number
    pass_rate: number
  }
  verification_history: Array<{
    id: number
    action: string
    result: string
    similarity_score: number | null
    liveness_score: number | null
    liveness_passed: boolean | null
    failure_reason: string | null
    ip_address: string | null
    created_at: string | null
  }>
  enrollment_audit: Array<{
    id: number
    status: string
    consented_at: string | null
    reviewed_at: string | null
    review_reason: string | null
  }>
}

interface Department {
  id: number
  name: string
  code: string
}

export function FaceRegistrationPage() {
  const [activeTab, setActiveTab] = useState<'enrollments' | 'pending' | 'audit'>('enrollments')
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Data states
  const [items, setItems] = useState<EnrollmentItem[]>([])
  const [summary, setSummary] = useState<SummaryKPIs>({
    total_faculty: 0,
    approved_count: 0,
    pending_count: 0,
    rejected_count: 0,
    re_enrollment_count: 0,
    not_enrolled_count: 0,
  })
  const [departments, setDepartments] = useState<Department[]>([])
  const [verifications, setVerifications] = useState<VerificationLogItem[]>([])

  // Filters & Pagination
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalRecords, setTotalRecords] = useState(0)

  // Verification filter states
  const [verifResultFilter, setVerifResultFilter] = useState('all')
  const [verifActionFilter, setVerifActionFilter] = useState('all')
  const [verifPage, setVerifPage] = useState(1)
  const [verifTotalPages, setVerifTotalPages] = useState(1)

  // Modals
  const [selectedFacultyId, setSelectedFacultyId] = useState<number | null>(null)
  const [facultyDetails, setFacultyDetails] = useState<SingleFacultyBiometricDetails | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)

  // Action modals
  const [rejectingFaculty, setRejectingFaculty] = useState<EnrollmentItem | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [actionBusy, setActionBusy] = useState(false)

  const [reEnrollingFaculty, setReEnrollingFaculty] = useState<EnrollmentItem | null>(null)
  const [reEnrollReason, setReEnrollReason] = useState('')

  // Load departments
  useEffect(() => {
    fetchJson<Department[]>('/departments')
      .then(setDepartments)
      .catch(() => {})
  }, [])

  // Load Enrollments Data
  const loadEnrollments = async (p = page) => {
    setLoading(true)
    try {
      const params: Record<string, string> = {
        page: String(p),
        limit: '15',
      }
      if (search.trim()) params.search = search.trim()
      if (departmentFilter !== 'all') params.department_id = departmentFilter

      if (activeTab === 'pending') {
        params.status = 'pending_approval'
      } else if (statusFilter !== 'all') {
        params.status = statusFilter
      }

      const res = await fetchJson<{
        summary: SummaryKPIs
        total: number
        page: number
        limit: number
        pages: number
        items: EnrollmentItem[]
      }>('/admin/biometrics/enrollments', params)

      setItems(res.items)
      setSummary(res.summary)
      setTotalPages(res.pages)
      setTotalRecords(res.total)
      setPage(res.page)
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setLoading(false)
    }
  }

  // Load Verification Logs
  const loadVerifications = async (p = verifPage) => {
    setLoading(true)
    try {
      const params: Record<string, string> = {
        page: String(p),
        limit: '20',
      }
      if (search.trim()) params.search = search.trim()
      if (verifResultFilter !== 'all') params.result = verifResultFilter
      if (verifActionFilter !== 'all') params.action = verifActionFilter

      const res = await fetchJson<{
        total: number
        page: number
        limit: number
        pages: number
        items: VerificationLogItem[]
      }>('/admin/biometrics/verifications', params)

      setVerifications(res.items)
      setVerifTotalPages(res.pages)
      setVerifPage(res.page)
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'audit') {
      loadVerifications(1)
    } else {
      loadEnrollments(1)
    }
  }, [activeTab, statusFilter, departmentFilter, verifResultFilter, verifActionFilter])

  // Open Details Modal
  const openFacultyDetails = async (facultyId: number) => {
    setSelectedFacultyId(facultyId)
    setDetailsLoading(true)
    try {
      const res = await fetchJson<SingleFacultyBiometricDetails>(`/admin/biometrics/enrollments/${facultyId}`)
      setFacultyDetails(res)
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
      setSelectedFacultyId(null)
    } finally {
      setDetailsLoading(false)
    }
  }

  // Action: Approve
  const handleApprove = async (facultyId: number, facultyName: string) => {
    if (!confirm(`Are you sure you want to approve face biometric enrollment for ${facultyName}?`)) return
    setActionBusy(true)
    try {
      await api.post(`/admin/biometrics/enrollments/${facultyId}/approve`)
      setFeedback({ type: 'success', message: `Biometric enrollment for ${facultyName} approved successfully.` })
      if (selectedFacultyId === facultyId) {
        openFacultyDetails(facultyId)
      }
      loadEnrollments(page)
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setActionBusy(false)
    }
  }

  // Action: Reject
  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!rejectingFaculty) return
    if (!rejectReason.trim()) {
      alert('Please provide a reason for rejecting this face biometric enrollment.')
      return
    }
    setActionBusy(true)
    try {
      await api.post(`/admin/biometrics/enrollments/${rejectingFaculty.faculty_id}/reject`, {
        reason: rejectReason.trim(),
      })
      setFeedback({ type: 'success', message: `Enrollment for ${rejectingFaculty.faculty_name} rejected.` })
      setRejectingFaculty(null)
      setRejectReason('')
      if (selectedFacultyId === rejectingFaculty.faculty_id) {
        openFacultyDetails(rejectingFaculty.faculty_id)
      }
      loadEnrollments(page)
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setActionBusy(false)
    }
  }

  // Action: Request Re-Enrollment
  const handleReEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reEnrollingFaculty) return
    setActionBusy(true)
    try {
      await api.post(`/admin/biometrics/enrollments/${reEnrollingFaculty.faculty_id}/request-re-enrollment`, {
        reason: reEnrollReason.trim() || undefined,
      })
      setFeedback({ type: 'success', message: `Re-enrollment requested for ${reEnrollingFaculty.faculty_name}. Old template was cleared.` })
      setReEnrollingFaculty(null)
      setReEnrollReason('')
      if (selectedFacultyId === reEnrollingFaculty.faculty_id) {
        openFacultyDetails(reEnrollingFaculty.faculty_id)
      }
      loadEnrollments(page)
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setActionBusy(false)
    }
  }

  // Format status badge
  const renderStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'approved':
        return (
          <span className="badge badge-approved">
            <CheckCircle2 size={12} /> Approved
          </span>
        )
      case 'pending_approval':
        return (
          <span className="badge badge-pending">
            <AlertCircle size={12} /> Pending Approval
          </span>
        )
      case 'rejected':
        return (
          <span className="badge badge-rejected">
            <X size={12} /> Rejected
          </span>
        )
      case 're_enrollment_required':
        return (
          <span className="badge badge-re_enrollment_required">
            <RotateCcw size={12} /> Re-Enrollment Required
          </span>
        )
      default:
        return (
          <span className="badge badge-not_enrolled">
            <Fingerprint size={12} /> Not Registered
          </span>
        )
    }
  }

  return (
    <div className="admin-page-container">
      {/* Page Header */}
      <div className="admin-page-header">
        <div className="admin-page-titles">
          <span className="admin-eyebrow">Biometric Security & Access Control</span>
          <h1>Face Registration Management</h1>
          <p className="admin-page-desc">
            Review facial enrollment templates, verify anti-spoofing and liveness scores, and manage biometric access.
          </p>
        </div>

        <div className="admin-header-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              if (activeTab === 'audit') loadVerifications(verifPage)
              else loadEnrollments(page)
            }}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'admin-spin mr-1' : 'mr-1'} />
            Refresh
          </button>
        </div>
      </div>

      {/* Security & Anti-Spoof Policy Banner */}
      <div className="biometric-info-banner">
        <Info size={18} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <strong>Anti-Spoofing & Account Template Binding:</strong> Each biometric template is encrypted with AES-128 (Fernet) and linked strictly to the authenticated faculty member's profile. During punch-in, facial captures are compared strictly against that member's approved template with passive liveness & eye/head motion challenges. Cross-account punches are rejected and logged.
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

      {/* KPI Cards */}
      <div className="admin-kpi-grid-6">
        <div className="admin-kpi-card">
          <div className="admin-kpi-icon-wrap">
            <Users size={18} />
          </div>
          <div className="admin-kpi-content">
            <span className="admin-kpi-label">Total Faculty</span>
            <span className="admin-kpi-value">{summary.total_faculty}</span>
            <span className="admin-kpi-note">Teaching staff</span>
          </div>
        </div>

        <div className="admin-kpi-card kpi-border-green">
          <div className="admin-kpi-icon-wrap bg-green-subtle text-green">
            <CheckCircle2 size={18} />
          </div>
          <div className="admin-kpi-content">
            <span className="admin-kpi-label">Approved</span>
            <span className="admin-kpi-value text-green">{summary.approved_count}</span>
            <span className="admin-kpi-note">Ready for punch-in</span>
          </div>
        </div>

        <div
          className="admin-kpi-card kpi-border-amber kpi-card-interactive"
          onClick={() => {
            setActiveTab('pending')
            setStatusFilter('pending_approval')
          }}
          title="Click to view pending approvals queue"
        >
          <div className="admin-kpi-icon-wrap bg-amber-subtle text-amber">
            <AlertCircle size={18} />
          </div>
          <div className="admin-kpi-content">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="admin-kpi-label">Pending Review</span>
              {summary.pending_count > 0 && <span className="pulse-indicator" />}
            </div>
            <span className="admin-kpi-value text-amber">{summary.pending_count}</span>
            <span className="admin-kpi-note">Needs admin action</span>
          </div>
        </div>

        <div className="admin-kpi-card kpi-border-red">
          <div className="admin-kpi-icon-wrap bg-red-subtle text-red">
            <X size={18} />
          </div>
          <div className="admin-kpi-content">
            <span className="admin-kpi-label">Rejected</span>
            <span className="admin-kpi-value text-red">{summary.rejected_count}</span>
            <span className="admin-kpi-note">Failed quality check</span>
          </div>
        </div>

        <div className="admin-kpi-card kpi-border-purple">
          <div className="admin-kpi-icon-wrap bg-purple-subtle text-purple">
            <RotateCcw size={18} />
          </div>
          <div className="admin-kpi-content">
            <span className="admin-kpi-label">Re-Enrollment</span>
            <span className="admin-kpi-value text-purple">{summary.re_enrollment_count}</span>
            <span className="admin-kpi-note">Template reset</span>
          </div>
        </div>

        <div className="admin-kpi-card kpi-border-slate">
          <div className="admin-kpi-icon-wrap" style={{ background: '#f1f5f9', color: '#64748b' }}>
            <Fingerprint size={18} />
          </div>
          <div className="admin-kpi-content">
            <span className="admin-kpi-label">Not Registered</span>
            <span className="admin-kpi-value" style={{ color: '#64748b' }}>{summary.not_enrolled_count}</span>
            <span className="admin-kpi-note">No template yet</span>
          </div>
        </div>
      </div>

      {/* Tabs navigation */}
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
            setActiveTab('enrollments')
            setStatusFilter('all')
          }}
          className={`profile-tab-button ${activeTab === 'enrollments' ? 'tab-active' : ''}`}
        >
          <Fingerprint size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />
          Face Registrations Directory
          <span className="nav-tab-counter">{summary.total_faculty}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('pending')
            setStatusFilter('pending_approval')
          }}
          className={`profile-tab-button ${activeTab === 'pending' ? 'tab-active' : ''}`}
        >
          <AlertCircle size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />
          Pending Approvals Queue
          {summary.pending_count > 0 && (
            <span className="nav-tab-counter nav-tab-counter-highlight">{summary.pending_count}</span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className={`profile-tab-button ${activeTab === 'audit' ? 'tab-active' : ''}`}
        >
          <History size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />
          Live Verification Audit Feed
        </button>
      </div>

      {/* Tab 1 & Tab 2: Enrollments / Pending View */}
      {activeTab !== 'audit' && (
        <>
          {/* Filters Bar */}
          <div className="panel p-4 mb-4">
            <div className="admin-filters-flex">
              <div className="admin-search-box flex-1">
                <Search size={15} className="text-muted" />
                <input
                  type="text"
                  placeholder="Search faculty name, ID, or email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadEnrollments(1)}
                />
              </div>

              <div className="admin-filter-group">
                {activeTab === 'enrollments' && (
                  <select
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value)
                      setPage(1)
                    }}
                    className="admin-select"
                  >
                    <option value="all">All Biometric Statuses</option>
                    <option value="pending_approval">Pending Approval</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="re_enrollment_required">Re-Enrollment Required</option>
                    <option value="not_enrolled">Not Registered</option>
                  </select>
                )}

                <select
                  value={departmentFilter}
                  onChange={(e) => {
                    setDepartmentFilter(e.target.value)
                    setPage(1)
                  }}
                  className="admin-select"
                >
                  <option value="all">All Departments</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => loadEnrollments(1)}
                  className="button button-primary"
                >
                  Filter
                </button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="panel admin-table-panel">
            <div className="table-scroll">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>Faculty Member</th>
                    <th>Faculty ID</th>
                    <th>Department</th>
                    <th>Registration Date</th>
                    <th>Enrollment Status</th>
                    <th>Approval Status</th>
                    <th>Last Verification</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="text-center py-8 muted">
                        <RefreshCw className="admin-spin inline mr-2" size={16} />
                        Loading face biometric records...
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-10 muted">
                        <Fingerprint size={32} className="mx-auto mb-2 text-muted" />
                        <strong>No faculty biometric records matched your criteria.</strong>
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr key={item.faculty_id}>
                        {/* Faculty Name */}
                        <td>
                          <div className="faculty-row-identity">
                            <div className="faculty-avatar-circle">
                              {item.faculty_name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <strong>{item.faculty_name}</strong>
                              <div className="text-xs text-muted">{item.email}</div>
                            </div>
                          </div>
                        </td>

                        {/* ID */}
                        <td>
                          <span className="faculty-code-tag">{item.employee_id}</span>
                        </td>

                        {/* Department */}
                        <td>
                          <span className="dept-tag">{item.department || 'Unassigned'}</span>
                        </td>

                        {/* Registration Date */}
                        <td>
                          {item.registration_date ? (
                            <span style={{ fontSize: 12 }}>
                              {new Date(item.registration_date).toLocaleDateString(undefined, {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                          ) : (
                            <span className="text-muted italic" style={{ fontSize: 11 }}>Not enrolled</span>
                          )}
                        </td>

                        {/* Status */}
                        <td>
                          {renderStatusBadge(item.enrollment_status)}
                        </td>

                        {/* Approval Info */}
                        <td>
                          {item.approved_by_name ? (
                            <span style={{ fontSize: 11, color: '#334155' }}>
                              By <strong>{item.approved_by_name}</strong>
                            </span>
                          ) : item.review_reason ? (
                            <span className="text-red" style={{ fontSize: 11 }} title={item.review_reason}>
                              {item.review_reason.length > 25 ? `${item.review_reason.slice(0, 25)}...` : item.review_reason}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>

                        {/* Last Verification Date */}
                        <td>
                          {item.last_verification_date ? (
                            <div style={{ fontSize: 11 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span
                                  style={{
                                    width: 7,
                                    height: 7,
                                    borderRadius: '50%',
                                    background: item.last_verification_result === 'pass' ? '#16a34a' : '#dc2626',
                                    display: 'inline-block',
                                  }}
                                />
                                {new Date(item.last_verification_date).toLocaleDateString(undefined, {
                                  day: '2-digit',
                                  month: 'short',
                                })}{' '}
                                {new Date(item.last_verification_date).toLocaleTimeString(undefined, {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </div>
                              {item.last_liveness_score !== null && (
                                <span className="text-muted" style={{ fontSize: 10 }}>
                                  Liveness: {Math.round(item.last_liveness_score * 100)}%
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted" style={{ fontSize: 11 }}>No attempts</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td style={{ textAlign: 'right' }}>
                          <div className="admin-inline-actions" style={{ justifyContent: 'flex-end' }}>
                            {/* View Details */}
                            <button
                              type="button"
                              onClick={() => openFacultyDetails(item.faculty_id)}
                              title="View Biometric Profile & Logs"
                              className="button button-secondary button-sm"
                            >
                              <Eye size={13} /> View
                            </button>

                            {/* Approve (for pending) */}
                            {item.enrollment_status === 'pending_approval' && (
                              <button
                                type="button"
                                onClick={() => handleApprove(item.faculty_id, item.faculty_name)}
                                disabled={actionBusy}
                                title="Approve Biometrics"
                                className="button button-primary button-sm"
                              >
                                <Check size={13} /> Approve
                              </button>
                            )}

                            {/* Reject (for pending or approved) */}
                            {(item.enrollment_status === 'pending_approval' || item.enrollment_status === 'approved') && (
                              <button
                                type="button"
                                onClick={() => setRejectingFaculty(item)}
                                title="Reject Biometrics"
                                className="button button-danger button-sm"
                              >
                                <X size={13} /> Reject
                              </button>
                            )}

                            {/* Request Re-registration */}
                            {(item.enrollment_status === 'approved' || item.enrollment_status === 'rejected') && (
                              <button
                                type="button"
                                onClick={() => setReEnrollingFaculty(item)}
                                title="Request Re-Registration (Reset Template)"
                                className="button button-secondary button-sm text-purple"
                              >
                                <RotateCcw size={13} /> Re-Enroll
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            <div className="admin-pagination-bar">
              <span className="text-muted text-sm">
                Showing {items.length} of {totalRecords} faculty members
              </span>
              <div className="pagination-controls">
                <button
                  type="button"
                  className="button button-secondary button-sm"
                  disabled={page <= 1 || loading}
                  onClick={() => loadEnrollments(page - 1)}
                >
                  <ChevronLeft size={14} /> Previous
                </button>
                <span className="pagination-page-indicator">
                  Page {page} of {totalPages || 1}
                </span>
                <button
                  type="button"
                  className="button button-secondary button-sm"
                  disabled={page >= totalPages || loading}
                  onClick={() => loadEnrollments(page + 1)}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Tab 3: Verification & Anti-Spoof Audit Feed */}
      {activeTab === 'audit' && (
        <>
          <div className="panel p-4 mb-4">
            <div className="admin-filters-flex">
              <div className="admin-search-box flex-1">
                <Search size={15} className="text-muted" />
                <input
                  type="text"
                  placeholder="Search faculty name, ID, or failure reason..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadVerifications(1)}
                />
              </div>

              <div className="admin-filter-group">
                <select
                  value={verifResultFilter}
                  onChange={(e) => {
                    setVerifResultFilter(e.target.value)
                    setVerifPage(1)
                  }}
                  className="admin-select"
                >
                  <option value="all">All Verification Results</option>
                  <option value="pass">Pass Only</option>
                  <option value="fail">Fail (Mismatch / Spoof)</option>
                  <option value="error">Error</option>
                </select>

                <select
                  value={verifActionFilter}
                  onChange={(e) => {
                    setVerifActionFilter(e.target.value)
                    setVerifPage(1)
                  }}
                  className="admin-select"
                >
                  <option value="all">All Actions</option>
                  <option value="punch_in">Punch-In</option>
                  <option value="punch_out">Punch-Out</option>
                  <option value="enrollment">Enrollment</option>
                </select>

                <button
                  type="button"
                  onClick={() => loadVerifications(1)}
                  className="button button-primary"
                >
                  Filter Audit Logs
                </button>
              </div>
            </div>
          </div>

          {/* Audit Logs Table */}
          <div className="panel admin-table-panel">
            <div className="table-scroll">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Faculty Member</th>
                    <th>Action</th>
                    <th>Result</th>
                    <th>Cosine Similarity</th>
                    <th>Liveness Score</th>
                    <th>Anti-Spoof Check</th>
                    <th>Reason / Failure Details</th>
                    <th>Client IP</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="text-center py-8 muted">
                        <RefreshCw className="admin-spin inline mr-2" size={16} />
                        Loading verification events...
                      </td>
                    </tr>
                  ) : verifications.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-10 muted">
                        <ShieldCheck size={32} className="mx-auto mb-2 text-muted" />
                        <strong>No verification events match this filter.</strong>
                      </td>
                    </tr>
                  ) : (
                    verifications.map((v) => (
                      <tr key={v.id}>
                        <td className="faculty-code-tag">
                          {v.created_at ? (
                            <>
                              {new Date(v.created_at).toLocaleDateString(undefined, {
                                day: '2-digit',
                                month: 'short',
                              })}{' '}
                              {new Date(v.created_at).toLocaleTimeString(undefined, {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <strong>{v.faculty_name}</strong>
                          <div className="faculty-code-tag">{v.employee_id} · {v.department}</div>
                        </td>
                        <td style={{ textTransform: 'capitalize' }}>
                          {v.action.replace('_', ' ')}
                        </td>
                        <td>
                          {v.result === 'pass' ? (
                            <span className="badge badge-approved">
                              <CheckCircle2 size={11} /> Pass
                            </span>
                          ) : v.result === 'fail' ? (
                            <span className="badge badge-rejected">
                              <ShieldAlert size={11} /> Failed
                            </span>
                          ) : (
                            <span className="badge badge-pending">Error</span>
                          )}
                        </td>
                        <td className="faculty-code-tag">
                          {v.similarity_score !== null ? (
                            <strong className={v.similarity_score >= 0.363 ? 'text-green' : 'text-red'}>
                              {v.similarity_score}
                            </strong>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="faculty-code-tag">
                          {v.liveness_score !== null ? (
                            <span>{Math.round(v.liveness_score * 100)}%</span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td>
                          {v.liveness_passed === true ? (
                            <span className="text-green" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600, fontSize: 11 }}>
                              <Check size={12} /> Verified
                            </span>
                          ) : v.liveness_passed === false ? (
                            <span className="text-red" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, fontSize: 11 }}>
                              <ShieldAlert size={12} /> Spoof Flagged
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="text-red" style={{ fontSize: 11 }}>
                          {v.failure_reason || <span className="text-muted">—</span>}
                        </td>
                        <td className="faculty-code-tag">
                          {v.ip_address || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            <div className="admin-pagination-bar">
              <span className="text-muted text-sm">
                Showing {verifications.length} audit records
              </span>
              <div className="pagination-controls">
                <button
                  type="button"
                  className="button button-secondary button-sm"
                  disabled={verifPage <= 1 || loading}
                  onClick={() => loadVerifications(verifPage - 1)}
                >
                  <ChevronLeft size={14} /> Previous
                </button>
                <span className="pagination-page-indicator">
                  Page {verifPage} of {verifTotalPages || 1}
                </span>
                <button
                  type="button"
                  className="button button-secondary button-sm"
                  disabled={verifPage >= verifTotalPages || loading}
                  onClick={() => loadVerifications(verifPage + 1)}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal: Single Faculty Biometric Details & Logs */}
      {selectedFacultyId && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal admin-profile-modal">
            {/* Modal Header */}
            <div className="admin-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="admin-avatar">
                  <Fingerprint size={18} />
                </div>
                <div>
                  <h3 className="m-0 text-lg font-bold">
                    {facultyDetails?.faculty.full_name || 'Faculty Biometric Profile'}
                  </h3>
                  <span className="text-xs text-muted">
                    {facultyDetails?.faculty.employee_id} · {facultyDetails?.faculty.department}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="icon-button"
                onClick={() => {
                  setSelectedFacultyId(null)
                  setFacultyDetails(null)
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="admin-modal-body">
              {detailsLoading || !facultyDetails ? (
                <div className="p-8 text-center muted">
                  <RefreshCw className="admin-spin inline mr-2" size={18} />
                  Loading biometric template & audit records...
                </div>
              ) : (
                <>
                  {/* Top Stats Banner */}
                  <div className="admin-kpi-grid admin-kpi-grid-4 mb-4" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
                    <div className="admin-kpi-card">
                      <div className="admin-kpi-content">
                        <span className="admin-kpi-label">Template Status</span>
                        <div style={{ marginTop: 4 }}>
                          {renderStatusBadge(facultyDetails.faculty.face_enrollment_status)}
                        </div>
                      </div>
                    </div>

                    <div className="admin-kpi-card">
                      <div className="admin-kpi-content">
                        <span className="admin-kpi-label">Total Verifications</span>
                        <span className="admin-kpi-value">{facultyDetails.statistics.total_attempts}</span>
                      </div>
                    </div>

                    <div className="admin-kpi-card kpi-border-green">
                      <div className="admin-kpi-content">
                        <span className="admin-kpi-label">Pass Rate</span>
                        <span className="admin-kpi-value text-green">{facultyDetails.statistics.pass_rate}%</span>
                      </div>
                    </div>

                    <div className="admin-kpi-card kpi-border-red">
                      <div className="admin-kpi-content">
                        <span className="admin-kpi-label">Spoof / Rejections</span>
                        <span className="admin-kpi-value text-red">{facultyDetails.statistics.spoof_failures}</span>
                      </div>
                    </div>
                  </div>

                  {/* Template Details Box */}
                  <div className="biometric-overview-box mb-4">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                      <Shield size={16} className="text-blue" />
                      <strong style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                        Biometric Template Protection & Storage
                      </strong>
                    </div>

                    <div className="profile-grid">
                      <div className="profile-field">
                        <label>Encrypted Vector</label>
                        {facultyDetails.template.has_embedding ? (
                          <strong className="text-green faculty-code-tag">128-d AES-128 Fernet Stored</strong>
                        ) : (
                          <span className="text-muted italic">No embedding captured</span>
                        )}
                      </div>
                      <div className="profile-field">
                        <label>Enrolled Timestamp</label>
                        <strong>
                          {facultyDetails.template.enrolled_at
                            ? new Date(facultyDetails.template.enrolled_at).toLocaleString()
                            : '—'}
                        </strong>
                      </div>
                      <div className="profile-field">
                        <label>Reviewed By</label>
                        <strong>{facultyDetails.template.approved_by_name || 'Pending Review'}</strong>
                      </div>
                      <div className="profile-field">
                        <label>Approved Timestamp</label>
                        <strong>
                          {facultyDetails.template.approved_at
                            ? new Date(facultyDetails.template.approved_at).toLocaleString()
                            : '—'}
                        </strong>
                      </div>
                      {facultyDetails.template.revoke_reason && (
                        <div className="profile-field" style={{ gridColumn: '1 / -1' }}>
                          <label>Rejection / Reset Reason</label>
                          <strong className="text-red">{facultyDetails.template.revoke_reason}</strong>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Verification History Table */}
                  <div>
                    <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <History size={15} className="text-blue" /> Verification Attempt Logs (Recent 50)
                    </h4>
                    {facultyDetails.verification_history.length === 0 ? (
                      <p className="text-muted italic" style={{ fontSize: 12 }}>
                        No verification attempts logged yet for this faculty member.
                      </p>
                    ) : (
                      <div className="table-scroll" style={{ maxHeight: 240, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                        <table className="admin-data-table">
                          <thead>
                            <tr>
                              <th>Date & Time</th>
                              <th>Action</th>
                              <th>Result</th>
                              <th>Cosine Score</th>
                              <th>Liveness</th>
                              <th>Details</th>
                            </tr>
                          </thead>
                          <tbody>
                            {facultyDetails.verification_history.map((h) => (
                              <tr key={h.id}>
                                <td className="faculty-code-tag">
                                  {h.created_at ? new Date(h.created_at).toLocaleString() : '—'}
                                </td>
                                <td style={{ textTransform: 'capitalize' }}>{h.action.replace('_', ' ')}</td>
                                <td>
                                  {h.result === 'pass' ? (
                                    <strong className="text-green">PASS</strong>
                                  ) : (
                                    <strong className="text-red">FAIL</strong>
                                  )}
                                </td>
                                <td className="faculty-code-tag">
                                  {h.similarity_score !== null ? (
                                    <strong className={h.similarity_score >= 0.363 ? 'text-green' : 'text-red'}>
                                      {h.similarity_score}
                                    </strong>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                                <td className="faculty-code-tag">
                                  {h.liveness_score !== null ? `${Math.round(h.liveness_score * 100)}%` : '—'}
                                </td>
                                <td className="text-red" style={{ fontSize: 11 }}>
                                  {h.failure_reason || <span className="text-muted">Verified</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer Actions */}
            {facultyDetails && (
              <div className="admin-modal-footer" style={{ justifyContent: 'space-between' }}>
                <span className="text-muted text-xs">
                  Account Status:{' '}
                  <strong style={{ color: '#0f172a', textTransform: 'capitalize' }}>
                    {facultyDetails.faculty.face_enrollment_status.replace('_', ' ')}
                  </strong>
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {facultyDetails.faculty.face_enrollment_status === 'pending_approval' && (
                    <button
                      type="button"
                      onClick={() => handleApprove(facultyDetails.faculty.id, facultyDetails.faculty.full_name)}
                      disabled={actionBusy}
                      className="button button-primary button-sm"
                    >
                      <Check size={14} /> Approve Biometrics
                    </button>
                  )}

                  {(facultyDetails.faculty.face_enrollment_status === 'pending_approval' ||
                    facultyDetails.faculty.face_enrollment_status === 'approved') && (
                    <button
                      type="button"
                      onClick={() => {
                        const item = items.find((i) => i.faculty_id === facultyDetails.faculty.id)
                        if (item) setRejectingFaculty(item)
                      }}
                      className="button button-danger button-sm"
                    >
                      <X size={14} /> Reject with Reason
                    </button>
                  )}

                  {(facultyDetails.faculty.face_enrollment_status === 'approved' ||
                    facultyDetails.faculty.face_enrollment_status === 'rejected') && (
                    <button
                      type="button"
                      onClick={() => {
                        const item = items.find((i) => i.faculty_id === facultyDetails.faculty.id)
                        if (item) setReEnrollingFaculty(item)
                      }}
                      className="button button-secondary button-sm text-purple"
                    >
                      <RotateCcw size={14} /> Request Re-Registration
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Reject Enrollment with mandatory reason */}
      {rejectingFaculty && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal" style={{ maxWidth: 480 }}>
            <form onSubmit={handleRejectSubmit}>
              <div className="admin-modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="admin-avatar" style={{ background: '#fef2f2', color: '#dc2626' }}>
                    <X size={18} />
                  </div>
                  <div>
                    <h3 className="m-0 text-base font-bold">Reject Biometric Enrollment</h3>
                    <span className="text-xs text-muted">
                      {rejectingFaculty.faculty_name} ({rejectingFaculty.employee_id})
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => {
                    setRejectingFaculty(null)
                    setRejectReason('')
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="admin-modal-body">
                <p className="text-muted text-xs mb-3">
                  Please enter the administrative reason for rejecting this face template. This notification will be displayed directly to the faculty member.
                </p>

                <div className="admin-form-group">
                  <label className="admin-form-label">Rejection Reason *</label>
                  <textarea
                    required
                    rows={3}
                    placeholder="e.g. Image too blurry, face is partially obscured, or lighting is inadequate..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="admin-textarea"
                  />
                </div>
              </div>

              <div className="admin-modal-footer">
                <button
                  type="button"
                  onClick={() => {
                    setRejectingFaculty(null)
                    setRejectReason('')
                  }}
                  className="button button-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionBusy || !rejectReason.trim()}
                  className="button button-danger"
                >
                  {actionBusy ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Request Re-Registration */}
      {reEnrollingFaculty && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal" style={{ maxWidth: 480 }}>
            <form onSubmit={handleReEnrollSubmit}>
              <div className="admin-modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="admin-avatar" style={{ background: '#faf5ff', color: '#9333ea' }}>
                    <RotateCcw size={18} />
                  </div>
                  <div>
                    <h3 className="m-0 text-base font-bold">Request Face Re-Registration</h3>
                    <span className="text-xs text-muted">
                      {reEnrollingFaculty.faculty_name} ({reEnrollingFaculty.employee_id})
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => {
                    setReEnrollingFaculty(null)
                    setReEnrollReason('')
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="admin-modal-body">
                <p className="text-muted text-xs mb-3">
                  Requesting re-registration will <strong className="text-red">clear their existing face template</strong> and set their status to <em>Re-enrollment Required</em>. The faculty member will be required to re-scan their face before punching attendance.
                </p>

                <div className="admin-form-group">
                  <label className="admin-form-label">Notice / Instructions (Optional)</label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Please re-register using the high-resolution front camera in good lighting..."
                    value={reEnrollReason}
                    onChange={(e) => setReEnrollReason(e.target.value)}
                    className="admin-textarea"
                  />
                </div>
              </div>

              <div className="admin-modal-footer">
                <button
                  type="button"
                  onClick={() => {
                    setReEnrollingFaculty(null)
                    setReEnrollReason('')
                  }}
                  className="button button-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionBusy}
                  className="button button-primary"
                  style={{ background: '#7c3aed', borderColor: '#7c3aed' }}
                >
                  {actionBusy ? 'Processing...' : 'Confirm Re-Enrollment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
