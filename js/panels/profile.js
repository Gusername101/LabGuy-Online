/* ============================================================
   panels/profile.js — Profile settings panel logic
   LabGuy Application
============================================================ */

const ProfilePanel = (() => {

  function render() {
    if (!App.currentUser) return;
    const u = App.currentUser;
    const el = id => document.getElementById(id);
    const name     = u.full_name || u.email || 'User';
    const initials = name.split(' ').filter(Boolean).slice(0,2).map(w => w[0]).join('').toUpperCase() || '?';
    if (el('profile-avatar')) el('profile-avatar').textContent = initials;
    if (el('profile-name'))   el('profile-name').textContent   = name;
    if (el('profile-email'))  el('profile-email').textContent  = u.email;
    if (el('profile-role'))   el('profile-role').textContent   = `Role: ${u.role}`;
  }

  function open() {
    render();
    openPanel('panel-profile');
  }

  // ── Edit Profile ──────────────────────────────────────
  function editProfile() {
    const u = App.currentUser;
    if (!u) return;

    document.getElementById('edit-profile-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'edit-profile-overlay';
    overlay.innerHTML = `
      <div class="inv-sample-modal">
        <div class="inv-sample-header">
          <div class="inv-sample-icon"><i class="fas fa-user-edit"></i></div>
          <div>
            <h3 class="inv-sample-title">Edit Profile</h3>
            <p class="inv-sample-sub">Update your display name</p>
          </div>
          <button class="as-close" onclick="document.getElementById('edit-profile-overlay').remove()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="inv-sample-body">
          <div class="inv-sample-fields">
            <div class="inv-sf-row">
              <label class="inv-sf-label">Full Name</label>
              <input class="inv-sf-input" id="edit-name-input"
                     value="${(u.full_name || '').replace(/"/g, '&quot;')}"
                     placeholder="Enter your full name"/>
            </div>

          </div>
        </div>
        <div class="inv-sample-footer">
          <div style="flex:1"></div>
          <button class="as-btn cancel"
                  onclick="document.getElementById('edit-profile-overlay').remove()">Cancel</button>
          <button class="as-btn primary" onclick="ProfilePanel.saveProfile()">
            <i class="fas fa-check"></i> Save Changes
          </button>
        </div>
      </div>`;

    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
    setTimeout(() => document.getElementById('edit-name-input')?.focus(), 100);

  }

  async function saveProfile() {
    const u    = App.currentUser;
    const uid  = u?.uid;
    if (!uid) return;

    const newName = document.getElementById('edit-name-input')?.value.trim();

    if (!newName) { showToast('Name cannot be empty.', 'warn'); return; }

    const btn = document.querySelector('#edit-profile-overlay .as-btn.primary');
    if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; btn.disabled = true; }

    try {
      // Update display name in Firebase DB
      await window.fbDB.ref(`users/${uid}/full_name`).set(newName);
      App.currentUser.full_name = newName;



      showToast('Profile updated!', 'success');
      render();
      document.getElementById('edit-profile-overlay')?.remove();
    } catch (err) {
      showToast(`Update failed: ${err.message}`, 'error');
      if (btn) { btn.innerHTML = '<i class="fas fa-check"></i> Save Changes'; btn.disabled = false; }
    }
  }

  // ── Reset Password ────────────────────────────────────
  async function resetPassword() {
    const email = App.currentUser?.email;
    if (!email) { showToast('No email found on your account.', 'warn'); return; }

    try {
      await window.fbAuth.sendPasswordResetEmail(email);
      showToast(`Reset email sent to ${email}!`, 'success');
    } catch (err) {
      showToast(`Failed to send reset email: ${err.message}`, 'error');
    }
  }

  // ── Auto-Populate ─────────────────────────────────────
  async function openAutoPopulate() {
    const uid = App.currentUser?.uid;
    if (!uid) return;

    const snap    = await window.fbDB.ref(`users/${uid}/settings/auto_populate`).once('value');
    const current = snap.exists() ? snap.val() : false;

    document.getElementById('ap-modal-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'ap-modal-overlay';
    overlay.innerHTML = `
      <div class="ap-modal">
        <div class="ap-modal-header">
          <i class="fas fa-magic" style="color:var(--accent-green)"></i>
          <h3>Auto-Populate</h3>
          <button class="lc-close" onclick="document.getElementById('ap-modal-overlay').remove()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="ap-modal-body">
          <p class="ap-desc">
            When adding multiple samples, <strong>Auto-Populate</strong> copies the previous
            sample's data into each new row — so you only need to change what's different.
            Great for batches that share most fields.
          </p>
          <div class="ap-toggle-row">
            <div class="ap-toggle-info">
              <span class="ap-toggle-label">Auto-Populate</span>
              <span class="ap-toggle-status" id="ap-status">${current ? 'Enabled' : 'Disabled'}</span>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="ap-toggle-input" ${current ? 'checked' : ''}
                     onchange="ProfilePanel.saveAutoPopulate(this.checked)">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>`;
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
  }

  async function saveAutoPopulate(val) {
    const uid = App.currentUser?.uid;
    if (!uid) return;
    await window.fbDB.ref(`users/${uid}/settings/auto_populate`).set(val);
    const status = document.getElementById('ap-status');
    if (status) status.textContent = val ? 'Enabled' : 'Disabled';
    showToast(`Auto-Populate ${val ? 'enabled' : 'disabled'}`, val ? 'success' : 'info');
  }

  return { open, editProfile, saveProfile, resetPassword, openAutoPopulate, saveAutoPopulate };
})();

window.ProfilePanel = ProfilePanel;
