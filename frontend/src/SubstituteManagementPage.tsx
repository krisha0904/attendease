import React, { useEffect, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
  UserCheck,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react'
import { api, errorMessage, fetchJson } from './api'

interface SubstituteItem {
  id: number
  lecture_id: number
  lecture_date: string
  status: string
  remarks: string | null
  response_remarks: string | null
  acknowledgement_at: string | null
  created_at: string | null
  original_faculty_id: number
  original_faculty_name: string
  original_employee_id: string
  original_department: string | null
  substitute_faculty_id: number
  substitute_faculty_name: string
  substitute_employee_id: string
  substitute_department: string | null
  assigned_by_id: number | null
  assigned_by_name: string | null
  lecture: {
    id: number
    subject: string
    course_name: string
    room: string | null
    day_of_week: number
    day_name: string
    start_time: string
    end_time: string
    lecture_type: string
  } | null
}

interface SubstituteKPIs {
  total_substitutions: number
  pending_acknowledgements: number
  active_substitutions: number
  declined_count: number
  uncovered_leaves_count: number
}

interface CandidateFaculty {
  faculty_id: number
  full_name: string
  employee_id: string
  email: string
  department_id: number | null
  department_name: string
  is_same_department: boolean
  is_eligible: boolean
  conflict_reason: string | null
  match_score: number
}

interface LookupDepartment {
  id: number
  name: string
  code: string
}

interface LookupLecture {
  id: number
  subject: string
  course_name?: string
  user_name: string
  day_name: string
  start_time: string
  end_time: string
  department?: string
  room?: string
}

interface SubstituteManagementPageProps {
  onNavigateToTimetable?: () => void
}

export const SubstituteManagementPage: React.FC<SubstituteManagementPageProps> = () => {
  const [items, setItems] = useState<SubstituteItem[]>([])
  const [kpis, setKpis] = useState<SubstituteKPIs>({
    total_substitutions: 0,
    pending_acknowledgements: 0,
    active_substitutions: 0,
    declined_count: 0,
    uncovered_leaves_count: 0,
  })
  const [loading, setLoading] = useState(false)
  const [departments, setDepartments] = useState<LookupDepartment[]>([])
  const [lectures, setLectures] = useState<LookupLecture[]>([])

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [deptFilter, setDeptFilter] = useState<number | 'all'>('all')
  const [dateFilter, setDateFilter] = useState('')

  // Modal: Assign Substitute
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedLectureId, setSelectedLectureId] = useState<number | ''>('')
  const [targetDate, setTargetDate] = useState('')
  const [candidates, setCandidates] = useState<CandidateFaculty[]>([])
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  const [chosenSubId, setChosenSubId] = useState<number | null>(null)
  const [assignRemarks, setAssignRemarks] = useState('')
  const [assigningBusy, setAssigningBusy] = useState(false)

  // Modal: Review/Ack
  const [reviewingSub, setReviewingSub] = useState<SubstituteItem | null>(null)
  const [reviewActionRemarks, setReviewActionRemarks] = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)

  // Feedback banner
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Load Lookups
  useEffect(() => {
    const loadLookups = async () => {
      try {
        const [deptsRes, lecsRes] = await Promise.all([
          fetchJson<{ items: LookupDepartment[] }>('/admin/academic/departments').catch(() => ({ items: [] })),
          fetchJson<{ items: LookupLecture[] }>('/admin/timetable').catch(() => ({ items: [] })),
        ])
        setDepartments(deptsRes.items || [])
        setLectures(lecsRes.items || [])
      } catch (err) {
        console.error('Failed to load lookups', err)
      }
    }
    void loadLookups()
  }, [])

  // Load Substitutions
  const loadSubstitutions = async () => {
    setLoading(true)
    setFeedback(null)
    try {
      const params: Record<string, any> = {}
      if (search.trim()) params.search = search.trim()
      if (statusFilter !== 'all') params.status_filter = statusFilter
      if (deptFilter !== 'all') params.department_id = deptFilter
      if (dateFilter) params.date = dateFilter

      const { data } = await api.get<{ items: SubstituteItem[]; kpis: SubstituteKPIs }>(
        '/admin/substitutes',
        { params }
      )
      setItems(data.items || [])
      setKpis(
        data.kpis || {
          total_substitutions: 0,
          pending_acknowledgements: 0,
          active_substitutions: 0,
          declined_count: 0,
          uncovered_leaves_count: 0,
        }
      )
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSubstitutions()
  }, [search, statusFilter, deptFilter, dateFilter])

  // Discover eligible candidates whenever selected lecture or target date changes
  useEffect(() => {
    if (!selectedLectureId) {
      setCandidates([])
      return
    }

    const fetchEligible = async () => {
      setLoadingCandidates(true)
      try {
        const { data } = await api.get<{ candidates: CandidateFaculty[] }>(
          '/admin/substitutes/eligible-faculty',
          {
            params: {
              lecture_id: selectedLectureId,
              lecture_date: targetDate || undefined,
            },
          }
        )
        setCandidates(data.candidates || [])
        // auto select highest score eligible candidate
        const best = data.candidates?.find((c) => c.is_eligible)
        if (best) setChosenSubId(best.faculty_id)
        else setChosenSubId(null)
      } catch (err) {
        console.error('Error fetching candidates', err)
        setCandidates([])
      } finally {
        setLoadingCandidates(false)
      }
    }

    void fetchEligible()
  }, [selectedLectureId, targetDate])

  // Handle Assign Submit
  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedLectureId || !chosenSubId || !targetDate) {
      alert('Please select a lecture, target date, and an eligible substitute faculty member.')
      return
    }

    setAssigningBusy(true)
    try {
      await api.post('/admin/substitutes/assign', {
        lecture_id: Number(selectedLectureId),
        substitute_faculty_id: Number(chosenSubId),
        lecture_date: targetDate,
        remarks: assignRemarks.trim() || undefined,
      })
      setFeedback({ type: 'success', message: 'Substitute faculty assigned and notified successfully.' })
      setShowAssignModal(false)
      loadSubstitutions()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setAssigningBusy(false)
    }
  }

  // Handle Admin Acknowledge / Action
  const handleAdminAcknowledge = async (action: 'accept' | 'decline') => {
    if (!reviewingSub) return
    setReviewBusy(true)
    try {
      await api.post(`/admin/substitutes/${reviewingSub.id}/acknowledge`, {
        action,
        remarks: reviewActionRemarks.trim() || undefined,
      })
      setFeedback({
        type: 'success',
        message: `Substitution status updated to ${action === 'accept' ? 'Accepted' : 'Declined'}.`,
      })
      setReviewingSub(null)
      loadSubstitutions()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setReviewBusy(false)
    }
  }

  // Handle Revoke
  const handleRevoke = async (item: SubstituteItem) => {
    if (!confirm(`Are you sure you want to revoke the substitution assignment for ${item.substitute_faculty_name}?`)) {
      return
    }
    try {
      await api.delete(`/admin/substitutes/${item.id}`)
      setFeedback({ type: 'success', message: 'Substitute assignment revoked successfully.' })
      loadSubstitutions()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    }
  }

  return (
    <div className="admin-page-container">
      {/* Header */}
      <div className="admin-page-header">
        <div>
          <span className="admin-page-eyebrow">CONTINGENCY REPLACEMENTS & LECTURE COVERAGE</span>
          <h1 className="admin-page-title">Substitute Faculty Management</h1>
          <p className="admin-page-description">
            Discover subject-qualified faculty, verify real-time timetable and absence conflicts, coordinate contingency replacement acknowledgements, and track lecture coverage.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => loadSubstitutions()}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              if (lectures.length > 0) setSelectedLectureId(lectures[0].id)
              setTargetDate(new Date().toISOString().slice(0, 10))
              setAssignRemarks('')
              setShowAssignModal(true)
            }}
          >
            <UserPlus size={15} />
            <span>New Replacement Assignment</span>
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
          <div className="stat-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
            <UserCheck size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Active Substitutions</span>
            <span className="stat-value">{kpis.active_substitutions}</span>
            <span className="stat-note" style={{ color: '#10b981' }}>Confirmed & Assigned</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
            <Clock size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Pending Acknowledgement</span>
            <span className="stat-value">{kpis.pending_acknowledgements}</span>
            <span className="stat-note" style={{ color: '#f59e0b' }}>Awaiting Faculty Response</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
            <AlertTriangle size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Uncovered Absences</span>
            <span className="stat-value">{kpis.uncovered_leaves_count}</span>
            <span className="stat-note" style={{ color: '#ef4444' }}>Lectures Needing Replacement</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}>
            <Calendar size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Total Contingencies</span>
            <span className="stat-value">{kpis.total_substitutions}</span>
            <span className="stat-note" style={{ color: '#6366f1' }}>Historical Replacements</span>
          </div>
        </div>
      </div>

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
              placeholder="Search faculty, subject, course, remarks..."
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
            style={{ width: '160px' }}
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending Response</option>
            <option value="accepted">Accepted / Active</option>
            <option value="declined">Declined</option>
            <option value="revoked">Revoked</option>
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

          {/* Date Picker */}
          <input
            type="date"
            className="input-field"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            style={{ width: '160px' }}
          />
          {dateFilter && (
            <button
              type="button"
              className="button button-ghost"
              onClick={() => setDateFilter('')}
              style={{ padding: '6px' }}
              title="Clear date"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="panel">
        <div className="table-scroll">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>Lecture & Subject</th>
                <th>Schedule & Date</th>
                <th>Original Faculty</th>
                <th>Substitute Faculty</th>
                <th>Status</th>
                <th>Remarks & Response</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem' }}>
                    <RefreshCw size={24} className="spin" style={{ margin: '0 auto 0.5rem', color: '#6366f1' }} />
                    <p>Loading contingency assignments...</p>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>
                    <UserCheck size={36} style={{ margin: '0 auto 0.5rem', opacity: 0.4 }} />
                    <p>No substitute assignments found matching criteria.</p>
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id}>
                    {/* Lecture & Subject */}
                    <td>
                      <div style={{ fontWeight: 600, color: '#f8fafc' }}>
                        {item.lecture?.subject || 'Lecture'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        {item.lecture?.course_name || 'N/A'} • Room: {item.lecture?.room || 'TBD'}
                      </div>
                    </td>

                    {/* Schedule & Date */}
                    <td>
                      <div style={{ fontWeight: 600, color: '#f1f5f9' }}>{item.lecture_date}</div>
                      <div style={{ fontSize: '0.75rem', color: '#38bdf8' }}>
                        {item.lecture?.day_name} {item.lecture?.start_time} - {item.lecture?.end_time}
                      </div>
                    </td>

                    {/* Original Faculty */}
                    <td>
                      <div style={{ fontWeight: 500, color: '#cbd5e1' }}>{item.original_faculty_name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        {item.original_employee_id || 'N/A'} • {item.original_department || 'General'}
                      </div>
                    </td>

                    {/* Substitute Faculty */}
                    <td>
                      <div style={{ fontWeight: 600, color: '#38bdf8' }}>{item.substitute_faculty_name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        {item.substitute_employee_id || 'N/A'} • {item.substitute_department || 'General'}
                      </div>
                    </td>

                    {/* Status */}
                    <td>
                      {item.status === 'accepted' && <span className="badge badge-success">Accepted / Active</span>}
                      {item.status === 'pending' && <span className="badge badge-warning">Pending Acknowledgment</span>}
                      {item.status === 'declined' && <span className="badge badge-danger">Declined</span>}
                      {item.status === 'revoked' && <span className="badge badge-neutral">Revoked</span>}
                    </td>

                    {/* Remarks & Response */}
                    <td>
                      <div style={{ fontSize: '0.8rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.response_remarks || item.remarks || ''}>
                        {item.response_remarks ? (
                          <span><strong>Sub:</strong> {item.response_remarks}</span>
                        ) : item.remarks ? (
                          <span><strong>Admin:</strong> {item.remarks}</span>
                        ) : (
                          <span style={{ color: '#64748b' }}>None</span>
                        )}
                      </div>
                      {item.acknowledgement_at && (
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                          Ack: {new Date(item.acknowledgement_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                        {item.status === 'pending' && (
                          <button
                            type="button"
                            className="button button-primary"
                            onClick={() => {
                              setReviewingSub(item)
                              setReviewActionRemarks('')
                            }}
                            title="Acknowledge or Override Response"
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                          >
                            <CheckCircle2 size={13} style={{ marginRight: '4px' }} />
                            <span>Action</span>
                          </button>
                        )}

                        {item.status !== 'revoked' && (
                          <button
                            type="button"
                            className="button button-ghost"
                            onClick={() => handleRevoke(item)}
                            title="Revoke Assignment"
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

      {/* MODAL: ASSIGN SUBSTITUTE */}
      {showAssignModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '640px' }}>
            <form onSubmit={handleAssignSubmit}>
              <div className="modal-header">
                <h2 className="modal-title">Assign Contingency Substitute Faculty</h2>
                <button type="button" className="modal-close-button" onClick={() => setShowAssignModal(false)}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem 0' }}>
                {/* Step 1: Select Lecture */}
                <div>
                  <label className="form-label" htmlFor="sub-lecture-select">Select Timetable Lecture *</label>
                  <select
                    id="sub-lecture-select"
                    className="select-field"
                    value={selectedLectureId}
                    onChange={(e) => setSelectedLectureId(e.target.value === '' ? '' : Number(e.target.value))}
                    required
                  >
                    <option value="">Choose Lecture to Cover...</option>
                    {lectures.map((lec) => (
                      <option key={lec.id} value={lec.id}>
                        {lec.subject} ({lec.day_name} {lec.start_time}-{lec.end_time}) - Prof. {lec.user_name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Step 2: Target Date */}
                <div>
                  <label className="form-label" htmlFor="sub-target-date">Coverage Date *</label>
                  <input
                    id="sub-target-date"
                    type="date"
                    className="input-field"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    required
                  />
                </div>

                {/* Step 3: Candidate Selection */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <label className="form-label" style={{ margin: 0 }}>
                      Eligible Substitute Candidates ({candidates.filter((c) => c.is_eligible).length} available)
                    </label>
                    {loadingCandidates && (
                      <span style={{ fontSize: '0.75rem', color: '#6366f1' }}>Checking timetable & absence conflicts...</span>
                    )}
                  </div>

                  <div
                    style={{
                      maxHeight: '220px',
                      overflowY: 'auto',
                      border: '1px solid #1e293b',
                      borderRadius: '8px',
                      padding: '0.5rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.4rem',
                      background: '#0f172a',
                    }}
                  >
                    {candidates.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8', fontSize: '0.85rem' }}>
                        {selectedLectureId ? 'No candidates discovered' : 'Select a lecture above to find eligible faculty'}
                      </div>
                    ) : (
                      candidates.map((cand) => (
                        <div
                          key={cand.faculty_id}
                          onClick={() => {
                            if (cand.is_eligible) setChosenSubId(cand.faculty_id)
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.6rem 0.75rem',
                            borderRadius: '6px',
                            background: chosenSubId === cand.faculty_id ? 'rgba(99, 102, 241, 0.15)' : '#1e293b',
                            border: `1px solid ${
                              chosenSubId === cand.faculty_id
                                ? '#6366f1'
                                : cand.is_eligible
                                ? 'transparent'
                                : 'rgba(239, 68, 68, 0.2)'
                            }`,
                            opacity: cand.is_eligible ? 1 : 0.6,
                            cursor: cand.is_eligible ? 'pointer' : 'not-allowed',
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.85rem' }}>
                              {cand.full_name}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                              {cand.employee_id} • {cand.department_name}
                            </div>
                            {cand.conflict_reason && (
                              <div style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: '0.2rem' }}>
                                ⚠ {cand.conflict_reason}
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {cand.is_eligible ? (
                              <span
                                className={`badge ${cand.match_score === 100 ? 'badge-success' : 'badge-neutral'}`}
                                style={{ fontSize: '0.7rem' }}
                              >
                                {cand.match_score}% Match
                              </span>
                            ) : (
                              <span className="badge badge-danger" style={{ fontSize: '0.7rem' }}>
                                Ineligible
                              </span>
                            )}
                            {chosenSubId === cand.faculty_id && <Check size={16} color="#6366f1" />}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Step 4: Remarks */}
                <div>
                  <label className="form-label" htmlFor="sub-remarks">Administrative Remarks / Instructions</label>
                  <textarea
                    id="sub-remarks"
                    className="input-field"
                    rows={2}
                    placeholder="E.g., Please cover Chapter 4 Lecture slides and take attendance."
                    value={assignRemarks}
                    onChange={(e) => setAssignRemarks(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setShowAssignModal(false)}
                  disabled={assigningBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={assigningBusy || !chosenSubId}
                >
                  {assigningBusy ? 'Assigning...' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADMIN ACKNOWLEDGE / OVERRIDE */}
      {reviewingSub && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Acknowledge Contingency Coverage</h2>
              <button type="button" className="modal-close-button" onClick={() => setReviewingSub(null)}>
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem 0' }}>
              <div style={{ background: '#0f172a', padding: '0.85rem', borderRadius: '6px', border: '1px solid #1e293b' }}>
                <div style={{ fontWeight: 600, color: '#f8fafc' }}>{reviewingSub.lecture?.subject}</div>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  Date: {reviewingSub.lecture_date} • Substitute: <strong>{reviewingSub.substitute_faculty_name}</strong>
                </div>
              </div>

              <div>
                <label className="form-label" htmlFor="review-action-remarks">Response Notes / Confirmation</label>
                <textarea
                  id="review-action-remarks"
                  className="input-field"
                  rows={2}
                  placeholder="E.g., Faculty verbally confirmed coverage via departmental phone."
                  value={reviewActionRemarks}
                  onChange={(e) => setReviewActionRemarks(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setReviewingSub(null)}
                disabled={reviewBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button button-danger"
                onClick={() => handleAdminAcknowledge('decline')}
                disabled={reviewBusy}
              >
                <XCircle size={15} />
                <span>Mark Declined</span>
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={() => handleAdminAcknowledge('accept')}
                disabled={reviewBusy}
              >
                <Check size={15} />
                <span>Mark Accepted</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
