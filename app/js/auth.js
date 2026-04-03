/* ============================================================
   auth.js — Login & Register UI logic (wired to Firebase)
   LabGuy Application
   ============================================================ */

let _sessionRestored = false;

// ── Persistence + inactivity timeout ─────────────────────
// Uses Firebase LOCAL persistence so short breaks keep the user logged in.
// refreshes and closed tabs. An inactivity timer logs them out
// after INACTIVITY_MS of no mouse/keyboard/touch activity.

const IDLE_WARNING_MS  = 25 * 60 * 1000; // Show warning at 25 min
const IDLE_LOGOUT_MS   = 30 * 60 * 1000; // Log out at 30 min
const IDLE_COUNTDOWN_S = 5  * 60;        // 5 minute countdown

let _idleWarningTimer  = null;
let _idleLogoutTimer   = null;
let _idleCountdownInterval = null;

function _resetInactivityTimer() {
  // If warning is showing, don't reset on activity — user must click a button
  if (document.getElementById('idle-warning-overlay')) return;

  // Save last active time so we can check it on next startup
  try { localStorage.setItem('labguy_last_active', Date.now()); } catch(e) {}

  clearTimeout(_idleWarningTimer);
  clearTimeout(_idleLogoutTimer);

  _idleWarningTimer = setTimeout(_showIdleWarning, IDLE_WARNING_MS);
  _idleLogoutTimer  = setTimeout(() => {
    _dismissIdleWarning();
    showToast('Logged out due to inactivity.', 'info');
    doLogout();
  }, IDLE_LOGOUT_MS);
}

