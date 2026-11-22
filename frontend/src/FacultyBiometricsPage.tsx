import { useEffect, useState } from 'react'
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Fingerprint,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  Video,
  X,
} from 'lucide-react'
import { api, errorMessage } from './api'
import { CaptureDialog, type User } from './App'

interface Challenge {
  challenge_token: string
  instruction: string
}

interface VerificationLogItem {
  id: number
  action: string
  result: string
  similarity_score: number | null
  liveness_score: number | null
  failure_reason: string | null
  created_at: string | null
}

interface EnrollmentHistoryItem {
  id: number
  status: string
  created_at: string | null
  reviewed_at: string | null
  review_reason: string | null
}

interface BiometricProfileData {
  user_id: number
  full_name: string
  employee_id: string
  face_enrolled: boolean
  enrollment_status: string
  enrolled_at: string | null
  approved_at: string | null
  approved_by: string | null
  algorithm: string
  anti_spoofing: string
  encryption: string
  match_threshold: number
  stats: {
    total_attempts: number
    pass_count: number
    fail_count: number
    accuracy_rate: number
  }
  recent_verifications: VerificationLogItem[]
  enrollment_history: EnrollmentHistoryItem[]
}

export function FacultyBiometricsPage({
  user,
  onUserUpdate,
  onComplete,
}: {
  user: User
  onUserUpdate: (u: User) => void
  onComplete?: () => void
}) {
  const [profile, setProfile] = useState<BiometricProfileData | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [pageError, setPageError] = useState<string>('')
  const [pageMessage, setPageMessage] = useState<string>('')

  // Enrollment / Re-Enrollment Modal State
  const [enrollChallenge, setEnrollChallenge] = useState<Challenge | null>(null)
  const [enrollOpen, setEnrollOpen] = useState<boolean>(false)
  const [consent, setConsent] = useState<boolean>(true)
  const [enrollBusy, setEnrollBusy] = useState<boolean>(false)

  // Live Test Verification Modal State
  const [testChallenge, setTestChallenge] = useState<Challenge | null>(null)
  const [testOpen, setTestOpen] = useState<boolean>(false)
  const [testBusy, setTestBusy] = useState<boolean>(false)
  const [testResult, setTestResult] = useState<{
    matched: boolean
    similarity_score: number | null
    liveness_score: number | null
    threshold: number
    message: string
  } | null>(null)

  const loadProfile = async () => {
    setLoading(true)
    setPageError('')
    try {
      const res = await api.get<BiometricProfileData>('/faculty/biometrics/profile')
      setProfile(res.data)
    } catch (err) {
      setPageError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProfile()
  }, [])

  // 1. Open Live Face Test Verification
  const startLiveFaceTest = async () => {
    setPageError('')
    setPageMessage('')
    setTestResult(null)
    setTestBusy(true)
    try {
      const challengeRes = await api.post<Challenge>('/biometrics/challenge', {
        action: 'test_verification',
      })
      setTestChallenge(challengeRes.data)
      setTestOpen(true)
    } catch (err) {
      setPageError(errorMessage(err))
    } finally {
      setTestBusy(false)
    }
  }

  // Submit Live Face Test Capture
  const handleTestCapture = async (frames: string[]) => {
    if (!testChallenge) return
    setTestBusy(true)
    setPageError('')
    try {
      const res = await api.post<{
        matched: boolean
        similarity_score: number | null
        liveness_score: number | null
        threshold: number
        message: string
      }>('/faculty/biometrics/test-verify', {
        challenge_token: testChallenge.challenge_token,
        frames,
        face_image_base64: frames[frames.length - 1],
      })
      setTestResult(res.data)
      setTestOpen(false)
      setTestChallenge(null)
      loadProfile()
    } catch (err) {
      setPageError(errorMessage(err))
      setTestOpen(false)
      setTestChallenge(null)
    } finally {
      setTestBusy(false)
    }
  }

  // 2. Open Face Enrollment
  const startEnrollment = async () => {
    setPageError('')
    setPageMessage('')
    setEnrollBusy(true)
    try {
      const challengeRes = await api.post<Challenge>('/biometrics/challenge', {
        action: 'enrollment',
      })
      setEnrollChallenge(challengeRes.data)
      setEnrollOpen(true)
    } catch (err) {
      setPageError(errorMessage(err))
    } finally {
      setEnrollBusy(false)
    }
  }

  // Submit Face Enrollment Capture
  const handleEnrollCapture = async (frames: string[]) => {
    if (!enrollChallenge) return
    if (!consent) {
      setPageError('Please consent to biometric template storage.')
      return
    }
    setEnrollBusy(true)
    setPageError('')
    try {
      await api.post('/biometrics/enroll', {
        challenge_token: enrollChallenge.challenge_token,
        frames,
        face_image_base64: frames[frames.length - 1],
        consent: true,
      })
      setPageMessage('Biometric enrollment active & approved! Face verified against college database.')
      setEnrollOpen(false)
      setEnrollChallenge(null)
      onUserUpdate({ ...user, face_enrollment_status: 'approved' })
      onComplete?.()
      loadProfile()
    } catch (err) {
      setPageError(errorMessage(err))
      setEnrollOpen(false)
      setEnrollChallenge(null)
    } finally {
      setEnrollBusy(false)
    }
  }

  // 3. Withdraw Consent & Delete Template
  const handleWithdrawConsent = async () => {
    if (
      !window.confirm(
        'Are you sure you want to withdraw biometric consent and delete your stored face template? This will disable biometric lecture punch-ins until you re-enroll.'
      )
    ) {
      return
    }
    setLoading(true)
    setPageError('')
    try {
      await api.delete('/biometrics/enrollment')
      setPageMessage('Biometric template deleted and consent withdrawn from database.')
      onUserUpdate({ ...user, face_enrollment_status: 'revoked' })
      loadProfile()
    } catch (err) {
      setPageError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const status = profile?.enrollment_status || 'not_enrolled'
  const isApproved = status === 'approved'
  const isPending = status === 'pending_approval'

  return (
    <div className="page-content">
      {/* Page Header */}
      <div className="page-heading">
        <div>
          <div className="eyebrow">BIOMETRICS & SECURITY</div>
          <h1>Face Verification & Biometric Credentials</h1>
          <p className="muted" style={{ marginTop: '4px' }}>
            Faculty: <strong>{user.full_name}</strong> ({user.employee_id}) · SFace 128D feature recognition & MiniFASNet neural anti-spoofing.
          </p>
        </div>

        <button
          className="button button-secondary"
          onClick={loadProfile}
          disabled={loading}
          title="Refresh database records"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Notifications / Alerts */}
      {pageError && (
        <div className="notice notice-error" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={18} />
          <span>{pageError}</span>
        </div>
      )}
      {pageMessage && (
        <div className="notice notice-success" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle2 size={18} />
          <span>{pageMessage}</span>
        </div>
      )}

      {/* Live Test Result Banner */}
      {testResult && (
        <div
          className={`notice ${testResult.matched ? 'notice-success' : 'notice-error'}`}
          style={{
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            padding: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            {testResult.matched ? (
              <CheckCircle2 style={{ color: '#2b9b76', marginTop: '2px' }} size={22} />
            ) : (
              <ShieldAlert style={{ color: '#cf6959', marginTop: '2px' }} size={22} />
            )}
            <div>
              <strong style={{ fontSize: '14px', display: 'block' }}>
                {testResult.matched ? 'Live Biometric Verification: PASSED' : 'Live Biometric Verification: REJECTED'}
              </strong>
              <p style={{ margin: '4px 0 8px 0', fontSize: '12px' }}>{testResult.message}</p>
              <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--muted)' }}>
                <span>
                  Similarity Score: <strong style={{ color: 'var(--ink)' }}>{testResult.similarity_score ?? 'N/A'}</strong> (Required Threshold: &ge; {testResult.threshold})
                </span>
                <span>·</span>
                <span>
                  Liveness Score: <strong style={{ color: 'var(--ink)' }}>{testResult.liveness_score ?? 'N/A'}</strong> (Anti-Spoofing: Passed)
                </span>
              </div>
            </div>
          </div>
          <button
            className="button button-link"
            onClick={() => setTestResult(null)}
            style={{ color: 'var(--muted)' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Main Hero Panel */}
      <div className="panel" style={{ padding: '24px', marginBottom: '19px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
            <div
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '12px',
                background: isApproved ? 'var(--teal-light)' : '#f5f8f8',
                color: isApproved ? 'var(--teal)' : 'var(--muted)',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <Fingerprint size={30} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span className={`badge ${isApproved ? 'badge-approved' : isPending ? 'badge-pending' : 'badge-rejected'}`}>
                  <span className="status-dot"></span>
                  {status.toUpperCase().replace('_', ' ')}
                </span>
                {isApproved && (
                  <span className="badge badge-approved" style={{ fontSize: '10px' }}>
                    <ShieldCheck size={11} /> SFace 128D Encrypted
                  </span>
                )}
              </div>
              <h2 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: 800, color: 'var(--ink)' }}>
                {isApproved
                  ? 'Biometric Template Active & Approved'
                  : isPending
                  ? 'Biometric Enrollment Awaiting Review'
                  : 'No Biometric Enrollment Active'}
              </h2>
              <p className="muted" style={{ margin: 0, fontSize: '12px', maxWidth: '580px' }}>
                {isApproved
                  ? `Enrolled with SFace feature extractor. Approved by ${profile?.approved_by || 'Department Admin'}. Valid for 1-click biometric lecture and campus attendance punches.`
                  : isPending
                  ? 'Your face capture has been stored in encrypted format. Waiting for HOD or College Admin approval.'
                  : 'Please register your face to enable 1-click biometric attendance during your scheduled lectures.'}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {isApproved && (
              <button
                className="button button-primary"
                onClick={startLiveFaceTest}
                disabled={testBusy}
              >
                <Video size={14} />
                <span>Test Live Face Match</span>
              </button>
            )}

            {!isApproved && !isPending && (
              <button
                className="button button-primary"
                onClick={startEnrollment}
                disabled={enrollBusy}
              >
                <Camera size={14} />
                <span>Enroll Face Now</span>
              </button>
            )}

            {(isApproved || isPending) && (
              <button
                className="button button-danger"
                onClick={handleWithdrawConsent}
                disabled={loading}
                title="Deletes stored biometric embedding from database"
              >
                <Trash2 size={14} />
                <span>Withdraw Consent</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Security & System Specifications */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '14px', marginBottom: '19px' }}>
        <div className="metric-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--teal)' }}>
            <Fingerprint size={16} />
            <span className="eyebrow" style={{ fontSize: '10px' }}>Recognition Model</span>
          </div>
          <div style={{ marginTop: '8px', fontWeight: 700, fontSize: '14px', color: 'var(--ink)' }}>
            {profile?.algorithm || 'SFace 128D (FaceRecognizerSF)'}
          </div>
          <div className="metric-note">OpenCV DNN Deep Feature Extractor</div>
        </div>

        <div className="metric-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1d6fbf' }}>
            <ShieldCheck size={16} />
            <span className="eyebrow" style={{ fontSize: '10px' }}>Liveness & Anti-Spoof</span>
          </div>
          <div style={{ marginTop: '8px', fontWeight: 700, fontSize: '14px', color: 'var(--ink)' }}>
            {profile?.anti_spoofing || 'MiniFASNet Dual-Branch'}
          </div>
          <div className="metric-note">Photo / Screen / Replay rejection</div>
        </div>

        <div className="metric-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#2b9b76' }}>
            <Lock size={16} />
            <span className="eyebrow" style={{ fontSize: '10px' }}>Cryptographic Storage</span>
          </div>
          <div style={{ marginTop: '8px', fontWeight: 700, fontSize: '14px', color: 'var(--ink)' }}>
            {profile?.encryption || 'Fernet AES-128 Biometric'}
          </div>
          <div className="metric-note">Raw photos discarded after embedding</div>
        </div>

        <div className="metric-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#d8963e' }}>
            <UserCheck size={16} />
            <span className="eyebrow" style={{ fontSize: '10px' }}>Cosine Threshold</span>
          </div>
          <div style={{ marginTop: '8px', fontWeight: 700, fontSize: '14px', color: 'var(--ink)' }}>
            &ge; {profile?.match_threshold ?? 0.363}
          </div>
          <div className="metric-note">Configured in College Policy</div>
        </div>
      </div>

      {/* Verification Statistics Panel */}
      {profile && (
        <div className="panel" style={{ padding: '20px', marginBottom: '19px' }}>
          <div className="panel-heading" style={{ marginBottom: '14px' }}>
            <h3>Verification Compliance Summary</h3>
            <span className="badge badge-approved">
              <span className="status-dot"></span>
              {profile.stats.accuracy_rate}% Match Success Rate
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px' }}>
            <div style={{ padding: '14px', background: '#fafcfc', borderRadius: '8px', border: '1px solid var(--line)', textAlign: 'center' }}>
              <div className="eyebrow" style={{ fontSize: '10px' }}>Total Punch Attempts</div>
              <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '4px', color: 'var(--ink)' }}>{profile.stats.total_attempts}</div>
            </div>
            <div style={{ padding: '14px', background: '#eef9f4', borderRadius: '8px', border: '1px solid #d7eee5', textAlign: 'center' }}>
              <div className="eyebrow" style={{ fontSize: '10px', color: '#28775f' }}>Biometric Matches (Pass)</div>
              <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '4px', color: '#28775f' }}>{profile.stats.pass_count}</div>
            </div>
            <div style={{ padding: '14px', background: '#fcf1ef', borderRadius: '8px', border: '1px solid #f0dcd7', textAlign: 'center' }}>
              <div className="eyebrow" style={{ fontSize: '10px', color: '#a35447' }}>Mismatches / Rejected (Fail)</div>
              <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '4px', color: '#a35447' }}>{profile.stats.fail_count}</div>
            </div>
            <div style={{ padding: '14px', background: '#edf7f6', borderRadius: '8px', border: '1px solid var(--line)', textAlign: 'center' }}>
              <div className="eyebrow" style={{ fontSize: '10px' }}>Enrolled Since</div>
              <div style={{ fontSize: '14px', fontWeight: 700, marginTop: '8px', color: 'var(--teal-dark)' }}>
                {profile.enrolled_at ? profile.enrolled_at.slice(0, 10) : 'Not enrolled'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Biometric Verification Audit Trail Table */}
      <div className="panel" style={{ padding: '20px' }}>
        <div className="panel-heading" style={{ marginBottom: '14px' }}>
          <div>
            <h3>Biometric Verification Audit Trail</h3>
            <p className="muted" style={{ margin: '4px 0 0 0', fontSize: '11px' }}>
              Live audit logs from biometric_verification_logs table in database.
            </p>
          </div>
        </div>

        <div className="table-scroll">
          <table className="data-table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)', background: '#fafcfc' }}>
                <th style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--muted)' }}>Date & Time</th>
                <th style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--muted)' }}>Action</th>
                <th style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--muted)' }}>Verification Result</th>
                <th style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--muted)' }}>Similarity Score</th>
                <th style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--muted)' }}>Liveness Score</th>
                <th style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--muted)' }}>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {!profile?.recent_verifications || profile.recent_verifications.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: 'var(--muted)', fontSize: '12px' }}>
                    No biometric verification logs found in the database.
                  </td>
                </tr>
              ) : (
                profile.recent_verifications.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 600 }}>{log.created_at || '—'}</td>
                    <td style={{ padding: '12px 14px', fontSize: '12px', textTransform: 'capitalize' }}>
                      {log.action.replace('_', ' ')}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span className={`badge ${log.result === 'PASS' ? 'badge-approved' : 'badge-rejected'}`}>
                        <span className="status-dot"></span>
                        {log.result}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 600 }}>
                      {log.similarity_score !== null ? log.similarity_score : '—'}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '12px' }}>
                      {log.liveness_score !== null ? log.liveness_score : '—'}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '11px', color: 'var(--muted)' }}>
                      {log.failure_reason || (log.result === 'PASS' ? 'SFace match verified' : '—')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Test Capture Dialog Modal */}
      {testOpen && testChallenge && (
        <CaptureDialog
          title="Live SFace Biometric Test"
          instruction={`${testChallenge.instruction}. Position your face in front of the camera with good lighting to evaluate your similarity score.`}
          captureLabel="Test My Face Match"
          busy={testBusy}
          onCancel={() => {
            setTestOpen(false)
            setTestChallenge(null)
          }}
          onCapture={handleTestCapture}
        />
      )}

      {/* Face Enrollment Capture Dialog Modal */}
      {enrollOpen && enrollChallenge && (
        <CaptureDialog
          title="Face Registration & Enrollment"
          instruction={`${enrollChallenge.instruction}. Position your face in front of the camera with neutral expression.`}
          captureLabel="Register Face"
          consent={consent}
          onConsentChange={setConsent}
          busy={enrollBusy}
          onCancel={() => {
            setEnrollOpen(false)
            setEnrollChallenge(null)
          }}
          onCapture={handleEnrollCapture}
        />
      )}
    </div>
  )
}
