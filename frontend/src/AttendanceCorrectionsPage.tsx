import React, { useEffect, useState } from 'react'
import {
  AlertCircle, AlertTriangle, CheckCircle2,
  Clock, Eye, FileEdit, History, Plus,
  RefreshCw, Search, X
} from 'lucide-react'
import { api, errorMessage, fetchJson } from './api'

interface CorrectionItem {
  id: number
  target_date: string
  faculty_id: number
  faculty_name: string
  employee_id: string
  faculty_email: string
  department_id: number | null
  department_name: string | null
  original_punch_in: string | null
  original_punch_out: string | null
  requested_punch_in: string | null
  requested_punch_out: string | null
  reason: string
  status: string
  admin_remarks: string | null
  reviewed_by_id: number | null
  reviewed_by_name: string | null
  reviewed_at: string | null
  created_at: string | null
}

interface SummaryKPIs {
  total_requests: number
  pending_count: number
  approved_count: number
  rejected_count: number
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

export function AttendanceCorrectionsPage() {
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Data
  const [items, setItems] = useState<CorrectionItem[]>([])
  const [summary, setSummary] = useState<SummaryKPIs>({
    total_requests: 0,
    pending_count: 0,
    approved_count: 0,
    rejected_count: 0,
  })

  // Lookups
  const [departments, setDepartments] = useState<LookupDepartment[]>([])
  const [facultyMembers, setFacultyMembers] = useState<LookupFaculty[]>([])

  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [deptFilter, setDeptFilter] = useState('all')
  const [search, setSearch] = useState('')

  // Review Modal State
  const [reviewingCorrection, setReviewingCorrection] = useState<CorrectionItem | null>(null)
  const [adminRemarks, setAdminRemarks] = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)

  // Submit on Behalf Modal
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [submittingUserId, setSubmittingUserId] = useState<number | ''>('')
  const [submitDate, setSubmitDate] = useState(() => new Date().toISOString().split('T')[0])
  const [submitPunchIn, setSubmitPunchIn] = useState('09:00')
  const [submitPunchOut, setSubmitPunchOut] = useState('17:00')
  const [submitReason, setSubmitReason] = useState('')
  const [submitBusy, setSubmitBusy] = useState(false)

  // Load Corrections Data
  const loadCorrections = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.append('status_filter', statusFilter)
      if (deptFilter !== 'all') params.append('department_id', deptFilter)
      if (search.trim()) params.append('search', search.trim())

      const res = await fetchJson<{ items: CorrectionItem[]; summary: SummaryKPIs }>(
        `/admin/attendance-corrections?${params.toString()}`
      )
      setItems(res.items || [])
      setSummary(res.summary || {
        total_requests: 0,
        pending_count: 0,
        approved_count: 0,
        rejected_count: 0,
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
    void loadCorrections()
  }, [statusFilter, deptFilter, search])

  // Open Review Modal
  const handleOpenReview = (c: CorrectionItem) => {
    setReviewingCorrection(c)
    setAdminRemarks(c.admin_remarks || '')
  }

  // Submit Review Decision (Approve or Reject)
  const handleReviewAction = async (action: 'approve' | 'reject') => {
    if (!reviewingCorrection) return

    if (action === 'reject' && !adminRemarks.trim()) {
      alert('Please provide rejection remarks explaining to the faculty member why this correction request is declined.')
      return
    }

    setReviewBusy(true)
    try {
      const res = await api.post<{ message: string; correction: any }>(
        `/admin/attendance-corrections/${reviewingCorrection.id}/review`,
        {
          action,
          admin_remarks: adminRemarks.trim() || undefined,
        }
      )
      setFeedback({ type: 'success', message: res.data?.message || `Request ${action}d successfully.` })
      setReviewingCorrection(null)
      loadCorrections()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setReviewBusy(false)
    }
  }

