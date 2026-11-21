import { useEffect, useState } from 'react'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Laptop,
  Power,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  User,
} from 'lucide-react'
import { AdminPageScaffold } from './AdminComponents'
import { api, errorMessage } from './api'

interface SessionItem {
  id: number
  user_id: number
  user_name: string
  email: string
  role: string
  portal: string
  ip_address: string
  device_info: string
  login_time: string | null
  last_active: string | null
  is_active: boolean
  is_current: boolean
}

interface SecurityEventItem {
  id: number
  event_type: string
  severity: string
  description: string
  ip_address: string
  resolved: boolean
  created_at: string | null
}

export function LoginMonitoringPage() {
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'sessions' | 'events'>('sessions')
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [events, setEvents] = useState<SecurityEventItem[]>([])
  const [sessionSummary, setSessionSummary] = useState({
    active_sessions: 0,
    failed_attempts_24h: 0,
    unique_devices: 0,
    revoked_sessions: 0,
  })
  const [eventSummary, setEventSummary] = useState({
    open_alerts: 0,
    critical_alerts: 0,
    resolved_alerts: 0,
    total_events: 0,
  })

  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [sessRes, evRes] = await Promise.all([
        api.get('/admin/security/sessions'),
        api.get('/admin/security/events'),
      ])
      setSessions(sessRes.data.items || [])
      setSessionSummary(sessRes.data.summary || {})
      setEvents(evRes.data.items || [])
      setEventSummary(evRes.data.summary || {})
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleRevokeSession = async (sess: SessionItem) => {
    if (!window.confirm(`Revoke session for ${sess.user_name} on ${sess.device_info}?`)) return
    try {
      await api.post(`/admin/security/sessions/${sess.id}/revoke`)
      setSuccessMsg(`Session for ${sess.user_name} has been revoked.`)
      loadData()
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const handleResolveEvent = async (evId: number) => {
    try {
      await api.post(`/admin/security/events/${evId}/resolve`)
      setSuccessMsg('Security alert marked as resolved.')
      loadData()
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <AdminPageScaffold
      title="Login & Activity Monitoring"
      eyebrow="ACTIVE SESSIONS & THREAT DETECTION"
      description="Real-time surveillance of user sessions, failed authentication attempts, IP geolocations, and suspicious session revocation."
      actions={
        <div className="admin-actions-row">
          <button className="button button-secondary" onClick={loadData} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      }
      stats={[
        { label: 'Active Sessions', value: sessionSummary.active_sessions, note: 'JWT & Token Validated', icon: Activity },
        { label: 'Failed Attempts (24h)', value: sessionSummary.failed_attempts_24h, note: 'Rate-Limited', icon: ShieldAlert },
        { label: 'Tracked Devices', value: sessionSummary.unique_devices, note: 'Unique Fingerprints', icon: Laptop },
        { label: 'Open Security Alerts', value: eventSummary.open_alerts, note: 'Incident Surveillance', icon: AlertTriangle },
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

      {/* Tabs */}
      <div className="admin-tabs mb-4">
        <button
          className={`tab-btn ${activeTab === 'sessions' ? 'active' : ''}`}
          onClick={() => setActiveTab('sessions')}
        >
          <Activity size={14} /> Active & Recent Sessions ({sessions.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'events' ? 'active' : ''}`}
          onClick={() => setActiveTab('events')}
        >
          <ShieldAlert size={14} /> Security Events & Threat Alerts ({events.length})
        </button>
      </div>

      {activeTab === 'sessions' ? (
        <div className="panel">
          <div className="table-scroll">
            <table className="admin-data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Portal</th>
                  <th>IP Address</th>
                  <th>Device / Browser</th>
                  <th>Login Time</th>
                  <th>Session Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {sessions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-6 text-muted">
                      No active sessions recorded.
                    </td>
                  </tr>
                ) : (
                  sessions.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <User size={15} className="text-muted" />
                          <div>
                            <strong>{s.user_name}</strong>
                            <div className="text-xs text-muted">{s.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-info">{s.portal}</span>
                      </td>
                      <td>
                        <span className="font-mono text-xs">{s.ip_address}</span>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5 text-xs">
                          {s.device_info.toLowerCase().includes('mobile') ||
                          s.device_info.toLowerCase().includes('iphone') ||
                          s.device_info.toLowerCase().includes('android') ? (
                            <Smartphone size={13} className="text-muted" />
                          ) : (
                            <Laptop size={13} className="text-muted" />
                          )}
                          <span>{s.device_info}</span>
                        </div>
                      </td>
                      <td>
                        <div className="text-xs">
                          {s.login_time
                            ? new Date(s.login_time).toLocaleString('en-IN', {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })
                            : 'N/A'}
                        </div>
                      </td>
                      <td>
                        {s.is_active ? (
                          <span className="badge badge-approved">
                            {s.is_current ? 'Active Current' : 'Active'}
                          </span>
                        ) : (
                          <span className="badge badge-rejected">Revoked</span>
                        )}
                      </td>
                      <td>
                        {s.is_current ? (
                          <span className="text-xs text-muted italic">Current Session</span>
                        ) : s.is_active ? (
                          <button
                            className="button button-danger button-sm"
                            onClick={() => handleRevokeSession(s)}
                          >
                            <Power size={13} /> Revoke
                          </button>
                        ) : (
                          <span className="text-xs text-muted">Terminated</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="panel">
          <div className="table-scroll">
            <table className="admin-data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Event Type</th>
                  <th>Severity</th>
                  <th>Description</th>
                  <th>Origin IP</th>
                  <th>Resolution</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-6 text-muted">
                      No security incidents reported. System perimeter is clean.
                    </td>
                  </tr>
                ) : (
                  events.map((ev) => (
                    <tr key={ev.id}>
                      <td>
                        <div className="flex items-center gap-1 font-mono text-xs text-muted">
                          <Clock size={12} />
                          {ev.created_at
                            ? new Date(ev.created_at).toLocaleString('en-IN', {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })
                            : 'N/A'}
                        </div>
                      </td>
                      <td>
                        <code className="text-xs font-semibold">{ev.event_type}</code>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            ev.severity === 'critical'
                              ? 'badge-rejected'
                              : ev.severity === 'high'
                              ? 'badge-pending'
                              : 'badge-info'
                          }`}
                        >
                          {ev.severity.toUpperCase()}
                        </span>
                      </td>
                      <td>{ev.description}</td>
                      <td>
                        <span className="font-mono text-xs text-muted">{ev.ip_address}</span>
                      </td>
                      <td>
                        {ev.resolved ? (
                          <span className="badge badge-approved">Resolved</span>
                        ) : (
                          <span className="badge badge-rejected">Open Alert</span>
                        )}
                      </td>
                      <td>
                        {!ev.resolved && (
                          <button
                            className="button button-secondary button-sm"
                            onClick={() => handleResolveEvent(ev.id)}
                          >
                            <ShieldCheck size={13} /> Resolve
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
      )}
    </AdminPageScaffold>
  )
}
