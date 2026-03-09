/* ============================================================
   panels/settings.js — Settings panel logic
   LabGuy Application
   ============================================================ */

const SettingsPanel = (() => {

  // ── Theme ─────────────────────────────────────────────
  function applyTheme(isLight) {
    document.body.classList.toggle('light-mode', isLight);
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) btn.classList.toggle('active', isLight);
  }

  async function loadTheme() {
    const uid = window.fbAuth?.currentUser?.uid;
    if (!uid) return;
    const snap = await window.fbDB.ref(`users/${uid}/settings/theme`).once('value');
    const isLight = snap.exists() ? snap.val() === 'light' : false;
    applyTheme(isLight);
  }

  async function toggleTheme() {
    const isLight = !document.body.classList.contains('light-mode');
    applyTheme(isLight);
    const uid = window.fbAuth?.currentUser?.uid;
    if (uid) {
      await window.fbDB.ref(`users/${uid}/settings/theme`).set(isLight ? 'light' : 'dark');
    }
  }

  async function requestAdminAccess() {
    const user = App.currentUser;
    if (!user) return;

    // Don't allow if already admin or developer
    if (user.role === 'admin' || user.role === 'developer') {
      showToast('You already have elevated access.', 'info');
      return;
    }

    // Check if request already pending via profile flag
    const existing = await window.fbDB.ref(`users/${user.uid}/pendingAdminRequest`).once('value');
    if (existing.exists() && existing.val() === true) {
      showToast('You already have a pending request.', 'warn');
      return;
    }

    try {
      await window.fbDB.ref('adminRequests').push({
        uid:       user.uid,
        name:      user.full_name,
        email:     user.email,
        timestamp: Date.now(),
      });
      // Set flag on user profile so we can check it without querying adminRequests
      await window.fbDB.ref(`users/${user.uid}/pendingAdminRequest`).set(true);
      showToast('Your request has been submitted. An administrator will review it shortly.', 'success');

      // Disable button to prevent duplicate requests
      const btn = document.getElementById('admin-request-btn');
      if (btn) {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.innerHTML = '<i class="fas fa-clock"></i> Request Pending...';
      }
    } catch (err) {
      console.error('Request failed:', err);
      showToast('Failed to submit request. Try again.', 'error');
    }
  }

  // Check on panel open if request is already pending
  async function checkPendingRequest() {
    const user = App.currentUser;
    if (!user) return;

    const block = document.getElementById('admin-request-block');
    const btn   = document.getElementById('admin-request-btn');

    // Always reset first
    if (block) block.style.display = '';
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.innerHTML = '<i class="fas fa-user-shield"></i> Request Admin Access';
    }

    if (user.role === 'admin' || user.role === 'developer') {
      if (block) block.style.display = 'none';
      return;
    }

    // Check if already pending via user's own profile flag
    const snap = await window.fbDB.ref(`users/${user.uid}/pendingAdminRequest`).once('value');
    if (snap.exists() && snap.val() === true && btn) {
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.innerHTML = '<i class="fas fa-clock"></i> Request Pending...';
    }
  }


  // ── Load version from Firebase ────────────────────────
  async function loadVersion() {
    const snap = await window.fbDB.ref('system/version').once('value');
    const el   = document.getElementById('settings-version');
    if (!el) return;
    if (snap.exists()) {
      const val = snap.val();
      const display = Number.isInteger(val) ? `v${val}.0` : `v${val}`;
      el.textContent = display;
    } else {
      el.textContent = 'v—';
    }
  }

  // ── Clear dashboard layout ─────────────────────────────
  async function clearDashboard() {
    const uid = window.fbAuth?.currentUser?.uid;
    if (!uid) return;

    const confirmed = await _confirmClear();
    if (!confirmed) return;

    try {
      await window.fbDB.ref(`dashboards/${uid}/widgets`).remove();
      showToast('Dashboard layout cleared. Refresh to reset.', 'success');
      // Reload page so grid resets cleanly
      setTimeout(() => location.reload(), 1200);
    } catch (err) {
      showToast('Failed to clear layout.', 'error');
    }
  }

  function _confirmClear() {
    return new Promise(resolve => {
      document.getElementById('settings-confirm-overlay')?.remove();
      const overlay = document.createElement('div');
      overlay.id = 'settings-confirm-overlay';
      overlay.innerHTML = `
        <div class="inv-confirm-modal">
          <div class="inv-confirm-icon">
            <i class="fas fa-th-large"></i>
          </div>
          <h3 class="inv-confirm-title">Clear Dashboard Layout?</h3>
          <p class="inv-confirm-msg">All widgets will be removed and the dashboard will reset to empty. This cannot be undone.</p>
          <div class="inv-confirm-btns">
            <button class="as-btn cancel"
                    onclick="document.getElementById('settings-confirm-overlay').remove(); window._settingsConfirmResolve(false)">
              Cancel
            </button>
            <button class="as-btn primary"
                    onclick="document.getElementById('settings-confirm-overlay').remove(); window._settingsConfirmResolve(true)">
              <i class="fas fa-check"></i> Clear It
            </button>
          </div>
        </div>`;
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:9999;';
      window._settingsConfirmResolve = resolve;
      document.body.appendChild(overlay);
      overlay.addEventListener('click', e => {
        if (e.target === overlay) { overlay.remove(); resolve(false); }
      });
    });
  }

  return { toggleTheme, loadTheme, applyTheme, requestAdminAccess, checkPendingRequest, loadVersion, clearDashboard };
})();

window.SettingsPanel = SettingsPanel;
