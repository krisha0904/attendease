import React, { useState } from 'react'
import {
  AlertCircle,
  ArrowDownToLine,
  CheckCircle2,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Upload,
  Users,
} from 'lucide-react'
import { AdminPageScaffold } from './AdminComponents'
import { api, errorMessage } from './api'

interface ImportRow {
  full_name: string
  email: string
  employee_id?: string
  department_code?: string
  phone?: string
  designation?: string
}

export function ImportExportPage() {
  const [csvText, setCsvText] = useState('')
  const [parsedRows, setParsedRows] = useState<ImportRow[]>([])
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<any | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sampleTemplate = `full_name,email,employee_id,department_code,phone,designation
Dr. Rajesh Sharma,sharma.rajesh@college.edu,VF-2025-001,CSE,+91 98200 12345,Visiting Professor
Prof. Anita Desai,anita.desai@college.edu,VF-2025-002,IT,+91 98201 67890,Guest Lecturer
Dr. Vikram Seth,vikram.seth@college.edu,VF-2025-003,ECE,+91 98202 34567,Adjunct Faculty`

  const parseCsvContent = (content: string) => {
    setError(null)
    setImportResult(null)
    const lines = content.trim().split('\n')
    if (lines.length < 2) {
      setError('CSV content must contain at least a header row and one data row.')
      setParsedRows([])
      return
    }

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/^["']|["']$/g, ''))
    const nameIdx = headers.indexOf('full_name')
    const emailIdx = headers.indexOf('email')
    const empIdx = headers.indexOf('employee_id')
    const deptIdx = headers.indexOf('department_code')
    const phoneIdx = headers.indexOf('phone')
    const desigIdx = headers.indexOf('designation')

    if (nameIdx === -1 || emailIdx === -1) {
      setError("CSV must include 'full_name' and 'email' header columns.")
      setParsedRows([])
      return
    }

    const rows: ImportRow[] = []
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      const cols = line.split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''))
      if (cols.length > nameIdx && cols.length > emailIdx) {
        rows.push({
          full_name: cols[nameIdx] || '',
          email: cols[emailIdx] || '',
          employee_id: empIdx !== -1 ? cols[empIdx] : undefined,
          department_code: deptIdx !== -1 ? cols[deptIdx] : undefined,
          phone: phoneIdx !== -1 ? cols[phoneIdx] : undefined,
          designation: desigIdx !== -1 ? cols[desigIdx] : undefined,
        })
      }
    }

    setParsedRows(rows)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      setCsvText(text)
      parseCsvContent(text)
    }
    reader.readAsText(file)
  }

  const handleImportSubmit = async () => {
    if (parsedRows.length === 0) return
    setImporting(true)
    setError(null)
    setImportResult(null)

    try {
      const res = await api.post('/admin/import/faculty', { rows: parsedRows })
      setImportResult(res.data)
      setParsedRows([])
      setCsvText('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setImporting(false)
    }
  }

  const handleDownloadExport = async (dataset: string, defaultName: string) => {
    try {
      const endpoint =
        dataset === 'honorarium' ? '/admin/reports/honorarium/export' : `/admin/export/${dataset}`
      const res = await api.get(endpoint, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `${defaultName}_${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (err) {
      alert('Export failed: ' + errorMessage(err))
    }
  }

  return (
    <AdminPageScaffold
      title="Import & Export Management"
      eyebrow="BULK DATA OPERATIONS"
      description="Batch onboarding of visiting faculty, curriculum schedule ingest, and authenticated institutional records export."
      stats={[
        { label: 'Import Validation', value: 'Strict Check', note: 'Duplicate Email & ID Guard', icon: FileSpreadsheet },
        { label: 'Export Channels', value: '4 Formats', note: 'Authenticated CSV Master', icon: Download },
        { label: 'Batch Capacity', value: '500 Records', note: 'Transactional Atomic Load', icon: Users },
      ]}
    >
      {error && (
        <div className="banner banner-error mb-4">
          <AlertCircle size={18} />
          <div>{error}</div>
        </div>
      )}

      {importResult && (
        <div className="banner banner-success mb-4 flex-col items-start gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} />
            <strong>{importResult.message}</strong>
          </div>
          {importResult.errors && importResult.errors.length > 0 && (
            <div className="text-xs bg-white/70 p-2 rounded w-full border border-green-200 mt-2">
              <span className="font-semibold text-gray-700">Notice on skipped rows:</span>
              <ul className="list-disc pl-4 mt-1 space-y-0.5 text-gray-600">
                {importResult.errors.map((err: string, i: number) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="admin-two-col-grid">
        {/* Bulk Import Column */}
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h3>Import Visiting Faculty (CSV)</h3>
              <p className="muted">Upload CSV with validation, duplicate protection, and automated role assignment.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="import-box">
              <FileSpreadsheet size={36} className="text-muted mb-2" />
              <p>Drag and drop your faculty CSV file here, or click to browse</p>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                className="hidden"
                id="faculty-csv-upload"
              />
              <label htmlFor="faculty-csv-upload" className="button button-primary cursor-pointer mt-2 inline-flex items-center gap-2">
                <Upload size={14} /> Select CSV File
              </label>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted">Or paste raw CSV text directly:</span>
              <button
                type="button"
                className="button button-link text-xs"
                onClick={() => {
                  setCsvText(sampleTemplate)
                  parseCsvContent(sampleTemplate)
                }}
              >
                Load Sample Template
              </button>
            </div>

            <textarea
              rows={4}
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value)
                parseCsvContent(e.target.value)
              }}
              placeholder="Paste comma-separated values with headers here..."
              className="font-mono text-xs w-full"
            />

            {parsedRows.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-xs font-semibold uppercase text-muted">
                    Preview Data ({parsedRows.length} Rows Ready)
                  </h4>
                  <button
                    className="button button-primary button-sm"
                    onClick={handleImportSubmit}
                    disabled={importing}
                  >
                    <ArrowDownToLine size={13} /> {importing ? 'Importing Batch...' : 'Confirm & Ingest Batch'}
                  </button>
                </div>
                <div className="table-scroll max-h-48 border border-gray-100 rounded">
                  <table className="admin-data-table text-xs">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Emp ID</th>
                        <th>Dept</th>
                        <th>Designation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.slice(0, 10).map((r, idx) => (
                        <tr key={idx}>
                          <td>{r.full_name}</td>
                          <td>{r.email}</td>
                          <td>{r.employee_id || 'Auto-Gen'}</td>
                          <td>{r.department_code || 'General'}</td>
                          <td>{r.designation || 'Visiting Faculty'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsedRows.length > 10 && (
                  <p className="text-xs text-muted text-center mt-1">
                    Showing first 10 of {parsedRows.length} rows.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Institutional Export Column */}
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h3>Export Institutional Master Records</h3>
              <p className="muted">Authenticated CSV statements for institutional audits and accreditation reports.</p>
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <div className="p-4 border border-gray-100 rounded-lg flex items-center justify-between hover:bg-gray-50 transition">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-blue-50 text-blue-600">
                  <Users size={20} />
                </div>
                <div>
                  <strong>Visiting Faculty Directory</strong>
                  <p className="text-xs text-muted">Full faculty roster, departments, contact info, biometric enrolment.</p>
                </div>
              </div>
              <button
                className="button button-secondary button-sm"
                onClick={() => handleDownloadExport('faculty', 'faculty_directory')}
              >
                <Download size={13} /> Export CSV
              </button>
            </div>

            <div className="p-4 border border-gray-100 rounded-lg flex items-center justify-between hover:bg-gray-50 transition">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-emerald-50 text-emerald-600">
                  <FileSpreadsheet size={20} />
                </div>
                <div>
                  <strong>Master Attendance Records</strong>
                  <p className="text-xs text-muted">Delivered lecture timestamps, teaching hours, biometric and GPS proofs.</p>
                </div>
              </div>
              <button
                className="button button-secondary button-sm"
                onClick={() => handleDownloadExport('attendance', 'master_attendance')}
              >
                <Download size={13} /> Export CSV
              </button>
            </div>

            <div className="p-4 border border-gray-100 rounded-lg flex items-center justify-between hover:bg-gray-50 transition">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-amber-50 text-amber-600">
                  <FileText size={20} />
                </div>
                <div>
                  <strong>Honorarium & Settlement Audit</strong>
                  <p className="text-xs text-muted">Billing statements, verified taught hours, hourly rate matrix, clearances.</p>
                </div>
              </div>
              <button
                className="button button-secondary button-sm"
                onClick={() => handleDownloadExport('honorarium', 'honorarium_statement')}
              >
                <Download size={13} /> Export CSV
              </button>
            </div>

            <div className="p-4 border border-gray-100 rounded-lg flex items-center justify-between hover:bg-gray-50 transition">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-purple-50 text-purple-600">
                  <FileCheck2 size={20} />
                </div>
                <div>
                  <strong>System Security & Audit Trail</strong>
                  <p className="text-xs text-muted">Chronological administrative action events, IPs, and timestamps.</p>
                </div>
              </div>
              <button
                className="button button-secondary button-sm"
                onClick={() => handleDownloadExport('audit_logs', 'system_audit_trail')}
              >
                <Download size={13} /> Export CSV
              </button>
            </div>
          </div>
        </div>
      </div>
    </AdminPageScaffold>
  )
}
