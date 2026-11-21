import React, { useEffect, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  ExternalLink,
  Info,
  Megaphone,
  Radio,
  RefreshCw,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import { api, errorMessage, fetchJson } from './api'

interface AnnouncementItem {
  id: number
  title: string
  message: string
  type: string
  priority: string
  target_role: string
  target_department_id: number | null
  target_department_name: string
  action_url: string | null
  is_active: boolean
  created_by_id: number | null
  created_by_name: string
  expires_at: string | null
  created_at: string | null
}

interface NotificationItem {
  id: number
  title: string
  message: string
  type: string
  priority: string
  is_read: boolean
  read_at: string | null
  action_url: string | null
  created_at: string | null
}

interface AnnouncementKPIs {
  total_announcements: number
  active_broadcasts: number
  urgent_alerts: number
  total_notifications_sent: number
}

interface LookupDepartment {
  id: number
  name: string
  code: string
}

export const NotificationHubPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'broadcasts' | 'inbox'>('broadcasts')
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([])
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const [kpis, setKpis] = useState<AnnouncementKPIs>({
    total_announcements: 0,
    active_broadcasts: 0,
    urgent_alerts: 0,
    total_notifications_sent: 0,
  })
  const [departments, setDepartments] = useState<LookupDepartment[]>([])
  const [loading, setLoading] = useState(false)

  // Filters
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [deptFilter, setDeptFilter] = useState<number | 'all'>('all')
  const [inboxFilter, setInboxFilter] = useState<'all' | 'unread' | 'urgent'>('all')

  // Create Broadcast Modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [formTitle, setFormTitle] = useState('')
  const [formMessage, setFormMessage] = useState('')
  const [formType, setFormType] = useState('info')
  const [formPriority, setFormPriority] = useState('normal')
  const [formTargetRole, setFormTargetRole] = useState('all')
  const [formTargetDeptId, setFormTargetDeptId] = useState<number | ''>('')
  const [formActionUrl, setFormActionUrl] = useState('')
  const [formExpiresAt, setFormExpiresAt] = useState('')
  const [creatingBusy, setCreatingBusy] = useState(false)

  // Feedback banner
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Load Departments lookup
  useEffect(() => {
    const loadDepts = async () => {
      try {
        const res = await fetchJson<{ items: LookupDepartment[] }>('/admin/academic/departments').catch(() => ({
          items: [],
        }))
        setDepartments(res.items || [])
      } catch (err) {
        console.error('Failed to load departments', err)
      }
    }
    void loadDepts()
  }, [])

  // Load Announcements & KPIs
  const loadAnnouncements = async () => {
    setLoading(true)
    setFeedback(null)
    try {
      const params: Record<string, any> = {}
      if (search.trim()) params.search = search.trim()
      if (typeFilter !== 'all') params.type_filter = typeFilter
      if (priorityFilter !== 'all') params.priority_filter = priorityFilter
      if (deptFilter !== 'all') params.department_id = deptFilter

      const { data } = await api.get<{ items: AnnouncementItem[]; kpis: AnnouncementKPIs }>(
        '/admin/announcements',
        { params }
      )
      setAnnouncements(data.items || [])
      setKpis(
        data.kpis || {
          total_announcements: 0,
          active_broadcasts: 0,
          urgent_alerts: 0,
          total_notifications_sent: 0,
        }
      )
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setLoading(false)
    }
  }

  // Load Notifications Inbox
  const loadNotifications = async () => {
    try {
      const params: Record<string, any> = {}
      if (inboxFilter !== 'all') params.filter_type = inboxFilter

      const { data } = await api.get<{ items: NotificationItem[]; unread_count: number }>(
        '/notifications',
        { params }
      )
      setNotifications(data.items || [])
      setUnreadCount(data.unread_count || 0)
    } catch (err) {
      console.error('Failed to load notifications', err)
    }
  }

  useEffect(() => {
    if (activeTab === 'broadcasts') {
      void loadAnnouncements()
    } else {
      void loadNotifications()
    }
  }, [activeTab, search, typeFilter, priorityFilter, deptFilter, inboxFilter])

  // Submit Broadcast Announcement
  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formTitle.trim() || !formMessage.trim()) {
      alert('Please provide both title and announcement message.')
      return
    }

    setCreatingBusy(true)
    try {
      await api.post('/admin/announcements', {
        title: formTitle.trim(),
        message: formMessage.trim(),
        type: formType,
        priority: formPriority,
        target_role: formTargetRole === 'all' ? undefined : formTargetRole,
        target_department_id: formTargetDeptId === '' ? undefined : Number(formTargetDeptId),
        action_url: formActionUrl.trim() || undefined,
        expires_at: formExpiresAt ? new Date(formExpiresAt).toISOString() : undefined,
      })
      setFeedback({ type: 'success', message: 'Announcement broadcasted and push notifications delivered.' })
      setShowCreateModal(false)
      loadAnnouncements()
      loadNotifications()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setCreatingBusy(false)
    }
  }

  // Deactivate Announcement
  const handleDeactivate = async (ann: AnnouncementItem) => {
    if (!confirm(`Are you sure you want to deactivate broadcast "${ann.title}"?`)) return
    try {
      await api.delete(`/admin/announcements/${ann.id}`)
      setFeedback({ type: 'success', message: 'Announcement deactivated successfully.' })
      loadAnnouncements()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    }
  }

  // Mark single notification read
  const handleMarkRead = async (id: number) => {
    try {
      await api.post(`/notifications/${id}/read`)
      loadNotifications()
    } catch (err) {
      console.error('Error marking notification read', err)
    }
  }

  // Mark all notifications read
  const handleMarkAllRead = async () => {
    try {
      await api.post('/notifications/read-all')
      setFeedback({ type: 'success', message: 'All notifications marked as read.' })
      loadNotifications()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    }
  }

  // Delete notification
  const handleDeleteNotification = async (id: number) => {
    try {
      await api.delete(`/notifications/${id}`)
      loadNotifications()
    } catch (err) {
      console.error('Error deleting notification', err)
    }
  }

  return (
    <div className="admin-page-container">
      {/* Header */}
      <div className="admin-page-header">
        <div>
          <span className="admin-page-eyebrow">INSTITUTION BROADCAST & REAL-TIME ALERTS</span>
          <h1 className="admin-page-title">Notifications & Announcements Hub</h1>
          <p className="admin-page-description">
            Broadcast emergency alerts, dispatch departmental announcements, deliver schedule change push notifications, and monitor real-time faculty delivery engagement.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              if (activeTab === 'broadcasts') loadAnnouncements()
              else loadNotifications()
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
              setFormTitle('')
              setFormMessage('')
              setFormType('info')
              setFormPriority('normal')
              setFormTargetRole('all')
              setFormTargetDeptId('')
              setFormActionUrl('')
              setFormExpiresAt('')
              setShowCreateModal(true)
            }}
          >
            <Send size={15} />
            <span>Broadcast Announcement</span>
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
          <div className="stat-icon-wrapper" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}>
            <Radio size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Active Broadcasts</span>
            <span className="stat-value">{kpis.active_broadcasts}</span>
            <span className="stat-note" style={{ color: '#6366f1' }}>Visible to Institution</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
            <AlertTriangle size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Urgent & Critical</span>
            <span className="stat-value">{kpis.urgent_alerts}</span>
            <span className="stat-note" style={{ color: '#ef4444' }}>High Priority Alerts</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
            <CheckCircle2 size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Delivered Alerts</span>
            <span className="stat-value">{kpis.total_notifications_sent}</span>
            <span className="stat-note" style={{ color: '#10b981' }}>Push Notifications Fanout</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
            <Bell size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">My Unread Alerts</span>
            <span className="stat-value">{unreadCount}</span>
            <span className="stat-note" style={{ color: '#f59e0b' }}>In Personal Inbox</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid #1e293b' }}>
        <button
          type="button"
          className={`button ${activeTab === 'broadcasts' ? 'button-primary' : 'button-ghost'}`}
          onClick={() => setActiveTab('broadcasts')}
          style={{ borderRadius: '8px 8px 0 0', padding: '8px 16px' }}
        >
          <Megaphone size={15} style={{ marginRight: '6px' }} />
          <span>Institution Announcements ({announcements.length})</span>
        </button>
        <button
          type="button"
          className={`button ${activeTab === 'inbox' ? 'button-primary' : 'button-ghost'}`}
          onClick={() => setActiveTab('inbox')}
          style={{ borderRadius: '8px 8px 0 0', padding: '8px 16px' }}
        >
          <Bell size={15} style={{ marginRight: '6px' }} />
          <span>Personal Alerts Inbox {unreadCount > 0 ? `(${unreadCount} new)` : ''}</span>
        </button>
      </div>

      {activeTab === 'broadcasts' ? (
        <>
          {/* Filters Bar */}
          <div className="panel" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
              <div style={{ position: 'relative', minWidth: '240px', flex: 1 }}>
                <Search
                  size={15}
                  style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}
                />
                <input
                  type="text"
                  className="input-field"
                  placeholder="Search announcements, content..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ paddingLeft: '32px' }}
                />
              </div>

              {/* Type Filter */}
              <select
                className="select-field"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                style={{ width: '150px' }}
              >
                <option value="all">All Types</option>
                <option value="info">Information</option>
                <option value="warning">Warning</option>
                <option value="urgent">Urgent</option>
                <option value="success">Success</option>
              </select>

              {/* Priority Filter */}
              <select
                className="select-field"
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                style={{ width: '150px' }}
              >
                <option value="all">All Priorities</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
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

          {/* Announcements Table */}
          <div className="panel">
            <div className="table-scroll">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>Broadcast Title & Content</th>
                    <th>Category & Priority</th>
                    <th>Target Audience</th>
                    <th>Broadcasted By</th>
                    <th>Created</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem' }}>
                        <RefreshCw size={24} className="spin" style={{ margin: '0 auto 0.5rem', color: '#6366f1' }} />
                        <p>Loading broadcasts...</p>
                      </td>
                    </tr>
                  ) : announcements.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>
                        <Megaphone size={36} style={{ margin: '0 auto 0.5rem', opacity: 0.4 }} />
                        <p>No active announcements matching current filters.</p>
                      </td>
                    </tr>
                  ) : (
                    announcements.map((ann) => (
                      <tr key={ann.id}>
                        <td>
                          <div style={{ fontWeight: 600, color: '#f8fafc' }}>{ann.title}</div>
                          <div
                            style={{
                              fontSize: '0.8rem',
                              color: '#94a3b8',
                              maxWidth: '320px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              marginTop: '0.2rem',
                            }}
                            title={ann.message}
                          >
                            {ann.message}
                          </div>
                          {ann.action_url && (
                            <a
                              href={ann.action_url}
                              target="_blank"
                              rel="noreferrer"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.75rem', color: '#6366f1', marginTop: '0.2rem' }}
                            >
                              <ExternalLink size={11} />
                              <span>Action Link</span>
                            </a>
                          )}
                        </td>

                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <span
                              className={`badge ${
                                ann.type === 'urgent'
                                  ? 'badge-danger'
                                  : ann.type === 'warning'
                                  ? 'badge-warning'
                                  : ann.type === 'success'
                                  ? 'badge-success'
                                  : 'badge-neutral'
                              }`}
                              style={{ textTransform: 'capitalize', width: 'fit-content' }}
                            >
                              {ann.type}
                            </span>
                            <span style={{ fontSize: '0.7rem', color: ann.priority === 'critical' ? '#ef4444' : '#94a3b8' }}>
                              Priority: {ann.priority}
                            </span>
                          </div>
                        </td>

                        <td>
                          <div style={{ fontWeight: 500, color: '#f1f5f9', fontSize: '0.85rem' }}>
                            {ann.target_department_name}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#38bdf8' }}>
                            {ann.target_role ? `Role: ${ann.target_role}` : 'All Roles'}
                          </div>
                        </td>

                        <td>
                          <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>{ann.created_by_name}</div>
                        </td>

                        <td>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            {ann.created_at ? new Date(ann.created_at).toLocaleDateString() : 'N/A'}
                          </div>
                          {ann.expires_at && (
                            <div style={{ fontSize: '0.7rem', color: '#ef4444' }}>
                              Exp: {new Date(ann.expires_at).toLocaleDateString()}
                            </div>
                          )}
                        </td>

                        <td>
                          {ann.is_active ? (
                            <span className="badge badge-success">Active</span>
                          ) : (
                            <span className="badge badge-neutral">Deactivated</span>
                          )}
                        </td>

                        <td style={{ textAlign: 'right' }}>
                          {ann.is_active && (
                            <button
                              type="button"
                              className="button button-ghost"
                              onClick={() => handleDeactivate(ann)}
                              title="Deactivate broadcast"
                              style={{ padding: '4px 8px', color: '#ef4444' }}
                            >
                              <X size={14} />
                            </button>
                          )}
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
        /* INBOX VIEW */
        <div className="panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className={`button ${inboxFilter === 'all' ? 'button-primary' : 'button-ghost'}`}
                onClick={() => setInboxFilter('all')}
                style={{ padding: '4px 10px', fontSize: '0.8rem' }}
              >
                All
              </button>
              <button
                type="button"
                className={`button ${inboxFilter === 'unread' ? 'button-primary' : 'button-ghost'}`}
                onClick={() => setInboxFilter('unread')}
                style={{ padding: '4px 10px', fontSize: '0.8rem' }}
              >
                Unread ({unreadCount})
              </button>
              <button
                type="button"
                className={`button ${inboxFilter === 'urgent' ? 'button-primary' : 'button-ghost'}`}
                onClick={() => setInboxFilter('urgent')}
                style={{ padding: '4px 10px', fontSize: '0.8rem' }}
              >
                Urgent Only
              </button>
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                className="button button-secondary"
                onClick={handleMarkAllRead}
                style={{ fontSize: '0.8rem', padding: '4px 10px' }}
              >
                <CheckCircle2 size={13} style={{ marginRight: '4px' }} />
                <span>Mark All as Read</span>
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {notifications.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>
                <Bell size={36} style={{ margin: '0 auto 0.5rem', opacity: 0.3 }} />
                <p>No notifications in your inbox.</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    padding: '0.85rem 1rem',
                    borderRadius: '8px',
                    background: n.is_read ? '#0f172a' : 'rgba(99, 102, 241, 0.08)',
                    border: `1px solid ${n.is_read ? '#1e293b' : 'rgba(99, 102, 241, 0.3)'}`,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                    <div
                      style={{
                        padding: '6px',
                        borderRadius: '6px',
                        background:
                          n.type === 'urgent' || n.priority === 'critical'
                            ? 'rgba(239, 68, 68, 0.2)'
                            : n.type === 'warning'
                            ? 'rgba(245, 158, 11, 0.2)'
                            : n.type === 'success'
                            ? 'rgba(16, 185, 129, 0.2)'
                            : 'rgba(99, 102, 241, 0.2)',
                        color:
                          n.type === 'urgent' || n.priority === 'critical'
                            ? '#ef4444'
                            : n.type === 'warning'
                            ? '#f59e0b'
                            : n.type === 'success'
                            ? '#10b981'
                            : '#6366f1',
                        marginTop: '2px',
                      }}
                    >
                      {n.type === 'urgent' || n.priority === 'critical' ? (
                        <AlertTriangle size={16} />
                      ) : n.type === 'warning' ? (
                        <AlertCircle size={16} />
                      ) : n.type === 'success' ? (
                        <CheckCircle2 size={16} />
                      ) : (
                        <Info size={16} />
                      )}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.9rem' }}>{n.title}</span>
                        {!n.is_read && (
                          <span
                            style={{
                              width: '7px',
                              height: '7px',
                              borderRadius: '50%',
                              background: '#6366f1',
                              display: 'inline-block',
                            }}
                          />
                        )}
                      </div>
                      <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.4 }}>
                        {n.message}
                      </p>
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.4rem', fontSize: '0.75rem', color: '#94a3b8' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <Clock size={11} />
                          {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                        </span>
                        {n.action_url && (
                          <a
                            href={n.action_url}
                            style={{ color: '#6366f1', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                          >
                            <ExternalLink size={11} />
                            <span>Open</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                    {!n.is_read && (
                      <button
                        type="button"
                        className="button button-ghost"
                        onClick={() => handleMarkRead(n.id)}
                        title="Mark as read"
                        style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                      >
                        <CheckCircle2 size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="button button-ghost"
                      onClick={() => handleDeleteNotification(n.id)}
                      title="Dismiss"
                      style={{ padding: '4px 8px', color: '#ef4444' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* BROADCAST MODAL */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '540px' }}>
            <form onSubmit={handleCreateAnnouncement}>
              <div className="modal-header">
                <h2 className="modal-title">Broadcast Institution Announcement</h2>
                <button type="button" className="modal-close-button" onClick={() => setShowCreateModal(false)}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem 0' }}>
                <div>
                  <label className="form-label" htmlFor="ann-title">Announcement Headline *</label>
                  <input
                    id="ann-title"
                    type="text"
                    className="input-field"
                    placeholder="E.g., Biometric Terminal Maintenance / Schedule Update..."
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="form-label" htmlFor="ann-message">Message Content *</label>
                  <textarea
                    id="ann-message"
                    className="input-field"
                    rows={3}
                    placeholder="Detailed explanation, instructions, and impact details..."
                    value={formMessage}
                    onChange={(e) => setFormMessage(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label className="form-label" htmlFor="ann-type">Category</label>
                    <select
                      id="ann-type"
                      className="select-field"
                      value={formType}
                      onChange={(e) => setFormType(e.target.value)}
                    >
                      <option value="info">Information (Blue)</option>
                      <option value="warning">Warning (Amber)</option>
                      <option value="urgent">Urgent Alert (Red)</option>
                      <option value="success">Success Notice (Green)</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label" htmlFor="ann-priority">Priority</label>
                    <select
                      id="ann-priority"
                      className="select-field"
                      value={formPriority}
                      onChange={(e) => setFormPriority(e.target.value)}
                    >
                      <option value="normal">Normal Priority</option>
                      <option value="high">High Priority</option>
                      <option value="critical">Critical / Emergency</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label className="form-label" htmlFor="ann-target-role">Target Role</label>
                    <select
                      id="ann-target-role"
                      className="select-field"
                      value={formTargetRole}
                      onChange={(e) => setFormTargetRole(e.target.value)}
                    >
                      <option value="all">All Roles (Campus-wide)</option>
                      <option value="faculty">Visiting Faculty Only</option>
                      <option value="hod">Department HODs Only</option>
                      <option value="super_admin">Administrators Only</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label" htmlFor="ann-target-dept">Target Department</label>
                    <select
                      id="ann-target-dept"
                      className="select-field"
                      value={formTargetDeptId}
                      onChange={(e) => setFormTargetDeptId(e.target.value === '' ? '' : Number(e.target.value))}
                    >
                      <option value="">All Departments</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="form-label" htmlFor="ann-action-url">Action / Resource Link (Optional)</label>
                  <input
                    id="ann-action-url"
                    type="text"
                    className="input-field"
                    placeholder="/timetable or https://university.edu/notices"
                    value={formActionUrl}
                    onChange={(e) => setFormActionUrl(e.target.value)}
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
                  {creatingBusy ? 'Broadcasting...' : 'Broadcast Announcement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
