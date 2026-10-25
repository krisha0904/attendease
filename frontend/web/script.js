const screens = document.querySelectorAll('.screen');
const navButtons = document.querySelectorAll('.nav-item');
const loginButton = document.getElementById('loginButton');
const showRegisterButton = document.getElementById('showRegisterButton');
const backToLoginButton = document.getElementById('backToLogin');
const registerSubmitButton = document.getElementById('registerSubmit');
const identifierInput = document.getElementById('identifierInput');
const otpInput = document.getElementById('otpInput');
const otpBox = document.getElementById('otpBox');
const otpLabel = document.getElementById('otpLabel');
const messageBox = document.getElementById('messageBox');
const identifierLabel = document.getElementById('identifierLabel');
const countryFlag = document.getElementById('countryFlag');
const countryCode = document.getElementById('countryCode');
const loginTermsCheckbox = document.getElementById('loginTermsCheckbox');
const registerTermsCheckbox = document.getElementById('registerTermsCheckbox');
const modeButtons = document.querySelectorAll('.mode-button');

const registerFacultyId = document.getElementById('registerFacultyId');
const registerName = document.getElementById('registerName');
const registerEmail = document.getElementById('registerEmail');
const registerPhone = document.getElementById('registerPhone');
const registerDepartment = document.getElementById('registerDepartment');
const directoryList = document.getElementById('directoryList');
const hodStaffList = document.getElementById('hodStaffList');
const hodLeaveList = document.getElementById('hodLeaveList');
const leaveList = document.getElementById('leaveList');
const leaveType = document.getElementById('leaveType');
const leaveStartDate = document.getElementById('leaveStartDate');
const leaveEndDate = document.getElementById('leaveEndDate');
const leaveReason = document.getElementById('leaveReason');
const profileCard = document.getElementById('profileCard');
const dashboardUserName = document.getElementById('dashboardUserName');
const dashboardDateLine = document.getElementById('dashboardDateLine');
const applyLeaveButton = document.getElementById('applyLeaveButton');

const API_BASE = 'http://localhost:8000';
let currentMode = 'email';
let otpRequestValue = '';
let otpSent = false;

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem('attendease-user') || 'null');
  } catch (error) {
    return null;
  }
}

function updateDashboardGreeting() {
  const user = getCurrentUser();
  if (!dashboardUserName) return;
  const name = user?.name ? user.name.toUpperCase() : 'FACULTY';
  dashboardUserName.innerHTML = `Good Evening, <span style="color:#1f2c3d;">${name}</span> <span class="emoji">👋</span>`;
  if (dashboardDateLine) {
    const now = new Date();
    dashboardDateLine.textContent = now.toLocaleDateString('en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }
}

function restoreSession() {
  const user = getCurrentUser();
  if (!user || !user.userId) return false;

  updateDashboardGreeting();
  showScreen('dashboard');
  navButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.screen === 'dashboard');
  });
  loadDashboardSummary();
  fillProfileCard();
  return true;
}

async function loadDashboardSummary() {
  const user = getCurrentUser();
  if (!user || !user.userId) return;

  try {
    const response = await fetch(`${API_BASE}/attendance/summary/${user.userId}`);
    const data = await response.json().catch(() => null);
    if (!data) return;

    const timerText = document.querySelector('.timer-inner .time');
    const statusText = document.querySelector('.timer-inner .status');
    if (timerText) {
      timerText.textContent = data.punch_in ? data.punch_in : '00:00';
    }
    if (statusText) {
      statusText.textContent = data.status || 'Present';
    }
  } catch (error) {
    console.warn('Dashboard summary load failed:', error);
  }
}

