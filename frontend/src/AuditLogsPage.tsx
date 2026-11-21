import { useEffect, useState } from 'react'
import {
  Activity,
  AlertCircle,
  Clock,
  Download,
  Eye,
  RefreshCw,
  ScrollText,
  Search,
  ShieldCheck,
  User,
  X,
} from 'lucide-react'
import { AdminPageScaffold } from './AdminComponents'
import { api, errorMessage } from './api'

interface AuditItem {
  id: number
  timestamp: string | null
  admin_name: string
  admin_role: string
  action: string
  resource_type: string
  resource_id: number | null
  old_value: any
  new_value: any
  ip_address: string
}

export function AuditLogsPage() {
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState<AuditItem[]>([])
  const [summary, setSummary] = useState({
    total_actions: 0,
    actions_today: 0,
    distinct_admins: 0,
    security_status: 'Clean',
  })

  const [searchTerm, setSearchTerm] = useState('')
  const [actionFilter, setActionFilter] = useState('ALL')
  const [error, setError] = useState<string | null>(null)
  const [selectedLog, setSelectedLog] = useState<AuditItem | null>(null)

  const loadLogs = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get('/admin/audit-logs', {
        params: {
          action_filter: actionFilter,
          search: searchTerm || undefined,
        },
      })
      setLogs(res.data.items || [])
      setSummary(res.data.summary || {})
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLogs()
  }, [actionFilter])

  const handleExportCSV = async () => {
    try {
      const res = await api.get('/admin/export/audit_logs', { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `audit_trail_${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (err) {
      alert('Export failed: ' + errorMessage(err))
    }
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    loadLogs()
  }

  return (
    <AdminPageScaffold
      title="Audit Logs"
      eyebrow="IMMUTABLE SECURITY RECORDS"
      description="Chronological, tamper-evident audit trail of all administrative actions, timetable revisions, biometric updates, and policy overrides."
      actions={
        <div className="admin-actions-row">
          <button className="button button-secondary" onClick={loadLogs} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button className="button button-primary" onClick={handleExportCSV}>
            <Download size={15} /> Export Audit Trail (CSV)
          </button>
        </div>
      }
      stats={[
        { label: 'Total Recorded Actions', value: summary.total_actions, note: 'Protected Tamper-Evident', icon: ScrollText },
        { label: 'Actions Today', value: summary.actions_today, note: 'Admin & Automated Actions', icon: Activity },
        { label: 'Distinct Administrators', value: summary.distinct_admins, note: 'Authorized Operators', icon: User },
        { label: 'Security Severity', value: summary.security_status, note: 'Integrity Check Clean', icon: ShieldCheck },
      ]}
    >
      {error && (
        <div className="banner banner-error mb-4">
          <AlertCircle size={18} />
          <div>{error}</div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <form onSubmit={handleSearchSubmit} className="admin-filter-bar mb-4">
        <div className="search-input-wrap flex-1">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search audit trail by action name, resource, or IP address..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            <option value="ALL">All Actions</option>
            <option value="SETTINGS">Settings Updates</option>
            <option value="ADMIN">Admin Users</option>
            <option value="BIOMETRIC">Biometrics</option>
            <option value="BACKUP">Backups</option>
            <option value="SESSION">Sessions</option>
            <option value="IMPORT">Data Imports</option>
          </select>
          <button type="submit" className="button button-secondary">
            Filter
          </button>
        </div>
      </form>

      {/* Audit Log Table */}
      <div className="panel">
        <div className="table-scroll">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Administrator</th>
                <th>Action</th>
                <th>Resource Scope</th>
                <th>IP Address</th>
                <th>Payload Diff</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-muted">
                    No audit records found matching your filters.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <div className="flex items-center gap-1.5 font-mono text-xs">
                        <Clock size={13} className="text-muted" />
                        {log.timestamp
                          ? new Date(log.timestamp).toLocaleString('en-IN', {
                              dateStyle: 'medium',
                              timeStyle: 'medium',
                            })
                          : 'N/A'}
                      </div>
                    </td>
                    <td>
                      <strong>{log.admin_name}</strong>
                      <div className="text-xs text-muted">
                        <span className="badge badge-info text-xs">{log.admin_role}</span>
                      </div>
                    </td>
                    <td>
                      <code className="text-xs font-semibold text-primary">{log.action}</code>
                    </td>
                    <td>
                      <span>{log.resource_type}</span>
                      {log.resource_id && <span className="text-muted text-xs"> #{log.resource_id}</span>}
                    </td>
                    <td>
                      <span className="font-mono text-xs text-muted">{log.ip_address}</span>
                    </td>
                    <td>
                      <button
                        className="button button-secondary button-sm"
                        onClick={() => setSelectedLog(log)}
                        disabled={!log.old_value && !log.new_value}
                      >
                        <Eye size={13} /> Inspect
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit Diff Modal */}
      {selectedLog && (
        <div className="modal-backdrop">
          <div className="modal-content modal-lg">
            <div className="modal-header">
              <div>
                <h3>Audit Inspection: {selectedLog.action}</h3>
                <p className="text-xs text-muted">
                  Log ID #{selectedLog.id} • {selectedLog.admin_name} • {selectedLog.ip_address}
                </p>
              </div>
              <button className="button-icon" onClick={() => setSelectedLog(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-semibold text-muted uppercase mb-2">Previous State (Old)</h4>
                  <pre className="p-3 bg-gray-50 border border-gray-200 rounded text-xs overflow-auto max-h-64 font-mono">
                    {selectedLog.old_value ? JSON.stringify(selectedLog.old_value, null, 2) : 'null (None)'}
                  </pre>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-muted uppercase mb-2">Committed State (New)</h4>
                  <pre className="p-3 bg-gray-50 border border-gray-200 rounded text-xs overflow-auto max-h-64 font-mono text-success">
                    {selectedLog.new_value ? JSON.stringify(selectedLog.new_value, null, 2) : 'null (None)'}
                  </pre>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="button button-secondary" onClick={() => setSelectedLog(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminPageScaffold>
  )
}
