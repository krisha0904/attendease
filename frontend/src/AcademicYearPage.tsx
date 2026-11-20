import React, { useEffect, useState } from 'react'
import {
  AlertCircle, Archive, Calendar, CalendarCheck, CalendarDays,
  Check, CheckCircle2, ChevronRight, Edit3, Plus, RefreshCw, X
} from 'lucide-react'
import { api, errorMessage, fetchJson } from './api'

interface AcademicYearItem {
  id: number
  name: string
  start_date: string | null
  end_date: string | null
  is_current: boolean
  is_archived: boolean
  created_at: string | null
}

export function AcademicYearPage() {
  const [years, setYears] = useState<AcademicYearItem[]>([])
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Add / Edit Modal
  const [showModal, setShowModal] = useState(false)
  const [editingYear, setEditingYear] = useState<AcademicYearItem | null>(null)
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [isCurrent, setIsCurrent] = useState(false)
  const [busy, setBusy] = useState(false)

  const loadYears = async () => {
    setLoading(true)
    try {
      const res = await fetchJson<AcademicYearItem[]>('/admin/academic/academic-years')
      setYears(res)
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadYears()
  }, [])

  const openAddModal = () => {
    setEditingYear(null)
    setName('')
    setStartDate('')
    setEndDate('')
    setIsCurrent(years.length === 0)
    setShowModal(true)
  }

  const openEditModal = (y: AcademicYearItem) => {
    setEditingYear(y)
    setName(y.name)
    setStartDate(y.start_date || '')
    setEndDate(y.end_date || '')
    setIsCurrent(y.is_current)
    setShowModal(true)
  }

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !startDate || !endDate) {
      alert('Please fill in name, start date, and end date.')
      return
    }
    if (new Date(endDate) <= new Date(startDate)) {
      alert('End date must be strictly after start date.')
      return
    }
    setBusy(true)
    try {
      if (editingYear) {
        await api.put(`/admin/academic/academic-years/${editingYear.id}`, {
          name: name.trim(),
          start_date: startDate,
          end_date: endDate,
          is_current: isCurrent,
        })
        setFeedback({ type: 'success', message: `Academic Year '${name}' updated.` })
      } else {
        await api.post('/admin/academic/academic-years', {
          name: name.trim(),
          start_date: startDate,
          end_date: endDate,
          is_current: isCurrent,
        })
        setFeedback({ type: 'success', message: `Academic Year '${name}' created.` })
      }
      setShowModal(false)
      loadYears()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const handleActivate = async (y: AcademicYearItem) => {
    if (!confirm(`Set '${y.name}' as the active institutional academic year?`)) return
    try {
      await api.post(`/admin/academic/academic-years/${y.id}/activate`)
      setFeedback({ type: 'success', message: `'${y.name}' is now active.` })
      loadYears()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    }
  }

  const handleArchive = async (y: AcademicYearItem) => {
    if (!confirm(`Archive '${y.name}'? Archived years remain readable for historical records.`)) return
    try {
      await api.post(`/admin/academic/academic-years/${y.id}/archive`)
      setFeedback({ type: 'success', message: `'${y.name}' archived.` })
      loadYears()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    }
  }

  const currentYear = years.find((y) => y.is_current)

  return (
    <div className="admin-page-container">
      {/* Page Header */}
      <div className="admin-page-header">
        <div className="admin-page-titles">
          <span className="admin-eyebrow">ACADEMIC CYCLES & CALENDARS</span>
          <h1>Academic Year Management</h1>
          <p className="admin-page-desc">
            Define institutional academic terms, set working semester ranges, and control the primary active calendar.
          </p>
        </div>
        <div className="admin-header-actions">
          <button type="button" className="button button-primary" onClick={openAddModal}>
            <Plus size={15} /> Create Academic Year
          </button>
          <button type="button" className="button button-secondary" onClick={loadYears}>
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

      {/* Active Academic Year Banner */}
      {currentYear && (
        <div className="panel p-4 mb-4" style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)', border: '1px solid #bfdbfe' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className="admin-kpi-icon-wrap" style={{ background: '#2563eb', color: '#fff', width: 44, height: 44 }}>
                <CalendarCheck size={22} />
              </div>
              <div>
                <span className="live-pulse-badge" style={{ marginBottom: 4 }}>
                  <span className="live-dot" /> CURRENT ACTIVE ACADEMIC YEAR
                </span>
                <h3 className="m-0 text-xl font-bold" style={{ color: '#0f172a' }}>
                  {currentYear.name}
                </h3>
                <span className="text-muted text-xs">
                  {currentYear.start_date} to {currentYear.end_date}
                </span>
              </div>
            </div>

            <button
              type="button"
              className="button button-secondary button-sm"
              onClick={() => openEditModal(currentYear)}
            >
              <Edit3 size={13} /> Edit Cycle Dates
            </button>
          </div>
        </div>
      )}

      {/* Academic Years Table */}
      <div className="panel admin-table-panel">
        <div className="table-scroll">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>Academic Year</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Status</th>
                <th>Archive State</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 muted">
                    <RefreshCw className="admin-spin inline mr-2" size={16} />
                    Loading academic years...
                  </td>
                </tr>
              ) : years.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 muted">
                    <CalendarDays size={32} className="mx-auto mb-2 text-muted" />
                    <strong>No academic years created yet.</strong>
                    <div className="mt-2">
                      <button type="button" className="button button-primary button-sm" onClick={openAddModal}>
                        <Plus size={13} /> Create First Academic Year
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                years.map((y) => (
                  <tr key={y.id} className={y.is_current ? 'row-highlight' : ''}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Calendar size={15} className={y.is_current ? 'text-blue' : 'text-muted'} />
                        <strong>{y.name}</strong>
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {y.start_date ? new Date(y.start_date).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {y.end_date ? new Date(y.end_date).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td>
                      {y.is_current ? (
                        <span className="badge badge-approved" style={{ fontWeight: 700 }}>
                          <Check size={11} /> Current Active
                        </span>
                      ) : (
                        <span className="badge badge-not_enrolled">Inactive</span>
                      )}
                    </td>
                    <td>
                      {y.is_archived ? (
                        <span className="dept-tag" style={{ color: '#64748b' }}>Archived</span>
                      ) : (
                        <span className="dept-tag" style={{ color: '#0369a1', background: '#f0f9ff' }}>Active Term</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="admin-inline-actions" style={{ justifyContent: 'flex-end' }}>
                        {!y.is_current && !y.is_archived && (
                          <button
                            type="button"
                            className="button button-primary button-sm"
                            onClick={() => handleActivate(y)}
                            title="Set as active institutional academic year"
                          >
                            Set Active
                          </button>
                        )}
                        <button
                          type="button"
                          className="button button-secondary button-sm"
                          onClick={() => openEditModal(y)}
                          title="Edit dates"
                        >
                          <Edit3 size={13} />
                        </button>
                        {!y.is_archived && (
                          <button
                            type="button"
                            className="button button-secondary button-sm"
                            onClick={() => handleArchive(y)}
                            title="Archive academic year"
                          >
                            <Archive size={13} />
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

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal" style={{ maxWidth: 480 }}>
            <form onSubmit={handleFormSubmit}>
              <div className="admin-modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="admin-avatar">
                    <CalendarDays size={18} />
                  </div>
                  <div>
                    <h3 className="m-0 text-base font-bold">
                      {editingYear ? 'Edit Academic Year' : 'Create Academic Year'}
                    </h3>
                    <span className="text-xs text-muted">Academic session calendar</span>
                  </div>
                </div>
                <button type="button" className="icon-button" onClick={() => setShowModal(false)}>
                  <X size={16} />
                </button>
              </div>

              <div className="admin-modal-body">
                <div className="admin-form-group">
                  <label className="admin-form-label">Academic Year Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. AY 2025-2026 or 2025-2026"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="admin-textarea"
                    style={{ minHeight: 38, resize: 'none' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div className="admin-form-group">
                    <label className="admin-form-label">Start Date *</label>
                    <input
                      type="date"
                      required
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="admin-textarea"
                      style={{ minHeight: 38, resize: 'none' }}
                    />
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">End Date *</label>
                    <input
                      type="date"
                      required
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="admin-textarea"
                      style={{ minHeight: 38, resize: 'none' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  <input
                    type="checkbox"
                    id="ayIsCurrent"
                    checked={isCurrent}
                    onChange={(e) => setIsCurrent(e.target.checked)}
                  />
                  <label htmlFor="ayIsCurrent" style={{ fontSize: 12.5, fontWeight: 600, color: '#334155' }}>
                    Set as the Current Active Academic Year for the institution
                  </label>
                </div>
              </div>

              <div className="admin-modal-footer">
                <button type="button" className="button button-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={busy} className="button button-primary">
                  {busy ? 'Saving...' : editingYear ? 'Save Changes' : 'Create Academic Year'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

