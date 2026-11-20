import React, { useEffect, useState } from 'react'
import {
  AlertCircle, Calendar, Check, CheckCircle2,
  Edit3, Palmtree, Plus, RefreshCw, Trash2, X
} from 'lucide-react'
import { api, errorMessage, fetchJson } from './api'

interface HolidayItem {
  id: number
  name: string
  date: string | null
  description: string
  created_at: string | null
}

export function HolidayManagementPage() {
  const [holidays, setHolidays] = useState<HolidayItem[]>([])
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Add / Edit Modal
  const [showModal, setShowModal] = useState(false)
  const [editingHoliday, setEditingHoliday] = useState<HolidayItem | null>(null)
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  const loadHolidays = async () => {
    setLoading(true)
    try {
      const res = await fetchJson<HolidayItem[]>('/admin/academic/holidays')
      setHolidays(res)
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadHolidays()
  }, [])

  const openAddModal = () => {
    setEditingHoliday(null)
    setName('')
    setDate(new Date().toISOString().split('T')[0])
    setDescription('')
    setShowModal(true)
  }

  const openEditModal = (h: HolidayItem) => {
    setEditingHoliday(h)
    setName(h.name)
    setDate(h.date || '')
    setDescription(h.description)
    setShowModal(true)
  }

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !date) {
      alert('Please enter holiday title and date.')
      return
    }
    setBusy(true)
    try {
      if (editingHoliday) {
        await api.put(`/admin/academic/holidays/${editingHoliday.id}`, {
          name: name.trim(),
          date: date,
          description: description.trim() || null,
        })
        setFeedback({ type: 'success', message: `Holiday '${name}' updated.` })
      } else {
        await api.post('/admin/academic/holidays', {
          name: name.trim(),
          date: date,
          description: description.trim() || null,
        })
        setFeedback({ type: 'success', message: `Holiday '${name}' added to calendar.` })
      }
      setShowModal(false)
      loadHolidays()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (h: HolidayItem) => {
    if (!confirm(`Delete holiday '${h.name}' on ${h.date}?`)) return
    try {
      await api.delete(`/admin/academic/holidays/${h.id}`)
      setFeedback({ type: 'success', message: `Holiday '${h.name}' removed.` })
      loadHolidays()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    }
  }

  return (
    <div className="admin-page-container">
      {/* Page Header */}
      <div className="admin-page-header">
        <div className="admin-page-titles">
          <span className="admin-eyebrow">INSTITUTIONAL CALENDAR</span>
          <h1>Holiday & Recess Management</h1>
          <p className="admin-page-desc">
            Maintain national public holidays, festival leaves, and campus recess dates where attendance calculations are paused.
          </p>
        </div>
        <div className="admin-header-actions">
          <button type="button" className="button button-primary" onClick={openAddModal}>
            <Plus size={15} /> Add Holiday
          </button>
          <button type="button" className="button button-secondary" onClick={loadHolidays}>
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

      {/* Table */}
      <div className="panel admin-table-panel">
        <div className="table-scroll">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>Holiday Title</th>
                <th>Calendar Date</th>
                <th>Day of Week</th>
                <th>Description / Notes</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 muted">
                    <RefreshCw className="admin-spin inline mr-2" size={16} />
                    Loading institutional holidays...
                  </td>
                </tr>
              ) : holidays.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 muted">
                    <Palmtree size={32} className="mx-auto mb-2 text-muted" />
                    <strong>No holidays scheduled in the academic calendar.</strong>
                    <div className="mt-2">
                      <button type="button" className="button button-primary button-sm" onClick={openAddModal}>
                        <Plus size={13} /> Add Holiday
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                holidays.map((h) => {
                  const dObj = h.date ? new Date(h.date + 'T00:00:00') : null
                  const isUpcoming = dObj ? dObj >= new Date(new Date().setHours(0, 0, 0, 0)) : false
                  return (
                    <tr key={h.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div
                            className="faculty-avatar-circle"
                            style={{
                              width: 32,
                              height: 32,
                              fontSize: 14,
                              background: isUpcoming ? '#eff6ff' : '#f1f5f9',
                              color: isUpcoming ? '#2563eb' : '#64748b',
                            }}
                          >
                            <Palmtree size={16} />
                          </div>
                          <div>
                            <strong>{h.name}</strong>
                            {isUpcoming && (
                              <span className="live-pulse-badge" style={{ marginLeft: 6, fontSize: 9, padding: '1px 6px' }}>
                                Upcoming
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ fontSize: 12.5, fontWeight: 700 }}>
                        {dObj ? dObj.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                      <td style={{ fontSize: 12, color: '#64748b' }}>
                        {dObj ? dObj.toLocaleDateString(undefined, { weekday: 'long' }) : '—'}
                      </td>
                      <td style={{ fontSize: 12, color: '#334155' }}>
                        {h.description || <span className="text-muted italic">Institutional holiday</span>}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="admin-inline-actions" style={{ justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="button button-secondary button-sm"
                            onClick={() => openEditModal(h)}
                            title="Edit holiday"
                          >
                            <Edit3 size={13} />
                          </button>
                          <button
                            type="button"
                            className="button button-danger button-sm"
                            onClick={() => handleDelete(h)}
                            title="Delete holiday"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
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
                    <Palmtree size={18} />
                  </div>
                  <div>
                    <h3 className="m-0 text-base font-bold">
                      {editingHoliday ? 'Edit Holiday' : 'Add New Holiday'}
                    </h3>
                    <span className="text-xs text-muted">Institutional academic recess</span>
                  </div>
                </div>
                <button type="button" className="icon-button" onClick={() => setShowModal(false)}>
                  <X size={16} />
                </button>
              </div>

              <div className="admin-modal-body">
                <div className="admin-form-group">
                  <label className="admin-form-label">Holiday Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Independence Day, Diwali, Semester Break"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="admin-textarea"
                    style={{ minHeight: 38, resize: 'none' }}
                  />
                </div>

                <div className="admin-form-group">
                  <label className="admin-form-label">Date *</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="admin-textarea"
                    style={{ minHeight: 38, resize: 'none' }}
                  />
                </div>

                <div className="admin-form-group">
                  <label className="admin-form-label">Description (Optional)</label>
                  <textarea
                    rows={3}
                    placeholder="Details about holiday observance or campus closure..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="admin-textarea"
                  />
                </div>
              </div>

              <div className="admin-modal-footer">
                <button type="button" className="button button-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={busy} className="button button-primary">
                  {busy ? 'Saving...' : editingHoliday ? 'Save Changes' : 'Add Holiday'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

