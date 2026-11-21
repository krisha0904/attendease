import React, { useEffect, useState } from 'react'
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Edit2,
  Lock,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { AdminPageScaffold } from './AdminComponents'
import { api, errorMessage } from './api'

interface Administrator {
  id: number
  username: string
  full_name: string
  email: string
  phone: string | null
  employee_id: string
  role: string
  department_id: number | null
  department_name: string
  is_active: boolean
  last_active: string | null
  created_at: string | null
}

interface DepartmentOption {
  id: number
  name: string
  code: string | null
}

export function AdminRolesPage() {
  const [loading, setLoading] = useState(true)
  const [admins, setAdmins] = useState<Administrator[]>([])
  const [departments, setDepartments] = useState<DepartmentOption[]>([])
  const [summary, setSummary] = useState({
    total_admins: 0,
    super_admins: 0,
    department_hods: 0,
    attendance_managers: 0,
    active_admins: 0,
  })

  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingAdmin, setEditingAdmin] = useState<Administrator | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Add form fields
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('college_admin')
  const [newDeptId, setNewDeptId] = useState<number | ''>('')
  const [newPhone, setNewPhone] = useState('')

  // Edit form fields
  const [editRole, setEditRole] = useState('')
  const [editDeptId, setEditDeptId] = useState<number | ''>('')
  const [editActive, setEditActive] = useState(true)
  const [editPassword, setEditPassword] = useState('')

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [adminRes, deptRes] = await Promise.all([
        api.get('/admin/administrators'),
        api.get('/admin/academic/departments').catch(() => ({ data: { items: [] } })),
      ])

      setAdmins(adminRes.data.items || [])
      setSummary(adminRes.data.summary || {})
      setDepartments(deptRes.data.items || deptRes.data || [])
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await api.post('/admin/administrators', {
        full_name: newName,
        email: newEmail,
        username: newUsername || undefined,
        password: newPassword,
        role: newRole,
        department_id: newDeptId ? Number(newDeptId) : undefined,
        phone: newPhone || undefined,
      })

      setSuccessMsg(`Administrator ${newName} created successfully!`)
      setShowAddModal(false)
      // Reset form
      setNewName('')
      setNewEmail('')
      setNewUsername('')
      setNewPassword('')
      setNewRole('college_admin')
      setNewDeptId('')
      setNewPhone('')
      loadData()
      setTimeout(() => setSuccessMsg(null), 4000)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const openEditModal = (adm: Administrator) => {
    setEditingAdmin(adm)
    setEditRole(adm.role)
    setEditDeptId(adm.department_id || '')
    setEditActive(adm.is_active)
    setEditPassword('')
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingAdmin) return

    setSubmitting(true)
    setError(null)
    try {
      await api.put(`/admin/administrators/${editingAdmin.id}`, {
        role: editRole,
        department_id: editDeptId ? Number(editDeptId) : undefined,
        is_active: editActive,
        password: editPassword.trim() ? editPassword.trim() : undefined,
      })

      setSuccessMsg(`Administrator ${editingAdmin.full_name} updated successfully!`)
      setEditingAdmin(null)
      loadData()
      setTimeout(() => setSuccessMsg(null), 4000)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeactivate = async (adm: Administrator) => {
    if (!window.confirm(`Are you sure you want to suspend administrator '${adm.full_name}'?`)) return

    try {
      await api.delete(`/admin/administrators/${adm.id}`)
      setSuccessMsg(`Administrator ${adm.full_name} deactivated.`)
      loadData()
      setTimeout(() => setSuccessMsg(null), 4000)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const filteredAdmins = admins.filter((a) => {
    const matchesSearch =
      a.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.employee_id.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesRole = roleFilter === 'all' || a.role === roleFilter
    return matchesSearch && matchesRole
  })

  return (
    <AdminPageScaffold
      title="Admin Roles & Permissions"
      eyebrow="ACCESS CONTROL LIST"
      description="Grant and manage granular institutional permissions for Super Admins, College Admins, Department HODs, and Attendance Managers."
      actions={
        <div className="admin-actions-row">
          <button className="button button-secondary" onClick={loadData} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Reload
          </button>
          <button className="button button-primary" onClick={() => setShowAddModal(true)}>
            <UserPlus size={15} /> Add Administrator
          </button>
        </div>
      }
      stats={[
        { label: 'Super Admins', value: summary.super_admins, note: 'Root Campus Privileges', icon: ShieldCheck },
        { label: 'Department HODs', value: summary.department_hods, note: 'Department-Scoped', icon: Users },
        { label: 'Attendance Managers', value: summary.attendance_managers, note: 'Punch Audit Access', icon: UserCheck },
        { label: 'Active Administrators', value: summary.active_admins, note: 'Active Accounts', icon: CheckCircle2 },
      ]}
    >
      {error && (
        <div className="banner banner-error mb-4">
          <AlertCircle size={18} />
          <div>{error}</div>
        </div>
      )}

      {successMsg && (
        <div className="banner banner-success mb-4">
          <CheckCircle2 size={18} />
          <div>{successMsg}</div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="admin-filter-bar mb-4">
        <div className="search-input-wrap flex-1">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search administrator by name, username, email, or employee ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="all">All Roles</option>
            <option value="super_admin">Super Admin</option>
            <option value="college_admin">College Admin</option>
            <option value="hod">HOD (Head of Dept)</option>
            <option value="attendance_manager">Attendance Manager</option>
            <option value="read_only_admin">Read-Only Admin</option>
          </select>
        </div>
      </div>

      {/* Administrators Table */}
      <div className="panel">
        <div className="table-scroll">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Full Name</th>
                <th>Role</th>
                <th>Department Scope</th>
                <th>Status</th>
                <th>Last Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAdmins.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-muted">
                    No administrators found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredAdmins.map((adm) => (
                  <tr key={adm.id}>
                    <td>
                      <strong>{adm.username}</strong>
                      <div className="text-xs text-muted">{adm.employee_id}</div>
                    </td>
                    <td>
                      <div>{adm.full_name}</div>
                      <div className="text-xs text-muted">{adm.email}</div>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          adm.role === 'super_admin'
                            ? 'badge-approved'
                            : adm.role === 'hod'
                            ? 'badge-info'
                            : 'badge-pending'
                        }`}
                      >
                        {adm.role.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <span className="flex items-center gap-1">
                        <Building2 size={13} className="text-muted" />
                        {adm.department_name}
                      </span>
                    </td>
                    <td>
                      {adm.is_active ? (
                        <span className="badge badge-approved">Active</span>
                      ) : (
                        <span className="badge badge-rejected">Suspended</span>
                      )}
                    </td>
                    <td>
                      {adm.last_active
                        ? new Date(adm.last_active).toLocaleString('en-IN', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })
                        : 'Never logged in'}
                    </td>
                    <td>
                      <div className="admin-inline-actions">
                        <button
                          className="button button-secondary button-sm"
                          onClick={() => openEditModal(adm)}
                          title="Edit Permissions"
                        >
                          <Edit2 size={13} /> Edit
                        </button>
                        {adm.is_active && adm.role !== 'super_admin' && (
                          <button
                            className="button button-danger button-sm"
                            onClick={() => handleDeactivate(adm)}
                            title="Deactivate Admin"
                          >
                            <ShieldAlert size={13} /> Suspend
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

      {/* Add Administrator Modal */}
      {showAddModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Create Administrator Account</h3>
              <button className="button-icon" onClick={() => setShowAddModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddSubmit}>
              <div className="modal-body space-y-4">
                <label>
                  Full Name *
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                    placeholder="e.g. Dr. Alan Turing"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label>
                    Email Address *
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      required
                      placeholder="alan.turing@apex.edu"
                    />
                  </label>
                  <label>
                    Username (Optional)
                    <input
                      type="text"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder="alan.turing"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label>
                    Password *
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      placeholder="Min 6 characters"
                    />
                  </label>
                  <label>
                    Phone
                    <input
                      type="text"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label>
                    Admin Role *
                    <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                      <option value="college_admin">College Admin</option>
                      <option value="hod">Department HOD</option>
                      <option value="attendance_manager">Attendance Manager</option>
                      <option value="read_only_admin">Read-Only Auditor</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  </label>
                  <label>
                    Department Scope
                    <select
                      value={newDeptId}
                      onChange={(e) => setNewDeptId(e.target.value ? Number(e.target.value) : '')}
                    >
                      <option value="">Institutional (All Departments)</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} {d.code ? `(${d.code})` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="button button-primary" disabled={submitting}>
                  <UserPlus size={15} /> {submitting ? 'Creating...' : 'Create Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Administrator Modal */}
      {editingAdmin && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Edit Permissions: {editingAdmin.full_name}</h3>
              <button className="button-icon" onClick={() => setEditingAdmin(null)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div className="modal-body space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <label>
                    Admin Role *
                    <select value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                      <option value="super_admin">Super Admin</option>
                      <option value="college_admin">College Admin</option>
                      <option value="hod">Department HOD</option>
                      <option value="attendance_manager">Attendance Manager</option>
                      <option value="read_only_admin">Read-Only Auditor</option>
                    </select>
                  </label>
                  <label>
                    Department Scope
                    <select
                      value={editDeptId}
                      onChange={(e) => setEditDeptId(e.target.value ? Number(e.target.value) : '')}
                    >
                      <option value="">Institutional (All Departments)</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} {d.code ? `(${d.code})` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label>
                  Reset Password (Leave blank to keep current)
                  <div className="relative">
                    <input
                      type="password"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      placeholder="Enter new password to reset"
                    />
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer pt-2">
                  <input
                    type="checkbox"
                    checked={editActive}
                    onChange={(e) => setEditActive(e.target.checked)}
                  />
                  <div>
                    <strong>Account Active & Authorized</strong>
                    <p className="text-xs text-muted">Unchecking immediately revokes console access.</p>
                  </div>
                </label>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setEditingAdmin(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="button button-primary" disabled={submitting}>
                  <Lock size={15} /> {submitting ? 'Saving...' : 'Update Permissions'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminPageScaffold>
  )
}
