import React, { useEffect, useState } from 'react'
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  Filter,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  User,
  X,
  XCircle,
} from 'lucide-react'
import { api, errorMessage, fetchJson } from './api'

interface AvailabilityItem {
  id: number
  faculty_id: number
  faculty_name: string
  employee_id: string
  faculty_email: string
  department_id: number | null
  department_name: string | null
  day_of_week: number
  day_name: string
  start_time: string
  end_time: string
  is_available: boolean
  status: string
  notes: string | null
  reviewed_by_id: number | null
  reviewed_by_name: string | null
  reviewed_at: string | null
  admin_remarks: string | null
}

interface AvailabilityKPIs {
  total_windows: number
  approved_windows: number
  pending_requests: number
  blackout_windows: number
  faculty_covered: number
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

const WEEKDAYS = [
  { index: 0, name: 'Monday' },
  { index: 1, name: 'Tuesday' },
  { index: 2, name: 'Wednesday' },
  { index: 3, name: 'Thursday' },
  { index: 4, name: 'Friday' },
  { index: 5, name: 'Saturday' },
  { index: 6, name: 'Sunday' },
]

export const AvailabilityManagementPage: React.FC = () => {
  const [items, setItems] = useState<AvailabilityItem[]>([])
  const [kpis, setKpis] = useState<AvailabilityKPIs>({
    total_windows: 0,
    approved_windows: 0,
    pending_requests: 0,
    blackout_windows: 0,
    faculty_covered: 0,
  })
  const [loading, setLoading] = useState(false)
  const [departments, setDepartments] = useState<LookupDepartment[]>([])
  const [facultyMembers, setFacultyMembers] = useState<LookupFaculty[]>([])

  // Filters & View Mode
  const [viewMode, setViewMode] = useState<'matrix' | 'table'>('table')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'available' | 'blackout'>('all')
  const [dayFilter, setDayFilter] = useState<number | 'all'>('all')
  const [deptFilter, setDeptFilter] = useState<number | 'all'>('all')

  // Modals state
  const [showAddEditModal, setShowAddEditModal] = useState(false)
  const [editingItem, setEditingItem] = useState<AvailabilityItem | null>(null)
  const [formFacultyId, setFormFacultyId] = useState<number | ''>('')
  const [formDayOfWeek, setFormDayOfWeek] = useState<number>(0)
  const [formStartTime, setFormStartTime] = useState('09:00')
  const [formEndTime, setFormEndTime] = useState('13:00')
  const [formIsAvailable, setFormIsAvailable] = useState<boolean>(true)
  const [formNotes, setFormNotes] = useState('')
  const [savingBusy, setSavingBusy] = useState(false)

  // Review Modal state
  const [reviewingItem, setReviewingItem] = useState<AvailabilityItem | null>(null)
  const [reviewRemarks, setReviewRemarks] = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)