async function loadDirectory() {
  try {
    const response = await fetch(`${API_BASE}/attendance/report`);
    const data = await response.json().catch(() => []);
    if (!directoryList) return;
    if (!Array.isArray(data) || data.length === 0) {
      directoryList.innerHTML = '<div class="empty-state">No faculty records found.</div>';
      return;
    }

    directoryList.innerHTML = data.slice(0, 10).map((entry) => `
      <div class="list-item">
        <div>
          <strong>${entry.user_name || 'Faculty Member'}</strong>
          <div class="small-meta">${entry.faculty_id || 'N/A'} • ${entry.status || 'Present'}</div>
        </div>
        <span class="status-pill">${entry.status || 'Present'}</span>
      </div>
    `).join('');
  } catch (error) {
    if (directoryList) {
      directoryList.innerHTML = '<div class="empty-state">Unable to load directory.</div>';
    }
  }
}

async function loadHodDashboard() {
  try {
    const response = await fetch(`${API_BASE}/hod/dashboard-summary`);
    const data = await response.json().catch(() => null);
    if (!data) {
      if (hodStaffList) hodStaffList.innerHTML = '<div class="empty-state">Unable to fetch department summary.</div>';
      return;
    }

    const present = Number(data.present || 0);
    const breakCount = Number(data.on_break || 0);
    const absent = Number(data.absent || 0);

    const presentEl = document.getElementById('hodPresentCount');
    const breakEl = document.getElementById('hodBreakCount');
    const absentEl = document.getElementById('hodAbsentCount');

    if (presentEl) presentEl.textContent = present;
    if (breakEl) breakEl.textContent = breakCount;
    if (absentEl) absentEl.textContent = absent;

    if (!hodStaffList) return;

    const staff = Array.isArray(data.staff_list) ? data.staff_list : [];
    hodStaffList.innerHTML = staff.length
      ? staff.map((person) => {
          const status = (person.status || 'WORKING').toUpperCase();
          const statusClass = status.includes('BREAK') ? 'break' : status.includes('ABSENT') ? 'absent' : 'working';
          return `
            <div class="hod-person-row">
              <div>
                <div class="hod-person-name">${person.name || 'Faculty Member'}</div>
                <div class="hod-person-time">${person.time || '--'}</div>
              </div>
              <span class="hod-status-badge ${statusClass}">${status}</span>
            </div>
          `;
        }).join('')
      : '<div class="empty-state">No attendance data available yet.</div>';

    await loadHodLeaveRequests();
  } catch (error) {
    if (hodStaffList) hodStaffList.innerHTML = '<div class="empty-state">Department summary unavailable.</div>';
  }
}

async function loadHodLeaveRequests() {
  try {
    const response = await fetch(`${API_BASE}/hod/leave-requests`);
    const data = await response.json().catch(() => []);
    if (!hodLeaveList) return;

    if (!Array.isArray(data) || data.length === 0) {
      hodLeaveList.innerHTML = '<div class="empty-state">No leave requests pending.</div>';
      return;
    }

    hodLeaveList.innerHTML = data.map((item) => `
      <div class="hod-person-row" style="align-items:flex-start;">
        <div>
          <div class="hod-person-name">${item.name || 'Faculty Member'}</div>
          <div class="hod-person-time">${item.faculty_id || 'N/A'} • ${item.leave_type || 'Leave'} • ${item.start_date ? new Date(item.start_date).toLocaleDateString() : '--'}</div>
          <div class="small-meta" style="margin-top:6px;">${item.reason || 'No reason provided'}</div>
        </div>
        <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
          <span class="hod-status-badge ${item.status === 'Approved' ? 'working' : item.status === 'Rejected' ? 'absent' : 'break'}">${(item.status || 'Pending').toUpperCase()}</span>
          <div style="display:flex; gap:6px;">
            <button type="button" class="small-action" data-leave-action="Approved" data-leave-id="${item.id}">Approve</button>
            <button type="button" class="small-action secondary" data-leave-action="Rejected" data-leave-id="${item.id}">Reject</button>
          </div>
        </div>
      </div>
    `).join('');

    document.querySelectorAll('[data-leave-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        const leaveId = button.dataset.leaveId;
        const status = button.dataset.leaveAction;
        await handleLeaveDecision(Number(leaveId), status);
      });
    });
  } catch (error) {
    if (hodLeaveList) hodLeaveList.innerHTML = '<div class="empty-state">Unable to load leave review queue.</div>';
  }
}