  // Submit Correction on Behalf
  const handleSubmitCorrection = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!submittingUserId) {
      alert('Please select a faculty member.')
      return
    }
    if (!submitReason.trim()) {
      alert('Please provide a reason / justification for this attendance adjustment.')
      return
    }

    setSubmitBusy(true)
    try {
      await api.post('/attendance-corrections', {
        user_id: Number(submittingUserId),
        target_date: submitDate,
        requested_punch_in: submitPunchIn || null,
        requested_punch_out: submitPunchOut || null,
        reason: submitReason.trim(),
      })
      setFeedback({ type: 'success', message: 'Attendance correction request submitted successfully.' })
      setShowSubmitModal(false)
      setSubmitReason('')
      loadCorrections()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setSubmitBusy(false)
    }
  }

  // Render Status Badge
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="badge badge-approved">
            <CheckCircle2 size={11} /> Approved
          </span>
        )
      case 'rejected':
        return (
          <span className="badge badge-rejected">
            <X size={11} /> Rejected
          </span>
        )
      default:
        return (
          <span className="badge badge-pending">
            <Clock size={11} /> Pending Review
          </span>
        )
    }
  }

  return (
    <div className="admin-page-container">
      {/* Header */}
      <div className="admin-page-header">
        <div className="admin-page-titles">
          <span className="admin-eyebrow">Discrepancy Resolution & Audit</span>
          <h1>Attendance Corrections</h1>
          <p className="admin-page-desc">
            Review faculty punch adjustment requests, verify original vs requested timestamps, and authorize attendance corrections with immutable audit logs.
          </p>
        </div>

        <div className="admin-header-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={loadCorrections}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'admin-spin mr-1' : 'mr-1'} />
            Refresh
          </button>

          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              setSubmittingUserId(facultyMembers[0]?.id || '')
              setShowSubmitModal(true)
            }}
          >
            <Plus size={15} /> Submit Correction
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

      {/* KPI Cards Grid */}
      <div className="admin-kpi-grid">
        <div
          className="admin-kpi-card kpi-border-amber kpi-card-interactive"
          onClick={() => setStatusFilter('pending')}
          title="Click to view pending requests"
        >
          <div className="admin-kpi-icon-wrap bg-amber-subtle text-amber">
            <FileEdit size={18} />
          </div>
          <div className="admin-kpi-content">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="admin-kpi-label">Pending Review</span>
              {summary.pending_count > 0 && <span className="pulse-indicator" />}
            </div>
            <span className="admin-kpi-value text-amber">{summary.pending_count}</span>
            <span className="admin-kpi-note">Awaiting admin review</span>
          </div>
        </div>

        <div
          className="admin-kpi-card kpi-border-green kpi-card-interactive"
          onClick={() => setStatusFilter('approved')}
          title="Click to view approved requests"
        >
          <div className="admin-kpi-icon-wrap bg-green-subtle text-green">
            <CheckCircle2 size={18} />
          </div>
          <div className="admin-kpi-content">
            <span className="admin-kpi-label">Approved</span>
            <span className="admin-kpi-value text-green">{summary.approved_count}</span>
            <span className="admin-kpi-note">Attendance updated</span>
          </div>
        </div>

        <div
          className="admin-kpi-card kpi-border-red kpi-card-interactive"
          onClick={() => setStatusFilter('rejected')}
          title="Click to view rejected requests"
        >
          <div className="admin-kpi-icon-wrap bg-red-subtle text-red">
            <AlertCircle size={18} />
          </div>
          <div className="admin-kpi-content">
            <span className="admin-kpi-label">Rejected</span>
            <span className="admin-kpi-value text-red">{summary.rejected_count}</span>
            <span className="admin-kpi-note">Declined with remarks</span>
          </div>
        </div>

        <div
          className="admin-kpi-card kpi-card-interactive"
          onClick={() => setStatusFilter('all')}
          title="Click to view all requests"
        >
          <div className="admin-kpi-icon-wrap bg-blue-subtle text-blue">
            <History size={18} />
          </div>
          <div className="admin-kpi-content">
            <span className="admin-kpi-label">Total Submissions</span>
            <span className="admin-kpi-value">{summary.total_requests}</span>
            <span className="admin-kpi-note">All historical requests</span>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="panel mb-4">
        <div className="admin-filters-flex" style={{ gap: 14 }}>
          {/* Status Tab buttons */}
          <div className="timetable-view-toggle">
            <button
              type="button"
              className={`timetable-toggle-btn ${statusFilter === 'all' ? 'toggle-active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              All ({summary.total_requests})
            </button>
            <button
              type="button"
              className={`timetable-toggle-btn ${statusFilter === 'pending' ? 'toggle-active' : ''}`}
              onClick={() => setStatusFilter('pending')}
            >
              Pending ({summary.pending_count})
            </button>
            <button
              type="button"
              className={`timetable-toggle-btn ${statusFilter === 'approved' ? 'toggle-active' : ''}`}
              onClick={() => setStatusFilter('approved')}
            >
              Approved ({summary.approved_count})
            </button>
            <button
              type="button"
              className={`timetable-toggle-btn ${statusFilter === 'rejected' ? 'toggle-active' : ''}`}
              onClick={() => setStatusFilter('rejected')}
            >
              Rejected ({summary.rejected_count})
            </button>
          </div>

          {/* Search Box */}
          <div className="admin-search-box" style={{ flex: 1, minWidth: 200 }}>
            <Search size={15} />
            <input
              type="text"
              placeholder="Search faculty name, ID, or discrepancy reason..."
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
        </div>
      </div>

      {/* Corrections Data Table */}
      <div className="panel">
        <div className="table-scroll">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>Request ID & Date</th>
                <th>Faculty Member</th>
                <th>Original Punch</th>
                <th>Requested Adjustments</th>
                <th>Discrepancy Justification</th>
                <th>Status & Reviewer</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center p-6 text-muted">
                    <RefreshCw size={20} className="admin-spin mb-1" style={{ display: 'inline', color: '#2563eb' }} />
                    <p style={{ margin: 0, fontSize: 12 }}>Loading discrepancy correction requests...</p>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center p-6 text-muted">
                    No attendance correction requests match the selected filters.
                  </td>
                </tr>
              ) : (
                items.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong style={{ color: '#0f172a' }}>#CR-{c.id}</strong>
                      <div style={{ fontSize: 11, color: '#2563eb', fontWeight: 600, marginTop: 2 }}>
                        {c.target_date}
                      </div>
                    </td>
                    <td>
                      <div className="faculty-row-identity">
                        <div className="faculty-avatar-circle" style={{ width: 26, height: 26, fontSize: 11 }}>
                          {c.faculty_name.charAt(0)}
                        </div>
                        <div className="faculty-row-meta">
                          <strong>{c.faculty_name}</strong>
                          <span>{c.employee_id} · {c.department_name || 'General Dept'}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: 11.5, color: '#64748b' }}>
                        In: <strong>{c.original_punch_in || '--:--'}</strong>
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>
                        Out: <strong>{c.original_punch_out || '--:--'}</strong>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: 11.5, color: '#166534' }}>
                        In: <strong>{c.requested_punch_in || '--:--'}</strong>
                      </div>
                      <div style={{ fontSize: 11, color: '#166534' }}>
                        Out: <strong>{c.requested_punch_out || '--:--'}</strong>
                      </div>
                    </td>
                    <td style={{ maxWidth: 280 }}>
                      <p style={{ margin: 0, fontSize: 12, color: '#334155', lineHeight: 1.4 }}>
                        {c.reason}
                      </p>
                    </td>
                    <td>
                      <div>{renderStatusBadge(c.status)}</div>
                      {c.reviewed_by_name && (
                        <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 4 }}>
                          By: {c.reviewed_by_name}
                        </div>
                      )}
                      {c.admin_remarks && (
                        <div style={{ fontSize: 10, color: c.status === 'rejected' ? '#dc2626' : '#166534', marginTop: 2 }}>
                          "{c.admin_remarks}"
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className={`button button-compact ${c.status === 'pending' ? 'button-primary' : 'button-secondary'}`}
                        onClick={() => handleOpenReview(c)}
                      >
                        {c.status === 'pending' ? (
                          <>
                            <FileEdit size={12} /> Review
                          </>
                        ) : (
                          <>
                            <Eye size={12} /> Audit Log
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ================= MODAL: REVIEW DISCREPANCY REQUEST ================= */}
      {reviewingCorrection && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal" style={{ width: 'min(680px, 100%)' }}>
            <div className="admin-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <FileEdit size={19} style={{ color: '#2563eb' }} />
                <h3>Review Correction Request #{reviewingCorrection.id}</h3>
              </div>
              <button
                type="button"
                className="button-link"
                onClick={() => setReviewingCorrection(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="admin-modal-body">
              {/* Faculty Info Card */}
              <div style={{ padding: '14px 18px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="faculty-avatar-circle" style={{ width: 34, height: 34, fontSize: 13 }}>
                      {reviewingCorrection.faculty_name.charAt(0)}
                    </div>
                    <div>
                      <strong style={{ fontSize: 13.5, color: '#0f172a' }}>{reviewingCorrection.faculty_name}</strong>
                      <div style={{ fontSize: 11, color: '#64748b' }}>
                        {reviewingCorrection.employee_id} · {reviewingCorrection.department_name || 'General Dept'} · {reviewingCorrection.faculty_email}
                      </div>
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: 12, color: '#64748b', marginRight: 8 }}>Target Date:</span>
                    <strong style={{ fontSize: 13, color: '#2563eb' }}>{reviewingCorrection.target_date}</strong>
                  </div>
                </div>
              </div>

              {/* Side-by-Side Comparison Box */}
              <div className="profile-grid mb-4">
                <div className="biometric-overview-box" style={{ background: '#f8fafc', borderColor: '#e2e8f0' }}>
                  <label style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                    Original Recorded Punches
                  </label>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#475569', marginTop: 6 }}>
                    Punch In: <strong>{reviewingCorrection.original_punch_in || 'None (Missing)'}</strong>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#475569', marginTop: 4 }}>
                    Punch Out: <strong>{reviewingCorrection.original_punch_out || 'None (Missing)'}</strong>
                  </div>
                  <span style={{ fontSize: 10.5, color: '#94a3b8', display: 'block', marginTop: 4 }}>
                    Actual biometric logs at gate terminal
                  </span>
                </div>

                <div className="biometric-overview-box" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
                  <label style={{ fontSize: 11, color: '#166534', textTransform: 'uppercase', fontWeight: 700 }}>
                    Requested Corrections
                  </label>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#15803d', marginTop: 6 }}>
                    Punch In: <strong>{reviewingCorrection.requested_punch_in || 'Unchanged'}</strong>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#15803d', marginTop: 4 }}>
                    Punch Out: <strong>{reviewingCorrection.requested_punch_out || 'Unchanged'}</strong>
                  </div>
                  <span style={{ fontSize: 10.5, color: '#16a34a', display: 'block', marginTop: 4 }}>
                    Faculty's proposed adjusted timings
                  </span>
                </div>
              </div>

              {/* Faculty Reason */}
              <div className="admin-form-group mb-4">
                <label className="admin-form-label">Faculty Discrepancy Explanation</label>
                <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12.5, color: '#334155', lineHeight: 1.5 }}>
                  {reviewingCorrection.reason}
                </div>
              </div>

              {/* Admin Remarks Input */}
              <div className="admin-form-group">
                <label className="admin-form-label">
                  Administrative Review Remarks {reviewingCorrection.status === 'pending' && <span className="text-muted">(Mandatory if rejecting)</span>}
                </label>
                <textarea
                  className="admin-textarea"
                  rows={3}
                  placeholder={
                    reviewingCorrection.status === 'pending'
                      ? 'Add remarks (e.g. Verified with gate security physical logbook entry at 17:02; or Reason for declining)...'
                      : 'Reviewer remarks'
                  }
                  value={adminRemarks}
                  onChange={(e) => setAdminRemarks(e.target.value)}
                  disabled={reviewingCorrection.status !== 'pending' || reviewBusy}
                />
              </div>

              {/* Historical audit trail info if already resolved */}
              {reviewingCorrection.status !== 'pending' && (
                <div style={{ padding: '10px 14px', background: reviewingCorrection.status === 'approved' ? '#f0fdf4' : '#fef2f2', borderRadius: 8, marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: reviewingCorrection.status === 'approved' ? '#166534' : '#991b1b' }}>
                    Status: {reviewingCorrection.status.toUpperCase()} by {reviewingCorrection.reviewed_by_name || 'Admin'} at {reviewingCorrection.reviewed_at}
                  </div>
                </div>
              )}
            </div>

            <div className="admin-modal-footer">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setReviewingCorrection(null)}
                disabled={reviewBusy}
              >
                Close
              </button>

              {reviewingCorrection.status === 'pending' && (
                <>
                  <button
                    type="button"
                    className="button button-danger"
                    onClick={() => handleReviewAction('reject')}
                    disabled={reviewBusy}
                  >
                    Decline Request
                  </button>
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => handleReviewAction('approve')}
                    disabled={reviewBusy}
                  >
                    {reviewBusy ? 'Processing...' : 'Approve & Update Attendance'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: SUBMIT CORRECTION ON BEHALF ================= */}
      {showSubmitModal && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal" style={{ width: 'min(580px, 100%)' }}>
            <div className="admin-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Plus size={19} style={{ color: '#2563eb' }} />
                <h3>Submit Attendance Correction Request</h3>
              </div>
              <button
                type="button"
                className="button-link"
                onClick={() => setShowSubmitModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitCorrection}>
              <div className="admin-modal-body">
                <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#475569' }}>
                  Submit a punch discrepancy request on behalf of a visiting faculty member. Once submitted, it enters the review queue for verification.
                </p>

                <div className="profile-grid">
                  {/* Faculty Member */}
                  <div className="admin-form-group">
                    <label className="admin-form-label">
                      Visiting Faculty Member <span className="text-red">*</span>
                    </label>
                    <select
                      className="admin-select"
                      value={submittingUserId}
                      onChange={(e) => setSubmittingUserId(Number(e.target.value))}
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

                  {/* Target Date */}
                  <div className="admin-form-group">
                    <label className="admin-form-label">
                      Discrepancy Date <span className="text-red">*</span>
                    </label>
                    <input
                      type="date"
                      className="admin-input"
                      value={submitDate}
                      onChange={(e) => setSubmitDate(e.target.value)}
                      required
                    />
                  </div>

                  {/* Requested Timings */}
                  <div className="admin-form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="admin-form-label">Proposed Accurate Timestamps</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <small style={{ display: 'block', fontSize: 10.5, color: '#64748b', marginBottom: 2 }}>
                          Requested Punch In
                        </small>
                        <input
                          type="time"
                          className="admin-input"
                          value={submitPunchIn}
                          onChange={(e) => setSubmitPunchIn(e.target.value)}
                        />
                      </div>
                      <span style={{ marginTop: 14 }}>to</span>
                      <div style={{ flex: 1 }}>
                        <small style={{ display: 'block', fontSize: 10.5, color: '#64748b', marginBottom: 2 }}>
                          Requested Punch Out
                        </small>
                        <input
                          type="time"
                          className="admin-input"
                          value={submitPunchOut}
                          onChange={(e) => setSubmitPunchOut(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Reason */}
                <div className="admin-form-group" style={{ marginTop: 12 }}>
                  <label className="admin-form-label">
                    Discrepancy Reason & Justification <span className="text-red">*</span>
                  </label>
                  <textarea
                    className="admin-textarea"
                    rows={3}
                    placeholder="Provide full explanation (e.g. Biometric device network failure at Gate 2; University field evaluation assignment)..."
                    value={submitReason}
                    onChange={(e) => setSubmitReason(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setShowSubmitModal(false)}
                  disabled={submitBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={submitBusy}
                >
                  {submitBusy ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
