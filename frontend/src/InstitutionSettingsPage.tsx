import React, { useEffect, useState } from 'react'
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock,
  Compass,
  Fingerprint,
  RefreshCw,
  Save,
  ShieldCheck,
} from 'lucide-react'
import { AdminPageScaffold } from './AdminComponents'
import { api, errorMessage } from './api'

export function InstitutionSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Form State
  const [collegeName, setCollegeName] = useState('')
  const [collegeCode, setCollegeCode] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [timezone, setTimezone] = useState('Asia/Kolkata')

  // Location Geofencing
  const [latitude, setLatitude] = useState(23.0225)
  const [longitude, setLongitude] = useState(72.5714)
  const [geofenceRadius, setGeofenceRadius] = useState(100)
  const [minGpsAccuracy, setMinGpsAccuracy] = useState(50)

  // Attendance & Biometric Policies
  const [requireFaceIn, setRequireFaceIn] = useState(true)
  const [requireFaceOut, setRequireFaceOut] = useState(true)
  const [requireGpsIn, setRequireGpsIn] = useState(true)
  const [requireGpsOut, setRequireGpsOut] = useState(true)
  const [faceMatchThreshold, setFaceMatchThreshold] = useState(0.363)
  const [punchInWindow, setPunchInWindow] = useState(15)
  const [punchOutWindow, setPunchOutWindow] = useState(15)
  const [maxOtpAttempts, setMaxOtpAttempts] = useState(3)
  const [otpValidityMinutes, setOtpValidityMinutes] = useState(5)

  const loadSettings = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get('/admin/settings/institution')
      const { college, location, policy } = res.data

      setCollegeName(college.name || '')
      setCollegeCode(college.code || '')
      setAddress(college.address || '')
      setPhone(college.phone || '')
      setEmail(college.email || '')
      setWebsite(college.website || '')
      setTimezone(college.timezone || 'Asia/Kolkata')

      if (location) {
        setLatitude(location.latitude ?? 23.0225)
        setLongitude(location.longitude ?? 72.5714)
        setGeofenceRadius(location.geofence_radius ?? 100)
        setMinGpsAccuracy(location.min_gps_accuracy ?? 50)
      }

      if (policy) {
        setRequireFaceIn(policy.require_face_for_punch_in ?? true)
        setRequireFaceOut(policy.require_face_for_punch_out ?? true)
        setRequireGpsIn(policy.require_gps_for_punch_in ?? true)
        setRequireGpsOut(policy.require_gps_for_punch_out ?? true)
        setFaceMatchThreshold(policy.face_match_threshold ?? 0.363)
        setPunchInWindow(policy.lecture_punch_in_window_minutes ?? 15)
        setPunchOutWindow(policy.lecture_punch_out_window_minutes ?? 15)
        setMaxOtpAttempts(policy.max_otp_attempts ?? 3)
        setOtpValidityMinutes(policy.otp_validity_minutes ?? 5)
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSettings()
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccessMsg(null)

    try {
      await api.put('/admin/settings/institution', {
        name: collegeName,
        address,
        phone,
        email,
        website,
        timezone,
        latitude,
        longitude,
        geofence_radius: geofenceRadius,
        min_gps_accuracy: minGpsAccuracy,
        require_face_for_punch_in: requireFaceIn,
        require_face_for_punch_out: requireFaceOut,
        require_gps_for_punch_in: requireGpsIn,
        require_gps_for_punch_out: requireGpsOut,
        face_match_threshold: faceMatchThreshold,
        lecture_punch_in_window_minutes: punchInWindow,
        lecture_punch_out_window_minutes: punchOutWindow,
        max_otp_attempts: maxOtpAttempts,
        otp_validity_minutes: otpValidityMinutes,
      })
      setSuccessMsg('Institution settings, GPS coordinates, and biometric rules updated successfully!')
      setTimeout(() => setSuccessMsg(null), 4000)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminPageScaffold
      title="Institution Settings"
      eyebrow="CAMPUS PROFILE & POLICIES"
      description="Configure institutional branding, geofence radius coordinates, punch-in validation windows, and biometric matching thresholds."
      actions={
        <div className="admin-actions-row">
          <button className="button button-secondary" onClick={loadSettings} disabled={loading || saving}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Reload
          </button>
          <button className="button button-primary" onClick={handleSave} disabled={loading || saving}>
            <Save size={15} /> {saving ? 'Saving Changes...' : 'Save Changes'}
          </button>
        </div>
      }
      stats={[
        { label: 'Campus Timezone', value: timezone, note: 'IANA Standard', icon: Clock },
        { label: 'Geofence Radius', value: `${geofenceRadius} Metres`, note: 'Haversine GPS Formula', icon: Building2 },
        { label: 'Face Match Threshold', value: `${faceMatchThreshold} (SFace)`, note: 'Strict Cosine Metric', icon: Fingerprint },
        { label: 'GPS Precision Gate', value: `±${minGpsAccuracy}m Accuracy`, note: 'Mobile Sensor Baseline', icon: Compass },
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

      <form onSubmit={handleSave} className="space-y-6">
        {/* Campus Profile & Branding */}
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h3>Campus Profile & Branding</h3>
              <p className="muted">Official institutional identity used in PDF records, notifications, and portal headers.</p>
            </div>
          </div>
          <div className="form-grid">
            <label>
              College / Institution Name *
              <input
                type="text"
                value={collegeName}
                onChange={(e) => setCollegeName(e.target.value)}
                required
              />
            </label>
            <label>
              Institution Code (Immutable)
              <input type="text" value={collegeCode} disabled className="bg-gray-100 cursor-not-allowed" />
            </label>
            <label>
              Official Contact Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Campus Phone / Helpline
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            <label>
              Institutional Website URL
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://apex.edu"
              />
            </label>
            <label>
              System Timezone
              <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                <option value="Asia/Kolkata">Asia/Kolkata (IST +05:30)</option>
                <option value="UTC">UTC (Universal Coordinated)</option>
                <option value="Asia/Dubai">Asia/Dubai (GST +04:00)</option>
                <option value="America/New_York">America/New_York (EST)</option>
                <option value="Europe/London">Europe/London (GMT)</option>
              </select>
            </label>
            <label className="col-span-2">
              Campus Address
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={2}
                placeholder="Street address, city, state, postal code"
              />
            </label>
          </div>
        </div>

        {/* GPS Geofence & Location Perimeter */}
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h3>Attendance & GPS Geofence Perimeter</h3>
              <p className="muted">Define the institutional centroid coordinate and acceptable punch-in perimeter.</p>
            </div>
          </div>
          <div className="form-grid">
            <label>
              Campus Centroid Latitude
              <input
                type="number"
                step="0.000001"
                value={latitude}
                onChange={(e) => setLatitude(parseFloat(e.target.value) || 0)}
                required
              />
            </label>
            <label>
              Campus Centroid Longitude
              <input
                type="number"
                step="0.000001"
                value={longitude}
                onChange={(e) => setLongitude(parseFloat(e.target.value) || 0)}
                required
              />
            </label>
            <label>
              Geofence Radius (meters)
              <input
                type="number"
                min="10"
                max="5000"
                value={geofenceRadius}
                onChange={(e) => setGeofenceRadius(parseFloat(e.target.value) || 100)}
                required
              />
            </label>
            <label>
              Minimum Device GPS Accuracy (meters)
              <input
                type="number"
                min="5"
                max="500"
                value={minGpsAccuracy}
                onChange={(e) => setMinGpsAccuracy(parseFloat(e.target.value) || 50)}
                required
              />
            </label>
          </div>
        </div>

        {/* Biometrics & Lecture Punch Windows */}
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h3>Biometric Verification & Punch-in Policies</h3>
              <p className="muted">Control AI face-anti-spoofing thresholds, OTP fallback rules, and lecture schedule buffer windows.</p>
            </div>
          </div>
          <div className="form-grid">
            <label>
              SFace Cosine Match Threshold
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.001"
                  min="0.2"
                  max="0.8"
                  value={faceMatchThreshold}
                  onChange={(e) => setFaceMatchThreshold(parseFloat(e.target.value) || 0.363)}
                  required
                />
                <span className="text-xs text-muted">0.363 recommended</span>
              </div>
            </label>
            <label>
              Lecture Punch-In Window (mins before scheduled start)
              <input
                type="number"
                min="5"
                max="60"
                value={punchInWindow}
                onChange={(e) => setPunchInWindow(parseInt(e.target.value) || 15)}
                required
              />
            </label>
            <label>
              Lecture Punch-Out Window (mins after scheduled end)
              <input
                type="number"
                min="5"
                max="60"
                value={punchOutWindow}
                onChange={(e) => setPunchOutWindow(parseInt(e.target.value) || 15)}
                required
              />
            </label>
            <label>
              Max OTP Verification Attempts
              <input
                type="number"
                min="1"
                max="10"
                value={maxOtpAttempts}
                onChange={(e) => setMaxOtpAttempts(parseInt(e.target.value) || 3)}
                required
              />
            </label>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={requireFaceIn}
                onChange={(e) => setRequireFaceIn(e.target.checked)}
              />
              <div>
                <strong>Enforce Face Recognition for Punch-In</strong>
                <p className="text-xs text-muted">Requires 128-d SFace cosine distance validation on check-in.</p>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={requireFaceOut}
                onChange={(e) => setRequireFaceOut(e.target.checked)}
              />
              <div>
                <strong>Enforce Face Recognition for Punch-Out</strong>
                <p className="text-xs text-muted">Prevents buddy punching during evening lecture departures.</p>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={requireGpsIn}
                onChange={(e) => setRequireGpsIn(e.target.checked)}
              />
              <div>
                <strong>Enforce GPS Geofence for Punch-In</strong>
                <p className="text-xs text-muted">Verifies coordinate is inside the {geofenceRadius}m campus boundary.</p>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={requireGpsOut}
                onChange={(e) => setRequireGpsOut(e.target.checked)}
              />
              <div>
                <strong>Enforce GPS Geofence for Punch-Out</strong>
                <p className="text-xs text-muted">Ensures faculty remain on campus premises during checkout.</p>
              </div>
            </label>
          </div>
        </div>

        <div className="admin-actions-row justify-end">
          <button type="submit" className="button button-primary" disabled={saving}>
            <ShieldCheck size={16} /> {saving ? 'Applying Policies...' : 'Save & Enforce Policies'}
          </button>
        </div>
      </form>
    </AdminPageScaffold>
  )
}