async function handleLeaveDecision(leaveId, status) {
  try {
    const response = await fetch(`${API_BASE}/leave/${leaveId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || data.message || 'Unable to update leave status');
    }
    showMessage(`Leave request marked as ${status}.`);
    await loadHodLeaveRequests();
    await loadLeaveStatus();
  } catch (error) {
    showMessage(error.message || 'Leave update failed', true);
  }
}

async function loadLeaveStatus() {
  const user = getCurrentUser();
  if (!leaveList || !user) return;

  try {
    const response = await fetch(`${API_BASE}/leave/status/${user.userId}`);
    const data = await response.json().catch(() => []);
    if (!Array.isArray(data) || data.length === 0) {
      leaveList.innerHTML = '<div class="empty-state">No leave requests yet.</div>';
      return;
    }

    leaveList.innerHTML = data.map((item) => `
      <div class="list-item">
        <div>
          <strong>${item.leave_type || 'Leave'}</strong>
          <div class="small-meta">${item.reason || 'No reason provided'}</div>
        </div>
        <span class="status-pill status-${(item.status || 'Pending').toLowerCase()}">${item.status || 'Pending'}</span>
      </div>
    `).join('');
  } catch (error) {
    leaveList.innerHTML = '<div class="empty-state">Unable to load leave requests.</div>';
  }
}

async function fillProfileCard() {
  const user = getCurrentUser();
  if (!profileCard) return;

  if (!user || !user.userId) {
    profileCard.innerHTML = '<div class="empty-state">No profile available.</div>';
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/users/${user.userId}`);
    const profile = await response.json().catch(() => null);
    if (!profile) throw new Error('Profile not found');

    profileCard.innerHTML = `
      <div class="profile-avatar">${(profile.name || 'F').charAt(0).toUpperCase()}</div>
      <h3>${profile.name || 'Faculty User'}</h3>
      <div class="small-meta">Faculty ID: ${profile.faculty_id || 'N/A'}</div>
      <div class="small-meta">Email: ${profile.email || 'N/A'}</div>
      <div class="small-meta">Phone: ${profile.phone || 'N/A'}</div>
      <div class="small-meta">Role: ${profile.role || 'teacher'}</div>
    `;
  } catch (error) {
    profileCard.innerHTML = `
      <div class="profile-avatar">${(user.name || 'F').charAt(0).toUpperCase()}</div>
      <h3>${user.name || 'Faculty User'}</h3>
      <div class="small-meta">User ID: ${user.userId || 'N/A'}</div>
      <div class="small-meta">Email: ${user.email || 'N/A'}</div>
      <div class="small-meta">Phone: ${user.phone || 'N/A'}</div>
    `;
  }
}

async function applyLeave() {
  const user = getCurrentUser();
  if (!user) {
    showMessage('Please log in before applying for leave.', true);
    return;
  }

  const startDate = leaveStartDate.value;
  const endDate = leaveEndDate.value;
  const reason = leaveReason.value.trim();
  const type = leaveType.value;

  if (!startDate || !endDate || !reason) {
    showMessage('Please complete the leave form.', true);
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/leave/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: user.userId,
        start_date: new Date(startDate).toISOString(),
        end_date: new Date(endDate).toISOString(),
        reason,
        leave_type: type,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || data.message || 'Leave application failed');
    }

    showMessage('Leave request submitted successfully.');
    leaveReason.value = '';
    leaveStartDate.value = '';
    leaveEndDate.value = '';
    await loadLeaveStatus();
  } catch (error) {
    showMessage(error.message || 'Leave application failed', true);
  }
}

