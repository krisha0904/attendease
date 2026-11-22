import { useEffect, useState } from 'react'
import {
  AlertCircle,
  Camera,
  Check,
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
      setPageMessage('Biometric enrollment submitted successfully! Pending administrator approval.')
      setEnrollOpen(false)
      setEnrollChallenge(null)
      onUserUpdate({ ...user, face_enrollment_status: 'pending_approval' })
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
    if (!window.confirm('Are you sure you want to withdraw biometric consent and delete your stored face template? This will disable biometric lecture punch-ins until you re-enroll.')) {
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
    <div className="page-content space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-200">
        <div>
          <div className="eyebrow text-xs font-semibold tracking-wider text-purple-600 uppercase">
            BIOMETRICS & SECURITY
          </div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Fingerprint className="text-purple-600" size={26} />
            Face Verification & Biometric Credentials
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Faculty: <strong>{user.full_name}</strong> ({user.employee_id}) · SFace 128D feature recognition & MiniFASNet neural anti-spoofing.
          </p>
        </div>

        <button
          className="btn btn-secondary flex items-center gap-1.5 text-sm py-1.5 px-3"
          onClick={loadProfile}
          disabled={loading}
          title="Refresh database records"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Notifications / Alerts */}
      {pageError && (
        <div className="notice notice-error flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          <AlertCircle size={18} />
          <span>{pageError}</span>
        </div>
      )}
      {pageMessage && (
        <div className="notice notice-success flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded text-green-700 text-sm">
          <CheckCircle2 size={18} />
          <span>{pageMessage}</span>
        </div>
      )}

      {/* Live Test Result Banner (if just tested) */}
      {testResult && (
        <div
          className={`p-4 rounded-lg border flex items-start justify-between gap-4 ${
            testResult.matched
              ? 'bg-green-50 border-green-300 text-green-900'
              : 'bg-red-50 border-red-300 text-red-900'
          }`}
        >
          <div className="flex items-start gap-3">
            {testResult.matched ? (
              <CheckCircle2 className="text-green-600 mt-0.5" size={24} />
            ) : (
              <ShieldAlert className="text-red-600 mt-0.5" size={24} />
            )}
            <div>
              <h3 className="text-base font-bold">
                {testResult.matched ? 'Live Biometric Verification: PASSED' : 'Live Biometric Verification: FAILED'}
              </h3>
              <p className="text-sm mt-0.5">{testResult.message}</p>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
                <span className="font-semibold">
                  Similarity Score: <strong>{testResult.similarity_score ?? 'N/A'}</strong> (Required Threshold: &gt;={testResult.threshold})
                </span>
                <span>·</span>
                <span className="font-semibold">
                  Liveness Score: <strong>{testResult.liveness_score ?? 'N/A'}</strong> (Neural Anti-Spoof: Passed)
                </span>
              </div>
            </div>
          </div>
          <button
            className="text-gray-400 hover:text-gray-600"
            onClick={() => setTestResult(null)}
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* Hero Status Card */}
      <div className="card p-6 bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div
            className={`p-4 rounded-xl flex items-center justify-center ${
              isApproved
                ? 'bg-green-100 text-green-700'
                : isPending
                ? 'bg-amber-100 text-amber-700'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            <Fingerprint size={36} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`badge px-2.5 py-0.5 text-xs font-bold rounded uppercase tracking-wider ${
                  isApproved
                    ? 'bg-green-100 text-green-800 border border-green-300'
                    : isPending
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-gray-100 text-gray-800 border border-gray-300'
                }`}
              >
                {status.replace('_', ' ')}
              </span>
              {isApproved && (
                <span className="badge bg-purple-100 text-purple-800 text-xs px-2 py-0.5 rounded font-medium flex items-center gap-1">
                  <ShieldCheck size={12} /> SFace 128D Encrypted
                </span>
              )}
            </div>

            <h2 className="text-xl font-bold text-gray-900 mt-2">
              {isApproved
                ? 'Biometric Template Active & Approved'
                : isPending
                ? 'Biometric Enrollment Awaiting Review'
                : 'No Biometric Enrollment Active'}
            </h2>
            <p className="text-sm text-gray-600 mt-1 max-w-xl">
              {isApproved
                ? `Enrolled with SFace feature extractor. Approved by ${profile?.approved_by || 'Department Admin'}. Valid for high-security lecture and campus attendance punches.`
                : isPending
                ? 'Your face capture has been stored in encrypted format. Waiting for HOD or College Admin approval.'
                : 'Please register your face to enable 1-click biometric attendance during your scheduled lectures.'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {isApproved && (
            <button
              className="btn bg-purple-700 hover:bg-purple-800 text-white text-sm font-semibold py-2.5 px-4 rounded-lg shadow-sm flex items-center gap-2 w-full sm:w-auto justify-center"
              onClick={startLiveFaceTest}
              disabled={testBusy}
            >
              <Video size={16} />
              <span>Test Live Face Match</span>
            </button>
          )}

          {!isApproved && !isPending && (
            <button
              className="btn bg-purple-700 hover:bg-purple-800 text-white text-sm font-semibold py-2.5 px-4 rounded-lg shadow-sm flex items-center gap-2 w-full sm:w-auto justify-center"
              onClick={startEnrollment}
              disabled={enrollBusy}
            >
              <Camera size={16} />
              <span>Enroll Face Now</span>
            </button>
          )}

          {(isApproved || isPending) && (
            <button
              className="btn btn-secondary text-sm font-semibold py-2.5 px-4 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 flex items-center gap-2 w-full sm:w-auto justify-center"
              onClick={handleWithdrawConsent}
              disabled={loading}
              title="Deletes stored biometric embedding from database"
            >
              <Trash2 size={16} />
              <span>Withdraw Consent</span>
            </button>
          )}
        </div>
      </div>

      {/* Specifications & System Details */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase">
            <Fingerprint size={16} className="text-purple-600" />
            Recognition Model
          </div>
          <div className="text-base font-bold text-gray-900 mt-2">
            {profile?.algorithm || 'SFace 128D (FaceRecognizerSF)'}
          </div>
          <div className="text-xs text-gray-500 mt-1">OpenCV DNN Deep Feature Extractor</div>
        </div>

        <div className="card p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase">
            <ShieldCheck size={16} className="text-blue-600" />
            Liveness & Anti-Spoof
          </div>
          <div className="text-base font-bold text-gray-900 mt-2">
            {profile?.anti_spoofing || 'MiniFASNet Dual-Branch'}
          </div>
          <div className="text-xs text-gray-500 mt-1">Photo / Screen / Replay attack rejection</div>
        </div>

        <div className="card p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase">
            <Lock size={16} className="text-emerald-600" />
            Cryptographic Storage
          </div>
          <div className="text-base font-bold text-gray-900 mt-2">
            {profile?.encryption || 'Fernet AES-256 (PBKDF2)'}
          </div>
          <div className="text-xs text-gray-500 mt-1">Raw photos discarded after embedding</div>
        </div>

        <div className="card p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase">
            <UserCheck size={16} className="text-amber-600" />
            Cosine Threshold
          </div>
          <div className="text-base font-bold text-gray-900 mt-2">
            &gt;= {profile?.match_threshold ?? 0.363}
          </div>
          <div className="text-xs text-gray-500 mt-1">Configured in College Attendance Policy</div>
        </div>
      </div>

      {/* Verification Accuracy Statistics */}
      {profile && (
        <div className="card p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
              Verification Compliance Summary
            </h3>
            <span className="text-xs text-green-700 font-semibold bg-green-50 px-2 py-0.5 rounded border border-green-200">
              {profile.stats.accuracy_rate}% Match Success Rate
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="p-3 bg-gray-50 rounded">
              <span className="text-xs text-gray-500 font-medium">Total Punch Attempts</span>
              <div className="text-xl font-bold text-gray-900 mt-1">{profile.stats.total_attempts}</div>
            </div>
            <div className="p-3 bg-green-50 rounded">
              <span className="text-xs text-green-700 font-medium">Biometric Matches (Pass)</span>
              <div className="text-xl font-bold text-green-800 mt-1">{profile.stats.pass_count}</div>
            </div>
            <div className="p-3 bg-red-50 rounded">
              <span className="text-xs text-red-700 font-medium">Mismatch / Mismatched (Fail)</span>
              <div className="text-xl font-bold text-red-800 mt-1">{profile.stats.fail_count}</div>
            </div>
            <div className="p-3 bg-purple-50 rounded">
              <span className="text-xs text-purple-700 font-medium">Enrolled Since</span>
              <div className="text-xs font-bold text-purple-900 mt-2">
                {profile.enrolled_at ? profile.enrolled_at.slice(0, 10) : 'Not enrolled'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Verification History Table */}
      <div className="card bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-900">Biometric Verification Audit Trail</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Live audit logs from biometric_verification_logs table in database.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase">
              <tr>
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Verification Result</th>
                <th className="py-3 px-4">Similarity Score</th>
                <th className="py-3 px-4">Liveness Score</th>
                <th className="py-3 px-4">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!profile?.recent_verifications || profile.recent_verifications.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-500">
                    No biometric verification logs found in the database.
                  </td>
                </tr>
              ) : (
                profile.recent_verifications.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4 text-xs font-medium text-gray-900 whitespace-nowrap">
                      {log.created_at || '—'}
                    </td>
                    <td className="py-3 px-4 text-xs font-semibold text-gray-700 uppercase">
                      {log.action.replace('_', ' ')}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`badge text-xs px-2 py-0.5 rounded font-medium inline-flex items-center gap-1 ${
                          log.result === 'PASS'
                            ? 'bg-green-100 text-green-800'
                            : log.result === 'FAIL'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {log.result === 'PASS' ? <Check size={12} /> : <X size={12} />}
                        {log.result}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs font-semibold text-gray-800">
                      {log.similarity_score !== null ? log.similarity_score : '—'}
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-600">
                      {log.liveness_score !== null ? log.liveness_score : '—'}
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-500">
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
