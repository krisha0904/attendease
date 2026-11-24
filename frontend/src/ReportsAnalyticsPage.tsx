import React, { useEffect, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  FileSpreadsheet,
  FileText,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react'
import { api, errorMessage, fetchJson } from './api'

// --- TYPES & INTERFACES ---
export interface AuditSessionItem {
  record_id: number
  schedule_id: number
  source_type: 'weekly' | 'additional'
  date: string
  day_name: string
  faculty_id: number
  faculty_name: string
  employee_id: string
  department_name: string
  subject: string
  course_name: string
  room: string
  scheduled_start: string
  scheduled_end: string
  scheduled_slot: string
  punch_in_time: string | null
  punch_out_time: string | null
  worked_minutes: number
  worked_hours: number
  rate_per_lecture: number
  rate_per_hour: number
  session_payable: number
  session_status: 'completed' | 'in_progress' | 'missed' | 'scheduled'
  approval_status: 'verified' | 'pending' | 'rejected'
  face_verified: boolean
  gps_verified: boolean
  rejection_reason?: string | null
  approved_at?: string | null
}

export interface AuditKPIs {
  total_sessions: number
  verified_sessions: number
  pending_sessions: number
  rejected_sessions: number
  absent_sessions: number
  total_hours_delivered: number
  total_payable_amount: number
}

export interface FacultySummaryItem {
  faculty_id: number
  faculty_name: string
  employee_id: string
  department_name: string
  total_sessions: number
  verified_sessions: number
  pending_sessions: number
  total_hours: number
  rate_per_lecture: number
  total_payable: number
}

export interface HonorariumItem {
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

export interface HonorariumKPIs {
  total_honorarium_payable: number
  total_lectures_conducted: number
  total_hours_delivered: number
  average_punctuality_rate: number
  settled_amount: number
  pending_amount: number
}

export interface PaymentRateItem {
  id: number
  faculty_id: number | null
  faculty_name: string
  subject_id: number | null
  subject_name: string
  rate_per_lecture: number
  rate_per_hour: number
  effective_from: string | null
}

export interface LookupDepartment {
  id: number
  name: string
  code: string
}

export interface LookupFaculty {
  id: number
  full_name: string
  employee_id: string
  role?: string
  designation?: string
  department_id?: number
}

export const ReportsAnalyticsPage: React.FC = () => {
  // Navigation Tabs: Audit (Default), Honorarium Settlements, Rates
  const [activeTab, setActiveTab] = useState<'audit' | 'honorarium' | 'rates'>('audit')

  // Global Lookups
  const [departments, setDepartments] = useState<LookupDepartment[]>([])
  const [facultyMembers, setFacultyMembers] = useState<LookupFaculty[]>([])
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Common Date Filter
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date()
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    return new Date(d.getFullYear(), d.getMonth(), lastDay).toISOString().slice(0, 10)
  })

  // ==========================================
  // TAB 1: ATTENDANCE & PAYROLL AUDIT STATE
  // ==========================================
  const [auditSessions, setAuditSessions] = useState<AuditSessionItem[]>([])
  const [auditKpis, setAuditKpis] = useState<AuditKPIs>({
    total_sessions: 0,
    verified_sessions: 0,
    pending_sessions: 0,
    rejected_sessions: 0,
    absent_sessions: 0,
    total_hours_delivered: 0,
    total_payable_amount: 0,
  })
  const [facultySummaries, setFacultySummaries] = useState<FacultySummaryItem[]>([])

  // Audit Filters
  const [auditFacultyFilter, setAuditFacultyFilter] = useState<number | 'all'>('all')
  const [auditDeptFilter, setAuditDeptFilter] = useState<number | 'all'>('all')
  const [auditSemesterFilter, setAuditSemesterFilter] = useState<string>('all')
  const [auditApprovalFilter, setAuditApprovalFilter] = useState<'all' | 'pending' | 'verified' | 'rejected'>('all')
  const [auditSearch, setAuditSearch] = useState('')

  // Approval Busy & Modals
  const [approvingBusy, setApprovingBusy] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectingRecordId, setRejectingRecordId] = useState<number | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  // Printable Remuneration Voucher Modal
  const [showVoucherModal, setShowVoucherModal] = useState(false)
  const [voucherTargetFacultyId, setVoucherTargetFacultyId] = useState<number | 'all'>('all')

  // ==========================================
  // TAB 2: HONORARIUM SETTLEMENTS STATE
  // ==========================================
  const [honorariumItems, setHonorariumItems] = useState<HonorariumItem[]>([])
  const [honorariumKpis, setHonorariumKpis] = useState<HonorariumKPIs>({
    total_honorarium_payable: 0,
    total_lectures_conducted: 0,
    total_hours_delivered: 0,
    average_punctuality_rate: 100,
    settled_amount: 0,
    pending_amount: 0,
  })
  const [honorariumSearch, setHonorariumSearch] = useState('')
  const [honorariumDeptFilter, setHonorariumDeptFilter] = useState<number | 'all'>('all')
  const [honorariumStatusFilter, setHonorariumStatusFilter] = useState<'all' | 'settled' | 'pending'>('all')
  const [showSettleModal, setShowSettleModal] = useState(false)
  const [settlingItem, setSettlingItem] = useState<HonorariumItem | null>(null)
  const [settleTxRef, setSettleTxRef] = useState('')
  const [settleNotes, setSettleNotes] = useState('')
  const [settlingBusy, setSettlingBusy] = useState(false)

  // ==========================================
  // TAB 3: REMUNERATION RATES STATE
  // ==========================================
  const [rates, setRates] = useState<PaymentRateItem[]>([])
  const [showRateModal, setShowRateModal] = useState(false)
  const [rateFacultyId, setRateFacultyId] = useState<number | ''>('')
  const [ratePerLecture, setRatePerLecture] = useState<number>(1500)
  const [ratePerHour, setRatePerHour] = useState<number>(1000)
  const [rateEffectiveFrom, setRateEffectiveFrom] = useState<string>(new Date().toISOString().slice(0, 10))
  const [savingRateBusy, setSavingRateBusy] = useState(false)

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
              f.role === 'staff' ||
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

  // ==========================================
  // DATA LOADERS
  // ==========================================
  const loadAuditReport = async () => {
    setLoading(true)
    setFeedback(null)
    try {
      const params: Record<string, any> = {
        date_from: dateFrom,
        date_to: dateTo,
      }
      if (auditDeptFilter !== 'all') params.department_id = auditDeptFilter
      if (auditFacultyFilter !== 'all') params.faculty_id = auditFacultyFilter
      if (auditApprovalFilter !== 'all') params.approval_status = auditApprovalFilter
      if (auditSearch.trim()) params.search = auditSearch.trim()

      const { data } = await api.get<{
        period: { date_from: string; date_to: string }
        kpis: AuditKPIs
        sessions: AuditSessionItem[]
        faculty_summaries: FacultySummaryItem[]
      }>('/admin/reports/attendance-audit', { params })

      setAuditSessions(data.sessions || [])
      setAuditKpis(data.kpis)
      setFacultySummaries(data.faculty_summaries || [])
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setLoading(false)
    }
  }

  const loadHonorariumReport = async () => {
    setLoading(true)
    setFeedback(null)
    try {
      const params: Record<string, any> = {
        date_from: dateFrom,
        date_to: dateTo,
      }
      if (honorariumDeptFilter !== 'all') params.department_id = honorariumDeptFilter

      const { data } = await api.get<{
        period: { date_from: string; date_to: string }
        items: HonorariumItem[]
        kpis: HonorariumKPIs
      }>('/admin/reports/honorarium', { params })

      setHonorariumItems(data.items || [])
      setHonorariumKpis(
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

  const loadRates = async () => {
    try {
      const res = await fetchJson<PaymentRateItem[]>('/admin/reports/payment-rates')
      setRates(res || [])
    } catch (err) {
      console.error('Failed to load payment rates', err)
    }
  }

  // Trigger load on active tab / filter changes
  useEffect(() => {
    if (activeTab === 'audit') {
      void loadAuditReport()
    } else if (activeTab === 'honorarium') {
      void loadHonorariumReport()
    } else if (activeTab === 'rates') {
      void loadRates()
    }
  }, [activeTab, dateFrom, dateTo, auditDeptFilter, auditFacultyFilter, auditApprovalFilter, honorariumDeptFilter])

  // ==========================================
  // AUDIT ACTIONS (APPROVE / REJECT / BATCH)
  // ==========================================
  const handleApproveSession = async (recordId: number) => {
    setApprovingBusy(true)
    try {
      await api.post('/admin/reports/attendance-audit/approve', {
        record_ids: [recordId],
        action: 'approve',
      })
      setFeedback({ type: 'success', message: 'Session verified and approved for monthly payroll.' })
      void loadAuditReport()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setApprovingBusy(false)
    }
  }

  const handleOpenReject = (recordId: number) => {
    setRejectingRecordId(recordId)
    setRejectReason('')
    setShowRejectModal(true)
  }

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!rejectingRecordId) return
    setApprovingBusy(true)
    try {
      await api.post('/admin/reports/attendance-audit/approve', {
        record_ids: [rejectingRecordId],
        action: 'reject',
        rejection_reason: rejectReason.trim() || 'Discrepancy observed during administrative audit',
      })
      setFeedback({ type: 'success', message: 'Session marked as rejected from honorarium payout.' })
      setShowRejectModal(false)
      setRejectingRecordId(null)
      setRejectReason('')
      void loadAuditReport()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setApprovingBusy(false)
    }
  }

  const handleApproveAllPending = async (targetFacultyId?: number) => {
    const confirmMsg = targetFacultyId
      ? 'Approve all sessions for this faculty member?'
      : 'Approve all pending verified sessions matching current filters?'
    if (!window.confirm(confirmMsg)) return

    setApprovingBusy(true)
    try {
      if (targetFacultyId) {
        await api.post('/admin/reports/attendance-audit/approve', {
          faculty_id: targetFacultyId,
          approve_all: true,
          action: 'approve',
          date_from: dateFrom,
          date_to: dateTo,
        })
      } else {
        const pendingIds = auditSessions
          .filter((s) => s.approval_status === 'pending' && s.record_id > 0)
          .map((s) => s.record_id)
        if (pendingIds.length === 0) {
          setFeedback({ type: 'error', message: 'No recorded pending sessions available to approve.' })
          setApprovingBusy(false)
          return
        }
        await api.post('/admin/reports/attendance-audit/approve', {
          record_ids: pendingIds,
          action: 'approve',
        })
      }
      setFeedback({ type: 'success', message: 'All target pending sessions verified and approved successfully.' })
      void loadAuditReport()
    } catch (err) {
      setFeedback({ type: 'error', message: errorMessage(err) })
    } finally {
      setApprovingBusy(false)
    }
  }

  // ==========================================
  // EXPORTS (CSV & PDF VOUCHER)
  // ==========================================
  const handleDownloadAuditCsv = () => {
    const params = new URLSearchParams({
      date_from: dateFrom,
      date_to: dateTo,
    })
    if (auditDeptFilter !== 'all') params.append('department_id', String(auditDeptFilter))
    if (auditFacultyFilter !== 'all') params.append('faculty_id', String(auditFacultyFilter))
    if (auditApprovalFilter !== 'all') params.append('approval_status', auditApprovalFilter)
    if (auditSearch.trim()) params.append('search', auditSearch.trim())

    const url = `${api.defaults.baseURL || ''}/admin/reports/attendance-audit/export-csv?${params.toString()}`
    window.open(url, '_blank')
  }

  const handleOpenVoucherModal = (facId?: number) => {
    setVoucherTargetFacultyId(facId !== undefined ? facId : (auditFacultyFilter !== 'all' ? auditFacultyFilter : 'all'))
    setShowVoucherModal(true)
  }

  // ==========================================
  // TAB 2: SETTLEMENT HANDLERS
  // ==========================================
  const handleOpenSettle = (item: HonorariumItem) => {
    setSettlingItem(item)
    const genRef = `NEFT-PAY-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${item.faculty_id}`
    setSettleTxRef(genRef)
    setSettleNotes(`Honorarium settlement for period ${dateFrom} to ${dateTo}`)
    setShowSettleModal(true)
  }

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

  // ==========================================
  // TAB 3: RATE HANDLERS
  // ==========================================
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

  // Filtered session list locally for semester if needed
  const displaySessions = auditSessions.filter((s) => {
    if (auditSemesterFilter !== 'all') {
      const semStr = `Sem ${auditSemesterFilter}`
      if (!s.course_name.includes(semStr) && !s.subject.includes(semStr)) return false
    }
    return true
  })

  // Target faculty list for voucher modal
  const voucherSessions = displaySessions.filter(
    (s) => voucherTargetFacultyId === 'all' || s.faculty_id === voucherTargetFacultyId
  )
  const voucherTotalPayable = voucherSessions.reduce((acc, s) => acc + (s.session_payable || 0), 0)
  const voucherTotalHours = voucherSessions.reduce((acc, s) => acc + (s.worked_hours || 0), 0)
  const voucherSelectedFac = facultyMembers.find((f) => f.id === voucherTargetFacultyId)

  return (
    <div className="admin-page-container" style={{ width: '100%', maxWidth: '100%', padding: '24px 32px' }}>
      {/* Page Header */}
      <div className="admin-page-header flex items-center justify-between flex-wrap gap-4" style={{ marginBottom: '18px' }}>
        <div>
          <span className="admin-page-eyebrow" style={{ color: '#64748b', fontSize: '11px', fontWeight: 700, letterSpacing: '0.6px' }}>
            ACADEMIC PAYROLL & COMPLIANCE AUDIT
          </span>
          <h1 className="admin-page-title" style={{ fontSize: '24px', fontWeight: 800, color: '#162d50', margin: '3px 0' }}>
            Attendance & Payroll Audit Report
          </h1>
          <p className="admin-page-description" style={{ fontSize: '12.5px', color: '#64748b', margin: 0 }}>
            Audit visiting faculty biometric punches, verify lecture attendance logs, calculate automated remuneration payouts, and generate official vouchers.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="button button-secondary"
            onClick={activeTab === 'audit' ? handleDownloadAuditCsv : () => window.open(`${api.defaults.baseURL}/admin/reports/honorarium/export?date_from=${dateFrom}&date_to=${dateTo}`, '_blank')}
            title="Download CSV for Accounts / Payroll import"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', fontSize: '12px', fontWeight: 700 }}
          >
            <FileSpreadsheet size={15} style={{ color: '#16a34a' }} />
            <span>Download CSV (Accounts)</span>
          </button>

          <button
            type="button"
            className="button button-secondary"
            onClick={() => handleOpenVoucherModal()}
            title="Generate formatted monthly remuneration voucher for official sign-off"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', fontSize: '12px', fontWeight: 700 }}
          >
            <Printer size={15} style={{ color: '#2563eb' }} />
            <span>Download PDF Voucher</span>
          </button>

          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              if (activeTab === 'audit') void loadAuditReport()
              else if (activeTab === 'honorarium') void loadHonorariumReport()
              else void loadRates()
            }}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', fontSize: '12px' }}
          >
            <RefreshCw size={14} className={loading ? 'admin-spin' : ''} />
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
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', fontSize: '12px', fontWeight: 700 }}
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
          style={{
            marginBottom: '14px',
            padding: '10px 14px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: feedback.type === 'success' ? '#f0fdf4' : '#fef2f2',
            color: feedback.type === 'success' ? '#15803d' : '#b91c1c',
            border: `1px solid ${feedback.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
            fontSize: '12.5px',
          }}
        >
          {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span style={{ flex: 1, fontWeight: 600 }}>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Tabs Bar */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', borderBottom: '1px solid #e2e8f0' }}>
        <button
          type="button"
          className={`button ${activeTab === 'audit' ? 'button-primary' : 'button-ghost'}`}
          onClick={() => setActiveTab('audit')}
          style={{
            borderRadius: '8px 8px 0 0',
            padding: '9px 18px',
            fontSize: '13px',
            fontWeight: 800,
            borderBottom: activeTab === 'audit' ? '2px solid #0284c7' : 'none',
          }}
        >
          <ShieldCheck size={16} style={{ marginRight: '6px' }} />
          <span>Attendance & Payroll Audit ({auditSessions.length})</span>
        </button>

        <button
          type="button"
          className={`button ${activeTab === 'honorarium' ? 'button-primary' : 'button-ghost'}`}
          onClick={() => setActiveTab('honorarium')}
          style={{
            borderRadius: '8px 8px 0 0',
            padding: '9px 18px',
            fontSize: '13px',
            fontWeight: 800,
            borderBottom: activeTab === 'honorarium' ? '2px solid #0284c7' : 'none',
          }}
        >
          <CreditCard size={16} style={{ marginRight: '6px' }} />
          <span>Monthly Honorarium Summary ({honorariumItems.length})</span>
        </button>

        <button
          type="button"
          className={`button ${activeTab === 'rates' ? 'button-primary' : 'button-ghost'}`}
          onClick={() => setActiveTab('rates')}
          style={{
            borderRadius: '8px 8px 0 0',
            padding: '9px 18px',
            fontSize: '13px',
            fontWeight: 800,
            borderBottom: activeTab === 'rates' ? '2px solid #0284c7' : 'none',
          }}
        >
          <Settings size={16} style={{ marginRight: '6px' }} />
          <span>Remuneration Rate Policies ({rates.length})</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: ATTENDANCE & PAYROLL AUDIT (PRIMARY ADMIN VIEW)   */}
      {/* ======================================================== */}
      {activeTab === 'audit' && (
        <>
          {/* Quick Faculty Overview Chips */}
          {facultySummaries.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '10px', marginBottom: '14px' }}>
              <div
                onClick={() => setAuditFacultyFilter('all')}
                style={{
                  padding: '7px 12px',
                  borderRadius: '10px',
                  border: auditFacultyFilter === 'all' ? '2px solid #0284c7' : '1px solid #e2e8f0',
                  background: auditFacultyFilter === 'all' ? '#f0f9ff' : '#fff',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: auditFacultyFilter === 'all' ? '#0369a1' : '#475569',
                }}
              >
                All Visiting Faculty ({facultySummaries.length})
              </div>
              {facultySummaries.map((f) => (
                <div
                  key={f.faculty_id}
                  onClick={() => setAuditFacultyFilter(auditFacultyFilter === f.faculty_id ? 'all' : f.faculty_id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '10px',
                    border: auditFacultyFilter === f.faculty_id ? '2px solid #0284c7' : '1px solid #e2e8f0',
                    background: auditFacultyFilter === f.faculty_id ? '#f0f9ff' : '#fff',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    fontSize: '12px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>{f.faculty_name}</span>
                  <span style={{ color: '#64748b', fontSize: '11px', marginLeft: '6px' }}>
                    ({f.verified_sessions} verified • ₹{f.total_payable.toLocaleString()})
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Top Analytical KPI Metric Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: '12px',
              marginBottom: '16px',
            }}
          >
            {/* Card 1: Total Sessions */}
            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '12px', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#0284c7' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Total Sessions</span>
                <Clock size={16} />
              </div>
              <strong style={{ fontSize: '24px', fontWeight: 800, color: '#0369a1', display: 'block', margin: '4px 0 2px' }}>
                {auditKpis.total_sessions}
              </strong>
              <span style={{ fontSize: '11px', color: '#64748b' }}>Scheduled in period</span>
            </div>

            {/* Card 2: Verified Sessions */}
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#16a34a' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Verified Sessions</span>
                <CheckCircle2 size={16} />
              </div>
              <strong style={{ fontSize: '24px', fontWeight: 800, color: '#15803d', display: 'block', margin: '4px 0 2px' }}>
                {auditKpis.verified_sessions}
              </strong>
              <span style={{ fontSize: '11px', color: '#166534' }}>Biometric & GPS approved</span>
            </div>

            {/* Card 3: Pending Verification */}
            <div style={{ background: '#fefce8', border: '1px solid #fef08a', borderRadius: '12px', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#ca8a04' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Pending Review</span>
                <AlertTriangle size={16} />
              </div>
              <strong style={{ fontSize: '24px', fontWeight: 800, color: '#a16207', display: 'block', margin: '4px 0 2px' }}>
                {auditKpis.pending_sessions}
              </strong>
              <span style={{ fontSize: '11px', color: '#854d0e' }}>Awaiting admin clearance</span>
            </div>

            {/* Card 4: Rejected / Absent */}
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#dc2626' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Absent / Rejected</span>
                <XCircle size={16} />
              </div>
              <strong style={{ fontSize: '24px', fontWeight: 800, color: '#b91c1c', display: 'block', margin: '4px 0 2px' }}>
                {auditKpis.rejected_sessions + auditKpis.absent_sessions}
              </strong>
              <span style={{ fontSize: '11px', color: '#991b1b' }}>Excluded from payout</span>
            </div>

            {/* Card 5: Teaching Hours */}
            <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '12px', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#9333ea' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Teaching Hours</span>
                <BarChart3 size={16} />
              </div>
              <strong style={{ fontSize: '24px', fontWeight: 800, color: '#7e22ce', display: 'block', margin: '4px 0 2px' }}>
                {auditKpis.total_hours_delivered} hrs
              </strong>
              <span style={{ fontSize: '11px', color: '#6b21a8' }}>Delivered instruction</span>
            </div>

            {/* Card 6: Total Payable Amount */}
            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '12px', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#059669' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Gross Payable</span>
                <DollarSign size={16} />
              </div>
              <strong style={{ fontSize: '24px', fontWeight: 800, color: '#047857', display: 'block', margin: '4px 0 2px' }}>
                ₹ {auditKpis.total_payable_amount.toLocaleString()}
              </strong>
              <span style={{ fontSize: '11px', color: '#065f46' }}>Automated honorarium calculation</span>
            </div>
          </div>

          {/* Admin Controls & Comprehensive Filter Toolbar */}
          <div
            style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '14px 18px',
              marginBottom: '16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
              {/* Filter 1: Visiting Faculty Selector with search */}
              <div style={{ minWidth: '220px', flex: 1 }}>
                <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, color: '#64748b', marginBottom: '3px' }}>
                  VISITING FACULTY MEMBER
                </label>
                <select
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#1e293b',
                    background: '#fff',
                  }}
                  value={auditFacultyFilter}
                  onChange={(e) => setAuditFacultyFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                >
                  <option value="all">All Visiting Faculty ({facultyMembers.length})</option>
                  {facultyMembers.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.full_name} ({f.employee_id})
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter 2: Department / Branch Filter */}
              <div style={{ minWidth: '180px' }}>
                <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, color: '#64748b', marginBottom: '3px' }}>
                  DEPARTMENT / BRANCH
                </label>
                <select
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#1e293b',
                    background: '#fff',
                  }}
                  value={auditDeptFilter}
                  onChange={(e) => setAuditDeptFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                >
                  <option value="all">All Departments</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter 3: Semester Filter */}
              <div style={{ minWidth: '130px' }}>
                <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, color: '#64748b', marginBottom: '3px' }}>
                  SEMESTER
                </label>
                <select
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#1e293b',
                    background: '#fff',
                  }}
                  value={auditSemesterFilter}
                  onChange={(e) => setAuditSemesterFilter(e.target.value)}
                >
                  <option value="all">All Semesters</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                    <option key={s} value={String(s)}>
                      Semester {s}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter 4: Approval Status Filter */}
              <div style={{ minWidth: '160px' }}>
                <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, color: '#64748b', marginBottom: '3px' }}>
                  APPROVAL STATUS
                </label>
                <select
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#1e293b',
                    background: '#fff',
                  }}
                  value={auditApprovalFilter}
                  onChange={(e) => setAuditApprovalFilter(e.target.value as any)}
                >
                  <option value="all">All Statuses</option>
                  <option value="verified">Verified & Approved</option>
                  <option value="pending">Pending Verification</option>
                  <option value="rejected">Rejected / Disputed</option>
                </select>
              </div>

              {/* Filter 5: Date Range (Period) */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, color: '#64748b', marginBottom: '3px' }}>
                    FROM
                  </label>
                  <input
                    type="date"
                    style={{
                      padding: '6px 10px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#1e293b',
                    }}
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, color: '#64748b', marginBottom: '3px' }}>
                    TO
                  </label>
                  <input
                    type="date"
                    style={{
                      padding: '6px 10px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#1e293b',
                    }}
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>
              </div>

              {/* Batch Action: Approve All Pending */}
              <div style={{ marginLeft: 'auto', alignSelf: 'flex-end' }}>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => handleApproveAllPending(auditFacultyFilter !== 'all' ? auditFacultyFilter : undefined)}
                  disabled={approvingBusy || auditKpis.pending_sessions === 0}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 14px',
                    fontSize: '12px',
                    fontWeight: 800,
                    background: '#16a34a',
                    borderColor: '#16a34a',
                  }}
                  title="Bulk verify all pending sessions for payout"
                >
                  <CheckCircle2 size={15} />
                  <span>Approve All ({auditKpis.pending_sessions} Pending)</span>
                </button>
              </div>
            </div>

            {/* Live Search Input */}
            <div style={{ marginTop: '10px', position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search by subject, course, classroom room, faculty name, or employee ID..."
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 10px 7px 32px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  fontSize: '12px',
                  background: '#f8fafc',
                }}
              />
            </div>
          </div>

          {/* Detailed Session-by-Session Audit Table */}
          <div
            style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <strong style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                Verified Lecture Delivery Ledger ({displaySessions.length} Sessions)
              </strong>
              <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                Sorted chronologically · All rates and payables calculated against active institutional policy
              </span>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
                <RefreshCw size={24} className="admin-spin" style={{ margin: '0 auto 8px', color: '#0284c7' }} />
                <p style={{ fontSize: '12.5px' }}>Auditing attendance logs & calculating honorarium remuneration...</p>
              </div>
            ) : displaySessions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                <FileText size={36} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                <p style={{ fontSize: '13px', fontWeight: 600 }}>No lecture attendance records found matching these criteria.</p>
                <span style={{ fontSize: '11.5px' }}>Try selecting another date range or clearing the search filter.</span>
              </div>
            ) : (
              <div className="table-scroll">
                <table className="faculty-timetable-table" style={{ width: '100%', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ padding: '9px 10px' }}>Date & Day</th>
                      <th style={{ padding: '9px 10px' }}>Faculty Member</th>
                      <th style={{ padding: '9px 10px' }}>Subject & Course</th>
                      <th style={{ padding: '9px 10px' }}>Room</th>
                      <th style={{ padding: '9px 10px' }}>Scheduled Slot</th>
                      <th style={{ padding: '9px 10px' }}>Biometric Punch In / Out</th>
                      <th style={{ padding: '9px 10px' }}>Delivered Hours</th>
                      <th style={{ padding: '9px 10px' }}>Rate & Payable</th>
                      <th style={{ padding: '9px 10px' }}>Status</th>
                      <th style={{ padding: '9px 10px' }}>Approval</th>
                      <th style={{ padding: '9px 10px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displaySessions.map((s, idx) => {
                      const isVerified = s.approval_status === 'verified'
                      const isPending = s.approval_status === 'pending'
                      const isRejected = s.approval_status === 'rejected'

                      return (
                        <tr
                          key={`${s.record_id}-${s.schedule_id}-${s.date}-${idx}`}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: isRejected ? '#fff5f5' : idx % 2 === 0 ? '#fff' : '#fafafa',
                          }}
                        >
                          {/* Date & Day */}
                          <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                            <strong style={{ color: '#0f172a', display: 'block' }}>{s.date}</strong>
                            <span style={{ fontSize: '10px', color: '#64748b' }}>{s.day_name}</span>
                          </td>

                          {/* Faculty Name & ID */}
                          <td style={{ padding: '9px 10px' }}>
                            <strong style={{ color: '#0284c7', display: 'block' }}>{s.faculty_name}</strong>
                            <div style={{ fontSize: '10px', color: '#64748b' }}>
                              <span>{s.employee_id}</span> · <span style={{ color: '#475569' }}>{s.department_name}</span>
                            </div>
                          </td>

                          {/* Subject & Course */}
                          <td style={{ padding: '9px 10px' }}>
                            <strong style={{ color: '#1e293b' }}>{s.subject}</strong>
                            <div style={{ fontSize: '10px', color: '#64748b' }}>{s.course_name}</div>
                          </td>

                          {/* Room */}
                          <td style={{ padding: '9px 10px', fontFamily: 'monospace', fontWeight: 600 }}>
                            {s.room}
                          </td>

                          {/* Slot */}
                          <td style={{ padding: '9px 10px', fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap' }}>
                            {s.scheduled_slot}
                          </td>

                          {/* Biometric Punches */}
                          <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                            {s.punch_in_time ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ color: '#16a34a', fontWeight: 700, fontFamily: 'monospace', fontSize: '11px' }}>
                                  In: {s.punch_in_time}
                                </span>
                                {s.punch_out_time && (
                                  <span style={{ color: '#0284c7', fontWeight: 700, fontFamily: 'monospace', fontSize: '11px' }}>
                                    · Out: {s.punch_out_time}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '11px' }}>No punch recorded</span>
                            )}
                            <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                              {s.face_verified && (
                                <span style={{ fontSize: '9px', background: '#dcfce7', color: '#15803d', padding: '1px 4px', borderRadius: '4px', fontWeight: 700 }}>
                                  Face ✓
                                </span>
                              )}
                              {s.gps_verified && (
                                <span style={{ fontSize: '9px', background: '#e0f2fe', color: '#0369a1', padding: '1px 4px', borderRadius: '4px', fontWeight: 700 }}>
                                  GPS ✓
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Delivered Hours */}
                          <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                            <strong>{s.worked_hours} hrs</strong>
                            <div style={{ fontSize: '10px', color: '#64748b' }}>({s.worked_minutes} mins)</div>
                          </td>

                          {/* Rate & Total Payable */}
                          <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                            <strong style={{ color: s.session_payable > 0 ? '#16a34a' : '#94a3b8', fontSize: '13px' }}>
                              ₹ {s.session_payable.toLocaleString()}
                            </strong>
                            <div style={{ fontSize: '10px', color: '#64748b' }}>
                              @ ₹{s.rate_per_lecture}/lec
                            </div>
                          </td>

                          {/* Session Status */}
                          <td style={{ padding: '9px 10px' }}>
                            <span
                              className={`lecture-status-badge status-${s.session_status}`}
                              style={{ fontSize: '10px', padding: '2px 6px' }}
                            >
                              {s.session_status}
                            </span>
                          </td>

                          {/* Approval Status Badge */}
                          <td style={{ padding: '9px 10px' }}>
                            {isVerified && (
                              <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '12px', fontSize: '10.5px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                <Check size={11} /> Verified
                              </span>
                            )}
                            {isPending && (
                              <span style={{ background: '#fef3c7', color: '#b45309', padding: '3px 8px', borderRadius: '12px', fontSize: '10.5px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                <Clock size={11} /> Pending
                              </span>
                            )}
                            {isRejected && (
                              <span
                                style={{ background: '#fee2e2', color: '#b91c1c', padding: '3px 8px', borderRadius: '12px', fontSize: '10.5px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                title={s.rejection_reason || 'Rejected by administration'}
                              >
                                <X size={11} /> Rejected
                              </span>
                            )}
                          </td>

                          {/* Admin Actions */}
                          <td style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', gap: '4px' }}>
                              {s.record_id > 0 && !isVerified && (
                                <button
                                  type="button"
                                  className="button button-compact"
                                  onClick={() => handleApproveSession(s.record_id)}
                                  disabled={approvingBusy}
                                  style={{ padding: '3px 7px', fontSize: '10.5px', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}
                                  title="Verify and approve this session"
                                >
                                  <Check size={12} />
                                  <span>Approve</span>
                                </button>
                              )}

                              {s.record_id > 0 && !isRejected && (
                                <button
                                  type="button"
                                  className="button button-compact"
                                  onClick={() => handleOpenReject(s.record_id)}
                                  disabled={approvingBusy}
                                  style={{ padding: '3px 7px', fontSize: '10.5px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5' }}
                                  title="Reject this session from honorarium calculation"
                                >
                                  <X size={12} />
                                  <span>Reject</span>
                                </button>
                              )}

                              <button
                                type="button"
                                className="button button-compact"
                                onClick={() => handleOpenVoucherModal(s.faculty_id)}
                                style={{ padding: '3px 7px', fontSize: '10.5px', background: '#f8fafc', color: '#0284c7', border: '1px solid #cbd5e1' }}
                                title="Generate individual voucher for this teacher"
                              >
                                <FileText size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ======================================================== */}
      {/* TAB 2: MONTHLY HONORARIUM SUMMARY & SETTLEMENTS          */}
      {/* ======================================================== */}
      {activeTab === 'honorarium' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
            <div className="panel" style={{ padding: '1rem', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Gross Payable</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>₹{honorariumKpis.total_honorarium_payable.toLocaleString()}</div>
            </div>
            <div className="panel" style={{ padding: '1rem', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Lectures Conducted</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#16a34a', marginTop: '4px' }}>{honorariumKpis.total_lectures_conducted}</div>
            </div>
            <div className="panel" style={{ padding: '1rem', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Hours Delivered</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0284c7', marginTop: '4px' }}>{honorariumKpis.total_hours_delivered} hrs</div>
            </div>
            <div className="panel" style={{ padding: '1rem', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Settled / Disbursed</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#8b5cf6', marginTop: '4px' }}>₹{honorariumKpis.settled_amount.toLocaleString()}</div>
            </div>
          </div>

          <div className="panel" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Period:</span>
                <input
                  type="date"
                  className="input-field"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  style={{ width: '145px', padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                />
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>to</span>
                <input
                  type="date"
                  className="input-field"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  style={{ width: '145px', padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div style={{ position: 'relative', minWidth: '220px', flex: 1 }}>
                <Search
                  size={15}
                  style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}
                />
                <input
                  type="text"
                  className="input-field"
                  placeholder="Search faculty name, ID, dept..."
                  value={honorariumSearch}
                  onChange={(e) => setHonorariumSearch(e.target.value)}
                  style={{ paddingLeft: '32px', width: '100%', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <select
                className="select-field"
                value={honorariumStatusFilter}
                onChange={(e) => setHonorariumStatusFilter(e.target.value as any)}
                style={{ width: '140px', padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
              >
                <option value="all">All Settlements</option>
                <option value="pending">Pending</option>
                <option value="settled">Settled</option>
              </select>

              <select
                className="select-field"
                value={honorariumDeptFilter}
                onChange={(e) => setHonorariumDeptFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                style={{ width: '170px', padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
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

          <div className="panel" style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px' }}>
            <div className="table-scroll">
              <table className="admin-data-table" style={{ width: '100%', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ padding: '9px 10px' }}>Visiting Faculty Member</th>
                    <th style={{ padding: '9px 10px' }}>Department</th>
                    <th style={{ padding: '9px 10px' }}>Delivered Lectures</th>
                    <th style={{ padding: '9px 10px' }}>Teaching Hours</th>
                    <th style={{ padding: '9px 10px' }}>Punctuality Rate</th>
                    <th style={{ padding: '9px 10px' }}>Remuneration Rate</th>
                    <th style={{ padding: '9px 10px' }}>Gross Honorarium</th>
                    <th style={{ padding: '9px 10px' }}>Settlement Status</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {honorariumItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>
                        <CreditCard size={36} style={{ margin: '0 auto 0.5rem', opacity: 0.4 }} />
                        <p>No faculty settlement records found for this period.</p>
                      </td>
                    </tr>
                  ) : (
                    honorariumItems.map((item) => (
                      <tr key={item.faculty_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '9px 10px' }}>
                          <strong style={{ color: '#0f172a' }}>{item.faculty_name}</strong>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                            ID: {item.employee_id || 'N/A'} · {item.email}
                          </div>
                        </td>
                        <td style={{ padding: '9px 10px' }}>
                          <span className="badge badge-neutral">{item.department_name}</span>
                        </td>
                        <td style={{ padding: '9px 10px', fontWeight: 700 }}>
                          {item.completed_lectures} lectures
                        </td>
                        <td style={{ padding: '9px 10px' }}>
                          {item.total_hours_delivered} hrs
                        </td>
                        <td style={{ padding: '9px 10px' }}>
                          <span className={`badge ${item.punctuality_rate >= 90 ? 'badge-success' : 'badge-warning'}`}>
                            {item.punctuality_rate}%
                          </span>
                        </td>
                        <td style={{ padding: '9px 10px' }}>
                          ₹ {item.rate_per_lecture.toLocaleString()} / lec
                        </td>
                        <td style={{ padding: '9px 10px', fontWeight: 700, color: '#16a34a' }}>
                          ₹ {item.gross_amount.toLocaleString()}
                        </td>
                        <td style={{ padding: '9px 10px' }}>
                          {item.settlement_status === 'settled' ? (
                            <span className="badge badge-success">Settled</span>
                          ) : (
                            <span className="badge badge-warning">Pending Payment</span>
                          )}
                        </td>
                        <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                          {item.settlement_status !== 'settled' && item.gross_amount > 0 ? (
                            <button
                              type="button"
                              className="button button-primary"
                              onClick={() => handleOpenSettle(item)}
                              style={{ padding: '4px 10px', fontSize: '11px' }}
                            >
                              <Check size={12} style={{ marginRight: '4px' }} />
                              <span>Settle Payout</span>
                            </button>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#64748b' }}>Disbursed</span>
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
      )}

      {/* ======================================================== */}
      {/* TAB 3: REMUNERATION & RATE POLICIES                      */}
      {/* ======================================================== */}
      {activeTab === 'rates' && (
        <div className="panel" style={{ padding: '1.5rem', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>
                Faculty Remuneration & Hourly Rate Matrices
              </h2>
              <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0.25rem 0 0' }}>
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
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={15} />
              <span>Add Custom Faculty Rate</span>
            </button>
          </div>

          <div className="table-scroll">
            <table className="admin-data-table" style={{ width: '100%', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '9px 10px' }}>Faculty Scope</th>
                  <th style={{ padding: '9px 10px' }}>Rate / Delivered Lecture</th>
                  <th style={{ padding: '9px 10px' }}>Rate / Teaching Hour</th>
                  <th style={{ padding: '9px 10px' }}>Effective Date</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '9px 10px', fontWeight: 700, color: r.faculty_id ? '#0284c7' : '#15803d' }}>
                      {r.faculty_name}
                    </td>
                    <td style={{ padding: '9px 10px', fontWeight: 700 }}>
                      ₹ {r.rate_per_lecture.toLocaleString()}
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      ₹ {r.rate_per_hour.toLocaleString()}
                    </td>
                    <td style={{ padding: '9px 10px', color: '#64748b' }}>
                      {r.effective_from || 'Always active'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 1: REJECTION REASON DIALOG                         */}
      {/* ======================================================== */}
      {showRejectModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div style={{ background: '#fff', borderRadius: '14px', maxWidth: '440px', width: '100%', padding: '20px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 800, color: '#b91c1c' }}>
              Reject Session Attendance
            </h3>
            <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#64748b' }}>
              Specify the reason for rejecting this lecture session. Rejected sessions are excluded from automated honorarium calculation.
            </p>

            <form onSubmit={handleRejectSubmit}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  REJECTION REASON *
                </label>
                <textarea
                  required
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. Session was not conducted / Punch-in occurred outside classroom geofence..."
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setShowRejectModal(false)}
                  disabled={approvingBusy}
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button"
                  disabled={approvingBusy}
                  style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 700, background: '#dc2626', color: '#fff', border: 0, borderRadius: '6px' }}
                >
                  {approvingBusy ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: PRINTABLE OFFICIAL REMUNERATION VOUCHER (PDF)    */}
      {/* ======================================================== */}
      {showVoucherModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '16px',
              maxWidth: '860px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              position: 'relative',
            }}
          >
            {/* Modal Top Toolbar (Hidden on Print) */}
            <div
              className="voucher-toolbar"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 24px',
                borderBottom: '1px solid #e2e8f0',
                background: '#f8fafc',
                borderRadius: '16px 16px 0 0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Printer size={18} style={{ color: '#0284c7' }} />
                <strong style={{ fontSize: '14px', color: '#0f172a' }}>
                  Official Remuneration Voucher Statement
                </strong>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* Faculty Selector Inside Voucher Preview */}
                <select
                  style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 700 }}
                  value={voucherTargetFacultyId}
                  onChange={(e) => setVoucherTargetFacultyId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                >
                  <option value="all">Consolidated (All Teachers)</option>
                  {facultyMembers.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.full_name} ({f.employee_id})
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => window.print()}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 800 }}
                >
                  <Printer size={14} />
                  <span>Print / Save PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowVoucherModal(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Printable Voucher Body */}
            <div id="printable-remuneration-voucher" style={{ padding: '32px 36px', color: '#0f172a', fontFamily: 'Manrope, sans-serif' }}>
              {/* College Letterhead */}
              <div style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '14px', marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1px', color: '#0284c7', textTransform: 'uppercase' }}>
                  ATTENDEASE HIGHER EDUCATION ACADEMIC ERP
                </div>
                <h2 style={{ margin: '4px 0 2px', fontSize: '22px', fontWeight: 900, color: '#0f172a' }}>
                  COLLEGE OF ENGINEERING & TECHNOLOGY
                </h2>
                <p style={{ margin: 0, fontSize: '11.5px', color: '#475569' }}>
                  Approved by AICTE & Affiliated to State Technological University · Academic Payroll Division
                </p>
                <div style={{ display: 'inline-block', marginTop: '10px', padding: '4px 14px', background: '#0f172a', color: '#fff', borderRadius: '4px', fontSize: '12px', fontWeight: 800, letterSpacing: '0.5px' }}>
                  VISITING FACULTY ATTENDANCE & REMUNERATION VOUCHER
                </div>
              </div>

              {/* Faculty & Period Info Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '12px',
                  padding: '14px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  marginBottom: '20px',
                  fontSize: '12px',
                }}
              >
                <div>
                  <div>
                    <span style={{ color: '#64748b' }}>Visiting Faculty: </span>
                    <strong style={{ color: '#0f172a' }}>
                      {voucherSelectedFac ? voucherSelectedFac.full_name : 'Consolidated Visiting Faculty Roster'}
                    </strong>
                  </div>
                  <div style={{ marginTop: '4px' }}>
                    <span style={{ color: '#64748b' }}>Employee ID: </span>
                    <strong style={{ fontFamily: 'monospace' }}>
                      {voucherSelectedFac ? voucherSelectedFac.employee_id : 'MULTIPLE'}
                    </strong>
                  </div>
                </div>

                <div>
                  <div>
                    <span style={{ color: '#64748b' }}>Audit Period: </span>
                    <strong>{dateFrom} to {dateTo}</strong>
                  </div>
                  <div style={{ marginTop: '4px' }}>
                    <span style={{ color: '#64748b' }}>Verification Status: </span>
                    <span style={{ color: '#16a34a', fontWeight: 800 }}>Biometric Facial & GPS Verified</span>
                  </div>
                </div>
              </div>

              {/* Summary Totals Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#0f172a', color: '#fff' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>Total Verified Sessions</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>Delivered Teaching Hours</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>Standard Honorarium Rate</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Net Remuneration Payable</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #cbd5e1', background: '#f1f5f9', fontWeight: 800 }}>
                    <td style={{ padding: '10px' }}>{voucherSessions.length} Sessions</td>
                    <td style={{ padding: '10px' }}>{voucherTotalHours.toFixed(2)} Hours</td>
                    <td style={{ padding: '10px' }}>₹ 1,500 / Lecture</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontSize: '15px', color: '#15803d' }}>
                      ₹ {voucherTotalPayable.toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Session Ledger Breakdown */}
              <div style={{ marginBottom: '24px' }}>
                <strong style={{ fontSize: '12px', textTransform: 'uppercase', color: '#475569', letterSpacing: '0.5px' }}>
                  Audited Classroom Instruction Ledger ({voucherSessions.length} Records)
                </strong>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8px', fontSize: '11px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Date</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Teacher</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Subject</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Room</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Slot</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Punch In / Out</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {voucherSessions.map((s, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '6px 8px' }}>{s.date}</td>
                        <td style={{ padding: '6px 8px', fontWeight: 600 }}>{s.faculty_name}</td>
                        <td style={{ padding: '6px 8px' }}>{s.subject}</td>
                        <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{s.room}</td>
                        <td style={{ padding: '6px 8px' }}>{s.scheduled_slot}</td>
                        <td style={{ padding: '6px 8px' }}>{s.punch_in_time || '—'} – {s.punch_out_time || '—'}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#15803d' }}>
                          ₹ {s.session_payable.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* THREE SIGNATURE BLOCKS */}
              <div
                style={{
                  marginTop: '40px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '24px',
                  paddingTop: '20px',
                  borderTop: '1px solid #cbd5e1',
                  textAlign: 'center',
                  fontSize: '11px',
                }}
              >
                <div>
                  <div style={{ height: '48px' }}></div>
                  <div style={{ borderTop: '1px dashed #0f172a', paddingTop: '6px', fontWeight: 800 }}>
                    Visiting Faculty Signature
                  </div>
                  <div style={{ color: '#64748b', fontSize: '10px' }}>Date: __________________</div>
                </div>

                <div>
                  <div style={{ height: '48px' }}></div>
                  <div style={{ borderTop: '1px dashed #0f172a', paddingTop: '6px', fontWeight: 800 }}>
                    Verified by Head of Dept (HOD)
                  </div>
                  <div style={{ color: '#64748b', fontSize: '10px' }}>Date: __________________</div>
                </div>

                <div>
                  <div style={{ height: '48px' }}></div>
                  <div style={{ borderTop: '1px dashed #0f172a', paddingTop: '6px', fontWeight: 800 }}>
                    Approved by Principal / Finance
                  </div>
                  <div style={{ color: '#64748b', fontSize: '10px' }}>Date: __________________</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: SETTLEMENT TRANSACTION MODAL                    */}
      {/* ======================================================== */}
      {showSettleModal && settlingItem && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div style={{ background: '#fff', borderRadius: '14px', maxWidth: '440px', width: '100%', padding: '20px' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
              Process Honorarium Settlement
            </h3>
            <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#64748b' }}>
              Confirm payment disbursement for <strong>{settlingItem.faculty_name}</strong>.
            </p>

            <form onSubmit={handleSettleSubmit}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  TRANSACTION REFERENCE *
                </label>
                <input
                  type="text"
                  required
                  value={settleTxRef}
                  onChange={(e) => setSettleTxRef(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  NOTES / REMARKS
                </label>
                <textarea
                  rows={2}
                  value={settleNotes}
                  onChange={(e) => setSettleNotes(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" className="button button-secondary" onClick={() => setShowSettleModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="button button-primary" disabled={settlingBusy}>
                  {settlingBusy ? 'Processing...' : 'Confirm Disbursement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 4: CONFIGURE RATE POLICY MODAL                     */}
      {/* ======================================================== */}
      {showRateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div style={{ background: '#fff', borderRadius: '14px', maxWidth: '440px', width: '100%', padding: '20px' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
              Configure Remuneration Rate
            </h3>

            <form onSubmit={handleSaveRate}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  FACULTY MEMBER (LEAVE EMPTY FOR DEFAULT)
                </label>
                <select
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                  value={rateFacultyId}
                  onChange={(e) => setRateFacultyId(e.target.value === '' ? '' : Number(e.target.value))}
                >
                  <option value="">Default College Baseline Rate</option>
                  {facultyMembers.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.full_name} ({f.employee_id})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    RATE PER LECTURE (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={50}
                    value={ratePerLecture}
                    onChange={(e) => setRatePerLecture(Number(e.target.value))}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    RATE PER HOUR (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={50}
                    value={ratePerHour}
                    onChange={(e) => setRatePerHour(Number(e.target.value))}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" className="button button-secondary" onClick={() => setShowRateModal(false)}>
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

export default ReportsAnalyticsPage
