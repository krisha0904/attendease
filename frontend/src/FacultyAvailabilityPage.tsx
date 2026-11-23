import { useEffect, useState, type FormEvent } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCw,
  Trash2,
  UserCheck,
} from 'lucide-react'
import { api, errorMessage } from './api'
import type { User } from './App'

interface AvailabilityItem {
  id: number
  day_of_week: number
  day_name: string
  start_time: string
  end_time: string
  is_available: boolean
  status: 'pending' | 'approved' | 'rejected'
  notes: string | null
  created_at: string | null
}

const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

export function FacultyAvailabilityPage({ user }: { user: User }) {
  const [items, setItems] = useState<AvailabilityItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [busy, setBusy] = useState<boolean>(false)
  const [actionError, setActionError] = useState<string>('')
  const [actionSuccess, setActionSuccess] = useState<string>('')

  // Form State
  const [dayOfWeek, setDayOfWeek] = useState<number>(0)
  const [startTime, setStartTime] = useState<string>('09:00')
  const [endTime, setEndTime] = useState<string>('13:00')
  const [isAvailable, setIsAvailable] = useState<boolean>(true)
  const [notes, setNotes] = useState<string>('')

  const loadAvailabilities = async () => {
    setLoading(true)
    setActionError('')
    try {
      const res = await api.get<AvailabilityItem[]>('/faculty-availability/mine')
      setItems(res.data)
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAvailabilities()
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setActionError('')
    setActionSuccess('')

    if (endTime <= startTime) {
      setActionError('End time must be strictly after start time.')
      return
    }

    setBusy(true)
    try {
      await api.post('/faculty-availability', {
        day_of_week: Number(dayOfWeek),
        start_time: startTime,
        end_time: endTime,
        is_available: isAvailable,
        notes: notes.trim() || undefined,
      })
      setActionSuccess(
        `${isAvailable ? 'Preferred teaching window' : 'Blackout window'} for ${WEEKDAYS[dayOfWeek]} submitted successfully.`
      )
      setNotes('')
      await loadAvailabilities()
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to remove this availability record?')) return
    setActionError('')
    setActionSuccess('')
    try {
      await api.delete(`/faculty-availability/${id}`)
      setActionSuccess('Availability entry removed successfully.')
      await loadAvailabilities()
    } catch (err) {
      setActionError(errorMessage(err))
    }
  }

  return (
    <div className="page-content">
      {/* Page Heading */}
      <div className="page-heading">
        <div>
          <div className="eyebrow">TEACHING PREFERENCES & SCHEDULING</div>
          <h1>Teaching Availability & Blackout Windows</h1>
          <p className="muted" style={{ marginTop: '4px' }}>
            Faculty: <strong>{user.full_name}</strong> ({user.employee_id}) · Declare your weekly available teaching hours or blackout periods to guide college lecture scheduling.
          </p>
        </div>

        <button
          className="button button-secondary"
          onClick={loadAvailabilities}
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

      {/* Availability Submission Form */}
      <div className="panel" style={{ padding: '24px', marginBottom: '19px' }}>
        <div className="panel-heading" style={{ marginBottom: '16px' }}>
          <div>
            <h3>Submit Availability / Blackout Hours</h3>
            <p className="muted" style={{ margin: '4px 0 0 0', fontSize: '11px' }}>
              Your department HOD reviews these windows when generating recurring timetables and assigning lectures.
            </p>
          </div>
          <span className="badge badge-approved">
            <UserCheck size={12} /> Live Scheduling Integration
          </span>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '14px', marginBottom: '16px' }}>
            {/* Day of Week */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--ink)', marginBottom: '6px' }}>
                Day of Week
              </label>
              <select
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '7px',
                  border: '1px solid var(--line)',
                  background: '#fff',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--ink)',
                }}
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(Number(e.target.value))}
              >
                {WEEKDAYS.map((name, idx) => (
                  <option key={idx} value={idx}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {/* Start Time */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--ink)', marginBottom: '6px' }}>
                Start Time
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
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>

            {/* End Time */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--ink)', marginBottom: '6px' }}>
                End Time
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
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </div>

            {/* Type */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--ink)', marginBottom: '6px' }}>
                Window Type
              </label>
              <select
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '7px',
                  border: '1px solid var(--line)',
                  background: '#fff',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: isAvailable ? 'var(--teal-dark)' : '#cf6959',
                }}
                value={isAvailable ? 'available' : 'blackout'}
                onChange={(e) => setIsAvailable(e.target.value === 'available')}
              >
                <option value="available">✓ Preferred Teaching Hours</option>
                <option value="blackout">⚠ Blackout / Unavailable</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--ink)', marginBottom: '6px' }}>
              Notes & Justification (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Free for CS lecture sessions; unavailable earlier due to university committee meeting"
              style={{
                width: '100%',
                padding: '9px 14px',
                borderRadius: '7px',
                border: '1px solid var(--line)',
                background: '#fff',
                fontSize: '12px',
                color: 'var(--ink)',
              }}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={255}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              className="button button-primary"
              disabled={busy}
            >
              <Plus size={14} />
              <span>{busy ? 'Saving to Database...' : 'Save Availability Window'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Weekly Schedule Overview Visualizer */}
      <div className="panel" style={{ padding: '20px', marginBottom: '19px' }}>
        <div className="panel-heading" style={{ marginBottom: '14px' }}>
          <h3>Weekly Teaching Availability Matrix</h3>
          <span className="muted" style={{ fontSize: '11px' }}>7-day summary view</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '8px' }}>
          {WEEKDAYS.map((dayName, idx) => {
            const dayEntries = items.filter((item) => item.day_of_week === idx)
            return (
              <div
                key={idx}
                style={{
                  padding: '12px 10px',
                  borderRadius: '8px',
                  background: dayEntries.length > 0 ? '#fafcfc' : '#f5f8f8',
                  border: '1px solid var(--line)',
                  minHeight: '120px',
                }}
              >
                <strong style={{ fontSize: '12px', display: 'block', color: 'var(--ink)', borderBottom: '1px solid var(--line)', paddingBottom: '6px', marginBottom: '8px' }}>
                  {dayName.slice(0, 3)}
                </strong>
                {dayEntries.length === 0 ? (
                  <span className="muted" style={{ fontSize: '10px' }}>No preference</span>
                ) : (
                  dayEntries.map((e) => (
                    <div
                      key={e.id}
                      style={{
                        padding: '4px 6px',
                        borderRadius: '5px',
                        background: e.is_available ? '#eef9f4' : '#fcf1ef',
                        border: `1px solid ${e.is_available ? '#d7eee5' : '#f0dcd7'}`,
                        color: e.is_available ? '#28775f' : '#cf6959',
                        fontSize: '10px',
                        fontWeight: 600,
                        marginBottom: '4px',
                      }}
                      title={e.notes || (e.is_available ? 'Available' : 'Blackout')}
                    >
                      {e.start_time} - {e.end_time}
                      <span style={{ display: 'block', fontSize: '9px', fontWeight: 400, textTransform: 'capitalize' }}>
                        {e.is_available ? 'Preferred' : 'Blackout'} · {e.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Ledger Table */}
      <div className="panel" style={{ padding: '20px' }}>
        <div className="panel-heading" style={{ marginBottom: '14px' }}>
          <div>
            <h3>Your Submitted Availability Records</h3>
            <p className="muted" style={{ margin: '4px 0 0 0', fontSize: '11px' }}>
              Stored in faculty_availabilities table in the database.
            </p>
          </div>
          <span className="muted" style={{ fontSize: '11px' }}>Total Records: {items.length}</span>
        </div>

        <div className="table-scroll">
          <table className="data-table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)', background: '#fafcfc' }}>
                <th style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--muted)' }}>Day of Week</th>
                <th style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--muted)' }}>Time Slot</th>
                <th style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--muted)' }}>Window Type</th>
                <th style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--muted)' }}>Status</th>
                <th style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--muted)' }}>Notes</th>
                <th style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--muted)', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: 'var(--muted)', fontSize: '12px' }}>
                    No availability preferences declared yet. Use the form above to add your teaching windows.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>
                      {item.day_name}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 600 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={13} style={{ color: 'var(--muted)' }} />
                        {item.start_time} – {item.end_time}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span
                        className={`badge ${item.is_available ? 'badge-approved' : 'badge-rejected'}`}
                        style={{ fontSize: '10px' }}
                      >
                        <span className="status-dot"></span>
                        {item.is_available ? 'Preferred Hours' : 'Blackout Window'}
                      </span>
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
                    <td style={{ padding: '12px 14px', fontSize: '11px', color: 'var(--muted)' }}>
                      {item.notes || '—'}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <button
                        className="button button-secondary button-compact"
                        style={{ color: '#cf6959', borderColor: '#f0dcd7' }}
                        onClick={() => handleDelete(item.id)}
                        title="Remove availability entry"
                      >
                        <Trash2 size={13} />
                        <span>Remove</span>
                      </button>
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
