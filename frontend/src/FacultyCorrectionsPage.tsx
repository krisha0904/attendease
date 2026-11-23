import { useEffect, useState, type FormEvent } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  FileEdit,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { api, errorMessage } from './api'
import type { User } from './App'

interface CorrectionItem {
  id: number
  target_date: string
  original_punch_in: string | null
  original_punch_out: string | null
  requested_punch_in: string | null
  requested_punch_out: string | null
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  reviewer_name: string | null
  reviewed_at: string | null
  review_remarks: string | null
  created_at: string | null
}

export function FacultyCorrectionsPage({ user }: { user: User }) {
  const [items, setItems] = useState<CorrectionItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [busy, setBusy] = useState<boolean>(false)
  const [actionError, setActionError] = useState<string>('')
  const [actionSuccess, setActionSuccess] = useState<string>('')

  // Form State
  const [targetDate, setTargetDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  )
  const [requestedIn, setRequestedIn] = useState<string>('09:00')
  const [requestedOut, setRequestedOut] = useState<string>('10:30')
  const [reason, setReason] = useState<string>('')

  const loadCorrections = async () => {
    setLoading(true)
    setActionError('')
    try {
      const res = await api.get<CorrectionItem[]>('/attendance-corrections/mine')
      setItems(res.data)
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCorrections()
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setActionError('')
    setActionSuccess('')

    if (!reason.trim()) {
      setActionError('Please provide a reason explaining the attendance correction request.')
      return
    }

    setBusy(true)
    try {
      await api.post('/attendance-corrections', {
        target_date: targetDate,
        requested_punch_in: requestedIn || null,
        requested_punch_out: requestedOut || null,
        reason: reason.trim(),
      })
      setActionSuccess('Attendance correction request submitted to HOD & Administrator for review.')
      setReason('')
      await loadCorrections()
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleCancel = async (id: number) => {
    if (!window.confirm('Are you sure you want to cancel this pending correction request?')) return
    setActionError('')
    setActionSuccess('')
    try {
      await api.delete(`/attendance-corrections/${id}`)
      setActionSuccess('Correction request cancelled successfully.')
      await loadCorrections()
    } catch (err) {
      setActionError(errorMessage(err))
    }
  }

  return (
    <div className="page-content">
      {/* Page Heading */}
      <div className="page-heading">
        <div>
          <div className="eyebrow">ATTENDANCE ADJUSTMENTS & AUDIT</div>
          <h1>Attendance Corrections & Dispute Requests</h1>
          <p className="muted" style={{ marginTop: '4px' }}>
            Faculty: <strong>{user.full_name}</strong> ({user.employee_id}) · Request manual attendance rectification for device timeouts, network outages, or missed lecture punch-outs.
          </p>
        </div>

        <button
          className="button button-secondary"
          onClick={loadCorrections}
          disabled={loading}
          title="Refresh database records"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Alerts */}
      {actionError && (
        <div className="notice notice-error" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={18} />
          <span>{actionError}</span>
        </div>
      )}
      {actionSuccess && (
        <div className="notice notice-success" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle2 size={18} />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Submission Form Panel */}
      <div className="panel" style={{ padding: '24px', marginBottom: '19px' }}>
        <div className="panel-heading" style={{ marginBottom: '16px' }}>
          <div>
            <h3>Submit Attendance Correction Request</h3>
            <p className="muted" style={{ margin: '4px 0 0 0', fontSize: '11px' }}>
              Requires justification. When approved by your Department Admin, the lecture delivery ledger and honorarium records update automatically.
            </p>
          </div>
          <span className="badge badge-pending">
            <FileEdit size={12} /> HOD / Admin Review Enforced
          </span>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '14px', marginBottom: '16px' }}>
            {/* Target Date */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--ink)', marginBottom: '6px' }}>
                Date of Lecture / Workday
              </label>
              <input
                type="date"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '7px',
                  border: '1px solid var(--line)',
                  background: '#fff',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--ink)',
                }}
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                required
              />
            </div>

            {/* Requested Punch In */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--ink)', marginBottom: '6px' }}>
                Actual / Rectified Punch-In Time
              </label>
              <input
                type="time"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '7px',
                  border: '1px solid var(--line)',
                  background: '#fff',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--ink)',
                }}
                value={requestedIn}
                onChange={(e) => setRequestedIn(e.target.value)}
              />
            </div>

            {/* Requested Punch Out */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--ink)', marginBottom: '6px' }}>
                Actual / Rectified Punch-Out Time
              </label>
              <input
                type="time"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '7px',
                  border: '1px solid var(--line)',
                  background: '#fff',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--ink)',
                }}
                value={requestedOut}
                onChange={(e) => setRequestedOut(e.target.value)}
              />
            </div>
          </div>

          {/* Reason */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--ink)', marginBottom: '6px' }}>
              Reason & Explanation for Missing Punch
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Completed Data Structures lecture in LH-101. Could not punch out on mobile terminal due to campus WiFi connectivity outage."
              style={{
                width: '100%',
                padding: '9px 14px',
                borderRadius: '7px',
                border: '1px solid var(--line)',
                background: '#fff',
                fontSize: '12px',
                color: 'var(--ink)',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={2000}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              className="button button-primary"
              disabled={busy}
            >
              <Plus size={14} />
              <span>{busy ? 'Submitting Request...' : 'Submit Correction Request'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Corrections Ledger Table */}
      <div className="panel" style={{ padding: '20px' }}>
        <div className="panel-heading" style={{ marginBottom: '14px' }}>
          <div>
            <h3>Your Attendance Correction History</h3>
            <p className="muted" style={{ margin: '4px 0 0 0', fontSize: '11px' }}>
              Live audit status from attendance_corrections table in the database.
            </p>
          </div>
          <span className="muted" style={{ fontSize: '11px' }}>Total Requests: {items.length}</span>
        </div>

        <div className="table-scroll">
          <table className="data-table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)', background: '#fafcfc' }}>
                <th style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--muted)' }}>Lecture Date</th>
                <th style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--muted)' }}>Original Records</th>
                <th style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--muted)' }}>Requested Rectification</th>
                <th style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--muted)' }}>Reason</th>
                <th style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--muted)' }}>Review Status</th>
                <th style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--muted)', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: 'var(--muted)', fontSize: '12px' }}>
                    No attendance correction requests submitted yet.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>
                      {item.target_date}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '11px', color: 'var(--muted)' }}>
                      <div>In: {item.original_punch_in ? item.original_punch_in.slice(11, 16) : 'Missing'}</div>
                      <div>Out: {item.original_punch_out ? item.original_punch_out.slice(11, 16) : 'Missing'}</div>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 600, color: 'var(--teal-dark)' }}>
                      <div>In: {item.requested_punch_in ? item.requested_punch_in.slice(11, 16) : '—'}</div>
                      <div>Out: {item.requested_punch_out ? item.requested_punch_out.slice(11, 16) : '—'}</div>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '11px', maxWidth: '280px' }}>
                      <strong style={{ color: 'var(--ink)', display: 'block' }}>{item.reason}</strong>
                      {item.review_remarks && (
                        <span style={{ color: '#28775f', fontSize: '10px', display: 'block', marginTop: '2px' }}>
                          Remarks: {item.review_remarks} ({item.reviewer_name || 'Admin'})
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span
                        className={`badge ${
                          item.status === 'approved'
                            ? 'badge-approved'
                            : item.status === 'pending'
                            ? 'badge-pending'
                            : 'badge-rejected'
                        }`}
                        style={{ textTransform: 'capitalize' }}
                      >
                        <span className="status-dot"></span>
                        {item.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      {item.status === 'pending' ? (
                        <button
                          className="button button-secondary button-compact"
                          style={{ color: '#cf6959', borderColor: '#f0dcd7' }}
                          onClick={() => handleCancel(item.id)}
                          title="Cancel pending request"
                        >
                          <Trash2 size={13} />
                          <span>Cancel</span>
                        </button>
                      ) : (
                        <span className="muted" style={{ fontSize: '11px' }}>Processed</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
