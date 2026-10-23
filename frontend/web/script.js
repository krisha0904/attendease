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
const modeButtons = document.querySelectorAll('.mode-button');

const registerFacultyId = document.getElementById('registerFacultyId');
const registerName = document.getElementById('registerName');
const registerEmail = document.getElementById('registerEmail');
const registerPhone = document.getElementById('registerPhone');
const registerDepartment = document.getElementById('registerDepartment');

const API_BASE = 'http://localhost:8000';
let currentMode = 'email';
let otpRequestValue = '';
let otpSent = false;

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
  showMessage(`OTP sent successfully to ${value}. Demo code: ${data.otp}`);
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

setAuthMode('email');
showScreen('login');