  // Inspect detail drawer/modal state
  const [inspectItem, setInspectItem] = useState<AvailabilityItem | null>(null)

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
        setFacultyMembers((facRes || []).filter((f) => f.role === 'faculty' || f.designation?.includes('Faculty') || f.designation?.includes('Professor') || f.designation?.includes('Lecturer')))
      } catch (err) {
        console.error('Failed to load auxiliary lookups', err)
      }
    }
    void loadLookups()
  }, [])

  // Load Availability Windows & KPIs
  const loadAvailabilities = async () => {
    setLoading(true)
    setFeedback(null)
    try {
      const params: Record<string, any> = {}
      if (search.trim()) params.search = search.trim()
      if (statusFilter !== 'all') params.status_filter = statusFilter
      if (dayFilter !== 'all') params.day_of_week = dayFilter
      if (deptFilter !== 'all') params.department_id = deptFilter
      if (typeFilter === 'available') params.is_available = true
      if (typeFilter === 'blackout') params.is_available = false

      const { data } = await api.get<{ items: AvailabilityItem[]; kpis: AvailabilityKPIs }>(
        '/admin/faculty-availability',
        { params }
      )
      setItems(data.items || [])
      setKpis(data.kpis || {
        total_windows: 0,
        approved_windows: 0,
        pending_requests: 0,
        blackout_windows: 0,
        faculty_covered: 0,
      })
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAvailabilities()
  }, [search, statusFilter, typeFilter, dayFilter, deptFilter])

  // Open Add Modal
  const handleOpenAdd = () => {
    setEditingItem(null)
    setFormFacultyId(facultyMembers[0]?.id || '')
    setFormDayOfWeek(0)
    setFormStartTime('09:00')
    setFormEndTime('13:00')
    setFormIsAvailable(true)
    setFormNotes('')
    setShowAddEditModal(true)
  }

  // Open Edit Modal
  const handleOpenEdit = (item: AvailabilityItem) => {
    setEditingItem(item)
    setFormFacultyId(item.faculty_id)
    setFormDayOfWeek(item.day_of_week)
    setFormStartTime(item.start_time)
    setFormEndTime(item.end_time)
    setFormIsAvailable(item.is_available)
    setFormNotes(item.notes || '')
    setShowAddEditModal(true)
  }

  // Save Add or Edit
  const handleSaveWindow = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formStartTime || !formEndTime) {
      alert('Please provide both start and end times.')
      return
    }
    if (formEndTime <= formStartTime) {
      alert('End time must be strictly after start time.')
      return
    }

    setSavingBusy(true)
    try {
      if (editingItem) {
        await api.put(`/admin/faculty-availability/${editingItem.id}`, {
          start_time: formStartTime,
          end_time: formEndTime,
          is_available: formIsAvailable,
          notes: formNotes.trim() || undefined,
        })
        setFeedback({ type: 'success', message: 'Availability window updated successfully.' })
      } else {
        if (!formFacultyId) {
          alert('Please select a faculty member.')
          setSavingBusy(false)
          return
        }
        await api.post('/admin/faculty-availability', {
          faculty_id: Number(formFacultyId),
          day_of_week: Number(formDayOfWeek),
          start_time: formStartTime,
          end_time: formEndTime,
          is_available: formIsAvailable,
          notes: formNotes.trim() || undefined,
        })
        setFeedback({ type: 'success', message: 'Faculty availability window defined and approved.' })
      }
      setShowAddEditModal(false)
      loadAvailabilities()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setSavingBusy(false)
    }
  }

  // Open Review Modal
  const handleOpenReview = (item: AvailabilityItem) => {
    setReviewingItem(item)
    setReviewRemarks(item.admin_remarks || '')
  }

  // Submit Review Action
  const handleReviewAction = async (action: 'approve' | 'reject') => {
    if (!reviewingItem) return
    if (action === 'reject' && !reviewRemarks.trim()) {
      alert('Please provide remarks explaining why the faculty request is rejected.')
      return
    }

    setReviewBusy(true)
    try {
      await api.post(`/admin/faculty-availability/${reviewingItem.id}/review`, {
        action,
        admin_remarks: reviewRemarks.trim() || undefined,
      })
      setFeedback({
        type: 'success',
        message: `Availability window for ${reviewingItem.faculty_name} has been ${action === 'approve' ? 'approved' : 'rejected'}.`,
      })
      setReviewingItem(null)
      loadAvailabilities()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setReviewBusy(false)
    }
  }

  // Delete Window
  const handleDeleteWindow = async (item: AvailabilityItem) => {
    if (!confirm(`Are you sure you want to delete this availability window for ${item.faculty_name}?`)) {
      return
    }
    try {
      await api.delete(`/admin/faculty-availability/${item.id}`)
      setFeedback({ type: 'success', message: 'Availability window deleted successfully.' })
      loadAvailabilities()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    }
  }

  return (
    <div className="admin-page-container">
      {/* Header */}
      <div className="admin-page-header">
        <div>
          <span className="admin-page-eyebrow">WORK PREFERENCES & TIMETABLE CONSTRAINTS</span>
          <h1 className="admin-page-title">Faculty Availability Management</h1>
          <p className="admin-page-description">
            Define recurring weekly availability windows, review visiting faculty preference submissions, lock verified scheduling slots, and manage blackout periods.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => loadAvailabilities()}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={handleOpenAdd}
          >
            <Plus size={15} />
            <span>Define Availability</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div className={`notification-banner ${feedback.type === 'success' ? 'banner-success' : 'banner-error'}`} style={{ marginBottom: '1.25rem' }}>
          {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{feedback.message}</span>
          <button type="button" onClick={() => setFeedback(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
            <X size={15} />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
            <CheckCircle2 size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Approved Windows</span>
            <span className="stat-value">{kpis.approved_windows}</span>
            <span className="stat-note" style={{ color: '#10b981' }}>Locked into Master Timetable</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
            <Clock size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Pending Requests</span>
            <span className="stat-value">{kpis.pending_requests}</span>
            <span className="stat-note" style={{ color: '#f59e0b' }}>Awaiting Admin Approval</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
            <XCircle size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Blackout Periods</span>
            <span className="stat-value">{kpis.blackout_windows}</span>
            <span className="stat-note" style={{ color: '#ef4444' }}>Hard Schedule Restrictions</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}>
            <User size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Faculty Covered</span>
            <span className="stat-value">{kpis.faculty_covered}</span>
            <span className="stat-note" style={{ color: '#6366f1' }}>With Approved Availability</span>
          </div>
        </div>
      </div>

      {/* Filter and View Controls Bar */}
      <div className="panel" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', flex: 1 }}>
            {/* Search */}
            <div style={{ position: 'relative', minWidth: '240px' }}>
              <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                className="input-field"
                placeholder="Search faculty, email, ID..."
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
              style={{ width: '140px' }}
            >
              <option value="all">All Statuses</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
            </select>

            {/* Type Filter */}
            <select
              className="select-field"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              style={{ width: '150px' }}
            >
              <option value="all">All Window Types</option>
              <option value="available">Available Slots</option>
              <option value="blackout">Blackout Periods</option>
            </select>

            {/* Day Filter */}
            <select
              className="select-field"
              value={dayFilter}
              onChange={(e) => setDayFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              style={{ width: '130px' }}
            >
              <option value="all">All Days</option>
              {WEEKDAYS.map((d) => (
                <option key={d.index} value={d.index}>
                  {d.name}
                </option>
              ))}
            </select>

            {/* Department Filter */}
            <select
              className="select-field"
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              style={{ width: '170px' }}
            >
              <option value="all">All Departments</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>

          {/* View Mode Toggle */}
          <div style={{ display: 'flex', background: '#0f172a', padding: '3px', borderRadius: '8px', border: '1px solid #1e293b' }}>
            <button
              type="button"
              className={`button ${viewMode === 'table' ? 'button-primary' : 'button-ghost'}`}
              onClick={() => setViewMode('table')}
              style={{ padding: '6px 12px', fontSize: '0.8rem' }}
            >
              <Filter size={14} style={{ marginRight: '4px' }} />
              <span>Table List</span>
            </button>
            <button
              type="button"
              className={`button ${viewMode === 'matrix' ? 'button-primary' : 'button-ghost'}`}
              onClick={() => setViewMode('matrix')}
              style={{ padding: '6px 12px', fontSize: '0.8rem' }}
            >
              <Calendar size={14} style={{ marginRight: '4px' }} />
              <span>Weekly Grid</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {viewMode === 'table' ? (
        /* TABLE LIST VIEW */
        <div className="panel">
          <div className="table-scroll">
            <table className="admin-data-table">
              <thead>
                <tr>
                  <th>Faculty Member</th>
                  <th>Department</th>
                  <th>Day of Week</th>
                  <th>Time Slot</th>
                  <th>Window Type</th>
                  <th>Status</th>
                  <th>Admin Remarks</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem' }}>
                      <RefreshCw size={24} className="spin" style={{ margin: '0 auto 0.5rem', color: '#6366f1' }} />
                      <p>Loading faculty availability windows...</p>
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>
                      <Calendar size={36} style={{ margin: '0 auto 0.5rem', opacity: 0.4 }} />
                      <p>No availability windows found matching the current filters.</p>
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id}>
                      {/* Faculty info */}
                      <td>
                        <div style={{ fontWeight: 600, color: '#f8fafc' }}>{item.faculty_name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          ID: {item.employee_id || 'N/A'} • {item.faculty_email}
                        </div>
                      </td>

                      {/* Department */}
                      <td>
                        <span className="badge badge-neutral">
                          {item.department_name || 'General'}
                        </span>
                      </td>

                      {/* Day of Week */}
                      <td>
                        <span style={{ fontWeight: 500, color: '#38bdf8' }}>{item.day_name}</span>
                      </td>

                      {/* Time Slot */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Clock size={13} style={{ color: '#94a3b8' }} />
                          <span style={{ fontWeight: 600, color: '#f1f5f9' }}>
                            {item.start_time} - {item.end_time}
                          </span>
                        </div>
                      </td>

                      {/* Window Type */}
                      <td>
                        {item.is_available ? (
                          <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Check size={12} /> Available Slot
                          </span>
                        ) : (
                          <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <X size={12} /> Blackout Period
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td>
                        {item.status === 'approved' && (
                          <span className="badge badge-success">Approved</span>
                        )}
                        {item.status === 'pending' && (
                          <span className="badge badge-warning">Pending Review</span>
                        )}
                        {item.status === 'rejected' && (
                          <span className="badge badge-danger">Rejected</span>
                        )}
                      </td>

                      {/* Notes / Remarks */}
                      <td>
                        <div style={{ maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem', color: '#cbd5e1' }} title={item.admin_remarks || item.notes || ''}>
                          {item.admin_remarks ? (
                            <span><strong style={{ color: '#94a3b8' }}>Admin:</strong> {item.admin_remarks}</span>
                          ) : item.notes ? (
                            <span><strong style={{ color: '#94a3b8' }}>Note:</strong> {item.notes}</span>
                          ) : (
                            <span style={{ color: '#64748b' }}>None</span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                          {item.status === 'pending' ? (
                            <button
                              type="button"
                              className="button button-primary"
                              onClick={() => handleOpenReview(item)}
                              title="Review & Approve/Reject"
                              style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                            >
                              <CheckCircle2 size={13} style={{ marginRight: '4px' }} />
                              <span>Review</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="button button-ghost"
                              onClick={() => setInspectItem(item)}
                              title="View Details"
                              style={{ padding: '4px 8px' }}
                            >
                              <Eye size={14} />
                            </button>
                          )}

                          <button
                            type="button"
                            className="button button-ghost"
                            onClick={() => handleOpenEdit(item)}
                            title="Edit Timing"
                            style={{ padding: '4px 8px' }}
                          >
                            <Calendar size={14} />
                          </button>

                          <button
                            type="button"
                            className="button button-ghost"
                            onClick={() => handleDeleteWindow(item)}
                            title="Delete Window"
                            style={{ padding: '4px 8px', color: '#ef4444' }}
                          >
                            <Trash2 size={14} />
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
      ) : (
        /* WEEKLY MATRIX GRID VIEW */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          {WEEKDAYS.map((day) => {
            const dayItems = items.filter((it) => it.day_of_week === day.index)
            return (
              <div key={day.index} className="panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b', paddingBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#f8fafc' }}>{day.name}</div>
                  <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
                    {dayItems.length} {dayItems.length === 1 ? 'slot' : 'slots'}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minHeight: '180px' }}>
                  {dayItems.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#64748b', margin: 'auto', fontSize: '0.8rem' }}>
                      No slots defined
                    </div>
                  ) : (
                    dayItems.map((slot) => (
                      <div
                        key={slot.id}
                        onClick={() => setInspectItem(slot)}
                        style={{
                          background: slot.is_available
                            ? slot.status === 'approved'
                              ? 'rgba(16, 185, 129, 0.08)'
                              : 'rgba(245, 158, 11, 0.08)'
                            : 'rgba(239, 68, 68, 0.08)',
                          border: `1px solid ${
                            slot.is_available
                              ? slot.status === 'approved'
                                ? 'rgba(16, 185, 129, 0.3)'
                                : 'rgba(245, 158, 11, 0.3)'
                              : 'rgba(239, 68, 68, 0.3)'
                          }`,
                          borderRadius: '6px',
                          padding: '0.6rem 0.75rem',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#f1f5f9' }}>
                            {slot.faculty_name}
                          </span>
                          <span
                            className={`badge ${
                              slot.status === 'approved'
                                ? 'badge-success'
                                : slot.status === 'pending'
                                ? 'badge-warning'
                                : 'badge-danger'
                            }`}
                            style={{ fontSize: '0.65rem' }}
                          >
                            {slot.status}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8' }}>
                          <span>{slot.start_time} - {slot.end_time}</span>
                          <span style={{ color: slot.is_available ? '#10b981' : '#ef4444' }}>
                            {slot.is_available ? 'Available' : 'Blackout'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* INSPECT DETAIL MODAL */}
      {inspectItem && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Availability Window Details</h2>
              <button type="button" className="modal-close-button" onClick={() => setInspectItem(null)}>
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem 0' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Faculty</span>
                  <div style={{ fontWeight: 600, color: '#f8fafc' }}>{inspectItem.faculty_name}</div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{inspectItem.employee_id}</div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Department</span>
                  <div style={{ fontWeight: 600, color: '#f8fafc' }}>{inspectItem.department_name || 'General'}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Day of Week</span>
                  <div style={{ fontWeight: 600, color: '#38bdf8' }}>{inspectItem.day_name}</div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Time Slot</span>
                  <div style={{ fontWeight: 600, color: '#f8fafc' }}>{inspectItem.start_time} - {inspectItem.end_time}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Window Type</span>
                  <div>
                    {inspectItem.is_available ? (
                      <span className="badge badge-success">Available Slot</span>
                    ) : (
                      <span className="badge badge-danger">Blackout Period</span>
                    )}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Approval Status</span>
                  <div>
                    <span className={`badge ${inspectItem.status === 'approved' ? 'badge-success' : inspectItem.status === 'pending' ? 'badge-warning' : 'badge-danger'}`}>
                      {inspectItem.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              {inspectItem.notes && (
                <div style={{ background: '#0f172a', padding: '0.75rem', borderRadius: '6px', border: '1px solid #1e293b' }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>Faculty Note</span>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#e2e8f0' }}>{inspectItem.notes}</p>
                </div>
              )}

              {inspectItem.reviewed_by_name && (
                <div style={{ background: '#0f172a', padding: '0.75rem', borderRadius: '6px', border: '1px solid #1e293b' }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>
                    Reviewed by {inspectItem.reviewed_by_name} {inspectItem.reviewed_at ? `on ${new Date(inspectItem.reviewed_at).toLocaleDateString()}` : ''}
                  </span>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#e2e8f0' }}>{inspectItem.admin_remarks || 'No remarks provided.'}</p>
                </div>
              )}
            </div>
            <div className="modal-footer">
              {inspectItem.status === 'pending' && (
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => {
                    const it = inspectItem
                    setInspectItem(null)
                    handleOpenReview(it)
                  }}
                  style={{ marginRight: 'auto' }}
                >
                  <CheckCircle2 size={15} />
                  <span>Review Decision</span>
                </button>
              )}
              <button type="button" className="button button-secondary" onClick={() => setInspectItem(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REVIEW DECISION MODAL */}
      {reviewingItem && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Review Faculty Availability Request</h2>
              <button type="button" className="modal-close-button" onClick={() => setReviewingItem(null)}>
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem 0' }}>
              <div style={{ background: '#0f172a', padding: '0.85rem', borderRadius: '6px', border: '1px solid #1e293b' }}>
                <div style={{ fontWeight: 600, color: '#f8fafc', marginBottom: '0.25rem' }}>{reviewingItem.faculty_name}</div>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  Slot: <strong>{reviewingItem.day_name}</strong> {reviewingItem.start_time} - {reviewingItem.end_time} ({reviewingItem.is_available ? 'Available' : 'Blackout'})
                </div>
                {reviewingItem.notes && (
                  <div style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: '0.5rem', fontStyle: 'italic' }}>
                    "{reviewingItem.notes}"
                  </div>
                )}
              </div>

              <div>
                <label className="form-label" htmlFor="admin-review-remarks">
                  Administrator Remarks (Optional for approval, required for rejection)
                </label>
                <textarea
                  id="admin-review-remarks"
                  className="input-field"
                  rows={3}
                  placeholder="Enter scheduling confirmation notes or rejection reason..."
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
                <span>Approve Window</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT AVAILABILITY MODAL */}
      {showAddEditModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <form onSubmit={handleSaveWindow}>
              <div className="modal-header">
                <h2 className="modal-title">
                  {editingItem ? 'Edit Availability Window' : 'Define Faculty Availability Window'}
                </h2>
                <button type="button" className="modal-close-button" onClick={() => setShowAddEditModal(false)}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem 0' }}>
                {/* Faculty selection (disabled if editing) */}
                {!editingItem ? (
                  <div>
                    <label className="form-label" htmlFor="faculty-select">Faculty Member *</label>
                    <select
                      id="faculty-select"
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
                ) : (
                  <div>
                    <label className="form-label">Faculty Member</label>
                    <div style={{ fontWeight: 600, color: '#f8fafc' }}>{editingItem.faculty_name}</div>
                  </div>
                )}

                {/* Day of Week */}
                {!editingItem ? (
                  <div>
                    <label className="form-label" htmlFor="day-of-week-select">Day of Week *</label>
                    <select
                      id="day-of-week-select"
                      className="select-field"
                      value={formDayOfWeek}
                      onChange={(e) => setFormDayOfWeek(Number(e.target.value))}
                      required
                    >
                      {WEEKDAYS.map((d) => (
                        <option key={d.index} value={d.index}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="form-label">Day of Week</label>
                    <div style={{ fontWeight: 600, color: '#38bdf8' }}>{editingItem.day_name}</div>
                  </div>
                )}

                {/* Timing */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label className="form-label" htmlFor="start-time-input">Start Time *</label>
                    <input
                      id="start-time-input"
                      type="time"
                      className="input-field"
                      value={formStartTime}
                      onChange={(e) => setFormStartTime(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label" htmlFor="end-time-input">End Time *</label>
                    <input
                      id="end-time-input"
                      type="time"
                      className="input-field"
                      value={formEndTime}
                      onChange={(e) => setFormEndTime(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Window Type: Available vs Blackout */}
                <div>
                  <label className="form-label">Window Type</label>
                  <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.25rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#10b981' }}>
                      <input
                        type="radio"
                        name="window_type"
                        checked={formIsAvailable}
                        onChange={() => setFormIsAvailable(true)}
                      />
                      <span>Available for Lectures</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#ef4444' }}>
                      <input
                        type="radio"
                        name="window_type"
                        checked={!formIsAvailable}
                        onChange={() => setFormIsAvailable(false)}
                      />
                      <span>Blackout / Unavailable</span>
                    </label>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="form-label" htmlFor="window-notes">Notes / Justification</label>
                  <textarea
                    id="window-notes"
                    className="input-field"
                    rows={2}
                    placeholder="E.g., Special research slot, university consultation blackout..."
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setShowAddEditModal(false)}
                  disabled={savingBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={savingBusy}
                >
                  {savingBusy ? 'Saving...' : editingItem ? 'Save Changes' : 'Confirm Window'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
