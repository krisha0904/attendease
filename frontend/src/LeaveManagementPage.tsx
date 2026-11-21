import React, { useEffect, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Plus,
  RefreshCw,
  Search,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react'
import { api, errorMessage, fetchJson } from './api'

interface LeaveItem {
  id: number
  faculty_id: number
  faculty_name: string
  employee_id: string
  faculty_email: string
  department_id: number | null
  department_name: string | null
  leave_type_id: number
  leave_type_name: string
  leave_type_code: string
  is_paid: boolean
  start_date: string
  end_date: string
  total_days: number
  reason: string
  document_url: string | null
  status: string
  reviewed_by_id: number | null
  reviewed_by_name: string | null
  reviewed_at: string | null
  review_remarks: string | null
  affected_lectures_count: number
  created_at: string | null
}

interface LeaveKPIs {
  total_requests: number
  pending_requests: number
  approved_requests: number
  rejected_requests: number
  total_days_approved: number
  affected_lectures_total: number
}

interface LeaveTypeItem {
  id: number
  name: string
  code: string
  max_days_per_year: number
  is_paid: boolean
  requires_document: boolean
}

interface AffectedLecture {
  lecture_id: number
  date: string
  day_name: string
  subject: string
  course_name: string
  room: string
  start_time: string
  end_time: string
  lecture_type: string
  substitute_faculty_id: number | null
  substitute_faculty_name: string | null
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
  role?: string
  designation?: string
}

interface LeaveManagementPageProps {
  onNavigateToTimetable?: () => void
}

export const LeaveManagementPage: React.FC<LeaveManagementPageProps> = ({ onNavigateToTimetable }) => {
  const [activeTab, setActiveTab] = useState<'applications' | 'types'>('applications')
  const [items, setItems] = useState<LeaveItem[]>([])
  const [kpis, setKpis] = useState<LeaveKPIs>({
    total_requests: 0,
    pending_requests: 0,
    approved_requests: 0,
    rejected_requests: 0,
    total_days_approved: 0,
    affected_lectures_total: 0,
  })
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeItem[]>([])
  const [departments, setDepartments] = useState<LookupDepartment[]>([])
  const [facultyMembers, setFacultyMembers] = useState<LookupFaculty[]>([])
  const [loading, setLoading] = useState(false)

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState<number | 'all'>('all')
  const [deptFilter, setDeptFilter] = useState<number | 'all'>('all')

  // Review Modal
  const [reviewingItem, setReviewingItem] = useState<LeaveItem | null>(null)
  const [reviewRemarks, setReviewRemarks] = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)

  // Affected Lectures Modal
  const [inspectLeave, setInspectLeave] = useState<LeaveItem | null>(null)
  const [affectedLectures, setAffectedLectures] = useState<AffectedLecture[]>([])
  const [loadingAffected, setLoadingAffected] = useState(false)

  // Create / Grant Leave Modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [formFacultyId, setFormFacultyId] = useState<number | ''>('')
  const [formLeaveTypeId, setFormLeaveTypeId] = useState<number | ''>('')
  const [formStartDate, setFormStartDate] = useState('')
  const [formEndDate, setFormEndDate] = useState('')
  const [formReason, setFormReason] = useState('')
  const [formDocUrl, setFormDocUrl] = useState('')
  const [formStatus, setFormStatus] = useState<'approved' | 'pending'>('approved')
  const [formRemarks, setFormRemarks] = useState('')
  const [creatingBusy, setCreatingBusy] = useState(false)

  // Add Custom Leave Type Modal
  const [showAddTypeModal, setShowAddTypeModal] = useState(false)
  const [typeName, setTypeName] = useState('')
  const [typeCode, setTypeCode] = useState('')
  const [typeMaxDays, setTypeMaxDays] = useState(12)
  const [typeIsPaid, setTypeIsPaid] = useState(true)
  const [typeRequiresDoc, setTypeRequiresDoc] = useState(false)
  const [savingTypeBusy, setSavingTypeBusy] = useState(false)

  // Feedback banner
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Load auxiliary lookups
  useEffect(() => {
    const loadLookups = async () => {
      try {
        const [deptsRes, facRes] = await Promise.all([
          fetchJson<{ items: LookupDepartment[] }>('/admin/academic/departments').catch(() => ({ items: [] })),
          fetchJson<LookupFaculty[]>('/directory').catch(() => []),
        ])
        setDepartments(deptsRes.items || [])
        setFacultyMembers(
          (facRes || []).filter(
            (f) =>
              f.role === 'faculty' ||
              f.designation?.includes('Faculty') ||
              f.designation?.includes('Professor') ||
              f.designation?.includes('Lecturer')
          )
        )
      } catch (err) {
        console.error('Failed to load auxiliary lookups', err)
      }
    }
    void loadLookups()
  }, [])

  // Load Leave Types
  const loadLeaveTypes = async () => {
    try {
      const types = await fetchJson<LeaveTypeItem[]>('/admin/leave-types')
      setLeaveTypes(types || [])
      if (!formLeaveTypeId && types && types.length > 0) {
        setFormLeaveTypeId(types[0].id)
      }
    } catch (err) {
      console.error('Failed to load leave types', err)
    }
  }

  useEffect(() => {
    void loadLeaveTypes()
  }, [])

  // Load Leaves and KPIs
  const loadLeaves = async () => {
    setLoading(true)
    setFeedback(null)
    try {
      const params: Record<string, any> = {}
      if (search.trim()) params.search = search.trim()
      if (statusFilter !== 'all') params.status_filter = statusFilter
      if (typeFilter !== 'all') params.leave_type_id = typeFilter
      if (deptFilter !== 'all') params.department_id = deptFilter

      const { data } = await api.get<{ items: LeaveItem[]; kpis: LeaveKPIs }>('/admin/leaves', { params })
      setItems(data.items || [])
      setKpis(
        data.kpis || {
          total_requests: 0,
          pending_requests: 0,
          approved_requests: 0,
          rejected_requests: 0,
          total_days_approved: 0,
          affected_lectures_total: 0,
        }
      )
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadLeaves()
  }, [search, statusFilter, typeFilter, deptFilter])

  // Open Affected Lectures Inspection Modal
  const handleOpenAffected = async (leave: LeaveItem) => {
    setInspectLeave(leave)
    setLoadingAffected(true)
    try {
      const res = await fetchJson<{ affected_lectures: AffectedLecture[] }>(
        `/admin/leaves/${leave.id}/affected-lectures`
      )
      setAffectedLectures(res.affected_lectures || [])
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
      setAffectedLectures([])
    } finally {
      setLoadingAffected(false)
    }
  }

  // Open Review Modal
  const handleOpenReview = (leave: LeaveItem) => {
    setReviewingItem(leave)
    setReviewRemarks(leave.review_remarks || '')
  }

  // Submit Review Decision
  const handleReviewAction = async (action: 'approve' | 'reject') => {
    if (!reviewingItem) return
    if (action === 'reject' && !reviewRemarks.trim()) {
      alert('Please provide rejection remarks explaining the decision to the faculty member.')
      return
    }

    setReviewBusy(true)
    try {
      await api.post(`/admin/leaves/${reviewingItem.id}/review`, {
        action,
        review_remarks: reviewRemarks.trim() || undefined,
      })
      setFeedback({
        type: 'success',
        message: `Leave application #${reviewingItem.id} has been ${action === 'approve' ? 'approved' : 'rejected'}.`,
      })
      setReviewingItem(null)
      loadLeaves()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setReviewBusy(false)
    }
  }

  // Cancel Leave
  const handleCancelLeave = async (leave: LeaveItem) => {
    if (!confirm(`Are you sure you want to cancel the leave application for ${leave.faculty_name}?`)) {
      return
    }
    try {
      await api.post(`/admin/leaves/${leave.id}/cancel`)
      setFeedback({ type: 'success', message: 'Leave application cancelled successfully.' })
      loadLeaves()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    }
  }

  // Submit Direct Leave Grant / Creation
  const handleCreateLeave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formFacultyId || !formLeaveTypeId || !formStartDate || !formEndDate || !formReason.trim()) {
      alert('Please fill in all mandatory fields.')
      return
    }
    if (formEndDate < formStartDate) {
      alert('End date cannot precede the start date.')
      return
    }

    setCreatingBusy(true)
    try {
      await api.post('/admin/leaves', {
        faculty_id: Number(formFacultyId),
        leave_type_id: Number(formLeaveTypeId),
        start_date: formStartDate,
        end_date: formEndDate,
        reason: formReason.trim(),
        document_url: formDocUrl.trim() || undefined,
        status: formStatus,
        remarks: formRemarks.trim() || undefined,
      })
      setFeedback({ type: 'success', message: 'Leave successfully registered and timetable updated.' })
      setShowCreateModal(false)
      loadLeaves()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setCreatingBusy(false)
    }
  }

  // Submit New Custom Leave Type
  const handleCreateLeaveType = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!typeName.trim() || !typeCode.trim()) {
      alert('Please provide both name and code.')
      return
    }

    setSavingTypeBusy(true)
    try {
      await api.post('/admin/leave-types', {
        name: typeName.trim(),
        code: typeCode.trim().toUpperCase(),
        max_days_per_year: Number(typeMaxDays),
        is_paid: typeIsPaid,
        requires_document: typeRequiresDoc,
      })
      setFeedback({ type: 'success', message: `Leave policy "${typeName}" created successfully.` })
      setShowAddTypeModal(false)
      setTypeName('')
      setTypeCode('')
      loadLeaveTypes()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setSavingTypeBusy(false)
    }
  }

  return (
    <div className="admin-page-container">
      {/* Page Header */}
      <div className="admin-page-header">
        <div>
          <span className="admin-page-eyebrow">FACULTY ABSENCE & EXCUSAL WORKFLOWS</span>
          <h1 className="admin-page-title">Leave Management & Timetable Impact</h1>
          <p className="admin-page-description">
            Review faculty leave applications, identify affected lectures, examine attached medical/duty documentation, and coordinate substitute coverage.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              loadLeaves()
              loadLeaveTypes()
            }}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              setFormFacultyId(facultyMembers[0]?.id || '')
              setFormLeaveTypeId(leaveTypes[0]?.id || '')
              setFormStartDate(new Date().toISOString().slice(0, 10))
              setFormEndDate(new Date().toISOString().slice(0, 10))
              setFormReason('')
              setFormDocUrl('')
              setFormRemarks('')
              setShowCreateModal(true)
            }}
          >
            <Plus size={15} />
            <span>Grant / Register Leave</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`notification-banner ${feedback.type === 'success' ? 'banner-success' : 'banner-error'}`}
          style={{ marginBottom: '1.25rem' }}
        >
          {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Live KPIs */}
      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
            <Clock size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Pending Approvals</span>
            <span className="stat-value">{kpis.pending_requests}</span>
            <span className="stat-note" style={{ color: '#f59e0b' }}>Requires Admin Decision</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
            <CheckCircle2 size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Approved Leaves</span>
            <span className="stat-value">{kpis.approved_requests}</span>
            <span className="stat-note" style={{ color: '#10b981' }}>Active / Scheduled</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}>
            <Calendar size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Total Days Approved</span>
            <span className="stat-value">{kpis.total_days_approved}</span>
            <span className="stat-note" style={{ color: '#6366f1' }}>Working Days Covered</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
            <AlertTriangle size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Impacted Lectures</span>
            <span className="stat-value">{kpis.affected_lectures_total}</span>
            <span className="stat-note" style={{ color: '#ef4444' }}>Lectures Needing Substitutes</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid #1e293b' }}>
        <button
          type="button"
          className={`button ${activeTab === 'applications' ? 'button-primary' : 'button-ghost'}`}
          onClick={() => setActiveTab('applications')}
          style={{ borderRadius: '8px 8px 0 0', padding: '8px 16px' }}
        >
          <UserCheck size={15} style={{ marginRight: '6px' }} />
          <span>Leave Applications & Impact</span>
        </button>
        <button
          type="button"
          className={`button ${activeTab === 'types' ? 'button-primary' : 'button-ghost'}`}
          onClick={() => setActiveTab('types')}
          style={{ borderRadius: '8px 8px 0 0', padding: '8px 16px' }}
        >
          <BookOpen size={15} style={{ marginRight: '6px' }} />
          <span>Leave Types & Policies ({leaveTypes.length})</span>
        </button>
      </div>

      {activeTab === 'applications' ? (
        <>
          {/* Filter Bar */}
          <div className="panel" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
              {/* Search */}
              <div style={{ position: 'relative', minWidth: '240px', flex: 1 }}>
                <Search
                  size={15}
                  style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}
                />
                <input
                  type="text"
                  className="input-field"
                  placeholder="Search faculty, employee ID, reason..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ paddingLeft: '32px' }}
                />
              </div>

              {/* Status Filter */}
              <select
                className="select-field"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ width: '150px' }}
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
              </select>

              {/* Leave Type Filter */}
              <select
                className="select-field"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                style={{ width: '180px' }}
              >
                <option value="all">All Leave Types</option>
                {leaveTypes.map((lt) => (
                  <option key={lt.id} value={lt.id}>
                    {lt.name} ({lt.code})
                  </option>
                ))}
              </select>

              {/* Department Filter */}
              <select
                className="select-field"
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                style={{ width: '180px' }}
              >
                <option value="all">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Applications Table */}
          <div className="panel">
            <div className="table-scroll">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>Faculty Member</th>
                    <th>Leave Type</th>
                    <th>Duration & Dates</th>
                    <th>Timetable Impact</th>
                    <th>Reason & Proof</th>
                    <th>Status</th>
                    <th>Review Info</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem' }}>
                        <RefreshCw size={24} className="spin" style={{ margin: '0 auto 0.5rem', color: '#6366f1' }} />
                        <p>Loading leave applications...</p>
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>
                        <Calendar size={36} style={{ margin: '0 auto 0.5rem', opacity: 0.4 }} />
                        <p>No leave requests found matching the current filters.</p>
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr key={item.id}>
                        {/* Faculty Info */}
                        <td>
                          <div style={{ fontWeight: 600, color: '#f8fafc' }}>{item.faculty_name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            ID: {item.employee_id || 'N/A'} • {item.department_name || 'General'}
                          </div>
                        </td>

                        {/* Leave Type */}
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            <span className="badge badge-neutral" style={{ fontWeight: 600 }}>
                              {item.leave_type_name}
                            </span>
                            <span style={{ fontSize: '0.7rem', color: item.is_paid ? '#10b981' : '#94a3b8' }}>
                              {item.is_paid ? 'Paid Absence' : 'Unpaid Leave'}
                            </span>
                          </div>
                        </td>

                        {/* Dates & Duration */}
                        <td>
                          <div style={{ fontWeight: 600, color: '#f1f5f9' }}>
                            {item.start_date} → {item.end_date}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#38bdf8' }}>
                            {item.total_days} {item.total_days === 1 ? 'day' : 'days'}
                          </div>
                        </td>

                        {/* Timetable Impact */}
                        <td>
                          {item.affected_lectures_count > 0 ? (
                            <button
                              type="button"
                              onClick={() => handleOpenAffected(item)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                background: 'rgba(239, 68, 68, 0.15)',
                                color: '#ef4444',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                padding: '4px 8px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                              }}
                              title="Click to view affected lectures and coordinate substitutes"
                            >
                              <AlertTriangle size={13} />
                              <span>{item.affected_lectures_count} lectures</span>
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>No lectures</span>
                          )}
                        </td>

                        {/* Reason & Proof */}
                        <td>
                          <div
                            style={{
                              maxWidth: '220px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              fontSize: '0.8rem',
                              color: '#cbd5e1',
                            }}
                            title={item.reason}
                          >
                            {item.reason}
                          </div>
                          {item.document_url && (
                            <a
                              href={item.document_url}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                fontSize: '0.75rem',
                                color: '#6366f1',
                                marginTop: '0.2rem',
                              }}
                            >
                              <FileText size={12} />
                              <span>View Proof</span>
                            </a>
                          )}
                        </td>

                        {/* Status */}
                        <td>
                          {item.status === 'approved' && <span className="badge badge-success">Approved</span>}
                          {item.status === 'pending' && <span className="badge badge-warning">Pending Review</span>}
                          {item.status === 'rejected' && <span className="badge badge-danger">Rejected</span>}
                          {item.status === 'cancelled' && <span className="badge badge-neutral">Cancelled</span>}
                        </td>

                        {/* Review Info */}
                        <td>
                          {item.reviewed_by_name ? (
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                              <div>By {item.reviewed_by_name}</div>
                              {item.review_remarks && (
                                <div style={{ color: '#cbd5e1', fontStyle: 'italic', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.review_remarks}>
                                  "{item.review_remarks}"
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Pending</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                            {item.status === 'pending' && (
                              <button
                                type="button"
                                className="button button-primary"
                                onClick={() => handleOpenReview(item)}
                                title="Approve / Reject"
                                style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                              >
                                <CheckCircle2 size={13} style={{ marginRight: '4px' }} />
                                <span>Review</span>
                              </button>
                            )}

                            <button
                              type="button"
                              className="button button-ghost"
                              onClick={() => handleOpenAffected(item)}
                              title="Inspect Lectures Impact"
                              style={{ padding: '4px 8px' }}
                            >
                              <Eye size={14} />
                            </button>

                            {item.status !== 'cancelled' && (
                              <button
                                type="button"
                                className="button button-ghost"
                                onClick={() => handleCancelLeave(item)}
                                title="Cancel Leave"
                                style={{ padding: '4px 8px', color: '#ef4444' }}
                              >
                                <XCircle size={14} />
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
          </div>
        </>
      ) : (
        /* LEAVE TYPES POLICY VIEW */
        <div className="panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
                Institutional Leave Policies & Quotas
              </h2>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0.25rem 0 0' }}>
                Defined absence categories, annual allowances, paid/unpaid status, and document verification rules.
              </p>
            </div>
            <button
              type="button"
              className="button button-primary"
              onClick={() => setShowAddTypeModal(true)}
            >
              <Plus size={15} />
              <span>Add Custom Leave Policy</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
            {leaveTypes.map((lt) => (
              <div
                key={lt.id}
                style={{
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '8px',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: '1rem', color: '#f8fafc' }}>{lt.name}</span>
                  <span className="badge badge-neutral" style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                    {lt.code}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#94a3b8' }}>
                  <span>Annual Quota</span>
                  <span style={{ fontWeight: 600, color: '#f1f5f9' }}>{lt.max_days_per_year} Days / Year</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#94a3b8' }}>
                  <span>Compensation</span>
                  <span style={{ color: lt.is_paid ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
                    {lt.is_paid ? 'Paid Leave' : 'Unpaid / Loss of Pay'}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#94a3b8' }}>
                  <span>Proof Requirement</span>
                  <span style={{ color: lt.requires_document ? '#ef4444' : '#64748b' }}>
                    {lt.requires_document ? 'Mandatory Document' : 'Optional / Self-declaration'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AFFECTED LECTURES INSPECTION MODAL */}
      {inspectLeave && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '680px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Timetable Absence Impact Analysis</h2>
              <button type="button" className="modal-close-button" onClick={() => setInspectLeave(null)}>
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem 0' }}>
              <div style={{ background: '#0f172a', padding: '0.85rem', borderRadius: '6px', border: '1px solid #1e293b' }}>
                <div style={{ fontWeight: 600, color: '#f8fafc' }}>
                  {inspectLeave.faculty_name} ({inspectLeave.leave_type_name})
                </div>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  Leave Duration: <strong>{inspectLeave.start_date}</strong> to <strong>{inspectLeave.end_date}</strong> ({inspectLeave.total_days} days)
                </div>
                <div style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: '0.25rem' }}>
                  Reason: "{inspectLeave.reason}"
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f8fafc', marginBottom: '0.5rem' }}>
                  Impacted Lectures During Absence Window ({affectedLectures.length})
                </h3>

                {loadingAffected ? (
                  <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                    <RefreshCw size={20} className="spin" style={{ margin: '0 auto', color: '#6366f1' }} />
                    <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Analyzing timetable schedule...</p>
                  </div>
                ) : affectedLectures.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '1.5rem', background: '#0f172a', borderRadius: '6px', color: '#10b981' }}>
                    <CheckCircle2 size={24} style={{ margin: '0 auto 0.25rem' }} />
                    <p style={{ margin: 0, fontWeight: 500 }}>No scheduled lectures impacted during this period.</p>
                  </div>
                ) : (
                  <div className="table-scroll" style={{ maxHeight: '280px' }}>
                    <table className="admin-data-table" style={{ fontSize: '0.8rem' }}>
                      <thead>
                        <tr>
                          <th>Date & Day</th>
                          <th>Subject</th>
                          <th>Course & Room</th>
                          <th>Time Slot</th>
                          <th>Substitute Coverage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {affectedLectures.map((lec, idx) => (
                          <tr key={idx}>
                            <td>
                              <div style={{ fontWeight: 600, color: '#f8fafc' }}>{lec.date}</div>
                              <div style={{ fontSize: '0.7rem', color: '#38bdf8' }}>{lec.day_name}</div>
                            </td>
                            <td>
                              <div style={{ fontWeight: 600 }}>{lec.subject}</div>
                              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{lec.lecture_type}</div>
                            </td>
                            <td>
                              <div>{lec.course_name || 'N/A'}</div>
                              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Room: {lec.room || 'TBD'}</div>
                            </td>
                            <td>
                              <div style={{ fontWeight: 600, color: '#f1f5f9' }}>
                                {lec.start_time} - {lec.end_time}
                              </div>
                            </td>
                            <td>
                              {lec.substitute_faculty_name ? (
                                <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                                  Assigned: {lec.substitute_faculty_name}
                                </span>
                              ) : (
                                <span className="badge badge-danger" style={{ fontSize: '0.7rem' }}>
                                  Needs Substitute
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
              {onNavigateToTimetable && (
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => {
                    setInspectLeave(null)
                    onNavigateToTimetable()
                  }}
                >
                  <Calendar size={14} style={{ marginRight: '4px' }} />
                  <span>Go to Timetable to Assign Substitutes</span>
                </button>
              )}
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setInspectLeave(null)}
                style={{ marginLeft: 'auto' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REVIEW DECISION MODAL */}
      {reviewingItem && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Review Leave Application</h2>
              <button type="button" className="modal-close-button" onClick={() => setReviewingItem(null)}>
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem 0' }}>
              <div style={{ background: '#0f172a', padding: '0.85rem', borderRadius: '6px', border: '1px solid #1e293b' }}>
                <div style={{ fontWeight: 600, color: '#f8fafc' }}>
                  {reviewingItem.faculty_name} ({reviewingItem.leave_type_name})
                </div>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  Period: <strong>{reviewingItem.start_date}</strong> to <strong>{reviewingItem.end_date}</strong> ({reviewingItem.total_days} days)
                </div>
                <div style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: '0.25rem' }}>
                  Reason: "{reviewingItem.reason}"
                </div>
              </div>

              {reviewingItem.affected_lectures_count > 0 && (
                <div
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    padding: '0.75rem',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    color: '#ef4444',
                    fontSize: '0.85rem',
                  }}
                >
                  <AlertTriangle size={18} />
                  <span>
                    Warning: <strong>{reviewingItem.affected_lectures_count} lectures</strong> are scheduled during this period. Ensure substitute faculty coverage is coordinated.
                  </span>
                </div>
              )}

              <div>
                <label className="form-label" htmlFor="admin-review-remarks">
                  Administrator Remarks (Optional for approval, mandatory for rejection)
                </label>
                <textarea
                  id="admin-review-remarks"
                  className="input-field"
                  rows={3}
                  placeholder="Enter approval confirmation notes or reason for rejection..."
                  value={reviewRemarks}
                  onChange={(e) => setReviewRemarks(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setReviewingItem(null)}
                disabled={reviewBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button button-danger"
                onClick={() => handleReviewAction('reject')}
                disabled={reviewBusy}
              >
                <XCircle size={15} />
                <span>Reject</span>
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={() => handleReviewAction('approve')}
                disabled={reviewBusy}
              >
                <Check size={15} />
                <span>Approve Leave</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GRANT / REGISTER LEAVE MODAL */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '540px' }}>
            <form onSubmit={handleCreateLeave}>
              <div className="modal-header">
                <h2 className="modal-title">Grant / Register Leave for Faculty</h2>
                <button type="button" className="modal-close-button" onClick={() => setShowCreateModal(false)}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem 0' }}>
                {/* Faculty Selection */}
                <div>
                  <label className="form-label" htmlFor="create-faculty-select">Faculty Member *</label>
                  <select
                    id="create-faculty-select"
                    className="select-field"
                    value={formFacultyId}
                    onChange={(e) => setFormFacultyId(e.target.value === '' ? '' : Number(e.target.value))}
                    required
                  >
                    <option value="">Select Faculty...</option>
                    {facultyMembers.map((fac) => (
                      <option key={fac.id} value={fac.id}>
                        {fac.full_name} ({fac.employee_id})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Leave Type */}
                <div>
                  <label className="form-label" htmlFor="create-leave-type-select">Leave Type *</label>
                  <select
                    id="create-leave-type-select"
                    className="select-field"
                    value={formLeaveTypeId}
                    onChange={(e) => setFormLeaveTypeId(e.target.value === '' ? '' : Number(e.target.value))}
                    required
                  >
                    {leaveTypes.map((lt) => (
                      <option key={lt.id} value={lt.id}>
                        {lt.name} ({lt.code}) - {lt.is_paid ? 'Paid' : 'Unpaid'}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Dates */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label className="form-label" htmlFor="create-start-date">Start Date *</label>
                    <input
                      id="create-start-date"
                      type="date"
                      className="input-field"
                      value={formStartDate}
                      onChange={(e) => setFormStartDate(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label" htmlFor="create-end-date">End Date *</label>
                    <input
                      id="create-end-date"
                      type="date"
                      className="input-field"
                      value={formEndDate}
                      onChange={(e) => setFormEndDate(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Reason */}
                <div>
                  <label className="form-label" htmlFor="create-reason">Reason / Justification *</label>
                  <textarea
                    id="create-reason"
                    className="input-field"
                    rows={2}
                    placeholder="Enter reason for leave..."
                    value={formReason}
                    onChange={(e) => setFormReason(e.target.value)}
                    required
                  />
                </div>

                {/* Document URL */}
                <div>
                  <label className="form-label" htmlFor="create-doc-url">Supporting Document URL (Optional)</label>
                  <input
                    id="create-doc-url"
                    type="url"
                    className="input-field"
                    placeholder="https://cloud-storage.edu/documents/medical-certificate.pdf"
                    value={formDocUrl}
                    onChange={(e) => setFormDocUrl(e.target.value)}
                  />
                </div>

                {/* Initial Status */}
                <div>
                  <label className="form-label">Initial Status</label>
                  <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.25rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#10b981' }}>
                      <input
                        type="radio"
                        name="create_status"
                        checked={formStatus === 'approved'}
                        onChange={() => setFormStatus('approved')}
                      />
                      <span>Directly Approve</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#f59e0b' }}>
                      <input
                        type="radio"
                        name="create_status"
                        checked={formStatus === 'pending'}
                        onChange={() => setFormStatus('pending')}
                      />
                      <span>Mark as Pending Review</span>
                    </label>
                  </div>
                </div>

                {/* Remarks */}
                <div>
                  <label className="form-label" htmlFor="create-remarks">Administrative Remarks (Optional)</label>
                  <input
                    id="create-remarks"
                    type="text"
                    className="input-field"
                    placeholder="E.g., Authorized by Dean under special provisions..."
                    value={formRemarks}
                    onChange={(e) => setFormRemarks(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setShowCreateModal(false)}
                  disabled={creatingBusy}
                >
                  Cancel
                </button>
                <button type="submit" className="button button-primary" disabled={creatingBusy}>
                  {creatingBusy ? 'Registering...' : 'Register Leave'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD CUSTOM LEAVE TYPE MODAL */}
      {showAddTypeModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <form onSubmit={handleCreateLeaveType}>
              <div className="modal-header">
                <h2 className="modal-title">Define New Leave Policy</h2>
                <button type="button" className="modal-close-button" onClick={() => setShowAddTypeModal(false)}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem 0' }}>
                <div>
                  <label className="form-label" htmlFor="type-name">Policy Name *</label>
                  <input
                    id="type-name"
                    type="text"
                    className="input-field"
                    placeholder="E.g., Maternity Leave, Research Sabbatical..."
                    value={typeName}
                    onChange={(e) => setTypeName(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label className="form-label" htmlFor="type-code">Code *</label>
                    <input
                      id="type-code"
                      type="text"
                      className="input-field"
                      placeholder="E.g., MAT, SAB..."
                      value={typeCode}
                      onChange={(e) => setTypeCode(e.target.value.toUpperCase())}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label" htmlFor="type-max-days">Annual Days Quota</label>
                    <input
                      id="type-max-days"
                      type="number"
                      min={0}
                      max={365}
                      className="input-field"
                      value={typeMaxDays}
                      onChange={(e) => setTypeMaxDays(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={typeIsPaid}
                      onChange={(e) => setTypeIsPaid(e.target.checked)}
                    />
                    <span>Paid Leave (Faculty receives normal compensation)</span>
                  </label>
                </div>

                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={typeRequiresDoc}
                      onChange={(e) => setTypeRequiresDoc(e.target.checked)}
                    />
                    <span>Mandatory Proof / Document Verification Required</span>
                  </label>
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setShowAddTypeModal(false)}
                  disabled={savingTypeBusy}
                >
                  Cancel
                </button>
                <button type="submit" className="button button-primary" disabled={savingTypeBusy}>
                  {savingTypeBusy ? 'Saving...' : 'Save Policy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
