import React, { useEffect, useState } from 'react'
import {
  AlertCircle, Building, Check, CheckCircle2, DoorOpen,
  Edit3, Plus, Power, RefreshCw, School, Search, Trash2, X
} from 'lucide-react'
import { api, errorMessage, fetchJson } from './api'

interface ClassroomItem {
  id: number
  room_number: string
  building: string
  floor: string
  capacity: number
  room_type: string
  is_active: boolean
  created_at: string | null
}

export function ClassroomManagementPage() {
  const [rooms, setRooms] = useState<ClassroomItem[]>([])
  const [summary, setSummary] = useState({
    total_classrooms: 0,
    total_capacity: 0,
    lecture_halls: 0,
    laboratories: 0,
  })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Add / Edit Modal
  const [showModal, setShowModal] = useState(false)
  const [editingRoom, setEditingRoom] = useState<ClassroomItem | null>(null)
  const [roomNumber, setRoomNumber] = useState('')
  const [building, setBuilding] = useState('')
  const [floor, setFloor] = useState('')
  const [capacity, setCapacity] = useState(60)
  const [roomType, setRoomType] = useState('Lecture Hall')
  const [isActive, setIsActive] = useState(true)
  const [busy, setBusy] = useState(false)

  const loadRooms = async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = { status_filter: statusFilter }
      if (search.trim()) params.search = search.trim()
      if (typeFilter !== 'all') params.room_type = typeFilter
      const res = await fetchJson<{ summary: any; items: ClassroomItem[] }>('/admin/academic/classrooms', params)
      setRooms(res.items)
      setSummary(res.summary)
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRooms()
  }, [typeFilter, statusFilter])

  const openAddModal = () => {
    setEditingRoom(null)
    setRoomNumber('')
    setBuilding('Main Academic Block')
    setFloor('1st Floor')
    setCapacity(60)
    setRoomType('Lecture Hall')
    setIsActive(true)
    setShowModal(true)
  }

  const openEditModal = (r: ClassroomItem) => {
    setEditingRoom(r)
    setRoomNumber(r.room_number)
    setBuilding(r.building)
    setFloor(r.floor)
    setCapacity(r.capacity)
    setRoomType(r.room_type)
    setIsActive(r.is_active)
    setShowModal(true)
  }

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!roomNumber.trim()) {
      alert('Please enter room number.')
      return
    }
    setBusy(true)
    try {
      if (editingRoom) {
        await api.put(`/admin/academic/classrooms/${editingRoom.id}`, {
          room_number: roomNumber.trim(),
          building: building.trim() || null,
          floor: floor.trim() || null,
          capacity: Number(capacity),
          room_type: roomType,
          is_active: isActive,
        })
        setFeedback({ type: 'success', message: `Classroom '${roomNumber}' updated.` })
      } else {
        await api.post('/admin/academic/classrooms', {
          room_number: roomNumber.trim(),
          building: building.trim() || null,
          floor: floor.trim() || null,
          capacity: Number(capacity),
          room_type: roomType,
          is_active: isActive,
        })
        setFeedback({ type: 'success', message: `Classroom '${roomNumber}' added successfully.` })
      }
      setShowModal(false)
      loadRooms()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const handleToggleStatus = async (r: ClassroomItem) => {
    try {
      const res = await api.patch<{ is_active: boolean }>(`/admin/academic/classrooms/${r.id}/status`)
      setFeedback({
        type: 'success',
        message: `Classroom '${r.room_number}' is now ${res.data.is_active ? 'Active' : 'Inactive'}.`,
      })
      loadRooms()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    }
  }

  const handleDelete = async (r: ClassroomItem) => {
    if (!confirm(`Delete classroom '${r.room_number}'?`)) return
    try {
      await api.delete(`/admin/academic/classrooms/${r.id}`)
      setFeedback({ type: 'success', message: `Classroom '${r.room_number}' deleted.` })
      loadRooms()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    }
  }

  return (
    <div className="admin-page-container">
      {/* Page Header */}
      <div className="admin-page-header">
        <div className="admin-page-titles">
          <span className="admin-eyebrow">CAMPUS INFRASTRUCTURE</span>
          <h1>Classroom & Lab Management</h1>
          <p className="admin-page-desc">
            Manage physical lecture theaters, laboratories, seminar halls, capacity constraints, and floor locations.
          </p>
        </div>
        <div className="admin-header-actions">
          <button type="button" className="button button-primary" onClick={openAddModal}>
            <Plus size={15} /> Add Classroom
          </button>
          <button type="button" className="button button-secondary" onClick={loadRooms}>
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

      {/* KPI Cards */}
      <div className="admin-kpi-grid mb-4">
        <div className="admin-kpi-card">
          <div className="admin-kpi-icon-wrap">
            <School size={18} />
          </div>
          <div className="admin-kpi-content">
            <span className="admin-kpi-label">Total Classrooms</span>
            <span className="admin-kpi-value">{summary.total_classrooms}</span>
            <span className="admin-kpi-note">Campus rooms</span>
          </div>
        </div>

        <div className="admin-kpi-card kpi-border-green">
          <div className="admin-kpi-icon-wrap bg-green-subtle text-green">
            <Users size={18} />
          </div>
          <div className="admin-kpi-content">
            <span className="admin-kpi-label">Seating Capacity</span>
            <span className="admin-kpi-value text-green">{summary.total_capacity}</span>
            <span className="admin-kpi-note">Total student desks</span>
          </div>
        </div>

        <div className="admin-kpi-card kpi-border-amber">
          <div className="admin-kpi-icon-wrap bg-amber-subtle text-amber">
            <DoorOpen size={18} />
          </div>
          <div className="admin-kpi-content">
            <span className="admin-kpi-label">Lecture Theaters</span>
            <span className="admin-kpi-value text-amber">{summary.lecture_halls}</span>
            <span className="admin-kpi-note">Theory halls</span>
          </div>
        </div>

        <div className="admin-kpi-card kpi-border-purple">
          <div className="admin-kpi-icon-wrap bg-purple-subtle text-purple">
            <Building size={18} />
          </div>
          <div className="admin-kpi-content">
            <span className="admin-kpi-label">Laboratories</span>
            <span className="admin-kpi-value text-purple">{summary.laboratories}</span>
            <span className="admin-kpi-note">Practical labs</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="panel p-4 mb-4">
        <div className="admin-filters-flex">
          <div className="admin-search-box flex-1">
            <Search size={15} className="text-muted" />
            <input
              type="text"
              placeholder="Search by room number, building, floor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadRooms()}
            />
          </div>

          <div className="admin-filter-group">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="admin-select"
            >
              <option value="all">All Room Types</option>
              <option value="Lecture Hall">Lecture Hall</option>
              <option value="Computer Lab">Computer Lab</option>
              <option value="Science Lab">Science Lab</option>
              <option value="Seminar Hall">Seminar Hall</option>
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

            <button type="button" className="button button-primary" onClick={loadRooms}>
              Filter
            </button>
          </div>
        </div>
      </div>

      {/* Classrooms Table */}
      <div className="panel admin-table-panel">
        <div className="table-scroll">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>Room Number</th>
                <th>Building / Wing</th>
                <th>Floor</th>
                <th>Capacity</th>
                <th>Room Type</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 muted">
                    <RefreshCw className="admin-spin inline mr-2" size={16} />
                    Loading classrooms...
                  </td>
                </tr>
              ) : rooms.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 muted">
                    <School size={32} className="mx-auto mb-2 text-muted" />
                    <strong>No classrooms found matching your criteria.</strong>
                    <div className="mt-2">
                      <button type="button" className="button button-primary button-sm" onClick={openAddModal}>
                        <Plus size={13} /> Add First Classroom
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                rooms.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <DoorOpen size={16} className="text-blue" />
                        <strong style={{ fontSize: 13 }}>{r.room_number}</strong>
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>{r.building}</td>
                    <td style={{ fontSize: 12 }}>{r.floor}</td>
                    <td>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{r.capacity} Seats</span>
                    </td>
                    <td>
                      <span className="dept-tag">{r.room_type}</span>
                    </td>
                    <td>
                      <span className={`badge ${r.is_active ? 'badge-approved' : 'badge-not_enrolled'}`}>
                        {r.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="admin-inline-actions" style={{ justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="button button-secondary button-sm"
                          onClick={() => openEditModal(r)}
                          title="Edit classroom"
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          type="button"
                          className={`button ${r.is_active ? 'button-secondary' : 'button-primary'} button-sm`}
                          onClick={() => handleToggleStatus(r)}
                          title={r.is_active ? 'Deactivate' : 'Activate'}
                        >
                          <Power size={13} />
                        </button>
                        <button
                          type="button"
                          className="button button-danger button-sm"
                          onClick={() => handleDelete(r)}
                          title="Delete classroom"
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

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal" style={{ maxWidth: 500 }}>
            <form onSubmit={handleFormSubmit}>
              <div className="admin-modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="admin-avatar">
                    <DoorOpen size={18} />
                  </div>
                  <div>
                    <h3 className="m-0 text-base font-bold">
                      {editingRoom ? 'Edit Classroom' : 'Add New Classroom'}
                    </h3>
                    <span className="text-xs text-muted">Academic room allocation</span>
                  </div>
                </div>
                <button type="button" className="icon-button" onClick={() => setShowModal(false)}>
                  <X size={16} />
                </button>
              </div>

              <div className="admin-modal-body">
                <div className="admin-form-group">
                  <label className="admin-form-label">Room Number / Identifier *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. LH-101, LAB-B, SEM-2"
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value)}
                    className="admin-textarea"
                    style={{ minHeight: 38, resize: 'none' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div className="admin-form-group">
                    <label className="admin-form-label">Building / Wing</label>
                    <input
                      type="text"
                      placeholder="e.g. Science Block, West Wing"
                      value={building}
                      onChange={(e) => setBuilding(e.target.value)}
                      className="admin-textarea"
                      style={{ minHeight: 38, resize: 'none' }}
                    />
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">Floor</label>
                    <input
                      type="text"
                      placeholder="e.g. Ground Floor, 2nd Floor"
                      value={floor}
                      onChange={(e) => setFloor(e.target.value)}
                      className="admin-textarea"
                      style={{ minHeight: 38, resize: 'none' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div className="admin-form-group">
                    <label className="admin-form-label">Seating Capacity</label>
                    <input
                      type="number"
                      min={10}
                      max={500}
                      value={capacity}
                      onChange={(e) => setCapacity(Number(e.target.value))}
                      className="admin-textarea"
                      style={{ minHeight: 38, resize: 'none' }}
                    />
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">Room Type</label>
                    <select
                      value={roomType}
                      onChange={(e) => setRoomType(e.target.value)}
                      className="admin-select"
                      style={{ width: '100%' }}
                    >
                      <option value="Lecture Hall">Lecture Hall</option>
                      <option value="Computer Lab">Computer Lab</option>
                      <option value="Science Lab">Science Lab</option>
                      <option value="Seminar Hall">Seminar Hall</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  <input
                    type="checkbox"
                    id="roomIsActive"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                  />
                  <label htmlFor="roomIsActive" style={{ fontSize: 12.5, fontWeight: 600, color: '#334155' }}>
                    Active Classroom (available for lecture scheduling)
                  </label>
                </div>
              </div>

              <div className="admin-modal-footer">
                <button type="button" className="button button-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={busy} className="button button-primary">
                  {busy ? 'Saving...' : editingRoom ? 'Save Changes' : 'Create Classroom'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

