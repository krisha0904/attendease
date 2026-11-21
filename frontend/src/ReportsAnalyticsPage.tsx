import React, { useEffect, useState } from 'react'
import {
  AlertCircle,
  BarChart3,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Download,
  Plus,
  RefreshCw,
  Search,
  Settings,
  X,
} from 'lucide-react'
import { api, errorMessage, fetchJson } from './api'

interface HonorariumItem {
  faculty_id: number
  faculty_name: string
  employee_id: string
  email: string
  department_name: string
  completed_lectures: number
  total_hours_delivered: number
  punctuality_rate: number
  rate_per_lecture: number
  rate_per_hour: number
  gross_amount: number
  settlement_status: string
  settlement_date: string | null
  transaction_ref: string | null
}

interface HonorariumKPIs {
  total_honorarium_payable: number
  total_lectures_conducted: number
  total_hours_delivered: number
  average_punctuality_rate: number
  settled_amount: number
  pending_amount: number
}

interface PaymentRateItem {
  id: number
  faculty_id: number | null
  faculty_name: string
  subject_id: number | null
  subject_name: string
  rate_per_lecture: number
  rate_per_hour: number
  effective_from: string | null
}

interface LookupDepartment {
  id: number
  name: string
  code: string
}

interface LookupFaculty {
  id: number
  full_name: string
  employee_id: string
  role?: string
  designation?: string
}