function _showIdleWarning() {
  if (document.getElementById('idle-warning-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'idle-warning-overlay';

  let remaining = IDLE_COUNTDOWN_S;

  function _fmt(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  overlay.innerHTML = `
    <div class="idle-modal">
      <div class="idle-icon"><i class="fas fa-clock"></i></div>
      <h3 class="idle-title">Are you still there?</h3>
      <p class="idle-msg">You will be automatically logged out in</p>
      <div class="idle-countdown" id="idle-countdown">${_fmt(remaining)}</div>
      <div class="idle-actions">
        <button class="idle-btn logout" onclick="idleLogout()">
          <i class="fas fa-sign-out-alt"></i> Log Out
        </button>
        <button class="idle-btn stay" onclick="idleStayLoggedIn()">
          <i class="fas fa-check"></i> I'm Still Here!
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));

  _idleCountdownInterval = setInterval(() => {
    remaining--;
    const el = document.getElementById('idle-countdown');
    if (el) el.textContent = _fmt(remaining);
    if (remaining <= 0) {
      clearInterval(_idleCountdownInterval);
    }
  }, 1000);
}

function _dismissIdleWarning() {
  clearInterval(_idleCountdownInterval);
  const overlay = document.getElementById('idle-warning-overlay');
  if (!overlay) return;
  overlay.classList.remove('show');
  setTimeout(() => overlay.remove(), 250);
}

window.idleStayLoggedIn = function() {
  _dismissIdleWarning();
  _resetInactivityTimer();
};

window.idleLogout = function() {
  _dismissIdleWarning();
  doLogout();
};

function _startInactivityWatch() {
  ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'].forEach(evt => {
    document.addEventListener(evt, _resetInactivityTimer, { passive: true });
  });
  _resetInactivityTimer();
}

function _stopInactivityWatch() {
  clearTimeout(_idleWarningTimer);
  clearTimeout(_idleLogoutTimer);
  clearInterval(_idleCountdownInterval);
  _dismissIdleWarning();
  ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'].forEach(evt => {
    document.removeEventListener(evt, _resetInactivityTimer);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  // Set Firebase to LOCAL persistence — we handle expiry manually on startup
  try {
    await window.fbAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  } catch(e) {
    // Fallback silently if browser blocks storage (e.g. Edge tracking prevention)
    console.warn('Persistence unavailable, using default:', e.message);
  }

  window.fbAuth.onAuthStateChanged(async (firebaseUser) => {
    if (firebaseUser) {
      if (_sessionRestored) return; // prevent double-init

      // Check if session has expired due to inactivity across browser close
      try {
        const lastActive = parseInt(localStorage.getItem('labguy_last_active') || '0');
        const elapsed    = Date.now() - lastActive;
        if (lastActive && elapsed > IDLE_LOGOUT_MS) {
          console.log('[LabGuy] Session expired after', Math.round(elapsed/60000), 'min — logging out');
          localStorage.removeItem('labguy_last_active');
          await window.fbAuth.signOut();
          showPage('login-page');
          showToast('Your session expired. Please log in again.', 'info');
          return;
        }
      } catch(e) {}

      _sessionRestored = true;
      try {
        const profile = await _resolveProfile(firebaseUser);
        App.currentUser = { uid: firebaseUser.uid, ...profile };

        // Boot updates role back to their page if they navigate here
        if (profile.role === 'updates') {
          window.location.replace('updates.html');
          return;
        }

        _populateProfilePanel();
        showPage('dashboard-page');
        Dashboard.init();
        SettingsPanel.loadTheme();
        if (window.Maintenance) Maintenance.startListening();
        NotifPanel.startListening();
        if (window.LabCapacity) LabCapacity.startListening();
        if (window.TrashCan) TrashCan.startListening();
        SettingsPanel.checkPendingRequest();
        _startInactivityWatch();
        _startPresence(firebaseUser.uid);
      } catch(e) {
        console.error('Session restore failed:', e);
        _sessionRestored = false;
        showPage('login-page');
      }
    } else {
      _sessionRestored = false;
      _stopInactivityWatch();
      Maintenance.stopListening();
      showPage('login-page');
    }
  });
});


// ── Login audit ───────────────────────────────────────────
const LOGIN_AUDIT_RETENTION_DAYS = 90;

async function _writeLoginAudit(uid, name, type = 'login') {
  try {
    const ua      = navigator.userAgent;
    const browser = _parseBrowser(ua);
    const os      = _parseOS(ua);
    await window.fbDB.ref('login_audit').push({
      uid,
      name,
      type,
      browser,
      os,
      timestamp: { '.sv': 'timestamp' },
    });
    // Purge entries older than 90 days on every login (fire and forget)
    _purgeOldLoginAudit();
  } catch(e) {
    console.warn('[LabGuy] Login audit write failed:', e);
  }
}

async function _purgeOldLoginAudit() {
  try {
    const cutoff = Date.now() - (LOGIN_AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const snap   = await window.fbDB.ref('login_audit')
      .orderByChild('timestamp')
      .endAt(cutoff)
      .once('value');
    if (!snap.exists()) return;
    const updates = {};
    snap.forEach(child => { updates[child.key] = null; });
    await window.fbDB.ref('login_audit').update(updates);
    console.log(`[LabGuy] Purged ${Object.keys(updates).length} old login audit entries.`);
  } catch(e) {
    console.warn('[LabGuy] Login audit purge failed:', e);
  }
}

function _parseBrowser(ua) {
  if (/Edg\//.test(ua))     return 'Edge';
  if (/OPR\//.test(ua))     return 'Opera';
  if (/Chrome\//.test(ua))  return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua))  return 'Safari';
  return 'Unknown';
}

function _parseOS(ua) {
  if (/Windows NT 10/.test(ua)) return 'Windows 10/11';
  if (/Windows NT/.test(ua))    return 'Windows';
  if (/Mac OS X/.test(ua))      return 'macOS';
  if (/Android/.test(ua))       return 'Android';
  if (/iPhone|iPad/.test(ua))   return 'iOS';
  if (/Linux/.test(ua))         return 'Linux';
  return 'Unknown';
}

// ── Login ─────────────────────────────────────────────────
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;

  if (!email || !pass) {
    showToast('Please enter your email and password.', 'error');
    return;
  }

  try {
    const cred    = await window.fbAuth.signInWithEmailAndPassword(email, pass);
    const profile = await _resolveProfile(cred.user);
    App.currentUser = { uid: cred.user.uid, ...profile };
    if (profile.role !== 'updates' && profile.role !== 'developer') _writeLoginAudit(cred.user.uid, profile.full_name, 'login');

    // Updates role gets redirected to the publisher page
    if (profile.role === 'updates') {
      window.location.href = 'updates.html';
      return;
    }

    _populateProfilePanel();
    showPage('dashboard-page');
    showToast(`Welcome back, ${profile.full_name?.split(' ')[0] || 'there'}!`, 'success');
    Dashboard.init();
    SettingsPanel.loadTheme();
    if (window.Maintenance) Maintenance.startListening();
    NotifPanel.startListening();
    if (window.LabCapacity) LabCapacity.startListening();
    if (window.TrashCan) TrashCan.startListening();
    SettingsPanel.checkPendingRequest();
    _startInactivityWatch();
    _startPresence(cred.user.uid);
  } catch (err) {
    showToast(_authErrorMessage(err.code), 'error');
    console.error('Login error:', err.code, err.message);
  }
}

// ── Presence ─────────────────────────────────────────────
function _startPresence(uid) {
  const presenceRef = window.fbDB.ref(`users/${uid}/presence`);
  const connRef     = window.fbDB.ref('.info/connected');

  connRef.on('value', snap => {
    if (!snap.val()) return;
    // On disconnect: mark offline + record lastSeen
    presenceRef.onDisconnect().set({
      online:   false,
      lastSeen: window.firebase?.database?.ServerValue?.TIMESTAMP ||
                { '.sv': 'timestamp' }
    });
    // Mark online now
    presenceRef.set({ online: true, lastSeen: { '.sv': 'timestamp' } });
  });
}

function _stopPresence(uid) {
  if (!uid) return;
  window.fbDB.ref('.info/connected').off();
  window.fbDB.ref(`users/${uid}/presence`).set({
    online:   false,
    lastSeen: { '.sv': 'timestamp' }
  });
}

// ── Register ──────────────────────────────────────────────
async function doRegister() {
  const firstName = document.getElementById('reg-first').value.trim();
  const lastName  = document.getElementById('reg-last').value.trim();
  const email     = document.getElementById('reg-email').value.trim();
  const pass      = document.getElementById('reg-pass').value;
  const agreed    = document.getElementById('terms-check').checked;

  if (!firstName || !lastName || !email || !pass) {
    showToast('Please fill in all fields.', 'error');
    return;
  }
  if (!agreed) {
    showToast('Please accept the Terms and Conditions.', 'warn');
    return;
  }

  try {
    // Check if registration code is required
    const reqSnap = await window.fbDB.ref('system/requireRegistrationCode').once('value');
    if (reqSnap.exists() && reqSnap.val() === true) {
      const enteredCode = document.getElementById('reg-code')?.value.trim();
      if (!enteredCode) {
        showToast('A lab access code is required to register.', 'error');
        return;
      }
      const codeSnap = await window.fbDB.ref('system/registrationCode').once('value');
      const realCode = codeSnap.exists() ? codeSnap.val() : '';
      if (enteredCode !== realCode) {
        showToast('Incorrect access code. Please check with your administrator.', 'error');
        return;
      }
    }

    const cred    = await window.fbAuth.createUserWithEmailAndPassword(email, pass);
    const uid     = cred.user.uid;
    const profile = { full_name: `${firstName} ${lastName}`.trim(), email, role: 'user' };
    await FirebaseDB.createProfile(uid, profile);
    App.currentUser = { uid, ...profile };
    _populateProfilePanel();
    showPage('dashboard-page');
    showToast(`Account created! Welcome, ${firstName}!`, 'success');
    _writeLoginAudit(uid, profile.full_name, 'register');
    Dashboard.init();
    setTimeout(() => Tutorial.checkAndShow(), 700);
  } catch (err) {
    showToast(_authErrorMessage(err.code), 'error');
    console.error('Register error:', err.code, err.message);
  }
}

// Show/hide access code field on register page based on system setting
async function _checkRegCodeRequired() {
  try {
    const snap  = await window.fbDB.ref('system/requireRegistrationCode').once('value');
    const show  = snap.exists() && snap.val() === true;
    const group = document.getElementById('reg-code-group');
    const input = document.getElementById('reg-code');
    if (group) group.style.display = show ? '' : 'none';
    if (input) input.value = '';
  } catch(e) {}
}

// ── Logout ────────────────────────────────────────────────
async function doLogout() {
  try { _stopInactivityWatch(); localStorage.removeItem('labguy_last_active'); } catch(e) {}
  try { Maintenance.stopListening(); } catch(e) {}
  try { NotifPanel.stopListening(); } catch(e) {}
  try { if (window.LabCapacity) LabCapacity.stopListening(); } catch(e) {}
  try { if (window.TrashCan) TrashCan.stopListening(); } catch(e) {}
  try { if (window.TrashCan) TrashCan.stopListening(); } catch(e) {}
  try { closeAllPanels(); } catch(e) {}
  try { _stopPresence(App.currentUser?.uid); } catch(e) {}
  try {
    await window.fbAuth.signOut();
    App.currentUser = null;
    _sessionRestored = false;
    setTimeout(() => {
      showPage('login-page');
      const emailEl = document.getElementById('login-email');
      const passEl  = document.getElementById('login-pass');
      if (emailEl) emailEl.value = '';
      if (passEl)  passEl.value  = '';
    }, 300);
  } catch (err) {
    console.error('Logout error:', err);
    showToast('Logout failed. Try again.', 'error');
  }
}

// ── Forgot password ───────────────────────────────────────
async function doForgotPassword() {
  const email = document.getElementById('login-email').value.trim();
  if (!email) {
    showToast('Enter your email above first.', 'warn');
    return;
  }
  try {
    await window.fbAuth.sendPasswordResetEmail(email);
    showToast(`Password reset sent to ${email}`, 'info');
  } catch (err) {
    showToast(_authErrorMessage(err.code), 'error');
  }
}

// ── Resolve profile — handles existing DB schema ──────────
// Reads profile from DB, never overwrites existing role
async function _resolveProfile(firebaseUser) {
  const snap = await window.fbDB.ref(`users/${firebaseUser.uid}`).once('value');

  if (!snap.exists()) {
    // Brand new account — no DB record yet, create minimal one
    const displayName = firebaseUser.displayName || '';
    const parts       = displayName.trim().split(' ');
    // Fall back to email prefix if no display name
    const emailPrefix = (firebaseUser.email || 'User').split('@')[0];
    const full_name   = displayName || emailPrefix;
    const newProfile  = { full_name, email: firebaseUser.email || '', role: 'user' };
    await window.fbDB.ref(`users/${firebaseUser.uid}`).set(newProfile);
    console.log('[LabGuy] Profile auto-created ✓');
    return { firstName: parts[0] || 'User', lastName: parts.slice(1).join(' ') || '', ...newProfile };
  }

  // Profile exists — read it exactly as-is, preserving role
  const raw       = snap.val();
  console.log('[LabGuy] Raw profile from DB:', raw);
  const full_name = raw.full_name || `${raw.firstName || ''} ${raw.lastName || ''}`.trim() || 'User';
  const parts     = full_name.split(' ');
  const firstName = parts[0] || 'User';
  const lastName  = parts.slice(1).join(' ') || '';

  return { ...raw, firstName, lastName, full_name };
}

// ── Populate profile panel with current user ──────────────
function _populateProfilePanel() {
  const u = App.currentUser;
  if (!u) return;

  const el       = id => document.getElementById(id);
  const first    = u.firstName || '';
  const last     = u.lastName  || '';
  const initials = ((first[0] || '') + (last[0] || '')).toUpperCase() || '?';

  if (el('profile-avatar'))   el('profile-avatar').textContent   = initials;
  if (el('profile-name'))     el('profile-name').textContent     = `${first} ${last}`.trim() || u.email;
  if (el('profile-email'))    el('profile-email').textContent    = u.email || '';
  if (el('profile-role'))     el('profile-role').textContent     = `Role: ${u.role || 'user'}`;
  if (el('notif-user-id'))    el('notif-user-id').textContent    = u.full_name || u.email || '—';
  if (el('notif-role-badge')) el('notif-role-badge').textContent = u.role === 'developer' ? 'Developer' : u.role === 'admin' ? 'Admin' : 'User';

  // Show admin nav button only to admins
  const adminBtn = document.getElementById('nav-admin-btn');
  console.log('[LabGuy] Current user role:', u.role, '| Full user object:', u);
  if (adminBtn) adminBtn.style.display = (u.role === 'admin' || u.role === 'developer') ? 'flex' : 'none';
}

// ── Friendly error messages ───────────────────────────────
function _authErrorMessage(code) {
  const map = {
    'auth/invalid-email':          'Invalid email address.',
    'auth/user-not-found':         'No account found with that email.',
    'auth/wrong-password':         'Incorrect password.',
    'auth/invalid-credential':     'Invalid email or password.',
    'auth/email-already-in-use':   'An account with this email already exists.',
    'auth/weak-password':          'Password must be at least 6 characters.',
    'auth/too-many-requests':      'Too many attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Check your connection.',
    'auth/operation-not-allowed':  'Email/password login is not enabled in Firebase Console.',
  };
  return map[code] || `An error occurred (${code})`;
}

// ── Expose to window ──────────────────────────────────────
window.doLogin          = doLogin;
window.doRegister            = doRegister;
window._checkRegCodeRequired = _checkRegCodeRequired;
window.doLogout         = doLogout;

// ── Terms & Conditions Modal ──────────────────────────────
function openTermsModal() {
  document.getElementById('tos-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'tos-overlay';
  overlay.innerHTML = `
    <div class="tos-modal">
      <div class="tos-header">
        <div class="tos-header-icon"><i class="fas fa-file-contract"></i></div>
        <div>
          <h3>Terms and Conditions</h3>
          <p>Please read carefully before accepting</p>
        </div>
      </div>

      <div class="tos-progress-wrap">
        <div class="tos-progress-label">
          <span>Reading progress</span>
          <span id="tos-pct">0%</span>
        </div>
        <div class="tos-progress-bar">
          <div class="tos-progress-fill" id="tos-fill"></div>
        </div>
      </div>

      <div class="tos-body" id="tos-body">
        <div class="tos-content">
          <h1>Terms and Conditions</h1>
          <p><b>Effective Date:</b> 8/20/2025</p>
          <p><b>Owner:</b> Martin Valadez</p>
          <p><b>Contributor:</b> Jared Keller</p>

          <h2>1. Ownership and Intellectual Property</h2>
          <p><b>1.1.</b> The Lab Guy software ("Software") is owned exclusively by Martin Valadez with contributions from Jared Keller.</p>
          <p><b>1.2.</b> All rights, title, and interest in and to the Software, including but not limited to source code, design, functionality, graphics, user interface, and documentation, remain the sole property of Martin Valadez.</p>
          <p><b>1.3.</b> Users are granted only a limited, non-exclusive, non-transferable right to use the Software in accordance with this Agreement.</p>

          <h2>2. License Grant and Restrictions</h2>
          <p><b>2.1.</b> The Software is licensed, not sold.</p>
          <p><b>2.2. Users may not:</b></p>
          <ul>
            <li><b>Modify, edit, alter, translate, or create derivative works</b> of the Software.</li>
            <li><b>Reverse-engineer, decompile, disassemble</b>, or otherwise attempt to discover the Software's source code.</li>
            <li><b>Copy, distribute, rent, lease, sublicense, or transfer</b> the Software without express written consent.</li>
            <li><b>Circumvent or disable security</b> or licensing features of the Software.</li>
          </ul>

          <h2>3. User Data</h2>
          <p><b>3.1.</b> Any data created by users within the Software remains the sole property of the user or their organization.</p>
          <p><b>3.2.</b> The Software owner (Martin Valadez) does not claim ownership of user data but may process such data solely for providing and maintaining the Software's functionality.</p>

          <h2>4. Maintenance and Updates</h2>
          <p><b>4.1.</b> Periodic updates, patches, or maintenance may be released to improve performance, security, or functionality.</p>
          <p><b>4.2.</b> The Owner reserves the right to modify or discontinue features of the Software at any time.</p>

          <h2>5. Security and Integrity</h2>
          <p><b>5.1.</b> Users must not attempt to tamper with, damage, or disrupt the integrity of the Software.</p>
          <p><b>5.2.</b> Any attempt to interfere with the Software's normal operation may result in <b>immediate termination</b> of access and potential legal action.</p>

          <h2>6. Warranty Disclaimer</h2>
          <p><b>6.1.</b> The Software is provided <b>"AS IS"</b> without warranties of any kind, express or implied.</p>
          <p><b>6.2.</b> The Owner makes no guarantees that the Software will be error-free, secure, or operate without interruption.</p>

          <h2>7. Limitation of Liability</h2>
          <p><b>7.1.</b> In no event shall the Owner, Contributor, or affiliates be liable for any damages arising out of or related to the use or inability to use the Software, including but not limited to <b>loss of data, loss of profits, or business interruption</b>.</p>
          <p><b>7.2.</b> Liability shall be limited to the maximum extent permitted by law.</p>

          <h2>8. Termination</h2>
          <p><b>8.1.</b> The Owner may suspend or terminate user access to the Software at any time for violation of these Terms.</p>
          <p><b>8.2.</b> Upon termination, users must immediately cease all use of the Software.</p>

          <h2>9. Governing Law</h2>
          <p>This Agreement shall be governed by and construed in accordance with the laws of the State of <b>Texas</b>, without regard to conflict of laws principles.</p>

          <h2>10. Amendments</h2>
          <p>The Owner reserves the right to amend these Terms and Conditions at any time. Continued use of the Software after changes constitutes acceptance of the revised Terms.</p>
        </div>
      </div>

      <div class="tos-footer">
        <div class="tos-scroll-hint" id="tos-hint">
          <i class="fas fa-arrow-down"></i>
          <span>Scroll to read all terms before accepting</span>
        </div>
        <div class="tos-footer-btns">
          <button class="tos-btn decline" onclick="closeTosModal()">
            <i class="fas fa-times"></i> Decline
          </button>
          <button class="tos-btn accept" id="tos-accept-btn" disabled
                  onclick="acceptTos()">
            <i class="fas fa-check"></i> Accept & Continue
          </button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));

  // Track scroll progress
  // Load TOS from file
  const tosContent = document.querySelector('.tos-content');
  fetch('terms_and_conditions.html')
    .then(r => r.text())
    .then(html => {
      // Extract just the body content from the file
      const parser = new DOMParser();
      const doc    = parser.parseFromString(html, 'text/html');
      tosContent.innerHTML = doc.body.innerHTML;
    })
    .catch(() => {
      // File not found — keep the hardcoded content as fallback
      console.warn('terms_and_conditions.html not found, using built-in content.');
    });

  const body    = document.getElementById('tos-body');
  const fill    = document.getElementById('tos-fill');
  const pct     = document.getElementById('tos-pct');
  const acceptBtn = document.getElementById('tos-accept-btn');
  const hint    = document.getElementById('tos-hint');

  body.addEventListener('scroll', () => {
    const scrolled = body.scrollTop;
    const total    = body.scrollHeight - body.clientHeight;
    const progress = total > 0 ? Math.min(100, Math.round((scrolled / total) * 100)) : 100;

    fill.style.width = progress + '%';
    pct.textContent  = progress + '%';

    if (progress >= 100) {
      acceptBtn.disabled    = false;
      hint.style.opacity    = '0';
    }
  });
}

function closeTosModal() {
  const overlay = document.getElementById('tos-overlay');
  if (!overlay) return;
  overlay.classList.remove('show');
  setTimeout(() => overlay.remove(), 250);
}

function acceptTos() {
  closeTosModal();
  const checkbox = document.getElementById('terms-check');
  if (checkbox) {
    checkbox.disabled = false;
    checkbox.checked  = true;
  }
  showToast('Terms accepted!', 'success');
}

window.openTermsModal = openTermsModal;
window.closeTosModal  = closeTosModal;
window.acceptTos      = acceptTos;
window.doForgotPassword = doForgotPassword;
