import React, { useEffect, useState } from 'react'
import {
  AlertCircle, Building2, CheckCircle2,
  Edit3, Eye, Plus, Power, RefreshCw, Search, Shield, UserMinus, UserPlus, Users, X
} from 'lucide-react'
import { api, errorMessage, fetchJson } from './api'

interface DepartmentItem {
  id: number
  name: string
  code: string
  description: string
  is_active: boolean
  hod_id: number | null
  hod_name: string | null
  hod_email: string | null
  faculty_count: number
  course_count: number
  subject_count: number
  created_at: string | null
}

interface SummaryKPIs {
  total_departments: number
  active_departments: number
  total_hods: number
  total_faculty_assigned: number
}

interface FacultyMember {
  id: number
  employee_id: string
  full_name: string
  email: string
  phone: string | null
  designation: string | null
  role: string
  is_hod: boolean
  account_status: string
  face_enrollment_status: string
}

export function DepartmentManagementPage() {
  const [departments, setDepartments] = useState<DepartmentItem[]>([])
  const [summary, setSummary] = useState<SummaryKPIs>({
    total_departments: 0,
    active_departments: 0,
    total_hods: 0,
    total_faculty_assigned: 0,
  })
  const [allFaculty, setAllFaculty] = useState<Array<{ id: number; full_name: string; employee_id: string }>>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Modals
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingDept, setEditingDept] = useState<DepartmentItem | null>(null)
  const [formName, setFormName] = useState('')
  const [formCode, setFormCode] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formHodId, setFormHodId] = useState<number | ''>('')
  const [formIsActive, setFormIsActive] = useState(true)
  const [formBusy, setFormBusy] = useState(false)

  // View Faculty Drawer / Modal
  const [viewingFacultyDept, setViewingFacultyDept] = useState<DepartmentItem | null>(null)
  const [deptFaculty, setDeptFaculty] = useState<FacultyMember[]>([])
  const [facultyLoading, setFacultyLoading] = useState(false)
  const [showAssignPicker, setShowAssignPicker] = useState(false)
  const [selectedFacultyToAssign, setSelectedFacultyToAssign] = useState<number | ''>('')

  const loadDepartments = async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = { status_filter: statusFilter }
      if (search.trim()) params.search = search.trim()
      const res = await fetchJson<{ summary: SummaryKPIs; items: DepartmentItem[] }>('/admin/academic/departments', params)
      setDepartments(res.items)
      setSummary(res.summary)
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setLoading(false)
    }
  }

  const loadAllFaculty = async () => {
    try {
      const res = await fetchJson<{ items: Array<{ id: number; full_name: string; employee_id: string }> }>('/admin/faculty?limit=200')
      setAllFaculty(res.items || [])
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadDepartments()
    loadAllFaculty()
  }, [statusFilter])

  const openAddModal = () => {
    setEditingDept(null)
    setFormName('')
    setFormCode('')
    setFormDescription('')
    setFormHodId('')
    setFormIsActive(true)
    setShowAddModal(true)
  }

  const openEditModal = (dept: DepartmentItem) => {
    setEditingDept(dept)
    setFormName(dept.name)
    setFormCode(dept.code)
    setFormDescription(dept.description)
    setFormHodId(dept.hod_id || '')
    setFormIsActive(dept.is_active)
    setShowAddModal(true)
  }

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formName.trim() || !formCode.trim()) {
      alert('Please enter department name and code.')
      return
    }
    setFormBusy(true)
    try {
      if (editingDept) {
        await api.put(`/admin/academic/departments/${editingDept.id}`, {
          name: formName.trim(),
          code: formCode.trim().toUpperCase(),
          description: formDescription.trim() || null,
          hod_id: formHodId === '' ? 0 : Number(formHodId),
          is_active: formIsActive,
        })
        setFeedback({ type: 'success', message: `Department '${formName}' updated successfully.` })
      } else {
        await api.post('/admin/academic/departments', {
          name: formName.trim(),
          code: formCode.trim().toUpperCase(),
          description: formDescription.trim() || null,
          hod_id: formHodId === '' ? null : Number(formHodId),
          is_active: formIsActive,
        })
        setFeedback({ type: 'success', message: `Department '${formName}' created successfully.` })
      }
      setShowAddModal(false)
      loadDepartments()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setFormBusy(false)
    }
  }

  const handleToggleStatus = async (dept: DepartmentItem) => {
    try {
      const res = await api.patch<{ id: number; is_active: boolean }>(`/admin/academic/departments/${dept.id}/status`)
      setFeedback({
        type: 'success',
        message: `Department '${dept.name}' is now ${res.data.is_active ? 'Active' : 'Inactive'}.`,
      })
      loadDepartments()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    }
  }

  const openViewFaculty = async (dept: DepartmentItem) => {
    setViewingFacultyDept(dept)
    setFacultyLoading(true)
    setShowAssignPicker(false)
    setSelectedFacultyToAssign('')
    try {
      const res = await fetchJson<FacultyMember[]>(`/admin/academic/departments/${dept.id}/faculty`)
      setDeptFaculty(res)
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setFacultyLoading(false)
    }
  }

  const handleAssignFaculty = async () => {
    if (!viewingFacultyDept || !selectedFacultyToAssign) return
    try {
      await api.post(`/admin/academic/departments/${viewingFacultyDept.id}/assign-faculty`, {
        faculty_ids: [Number(selectedFacultyToAssign)],
      })
      setSelectedFacultyToAssign('')
      setShowAssignPicker(false)
      openViewFaculty(viewingFacultyDept)
      loadDepartments()
      setFeedback({ type: 'success', message: 'Faculty member assigned to department successfully.' })
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    }
  }

  const handleUnassignFaculty = async (facId: number, name: string) => {
    if (!viewingFacultyDept) return
    if (!confirm(`Are you sure you want to remove ${name} from ${viewingFacultyDept.name}?`)) return
    try {
      await api.delete(`/admin/academic/departments/${viewingFacultyDept.id}/faculty/${facId}`)
      openViewFaculty(viewingFacultyDept)
      loadDepartments()
      setFeedback({ type: 'success', message: `${name} unassigned from department.` })
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    }
  }

  return (
    <div className="admin-page-container">
      {/* Page Header */}
      <div className="admin-page-header">
        <div className="admin-page-titles">
          <span className="admin-eyebrow">ACADEMIC UNITS & STRUCTURE</span>
          <h1>Department Management</h1>
          <p className="admin-page-desc">
            Configure academic departments, assign Department Heads (HOD), map faculty rosters, and review academic units.
          </p>
        </div>
        <div className="admin-header-actions">
          <button type="button" className="button button-primary" onClick={openAddModal}>
            <Plus size={15} /> Add Department
          </button>
          <button type="button" className="button button-secondary" onClick={loadDepartments}>
            <RefreshCw size={14} className={loading ? 'admin-spin mr-1' : 'mr-1'} /> Refresh
          </button>
        </div>
      </div>

      {/* Feedback notice */}
      {feedback && (
        <div className={`notice notice-${feedback.type === 'success' ? 'success' : 'error'} mb-4`}>
          {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{feedback.message}</span>
          <button type="button" className="button-link ml-auto" onClick={() => setFeedback(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="admin-kpi-grid mb-4">
        <div className="admin-kpi-card">
          <div className="admin-kpi-icon-wrap">
            <Building2 size={18} />
          </div>
          <div className="admin-kpi-content">
            <span className="admin-kpi-label">Total Departments</span>
            <span className="admin-kpi-value">{summary.total_departments}</span>
            <span className="admin-kpi-note">Academic units</span>
          </div>
        </div>

        <div className="admin-kpi-card kpi-border-green">
          <div className="admin-kpi-icon-wrap bg-green-subtle text-green">
            <CheckCircle2 size={18} />
          </div>
          <div className="admin-kpi-content">
            <span className="admin-kpi-label">Active Units</span>
            <span className="admin-kpi-value text-green">{summary.active_departments}</span>
            <span className="admin-kpi-note">Operational</span>
          </div>
        </div>

        <div className="admin-kpi-card kpi-border-amber">
          <div className="admin-kpi-icon-wrap bg-amber-subtle text-amber">
            <Shield size={18} />
          </div>
          <div className="admin-kpi-content">
            <span className="admin-kpi-label">Assigned HODs</span>
            <span className="admin-kpi-value text-amber">{summary.total_hods}</span>
            <span className="admin-kpi-note">Department heads</span>
          </div>
        </div>

        <div className="admin-kpi-card kpi-border-purple">
          <div className="admin-kpi-icon-wrap bg-purple-subtle text-purple">
            <Users size={18} />
          </div>
          <div className="admin-kpi-content">
            <span className="admin-kpi-label">Allocated Faculty</span>
            <span className="admin-kpi-value text-purple">{summary.total_faculty_assigned}</span>
            <span className="admin-kpi-note">Active teaching staff</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="panel p-4 mb-4">
        <div className="admin-filters-flex">
          <div className="admin-search-box flex-1">
            <Search size={15} className="text-muted" />
            <input
              type="text"
              placeholder="Search by department name, code, or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadDepartments()}
            />
          </div>

          <div className="admin-filter-group">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="admin-select"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>

            <button type="button" className="button button-primary" onClick={loadDepartments}>
              Filter
            </button>
          </div>
        </div>
      </div>

      {/* Departments Table */}
      <div className="panel admin-table-panel">
        <div className="table-scroll">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>Department</th>
                <th>Code</th>
                <th>Department Head (HOD)</th>
                <th>Faculty Staff</th>
                <th>Courses / Subjects</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 muted">
                    <RefreshCw className="admin-spin inline mr-2" size={16} />
                    Loading academic departments...
                  </td>
                </tr>
              ) : departments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 muted">
                    <Building2 size={32} className="mx-auto mb-2 text-muted" />
                    <strong>No departments found matching your criteria.</strong>
                    <div className="mt-2">
                      <button type="button" className="button button-primary button-sm" onClick={openAddModal}>
                        <Plus size={13} /> Add First Department
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                departments.map((dept) => (
                  <tr key={dept.id}>
                    <td>
                      <div>
                        <strong>{dept.name}</strong>
                        {dept.description && (
                          <div className="text-xs text-muted" style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {dept.description}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="faculty-code-tag" style={{ fontSize: 12, fontWeight: 700 }}>
                        {dept.code}
                      </span>
                    </td>
                    <td>
                      {dept.hod_name ? (
                        <div className="faculty-row-identity">
                          <div className="faculty-avatar-circle" style={{ width: 28, height: 28, fontSize: 11, background: '#1e3a8a' }}>
                            {dept.hod_name.charAt(0)}
                          </div>
                          <div>
                            <strong style={{ fontSize: 12 }}>{dept.hod_name}</strong>
                            <div className="text-xs text-muted">{dept.hod_email}</div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted italic" style={{ fontSize: 11 }}>
                          Not Assigned
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => openViewFaculty(dept)}
                        className="button-link"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700 }}
                      >
                        <Users size={13} /> {dept.faculty_count} Faculty
                      </button>
                    </td>
                    <td>
                      <span style={{ fontSize: 12 }}>
                        <strong>{dept.course_count}</strong> Courses · <strong>{dept.subject_count}</strong> Subjects
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${dept.is_active ? 'badge-approved' : 'badge-not_enrolled'}`}>
                        {dept.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="admin-inline-actions" style={{ justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="button button-secondary button-sm"
                          onClick={() => openViewFaculty(dept)}
                          title="View assigned faculty"
                        >
                          <Eye size={13} /> Faculty
                        </button>
                        <button
                          type="button"
                          className="button button-secondary button-sm"
                          onClick={() => openEditModal(dept)}
                          title="Edit department"
                        >
                          <Edit3 size={13} /> Edit
                        </button>
                        <button
                          type="button"
                          className={`button ${dept.is_active ? 'button-secondary' : 'button-primary'} button-sm`}
                          onClick={() => handleToggleStatus(dept)}
                          title={dept.is_active ? 'Deactivate department' : 'Activate department'}
                        >
                          <Power size={13} />
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

      {/* Modal: Add / Edit Department */}
      {showAddModal && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal" style={{ maxWidth: 540 }}>
            <form onSubmit={handleFormSubmit}>
              <div className="admin-modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="admin-avatar">
                    <Building2 size={18} />
                  </div>
                  <div>
                    <h3 className="m-0 text-base font-bold">
                      {editingDept ? 'Edit Academic Department' : 'Add New Department'}
                    </h3>
                    <span className="text-xs text-muted">
                      {editingDept ? `Editing code: ${editingDept.code}` : 'Register a new institutional academic division'}
                    </span>
                  </div>
                </div>
                <button type="button" className="icon-button" onClick={() => setShowAddModal(false)}>
                  <X size={16} />
                </button>
              </div>

              <div className="admin-modal-body">
                <div className="admin-form-group">
                  <label className="admin-form-label">Department Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Computer Science & Engineering"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="admin-textarea"
                    style={{ minHeight: 38, resize: 'none' }}
                  />
                </div>

                <div className="admin-form-group">
                  <label className="admin-form-label">Department Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CSE, IT, MECH, ECE"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                    className="admin-textarea"
                    style={{ minHeight: 38, resize: 'none', textTransform: 'uppercase', fontFamily: 'monospace' }}
                  />
                  <small className="text-muted" style={{ fontSize: 10.5 }}>
                    Unique 2-8 character institutional abbreviation.
                  </small>
                </div>

                <div className="admin-form-group">
                  <label className="admin-form-label">Department Head (HOD)</label>
                  <select
                    value={formHodId}
                    onChange={(e) => setFormHodId(e.target.value === '' ? '' : Number(e.target.value))}
                    className="admin-select"
                    style={{ width: '100%' }}
                  >
                    <option value="">— Unassigned (Select Faculty) —</option>
                    {allFaculty.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.full_name} ({f.employee_id})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="admin-form-group">
                  <label className="admin-form-label">Description (Optional)</label>
                  <textarea
                    rows={3}
                    placeholder="Brief description of department scope, laboratories, or curriculum..."
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="admin-textarea"
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                  <input
                    type="checkbox"
                    id="deptIsActive"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                  />
                  <label htmlFor="deptIsActive" style={{ fontSize: 12.5, fontWeight: 600, color: '#334155' }}>
                    Active Department (allows lecture scheduling and course mapping)
                  </label>
                </div>
              </div>

              <div className="admin-modal-footer">
                <button type="button" className="button button-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={formBusy} className="button button-primary">
                  {formBusy ? 'Saving...' : editingDept ? 'Save Changes' : 'Create Department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: View Department Faculty Members */}
      {viewingFacultyDept && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal" style={{ maxWidth: 720 }}>
            <div className="admin-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="admin-avatar">
                  <Users size={18} />
                </div>
                <div>
                  <h3 className="m-0 text-base font-bold">
                    Faculty Roster: {viewingFacultyDept.name} ({viewingFacultyDept.code})
                  </h3>
                  <span className="text-xs text-muted">
                    {deptFaculty.length} assigned visiting & permanent teaching staff
                  </span>
                </div>
              </div>
              <button type="button" className="icon-button" onClick={() => setViewingFacultyDept(null)}>
                <X size={16} />
              </button>
            </div>

            <div className="admin-modal-body">
              {/* Quick Assign Bar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                  Allocated Staff
                </span>
                {!showAssignPicker ? (
                  <button
                    type="button"
                    className="button button-secondary button-sm"
                    onClick={() => setShowAssignPicker(true)}
                  >
                    <UserPlus size={13} /> Allocate Faculty Member
                  </button>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <select
                      value={selectedFacultyToAssign}
                      onChange={(e) => setSelectedFacultyToAssign(e.target.value === '' ? '' : Number(e.target.value))}
                      className="admin-select"
                      style={{ fontSize: 11, padding: '4px 8px' }}
                    >
                      <option value="">Select Faculty...</option>
                      {allFaculty
                        .filter((af) => !deptFaculty.some((df) => df.id === af.id))
                        .map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.full_name} ({f.employee_id})
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      disabled={!selectedFacultyToAssign}
                      onClick={handleAssignFaculty}
                      className="button button-primary button-sm"
                    >
                      Assign
                    </button>
                    <button
                      type="button"
                      className="button button-secondary button-sm"
                      onClick={() => setShowAssignPicker(false)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>

              {facultyLoading ? (
                <div className="p-8 text-center muted">
                  <RefreshCw className="admin-spin inline mr-2" size={16} />
                  Loading assigned faculty members...
                </div>
              ) : deptFaculty.length === 0 ? (
                <div className="p-8 text-center muted" style={{ border: '1px dashed #cbd5e1', borderRadius: 8 }}>
                  <Users size={28} className="mx-auto mb-2 text-muted" />
                  <p className="m-0 text-sm">No faculty members are currently assigned to this department.</p>
                </div>
              ) : (
                <div className="table-scroll" style={{ maxHeight: 320, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <table className="admin-data-table">
                    <thead>
                      <tr>
                        <th>Faculty Name</th>
                        <th>ID</th>
                        <th>Designation</th>
                        <th>Role / HOD</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deptFaculty.map((f) => (
                        <tr key={f.id}>
                          <td>
                            <strong>{f.full_name}</strong>
                            <div className="text-xs text-muted">{f.email}</div>
                          </td>
                          <td>
                            <span className="faculty-code-tag">{f.employee_id}</span>
                          </td>
                          <td style={{ fontSize: 12 }}>{f.designation || 'Visiting Faculty'}</td>
                          <td>
                            {f.is_hod ? (
                              <span className="badge badge-approved" style={{ fontWeight: 700 }}>
                                Department Head (HOD)
                              </span>
                            ) : (
                              <span className="text-muted" style={{ fontSize: 11, textTransform: 'capitalize' }}>
                                {f.role}
                              </span>
                            )}
                          </td>
                          <td>
                            <span className="badge badge-approved">{f.account_status}</span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              className="button button-danger button-sm"
                              onClick={() => handleUnassignFaculty(f.id, f.full_name)}
                              title="Unassign faculty from department"
                            >
                              <UserMinus size={12} /> Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="admin-modal-footer">
              <button type="button" className="button button-secondary" onClick={() => setViewingFacultyDept(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