function showScreen(target) {
  screens.forEach((screen) => {
    screen.classList.toggle('active', screen.dataset.screen === target);
  });
}

function showMessage(text, isError = false) {
  if (!messageBox) return;
  messageBox.style.display = 'block';
  messageBox.textContent = text;
  messageBox.style.color = isError ? '#b91c1c' : '#0f766e';
  messageBox.style.background = isError ? '#fef2f2' : '#ecfeff';
  messageBox.style.borderColor = isError ? '#fecaca' : '#a5f3fc';
}

function ensureTermsAccepted() {
  if (!loginTermsCheckbox || !loginTermsCheckbox.checked) {
    showMessage('Please accept the Terms & Conditions before continuing.', true);
    return false;
  }
  return true;
}

function ensureRegisterTermsAccepted() {
  if (!registerTermsCheckbox || !registerTermsCheckbox.checked) {
    showMessage('Please accept the Terms & Conditions to create your account.', true);
    return false;
  }
  return true;
}

function setAuthMode(mode) {
  currentMode = mode;
  const emailMode = mode === 'email';
  identifierLabel.textContent = emailMode ? 'Email Address' : 'Mobile Number';
  identifierInput.placeholder = emailMode ? 'Enter your email address' : 'Enter mobile number';
  countryFlag.textContent = emailMode ? '✉️' : '🇮🇳';
  countryCode.textContent = emailMode ? '@' : '+91';
  identifierInput.type = emailMode ? 'text' : 'tel';
  identifierInput.value = '';
  otpInput.value = '';
  otpBox.style.display = 'none';
  otpLabel.style.display = 'none';
  loginButton.textContent = 'Send OTP';
  otpRequestValue = '';
  otpSent = false;

  modeButtons.forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('active', active);
    button.style.background = active ? '#eaf5ff' : '#f5f7fa';
    button.style.color = active ? '#1b4f8a' : '#475569';
  });
}

async function checkUserExists(value) {
  const response = await fetch(`${API_BASE}/check-user/${encodeURIComponent(value)}`);
  const data = await response.json().catch(() => ({ exists: false }));
  return Boolean(data.exists);
}

async function sendOtp(value, methodOverride = currentMode) {
  const method = methodOverride === 'email' ? 'email' : 'sms';
  otpRequestValue = value;

  const response = await fetch(`${API_BASE}/send-otp/${encodeURIComponent(value)}?method=${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || data.message || 'Unable to send OTP');
  }

  otpBox.style.display = 'flex';
  otpLabel.style.display = 'block';
  otpSent = true;
  loginButton.textContent = 'Verify OTP';
  showMessage('OTP sent successfully. Please check your inbox or phone for the verification code.');
}

async function verifyOtp() {
  const otp = otpInput.value.trim();
  const value = otpRequestValue || identifierInput.value.trim();

  if (!value || !otp) {
    showMessage('Please enter the OTP.', true);
    return;
  }

  const payload = {
    otp,
    ...(currentMode === 'email' ? { email: value } : { phone: value }),
  };

  try {
    const response = await fetch(`${API_BASE}/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || data.message || 'OTP verification failed');
    }

    localStorage.setItem('attendease-user', JSON.stringify({
      userId: data.user_id,
      name: data.name,
      email: currentMode === 'email' ? value : '',
      phone: currentMode === 'sms' ? value : '',
      needsFaceSetup: data.needs_face_setup,
    }));

    showScreen('dashboard');
    navButtons.forEach((item) => item.classList.toggle('active', item.dataset.screen === 'dashboard'));
    showMessage('Login successful. Welcome back!');
    loginButton.textContent = 'Send OTP';
    otpSent = false;
  } catch (error) {
    showMessage(error.message || 'Verification failed', true);
  }
}

