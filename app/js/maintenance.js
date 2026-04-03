/* ============================================================
   maintenance.js — Real-time maintenance mode listener
   LabGuy Application
   ============================================================ */

const Maintenance = (() => {

  const SYS_PATH = 'system';
  let _active = false;

  // ── Start listening ───────────────────────────────────
  function startListening() {
    window.fbDB.ref(SYS_PATH).on('value', snap => {
      const val    = snap.exists() ? snap.val() : null;
      const isDown = val?.maintenance === true;
      const est    = val?.estimate || null;

      if (isDown === _active) return;
      _active = isDown;

      const role = App.currentUser?.role;

      if (isDown) {
        if (role === 'developer') _showDevBanner(est);
        else _showMaintenanceScreen(est);
      } else {
        _hideMaintenanceScreen();
        _hideDevBanner();
        if (role !== 'developer') {
          showToast('Service restored — welcome back!', 'success');
        }
      }
    });
  }

  // ── Stop listening ────────────────────────────────────
  function stopListening() {
    window.fbDB.ref(SYS_PATH).off();
    _hideMaintenanceScreen();
    _hideDevBanner();
    _active = false;
  }

  // ── Ctrl+Shift+F12 shortcut ───────────────────────────
  function _initDevShortcut() {
    document.addEventListener('keydown', async (e) => {
      if (!e.ctrlKey || !e.shiftKey || e.key !== 'F12') return;
      const role = App.currentUser?.role;
      if (role !== 'developer') return;

      const snap    = await window.fbDB.ref(SYS_PATH).once('value');
      const val     = snap.exists() ? snap.val() : null;
      const current = val?.maintenance === true;

      if (current) {
        // Turn OFF
        await window.fbDB.ref(SYS_PATH + '/maintenance').set(false);
      await window.fbDB.ref(SYS_PATH + '/estimate').remove();
        showToast('Maintenance mode OFF — users restored', 'success');
      } else {
        // Turn ON — show estimate picker
        _showEstimatePicker();
      }
    });
  }

  // ── Estimate picker ───────────────────────────────────
  function _showEstimatePicker() {
    document.getElementById('maint-picker-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'maint-picker-overlay';
    overlay.innerHTML = `
      <div class="maint-prompt">
        <div class="maint-prompt-icon"><i class="fas fa-clock"></i></div>
        <h4>Enable Maintenance Mode</h4>
        <p class="maint-prompt-sub">How long will maintenance take?</p>
        <div class="maint-estimate-options">
          <button class="maint-est-btn" onclick="Maintenance.confirmEstimate('~15 minutes')">~15 min</button>
          <button class="maint-est-btn" onclick="Maintenance.confirmEstimate('~30 minutes')">~30 min</button>
          <button class="maint-est-btn" onclick="Maintenance.confirmEstimate('~1 hour')">~1 hour</button>
          <button class="maint-est-btn" onclick="Maintenance.confirmEstimate('~2 hours')">~2 hours</button>
          <button class="maint-est-btn" onclick="Maintenance.confirmEstimate('A few hours')">A few hours</button>
          <button class="maint-est-btn" onclick="Maintenance.confirmEstimate('Unknown')">Unknown</button>
        </div>
        <div class="maint-custom-wrap">
          <input id="maint-custom-input" class="maint-custom-input"
                 placeholder="Or type a custom estimate..."
                 onkeydown="if(event.key==='Enter') Maintenance.confirmCustomEstimate()"/>
          <button class="maint-custom-btn" onclick="Maintenance.confirmCustomEstimate()">
            <i class="fas fa-check"></i>
          </button>
        </div>
        <button class="maint-cancel-btn"
                onclick="document.getElementById('maint-picker-overlay').remove()">
          Cancel
        </button>
      </div>`;

    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
    setTimeout(() => document.getElementById('maint-custom-input')?.focus(), 200);
  }

  async function confirmEstimate(estimate) {
    document.getElementById('maint-picker-overlay')?.remove();
    await window.fbDB.ref(SYS_PATH).update({ maintenance: true, estimate });
    showToast(`Maintenance ON — estimated: ${estimate}`, 'warn');
  }

  async function confirmCustomEstimate() {
    const val = document.getElementById('maint-custom-input')?.value.trim();
    if (!val) return;
    await confirmEstimate(val);
  }

  // ── Maintenance screen ────────────────────────────────
  function _showMaintenanceScreen(estimate) {
    if (document.getElementById('maintenance-screen')) return;

    const estHtml = estimate && estimate !== 'Unknown'
      ? `<div class="maint-estimate">
           <i class="fas fa-clock"></i>
           <span>Estimated downtime: <strong>${estimate}</strong></span>
         </div>`
      : '';

    const screen = document.createElement('div');
    screen.id = 'maintenance-screen';
    screen.innerHTML = `
      <div class="maint-card">
        <div class="maint-icon"><i class="fas fa-wrench"></i></div>
        <h2 class="maint-title">Under Maintenance</h2>
        <p class="maint-msg">
          Lab Guy is currently undergoing maintenance.<br>
          Please check back shortly — we'll be right back!
        </p>
        <div class="maint-status">
          <span class="maint-dot"></span>
          <span>Waiting for service to restore...</span>
        </div>
        ${estHtml}
        <div class="maint-footer">
          For urgent issues, contact your system administrator.
        </div>
      </div>`;

    document.body.appendChild(screen);
    requestAnimationFrame(() => screen.classList.add('show'));
  }

  function _hideMaintenanceScreen() {
    const screen = document.getElementById('maintenance-screen');
    if (!screen) return;
    screen.classList.remove('show');
    setTimeout(() => screen.remove(), 400);
  }

  // ── Developer banner ──────────────────────────────────
  function _showDevBanner(estimate) {
    if (document.getElementById('maintenance-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'maintenance-banner';
    banner.innerHTML = `
      <i class="fas fa-exclamation-triangle"></i>
      <span>Maintenance mode is <strong>ON</strong>${estimate ? ` — Est: ${estimate}` : ''}.
        Press <kbd>Ctrl+Shift+F12</kbd> to disable.</span>
      <button onclick="document.getElementById('maintenance-banner').remove()">
        <i class="fas fa-times"></i>
      </button>`;

    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('show'));
  }

  function _hideDevBanner() {
    const banner = document.getElementById('maintenance-banner');
    if (!banner) return;
    banner.classList.remove('show');
    setTimeout(() => banner.remove(), 300);
  }

  return {
    startListening,
    stopListening,
    _initDevShortcut,
    confirmEstimate,
    confirmCustomEstimate,
  };

})();

window.Maintenance = Maintenance;

document.addEventListener('DOMContentLoaded', () => {
  Maintenance._initDevShortcut();
});
