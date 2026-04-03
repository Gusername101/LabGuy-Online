/* ============================================================
   app.js — Global app state, routing, toast, overlay
   LabGuy Application
   ============================================================ */

// ── Offline persistence (admin controlled) ────────────────
if (localStorage.getItem('labguy_offline_mode') === 'true') {
  window.fbDB.enablePersistence({ synchronizeTabs: false })
    .catch(err => {
      if (err.code === 'failed-precondition') {
        console.warn('[LabGuy] Offline persistence unavailable — multiple tabs open.');
      } else if (err.code === 'unimplemented') {
        console.warn('[LabGuy] Offline persistence not supported in this browser.');
      }
    });
}

// ── Global state ─────────────────────────────────────────
const App = {
  currentUser: null,
  currentPage: null,
  activePanel: null,
};

// ── Page routing ─────────────────────────────────────────
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(pageId);
  if (target) target.classList.add('active');
  App.currentPage = pageId;
  closeAllPanels();
}

// ── Panel management ──────────────────────────────────────
function openPanel(panelId) {
  closeAllPanels(false);
  const panel = document.getElementById(panelId);
  if (panel) panel.classList.add('open');
  document.getElementById('overlay').classList.add('show');
  App.activePanel = panelId;
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.panel === panelId);
  });
  // Panel-specific hooks
  if (panelId === 'panel-settings') {
    SettingsPanel.checkPendingRequest();
    SettingsPanel.loadVersion();
    SettingsPanel.showArchiveBlock();
  }
  if (panelId === 'panel-admin') {
    AdminPanel.loadRegCodeSettings();
  }
}

function closeAllPanels(hideOverlay = true) {
  document.querySelectorAll('.side-panel').forEach(p => p.classList.remove('open'));
  if (hideOverlay) document.getElementById('overlay').classList.remove('show');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  App.activePanel = null;
}

// ── Toast ─────────────────────────────────────────────────
let _toastTimer;
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  const colors = { success: '#2ecc71', error: '#e74c3c', info: '#2980b9', warn: '#e67e22' };
  toast.style.borderLeftColor = colors[type] || colors.success;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── Overlay click closes panels ───────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('overlay');
  if (overlay) overlay.addEventListener('click', () => closeAllPanels());
});

// ── Expose to window (needed by all other scripts & HTML onclick) ──
window.App            = App;
window.showPage       = showPage;
window.openPanel      = openPanel;
window.closeAllPanels = closeAllPanels;
window.showToast      = showToast;