export const ReportsAnalyticsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'honorarium' | 'rates'>('honorarium')
  const [items, setItems] = useState<HonorariumItem[]>([])
  const [kpis, setKpis] = useState<HonorariumKPIs>({
    total_honorarium_payable: 0,
    total_lectures_conducted: 0,
    total_hours_delivered: 0,
    average_punctuality_rate: 100,
    settled_amount: 0,
    pending_amount: 0,
  })
  const [rates, setRates] = useState<PaymentRateItem[]>([])
  const [departments, setDepartments] = useState<LookupDepartment[]>([])
  const [facultyMembers, setFacultyMembers] = useState<LookupFaculty[]>([])
  const [loading, setLoading] = useState(false)

  // Filters & Period
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState<number | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'settled' | 'pending'>('all')

  // Settlement Modal
  const [showSettleModal, setShowSettleModal] = useState(false)
  const [settlingItem, setSettlingItem] = useState<HonorariumItem | null>(null)
  const [settleTxRef, setSettleTxRef] = useState('')
  const [settleNotes, setSettleNotes] = useState('')
  const [settlingBusy, setSettlingBusy] = useState(false)

  // Configure Rate Modal
  const [showRateModal, setShowRateModal] = useState(false)
  const [rateFacultyId, setRateFacultyId] = useState<number | ''>('')
  const [ratePerLecture, setRatePerLecture] = useState<number>(1500)
  const [ratePerHour, setRatePerHour] = useState<number>(1000)
  const [rateEffectiveFrom, setRateEffectiveFrom] = useState<string>(new Date().toISOString().slice(0, 10))
  const [savingRateBusy, setSavingRateBusy] = useState(false)

  // Feedback banner
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Load auxiliary lookups
  useEffect(() => {
    const loadLookups = async () => {
      try {
        const [deptsRes, facRes] = await Promise.all([
          fetchJson<{ items: LookupDepartment[] }>('/admin/academic/departments').catch(() => ({ items: [] })),
          fetchJson<LookupFaculty[]>('/directory').catch(() => []),
        ])
        setDepartments(deptsRes.items || [])
        setFacultyMembers(
          (facRes || []).filter(
            (f) =>
              f.role === 'faculty' ||
              f.designation?.includes('Faculty') ||
              f.designation?.includes('Professor') ||
              f.designation?.includes('Lecturer')
          )
        )
      } catch (err) {
        console.error('Failed to load lookups', err)
      }
    }
    void loadLookups()
  }, [])

  // Load Rates
  const loadRates = async () => {
    try {
      const res = await fetchJson<PaymentRateItem[]>('/admin/reports/payment-rates')
      setRates(res || [])
    } catch (err) {
      console.error('Failed to load payment rates', err)
    }
  }

  // Load Honorarium Report
  const loadHonorariumReport = async () => {
    setLoading(true)
    setFeedback(null)
    try {
      const params: Record<string, any> = {
        date_from: dateFrom,
        date_to: dateTo,
      }
      if (deptFilter !== 'all') params.department_id = deptFilter

      const { data } = await api.get<{
        period: { date_from: string; date_to: string }
        items: HonorariumItem[]
        kpis: HonorariumKPIs
      }>('/admin/reports/honorarium', { params })

      setItems(data.items || [])
      setKpis(
        data.kpis || {
          total_honorarium_payable: 0,
          total_lectures_conducted: 0,
          total_hours_delivered: 0,
          average_punctuality_rate: 100,
          settled_amount: 0,
          pending_amount: 0,
        }
      )
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'honorarium') {
      void loadHonorariumReport()
    } else {
      void loadRates()
    }
  }, [activeTab, dateFrom, dateTo, deptFilter])

  // Filter items by search & status locally
  const filteredItems = items.filter((item) => {
    const term = search.toLowerCase()
    const matchesSearch =
      !term ||
      item.faculty_name.toLowerCase().includes(term) ||
      item.employee_id.toLowerCase().includes(term) ||
      item.department_name.toLowerCase().includes(term)

    const matchesStatus =
      statusFilter === 'all' || item.settlement_status === statusFilter

    return matchesSearch && matchesStatus
  })

  // Open Settle Modal
  const handleOpenSettle = (item: HonorariumItem) => {
    setSettlingItem(item)
    const genRef = `NEFT-PAY-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${item.faculty_id}`
    setSettleTxRef(genRef)
    setSettleNotes(`Honorarium settlement for period ${dateFrom} to ${dateTo}`)
    setShowSettleModal(true)
  }

  // Submit Settlement
  const handleSettleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!settlingItem) return

    setSettlingBusy(true)
    try {
      await api.post('/admin/reports/settle', {
        faculty_id: settlingItem.faculty_id,
        period_start: dateFrom,
        period_end: dateTo,
        total_lectures: settlingItem.completed_lectures,
        total_hours: settlingItem.total_hours_delivered,
        gross_amount: settlingItem.gross_amount,
        transaction_ref: settleTxRef.trim() || undefined,
        notes: settleNotes.trim() || undefined,
      })
      setFeedback({
        type: 'success',
        message: `Settlement of ₹${settlingItem.gross_amount.toLocaleString()} marked for ${settlingItem.faculty_name}.`,
      })
      setShowSettleModal(false)
      loadHonorariumReport()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setSettlingBusy(false)
    }
  }

  // Save Payment Rate
  const handleSaveRate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingRateBusy(true)
    try {
      await api.post('/admin/reports/payment-rates', {
        faculty_id: rateFacultyId === '' ? undefined : Number(rateFacultyId),
        rate_per_lecture: Number(ratePerLecture),
        rate_per_hour: Number(ratePerHour),
        effective_from: rateEffectiveFrom || undefined,
      })
      setFeedback({ type: 'success', message: 'Honorarium remuneration rate saved successfully.' })
      setShowRateModal(false)
      loadRates()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setSavingRateBusy(false)
    }
  }

  // Download CSV
  const handleDownloadCsv = () => {
    const url = `${api.defaults.baseURL}/admin/reports/honorarium/export?date_from=${dateFrom}&date_to=${dateTo}${
      deptFilter !== 'all' ? `&department_id=${deptFilter}` : ''
    }`
    window.open(url, '_blank')
  }

  return (
    <div className="admin-page-container">
      {/* Header */}
      <div className="admin-page-header">
        <div>
          <span className="admin-page-eyebrow">VISITING FACULTY PAYROLL & TEACHING PERFORMANCE</span>
          <h1 className="admin-page-title">Reports, Analytics & Financial Settlements</h1>
          <p className="admin-page-description">
            Audit biometric-verified lecture delivery, compute honorarium remuneration disbursements, examine punctuality compliance, and settle financial statements.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            type="button"
            className="button button-secondary"
            onClick={handleDownloadCsv}
            title="Download formatted CSV spreadsheet for finance department"
          >
            <Download size={15} />
            <span>Export Statement (CSV)</span>
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              if (activeTab === 'honorarium') loadHonorariumReport()
              else loadRates()
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
              setRateFacultyId('')
              setRatePerLecture(1500)
              setRatePerHour(1000)
              setRateEffectiveFrom(new Date().toISOString().slice(0, 10))
              setShowRateModal(true)
            }}
          >
            <Settings size={15} />
            <span>Configure Rates</span>
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

      {/* Financial & Analytical KPI Cards */}
      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}>
            <DollarSign size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Gross Honorarium Payable</span>
            <span className="stat-value">₹ {kpis.total_honorarium_payable.toLocaleString()}</span>
            <span className="stat-note" style={{ color: '#6366f1' }}>
              Pending: ₹ {kpis.pending_amount.toLocaleString()} • Settled: ₹ {kpis.settled_amount.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
            <CheckCircle2 size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Lectures Verified & Delivered</span>
            <span className="stat-value">{kpis.total_lectures_conducted}</span>
            <span className="stat-note" style={{ color: '#10b981' }}>Face & GPS Verified</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
            <Clock size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Teaching Hours Delivered</span>
            <span className="stat-value">{kpis.total_hours_delivered} hrs</span>
            <span className="stat-note" style={{ color: '#f59e0b' }}>Recorded Classroom Instruction</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8' }}>
            <BarChart3 size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Faculty Punctuality Rate</span>
            <span className="stat-value">{kpis.average_punctuality_rate}%</span>
            <span className="stat-note" style={{ color: '#38bdf8' }}>On-time Lecture Punch-ins</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid #1e293b' }}>
        <button
          type="button"
          className={`button ${activeTab === 'honorarium' ? 'button-primary' : 'button-ghost'}`}
          onClick={() => setActiveTab('honorarium')}
          style={{ borderRadius: '8px 8px 0 0', padding: '8px 16px' }}
        >
          <CreditCard size={15} style={{ marginRight: '6px' }} />
          <span>Honorarium & Payroll Settlements ({items.length})</span>
        </button>
        <button
          type="button"
          className={`button ${activeTab === 'rates' ? 'button-primary' : 'button-ghost'}`}
          onClick={() => setActiveTab('rates')}
          style={{ borderRadius: '8px 8px 0 0', padding: '8px 16px' }}
        >
          <Settings size={15} style={{ marginRight: '6px' }} />
          <span>Remuneration & Rate Policies ({rates.length})</span>
        </button>
      </div>

      {activeTab === 'honorarium' ? (
        <>
          {/* Controls Bar */}
          <div className="panel" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
              {/* Date From & To */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Period:</span>
                <input
                  type="date"
                  className="input-field"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  style={{ width: '145px' }}
                />
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>to</span>
                <input
                  type="date"
                  className="input-field"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  style={{ width: '145px' }}
                />
              </div>

              {/* Search */}
              <div style={{ position: 'relative', minWidth: '220px', flex: 1 }}>
                <Search
                  size={15}
                  style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}
                />
                <input
                  type="text"
                  className="input-field"
                  placeholder="Search faculty name, ID, dept..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ paddingLeft: '32px' }}
                />
              </div>

              {/* Status Filter */}
              <select
                className="select-field"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                style={{ width: '140px' }}
              >
                <option value="all">All Settlements</option>
                <option value="pending">Pending</option>
                <option value="settled">Settled</option>
              </select>

              {/* Department Filter */}
              <select
                className="select-field"
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                style={{ width: '170px' }}
              >
                <option value="all">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="panel">
            <div className="table-scroll">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>Visiting Faculty Member</th>
                    <th>Department</th>
                    <th>Delivered Lectures</th>
                    <th>Teaching Hours</th>
                    <th>Punctuality Rate</th>
                    <th>Remuneration Rate</th>
                    <th>Gross Honorarium</th>
                    <th>Settlement Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '2.5rem' }}>
                        <RefreshCw size={24} className="spin" style={{ margin: '0 auto 0.5rem', color: '#6366f1' }} />
                        <p>Calculating verified attendance and honorarium...</p>
                      </td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>
                        <CreditCard size={36} style={{ margin: '0 auto 0.5rem', opacity: 0.4 }} />
                        <p>No faculty settlement records found for this period.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => (
                      <tr key={item.faculty_id}>
                        {/* Faculty Info */}
                        <td>
                          <div style={{ fontWeight: 600, color: '#f8fafc' }}>{item.faculty_name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            ID: {item.employee_id || 'N/A'} • {item.email}
                          </div>
                        </td>

                        {/* Department */}
                        <td>
                          <span className="badge badge-neutral">{item.department_name}</span>
                        </td>

                        {/* Delivered Lectures */}
                        <td>
                          <div style={{ fontWeight: 700, color: '#f1f5f9' }}>
                            {item.completed_lectures} {item.completed_lectures === 1 ? 'lecture' : 'lectures'}
                          </div>
                        </td>

                        {/* Teaching Hours */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <Clock size={13} style={{ color: '#94a3b8' }} />
                            <span>{item.total_hours_delivered} hrs</span>
                          </div>
                        </td>

                        {/* Punctuality */}
                        <td>
                          <span
                            className={`badge ${
                              item.punctuality_rate >= 90
                                ? 'badge-success'
                                : item.punctuality_rate >= 75
                                ? 'badge-warning'
                                : 'badge-danger'
                            }`}
                          >
                            {item.punctuality_rate}%
                          </span>
                        </td>

                        {/* Rate */}
                        <td>
                          <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                            ₹ {item.rate_per_lecture.toLocaleString()} / lecture
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                            (₹ {item.rate_per_hour.toLocaleString()} / hr)
                          </div>
                        </td>

                        {/* Gross Amount */}
                        <td>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#10b981' }}>
                            ₹ {item.gross_amount.toLocaleString()}
                          </div>
                        </td>

                        {/* Status */}
                        <td>
                          {item.settlement_status === 'settled' ? (
                            <div>
                              <span className="badge badge-success">Settled</span>
                              {item.transaction_ref && (
                                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.2rem' }} title={item.transaction_ref}>
                                  Ref: {item.transaction_ref}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="badge badge-warning">Pending Payment</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td style={{ textAlign: 'right' }}>
                          {item.settlement_status !== 'settled' && item.gross_amount > 0 ? (
                            <button
                              type="button"
                              className="button button-primary"
                              onClick={() => handleOpenSettle(item)}
                              title="Process & mark payment as settled"
                              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                            >
                              <Check size={13} style={{ marginRight: '4px' }} />
                              <span>Settle Payout</span>
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              {item.gross_amount === 0 ? 'No balance' : 'Disbursed'}
                            </span>
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
        /* RATES VIEW */
        <div className="panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
                Faculty Remuneration & Hourly Rate Matrices
              </h2>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0.25rem 0 0' }}>
                Configure institutional baseline rates or customize compensation tiers per faculty member.
              </p>
            </div>
            <button
              type="button"
              className="button button-primary"
              onClick={() => {
                setRateFacultyId(facultyMembers[0]?.id || '')
                setRatePerLecture(1800)
                setRatePerHour(1200)
                setRateEffectiveFrom(new Date().toISOString().slice(0, 10))
                setShowRateModal(true)
              }}
            >
              <Plus size={15} />
              <span>Add Custom Faculty Rate</span>
            </button>
          </div>

          <div className="table-scroll">
            <table className="admin-data-table">
              <thead>
                <tr>
                  <th>Faculty / Tier Scope</th>
                  <th>Rate Per Delivered Lecture</th>
                  <th>Equivalent Hourly Rate</th>
                  <th>Effective Date</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#f8fafc' }}>{r.faculty_name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        {r.faculty_id ? 'Special Custom Rate' : 'Institutional Baseline Tier'}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: '#10b981', fontSize: '0.95rem' }}>
                        ₹ {r.rate_per_lecture.toLocaleString()} / session
                      </div>
                    </td>
                    <td>
                      <div style={{ color: '#cbd5e1' }}>₹ {r.rate_per_hour.toLocaleString()} / hr</div>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{r.effective_from || 'Effective Immediately'}</div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="button button-ghost"
                        onClick={() => {
                          setRateFacultyId(r.faculty_id || '')
                          setRatePerLecture(r.rate_per_lecture)
                          setRatePerHour(r.rate_per_hour)
                          setRateEffectiveFrom(r.effective_from || new Date().toISOString().slice(0, 10))
                          setShowRateModal(true)
                        }}
                        style={{ padding: '4px 8px' }}
                      >
                        <Settings size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SETTLEMENT MODAL */}
      {showSettleModal && settlingItem && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <form onSubmit={handleSettleSubmit}>
              <div className="modal-header">
                <h2 className="modal-title">Process Honorarium Settlement</h2>
                <button type="button" className="modal-close-button" onClick={() => setShowSettleModal(false)}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem 0' }}>
                <div style={{ background: '#0f172a', padding: '0.85rem', borderRadius: '6px', border: '1px solid #1e293b' }}>
                  <div style={{ fontWeight: 600, color: '#f8fafc' }}>{settlingItem.faculty_name}</div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    ID: {settlingItem.employee_id} • {settlingItem.department_name}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #1e293b' }}>
                    <span style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                      {settlingItem.completed_lectures} Lectures ({settlingItem.total_hours_delivered} hrs)
                    </span>
                    <span style={{ fontWeight: 700, fontSize: '1rem', color: '#10b981' }}>
                      ₹ {settlingItem.gross_amount.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="form-label" htmlFor="settle-tx-ref">Banking / Transaction Reference *</label>
                  <input
                    id="settle-tx-ref"
                    type="text"
                    className="input-field"
                    placeholder="E.g., NEFT-APEX-2026-NOV-01..."
                    value={settleTxRef}
                    onChange={(e) => setSettleTxRef(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="form-label" htmlFor="settle-notes">Settlement Remarks / Disbursement Notes</label>
                  <textarea
                    id="settle-notes"
                    className="input-field"
                    rows={2}
                    placeholder="Enter finance notes, voucher number, or approval reference..."
                    value={settleNotes}
                    onChange={(e) => setSettleNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setShowSettleModal(false)}
                  disabled={settlingBusy}
                >
                  Cancel
                </button>
                <button type="submit" className="button button-primary" disabled={settlingBusy}>
                  {settlingBusy ? 'Processing...' : 'Confirm Settlement & Notify Faculty'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIGURE RATE MODAL */}
      {showRateModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <form onSubmit={handleSaveRate}>
              <div className="modal-header">
                <h2 className="modal-title">Configure Honorarium Rate Tier</h2>
                <button type="button" className="modal-close-button" onClick={() => setShowRateModal(false)}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem 0' }}>
                <div>
                  <label className="form-label" htmlFor="rate-faculty-select">Faculty Scope</label>
                  <select
                    id="rate-faculty-select"
                    className="select-field"
                    value={rateFacultyId}
                    onChange={(e) => setRateFacultyId(e.target.value === '' ? '' : Number(e.target.value))}
                  >
                    <option value="">Default Baseline (Applies to all visiting faculty without custom rate)</option>
                    {facultyMembers.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.full_name} ({f.employee_id})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label className="form-label" htmlFor="rate-per-lecture">Rate Per Delivered Lecture (₹) *</label>
                    <input
                      id="rate-per-lecture"
                      type="number"
                      min={0}
                      step={50}
                      className="input-field"
                      value={ratePerLecture}
                      onChange={(e) => setRatePerLecture(Number(e.target.value))}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label" htmlFor="rate-per-hour">Rate Per Hour (₹) *</label>
                    <input
                      id="rate-per-hour"
                      type="number"
                      min={0}
                      step={50}
                      className="input-field"
                      value={ratePerHour}
                      onChange={(e) => setRatePerHour(Number(e.target.value))}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="form-label" htmlFor="rate-effective-from">Effective Date</label>
                  <input
                    id="rate-effective-from"
                    type="date"
                    className="input-field"
                    value={rateEffectiveFrom}
                    onChange={(e) => setRateEffectiveFrom(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setShowRateModal(false)}
                  disabled={savingRateBusy}
                >
                  Cancel
                </button>
                <button type="submit" className="button button-primary" disabled={savingRateBusy}>
                  {savingRateBusy ? 'Saving...' : 'Save Rate Policy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