async function handleLoginClick() {
  const value = identifierInput.value.trim();
  if (!value) {
    showMessage('Please enter your email or phone number.', true);
    return;
  }

  if (!ensureTermsAccepted()) {
    return;
  }

  if (otpSent) {
    await verifyOtp();
    return;
  }

  try {
    const exists = await checkUserExists(value);
    if (!exists) {
      showMessage('Account not found. Please register first.', true);
      showScreen('register');
      if (currentMode === 'email') {
        registerEmail.value = value;
      } else {
        registerPhone.value = value;
      }
      return;
    }

    await sendOtp(value, currentMode);
  } catch (error) {
    showMessage(error.message || 'Unable to process login.', true);
  }
}

async function handlePunchOut() {
  const user = getCurrentUser();
  if (!user || !user.userId) {
    showMessage('Please log in first before punching out.', true);
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/attendance/punch-out`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.userId })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || data.message || 'Punch out failed');
    showMessage(data.message || 'Punched out successfully.');
    showScreen('success');
    await loadDashboardSummary();
  } catch (error) {
    showMessage(error.message || 'Punch out failed', true);
  }
}

async function handleBreakToggle() {
  const user = getCurrentUser();
  if (!user || !user.userId) {
    showMessage('Please log in to toggle break.', true);
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/attendance/break?user_id=${user.userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || data.message || 'Break update failed');
    showMessage(data.message || 'Break updated.');
  } catch (error) {
    showMessage(error.message || 'Break update failed', true);
  }
}

async function handleRegister() {
  const facultyId = registerFacultyId.value.trim();
  const name = registerName.value.trim();
  const email = registerEmail.value.trim();
  const phone = registerPhone.value.trim();
  const departmentId = Number(registerDepartment.value || 1);

  if (!facultyId || !name || !email || !phone) {
    showMessage('Please fill in all registration details.', true);
    return;
  }

  if (!ensureRegisterTermsAccepted()) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        faculty_id: facultyId,
        name,
        email,
        phone,
        role: 'teacher',
        department_id: departmentId,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || data.message || 'Registration failed');
    }

    showMessage('Account created. Sending OTP for verification...');
    showScreen('login');
    setAuthMode(currentMode);
    identifierInput.value = currentMode === 'email' ? email : phone;
    await sendOtp(currentMode === 'email' ? email : phone, currentMode);
  } catch (error) {
    showMessage(error.message || 'Registration failed', true);
  }
}

navButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const target = button.dataset.screen;
    navButtons.forEach((item) => item.classList.toggle('active', item === button));
    showScreen(target);

    if (target === 'directory') {
      loadDirectory();
    }
    if (target === 'hod') {
      loadHodDashboard();
    }
    if (target === 'task') {
      loadLeaveStatus();
    }
    if (target === 'profile') {
      fillProfileCard();
    }
    if (target === 'dashboard') {
      updateDashboardGreeting();
    }
  });
});

document.querySelectorAll('[data-back]').forEach((button) => {
  button.addEventListener('click', () => {
    const target = button.dataset.back;
    navButtons.forEach((item) => item.classList.toggle('active', item.dataset.screen === target));
    showScreen(target);
    if (target === 'dashboard') {
      updateDashboardGreeting();
    }
  });
});

modeButtons.forEach((button) => {
  button.addEventListener('click', () => setAuthMode(button.dataset.mode));
});

loginButton?.addEventListener('click', handleLoginClick);
showRegisterButton?.addEventListener('click', () => {
  showMessage('');
  showScreen('register');
});
backToLoginButton?.addEventListener('click', () => {
  showScreen('login');
  showMessage('');
});
registerSubmitButton?.addEventListener('click', handleRegister);
applyLeaveButton?.addEventListener('click', applyLeave);
document.getElementById('punchOutButton')?.addEventListener('click', handlePunchOut);
document.getElementById('breakInButton')?.addEventListener('click', handleBreakToggle);

setAuthMode('email');
if (!restoreSession()) {
  showScreen('login');
  updateDashboardGreeting();
}
loadDashboardSummary();
loadHodDashboard();
