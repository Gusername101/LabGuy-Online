/* ============================================================
   panels/user-management.js — User Management modal
   LabGuy Application
   ============================================================ */

const UserManagement = (() => {

  let _users            = [];
  let _editUid          = null;
  let _listener         = null;
  let _presenceListener = null;
  let _deleteUid = null;

  const ROLE_COLORS = {
    developer: '#a55eea',
    admin:     '#fd9644',
    user:      '#8a8faa',
  };

  // ── Open ──────────────────────────────────────────────
  function open() {
    document.getElementById('usermgmt-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'usermgmt-overlay';
    overlay.innerHTML = _buildModalHTML();
    overlay.addEventListener('click', e => {
      if (e.target === overlay) close();
    });

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));

    _switchTab('users');
    _loadUsers();
  }

  // ── Close ─────────────────────────────────────────────
  function close() {
    if (_presenceListener) {
      window.fbDB.ref('users').off('value', _presenceListener);
      _presenceListener = null;
    }
    const overlay = document.getElementById('usermgmt-overlay');
    if (!overlay) return;
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 300);
  }

  // ── Build HTML ────────────────────────────────────────
  function _buildModalHTML() {
    return `
      <div class="um-modal">
        <div class="um-header">
          <div class="um-header-icon"><i class="fas fa-users-cog"></i></div>
          <div class="um-header-text">
            <h3>User Management</h3>
            <p>Manage accounts, roles, and access</p>
          </div>
          <button class="um-close" onclick="UserManagement.close()">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="um-tabs">
          <button class="um-tab active" id="um-tab-users" onclick="UserManagement.switchTab('users')">
            <i class="fas fa-users"></i> All Users
          </button>
          <button class="um-tab" id="um-tab-roles" onclick="UserManagement.switchTab('roles')">
            <i class="fas fa-shield-alt"></i> Edit Role
          </button>
          <button class="um-tab" id="um-tab-delete" onclick="UserManagement.switchTab('delete')">
            <i class="fas fa-user-times"></i> Remove User
          </button>
          <button class="um-tab" id="um-tab-audit" onclick="UserManagement.switchTab('audit')">
            <i class="fas fa-history"></i> Audit Log
          </button>
          <button class="um-tab" id="um-tab-presence" onclick="UserManagement.switchTab('presence')">
            <i class="fas fa-circle" style="color:#2ecc71;font-size:9px"></i> Online
          </button>
        </div>

        <div class="um-body">

          <!-- ALL USERS -->
          <div class="um-tab-pane active" id="um-pane-users">
            <div class="um-search-bar">
              <i class="fas fa-search"></i>
              <input class="um-search-input" id="um-search"
                     placeholder="Search by name or email..."
                     oninput="UserManagement.filterUsers(this.value)"/>
            </div>
            <div class="um-user-list" id="um-user-list">
              <div class="um-empty">
                <i class="fas fa-spinner fa-spin"></i>
                Loading users...
              </div>
            </div>
          </div>

          <!-- EDIT ROLE -->
          <div class="um-tab-pane" id="um-pane-roles">
            <div class="um-search-bar">
              <i class="fas fa-search"></i>
              <input class="um-search-input" id="um-role-search"
                     placeholder="Search user to edit role..."
                     oninput="UserManagement.filterRoleUsers(this.value)"/>
            </div>
            <div class="um-user-list" id="um-role-user-list"></div>
            <div class="um-role-editor" id="um-role-editor">
              <div class="um-field">
                <label>Selected User</label>
                <div class="um-select" id="um-role-selected-name" style="cursor:default;">—</div>
              </div>
              <div class="um-field">
                <label>New Role</label>
                <select class="um-select" id="um-role-select">
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                  <option value="developer">Developer</option>
                </select>
              </div>
              <button class="um-save-btn" onclick="UserManagement.saveRole()">
                <i class="fas fa-check"></i> Update Role
              </button>
            </div>
          </div>

          <!-- DELETE USER -->
          <div class="um-tab-pane" id="um-pane-delete">
            <div class="um-search-bar">
              <i class="fas fa-search"></i>
              <input class="um-search-input" id="um-delete-search"
                     placeholder="Search user to remove..."
                     oninput="UserManagement.filterDeleteUsers(this.value)"/>
            </div>
            <div class="um-user-list" id="um-delete-user-list"></div>
            <div class="um-delete-zone" id="um-delete-zone">
              <div class="um-delete-warning">
                <i class="fas fa-exclamation-triangle"></i>
                This will permanently remove the user's data. It cannot be undone.
              </div>
              <div class="um-field">
                <label>Selected User</label>
                <div class="um-select" id="um-delete-selected-name" style="cursor:default;">—</div>
              </div>
              <input class="um-confirm-input" id="um-delete-confirm"
                     placeholder="Type DELETE to confirm..."
                     oninput="UserManagement.checkDeleteConfirm(this.value)"/>
              <button class="um-delete-btn" id="um-delete-btn" onclick="UserManagement.deleteUser()">
                <i class="fas fa-trash"></i> Remove User
              </button>
            </div>
          </div>

          <!-- AUDIT LOG -->
          <div class="um-tab-pane" id="um-pane-audit">
            <div id="um-audit-list">
              <div class="um-empty">
                <i class="fas fa-spinner fa-spin"></i>
                Loading audit log...
              </div>
            </div>
          </div>

          <div class="um-tab-pane" id="um-pane-presence">
            <div id="um-presence-list">
              <div class="um-empty">
                <i class="fas fa-spinner fa-spin"></i> Loading...
              </div>
            </div>
          </div>

        </div>

        <div class="um-footer">
          <span class="um-user-count" id="um-user-count">Loading...</span>
          <button class="um-footer-close" onclick="UserManagement.close()">Close</button>
        </div>
      </div>`;
  }

  // ── Load users from Firebase ──────────────────────────
  async function _loadUsers() {
    try {
      const snap = await window.fbDB.ref('users').once('value');
      _users = [];
      if (snap.exists()) {
        snap.forEach(child => {
          const d = child.val();
          _users.push({
            uid:       child.key,
            full_name: d.full_name || 'Unknown',
            email:     d.email || '—',
            role:      d.role  || 'user',
          });
        });
      }
      _users.sort((a, b) => {
        const order = { developer: 0, admin: 1, user: 2 };
        return (order[a.role] ?? 3) - (order[b.role] ?? 3);
      });

      _renderUserList(_users);
      _renderRoleList(_users);
      _renderDeleteList(_users);

      const countEl = document.getElementById('um-user-count');
      if (countEl) countEl.textContent = `${_users.length} user${_users.length !== 1 ? 's' : ''} total`;

    } catch (err) {
      const list = document.getElementById('um-user-list');
      if (list) list.innerHTML = `<div class="um-empty"><i class="fas fa-exclamation-triangle"></i>Failed to load users.</div>`;
    }
  }

  // ── Render helpers ────────────────────────────────────
  function _avatarColor(name) {
    const colors = ['#2ecc71','#3498db','#9b59b6','#e67e22','#e74c3c','#1abc9c','#fd9644','#a55eea'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  function _initials(name) {
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
    return (parts[0]?.[0] || '?').toUpperCase();
  }

  function _userCardHTML(user, mode) {
    const color    = _avatarColor(user.full_name);
    const initials = _initials(user.full_name);
    const isSelf   = user.uid === App.currentUser?.uid;

    let actions = '';
    if (mode === 'view') {
      actions = `
        <div class="um-card-actions">
          <button class="um-action-btn" title="Edit Role"
                  onclick="UserManagement.selectForRole('${user.uid}')">
            <i class="fas fa-shield-alt"></i>
          </button>
          ${!isSelf ? `
          <button class="um-action-btn danger" title="Remove User"
                  onclick="UserManagement.selectForDelete('${user.uid}')">
            <i class="fas fa-user-times"></i>
          </button>` : ''}
        </div>`;
    } else if (mode === 'role') {
      const sel = _editUid === user.uid ? 'border-color:var(--accent-green)' : '';
      actions = `
        <button class="um-action-btn" title="Select" style="${sel}"
                onclick="UserManagement.selectForRole('${user.uid}')">
          <i class="fas fa-${_editUid === user.uid ? 'check' : 'pen'}"></i>
        </button>`;
    } else if (mode === 'delete') {
      if (isSelf) return '';
      const sel = _deleteUid === user.uid ? 'border-color:var(--accent-red)' : '';
      actions = `
        <button class="um-action-btn danger" title="Select" style="${sel}"
                onclick="UserManagement.selectForDelete('${user.uid}')">
          <i class="fas fa-${_deleteUid === user.uid ? 'check' : 'user-times'}"></i>
        </button>`;
    }

    return `
      <div class="um-user-card" id="um-card-${mode}-${user.uid}">
        <div class="um-avatar" style="background:${color}">${initials}</div>
        <div class="um-user-info">
          <div class="um-user-name">${user.full_name}${isSelf ? ' <span style="color:var(--accent-green);font-size:10px">(you)</span>' : ''}</div>
          <div class="um-user-email">${user.email}</div>
        </div>
        <span class="um-role-badge ${user.role}">${user.role}</span>
        ${actions}
      </div>`;
  }

  function _renderUserList(users) {
    const el = document.getElementById('um-user-list');
    if (!el) return;
    if (!users.length) {
      el.innerHTML = `<div class="um-empty"><i class="fas fa-users"></i>No users found.</div>`;
      return;
    }
    el.innerHTML = users.map(u => _userCardHTML(u, 'view')).join('');
  }

  function _renderRoleList(users) {
    const el = document.getElementById('um-role-user-list');
    if (!el) return;
    el.innerHTML = users.map(u => _userCardHTML(u, 'role')).join('');
  }

  function _renderDeleteList(users) {
    const el = document.getElementById('um-delete-user-list');
    if (!el) return;
    const filtered = users.filter(u => u.uid !== App.currentUser?.uid);
    el.innerHTML = filtered.map(u => _userCardHTML(u, 'delete')).join('');
  }

  // ── Filtering ─────────────────────────────────────────
  function filterUsers(q) {
    const filtered = _filter(q);
    _renderUserList(filtered);
  }

  function filterRoleUsers(q) {
    _renderRoleList(_filter(q));
  }

  function filterDeleteUsers(q) {
    _renderDeleteList(_filter(q));
  }

  function _filter(q) {
    if (!q) return _users;
    const lower = q.toLowerCase();
    return _users.filter(u =>
      u.full_name.toLowerCase().includes(lower) ||
      u.email.toLowerCase().includes(lower)
    );
  }

  // ── Tab switching ─────────────────────────────────────
  function _switchTab(name) {
    document.querySelectorAll('.um-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.um-tab-pane').forEach(p => p.classList.remove('active'));
    document.getElementById(`um-tab-${name}`)?.classList.add('active');
    if (name === 'presence') _loadPresence();
    document.getElementById(`um-pane-${name}`)?.classList.add('active');

    if (name === 'audit') _loadAuditLog();
  }

  // Expose for onclick
  function switchTab(name) { _switchTab(name); }

  // ── Presence ──────────────────────────────────────────
  function _loadPresence() {
    const el = document.getElementById('um-presence-list');
    if (!el) return;

    if (_presenceListener) {
      window.fbDB.ref('users').off('value', _presenceListener);
    }

    _presenceListener = window.fbDB.ref('users').on('value', snap => {
      if (!snap.exists()) { el.innerHTML = '<div class="um-empty">No users found.</div>'; return; }

      const users = [];
      snap.forEach(child => {
        users.push({ uid: child.key, ...child.val() });
      });

      // Sort: online first, then by lastSeen desc
      users.sort((a, b) => {
        const aOn = a.presence?.online || false;
        const bOn = b.presence?.online || false;
        if (aOn !== bOn) return bOn - aOn;
        return (b.presence?.lastSeen || 0) - (a.presence?.lastSeen || 0);
      });

      el.innerHTML = users.map(u => {
        const online   = u.presence?.online || false;
        const lastSeen = u.presence?.lastSeen;
        const timeStr  = _formatLastSeen(lastSeen, online);
        const roleTag  = `<span class="um-presence-role um-presence-role-${u.role || 'user'}">${u.role || 'user'}</span>`;

        return `
          <div class="um-presence-row">
            <div class="um-presence-dot ${online ? 'online' : 'offline'}"></div>
            <div class="um-presence-info">
              <span class="um-presence-name">${u.full_name || 'Unknown'}</span>
              ${roleTag}
            </div>
            <div class="um-presence-time">${timeStr}</div>
          </div>`;
      }).join('');
    });
  }

  function _formatLastSeen(ts, online) {
    if (online) return '<span class="um-presence-online-label">Online now</span>';
    if (!ts) return 'Never seen';
    const diff = Date.now() - ts;
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins < 1)   return 'Just now';
    if (mins < 60)  return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }

  // ── Role editing ──────────────────────────────────────
  function selectForRole(uid) {
    _editUid = uid;
    const user = _users.find(u => u.uid === uid);
    if (!user) return;

    _switchTab('roles');
    _renderRoleList(_users);

    const editor = document.getElementById('um-role-editor');
    const nameEl = document.getElementById('um-role-selected-name');
    const sel    = document.getElementById('um-role-select');

    if (editor) editor.classList.add('show');
    if (nameEl) nameEl.textContent = `${user.full_name} (${user.email})`;
    if (sel)    sel.value = user.role;
  }

  async function saveRole() {
    if (!_editUid) return;
    const newRole = document.getElementById('um-role-select')?.value;
    const user    = _users.find(u => u.uid === _editUid);
    if (!user || !newRole) return;

    try {
      await window.fbDB.ref(`users/${_editUid}/role`).set(newRole);

      // Write audit log
      await _writeAudit('role_change', `${App.currentUser?.full_name} changed ${user.full_name}'s role from ${user.role} to ${newRole}`);

      // Send personal notification if promoted to admin
      if (newRole === 'admin' && user.role !== 'admin') {
        await window.fbDB.ref(`userNotifications/${_editUid}`).push({
          type:      'role_approved',
          title:     '🎉 Admin Access Granted!',
          body:      `Your account has been upgraded to Admin by <strong>${App.currentUser?.full_name || 'an administrator'}</strong>.<br><br>
                     As an Admin you can now:<br>
                     <ul class="notif-perm-list">
                       <li><i class="fas fa-flask"></i> Create and manage storage labs</li>
                       <li><i class="fas fa-table"></i> Define and edit metadata fields</li>
                       <li><i class="fas fa-users-cog"></i> Manage user roles and access</li>
                       <li><i class="fas fa-history"></i> View and purge the full audit log</li>
                       <li><i class="fas fa-bell"></i> Review and action access requests</li>
                     </ul>
                     Refresh the page to see your new permissions!`,
          timestamp: Date.now(),
        });
      }

      user.role = newRole;
      showToast(`${user.full_name}'s role updated to ${newRole}`, 'success');

      _editUid = null;
      document.getElementById('um-role-editor')?.classList.remove('show');
      _renderUserList(_users);
      _renderRoleList(_users);

    } catch (err) {
      showToast('Failed to update role.', 'error');
    }
  }

  // ── User deletion ─────────────────────────────────────
  function selectForDelete(uid) {
    _deleteUid = uid;
    const user = _users.find(u => u.uid === uid);
    if (!user) return;

    _switchTab('delete');
    _renderDeleteList(_users);

    const zone    = document.getElementById('um-delete-zone');
    const nameEl  = document.getElementById('um-delete-selected-name');
    const confirmEl = document.getElementById('um-delete-confirm');

    if (zone)    zone.classList.add('show');
    if (nameEl)  nameEl.textContent = `${user.full_name} (${user.email})`;
    if (confirmEl) { confirmEl.value = ''; checkDeleteConfirm(''); }
  }

  function checkDeleteConfirm(val) {
    const btn = document.getElementById('um-delete-btn');
    if (btn) btn.classList.toggle('ready', val === 'DELETE');
  }

  async function deleteUser() {
    if (!_deleteUid) return;
    const confirmVal = document.getElementById('um-delete-confirm')?.value;
    if (confirmVal !== 'DELETE') return;

    const user = _users.find(u => u.uid === _deleteUid);
    if (!user) return;

    try {
      await window.fbDB.ref(`users/${_deleteUid}`).remove();
      await window.fbDB.ref(`dashboards/${_deleteUid}`).remove();
      await _writeAudit('user_delete', `${App.currentUser?.full_name} removed user ${user.full_name} (${user.email})`);

      _users = _users.filter(u => u.uid !== _deleteUid);
      _deleteUid = null;

      document.getElementById('um-delete-zone')?.classList.remove('show');
      showToast(`${user.full_name} has been removed.`, 'success');

      _renderUserList(_users);
      _renderDeleteList(_users);

      const countEl = document.getElementById('um-user-count');
      if (countEl) countEl.textContent = `${_users.length} user${_users.length !== 1 ? 's' : ''} total`;

    } catch (err) {
      showToast('Failed to remove user.', 'error');
    }
  }

  // ── Audit log ─────────────────────────────────────────
  async function _writeAudit(type, message) {
    const uid = App.currentUser?.uid;
    if (!uid) return;
    const entry = { type, message, timestamp: Date.now(), by: uid };
    await window.fbDB.ref('audit_logs').push(entry);
  }

  async function _loadAuditLog() {
    const el = document.getElementById('um-audit-list');
    if (!el) return;
    el.innerHTML = '<div class="um-empty"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    try {
      const snap = await window.fbDB.ref('audit_logs').limitToLast(100).once('value');
      if (!snap.exists()) {
        el.innerHTML = '<div class="um-empty"><i class="fas fa-history"></i> No audit entries yet.</div>';
        return;
      }

      const val     = snap.val();
      const entries = Object.entries(val)
        .map(([key, data]) => ({ id: key, ...data }))
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      const DOT_COLORS = {
        edit_sample:   'edit',
        delete_sample: 'delete',
        move_sample:   'move',
        role_change:   'role',
        user_delete:   'delete',
      };

      const rows = entries.map(e => {
        const time = e.timestamp ? new Date(e.timestamp).toLocaleString() : '—';
        const dot  = DOT_COLORS[e.action || e.type] || 'info';
        let   text = '—';

        if (e.action === 'edit_sample')   text = `<strong>${e.name || 'Unknown'}</strong> edited Sample #${e.sampleId}${e.note ? ' — ' + e.note : ''}`;
        else if (e.action === 'delete_sample') text = `<strong>${e.name || 'Unknown'}</strong> deleted Sample #${e.sampleId}`;
        else if (e.action === 'move_sample')   text = `<strong>${e.name || 'Unknown'}</strong> moved Sample #${e.sampleId}${e.note ? ' — ' + e.note : ''}`;
        else if (e.type)                       text = e.message || '—';

        return `<div class="um-audit-entry">
          <div class="um-audit-dot ${dot}"></div>
          <div class="um-audit-text">${text}</div>
          <div class="um-audit-time">${time}</div>
        </div>`;
      }).join('');

      const role       = App.currentUser?.role;
      const canPurge   = role === 'admin' || role === 'developer';
      const purgeBlock = canPurge ? `
        <div class="um-audit-purge-bar">
          <button class="um-purge-toggle" onclick="UserManagement.togglePurgeMenu()">
            <i class="fas fa-trash-alt"></i> Delete Logs
            <i class="fas fa-chevron-up" id="um-purge-chevron"></i>
          </button>
          <div class="um-audit-purge-options" id="um-purge-options" style="display:none">
            <p class="um-audit-purge-desc">
              Any log older than the chosen threshold will be permanently removed.
            </p>
            <div class="um-purge-grid">
              <button class="um-purge-btn" onclick="UserManagement.purgeAuditLogs(30)">
                <span class="um-purge-days">30 days</span>
                <span class="um-purge-sub">Logs older than 30 days</span>
              </button>
              <button class="um-purge-btn" onclick="UserManagement.purgeAuditLogs(90)">
                <span class="um-purge-days">90 days</span>
                <span class="um-purge-sub">Logs older than 90 days</span>
              </button>
              <button class="um-purge-btn" onclick="UserManagement.purgeAuditLogs(180)">
                <span class="um-purge-days">180 days</span>
                <span class="um-purge-sub">Logs older than 180 days</span>
              </button>
              <button class="um-purge-btn danger" onclick="UserManagement.purgeAuditLogs(0)">
                <span class="um-purge-days">Clear All</span>
                <span class="um-purge-sub">Remove every log entry</span>
              </button>
            </div>
          </div>
        </div>` : '';

      el.innerHTML = `
        <div class="um-audit-legend">
          <div class="um-audit-legend-item"><div class="um-audit-dot edit"></div> Edit</div>
          <div class="um-audit-legend-item"><div class="um-audit-dot move"></div> Move</div>
          <div class="um-audit-legend-item"><div class="um-audit-dot delete"></div> Delete</div>
          <div class="um-audit-legend-item"><div class="um-audit-dot role"></div> Role Change</div>
        </div>
        <div class="um-audit-entries">${rows}</div>
        ${purgeBlock}`;

    } catch (err) {
      el.innerHTML = '<div class="um-empty"><i class="fas fa-exclamation-triangle"></i> Failed to load log.</div>';
    }
  }

    function togglePurgeMenu() {
    const options  = document.getElementById('um-purge-options');
    const chevron  = document.getElementById('um-purge-chevron');
    if (!options) return;
    const isOpen = options.style.display !== 'none';
    options.style.display = isOpen ? 'none' : '';
    if (chevron) chevron.className = isOpen ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
  }

  async function purgeAuditLogs(days) {
    const label = days === 0 ? 'all log entries' : `logs older than ${days} days`;
    const confirmed = await _confirmPurge(label);
    if (!confirmed) return;

    try {
      const snap = await window.fbDB.ref('audit_logs').once('value');
      if (!snap.exists()) { showToast('No logs to delete.', 'info'); return; }

      const cutoff  = days === 0 ? Infinity : Date.now() - (days * 24 * 60 * 60 * 1000);
      const updates = {};
      let   count   = 0;

      snap.forEach(child => {
        const ts = child.val().timestamp || 0;
        if (days === 0 || ts < cutoff) {
          updates[child.key] = null;
          count++;
        }
      });

      if (!count) { showToast('No logs matched that threshold.', 'info'); return; }

      await window.fbDB.ref('audit_logs').update(updates);
      showToast(`${count} log${count !== 1 ? 's' : ''} deleted.`, 'success');
      _loadAuditLog();
    } catch (err) {
      showToast('Failed to purge logs: ' + err.message, 'error');
    }
  }

  function _confirmPurge(label) {
    return new Promise(resolve => {
      document.getElementById('um-purge-confirm-overlay')?.remove();
      const overlay = document.createElement('div');
      overlay.id = 'um-purge-confirm-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:9999;';
      overlay.innerHTML = `
        <div class="inv-confirm-modal">
          <div class="inv-confirm-icon" style="color:#e74c3c">
            <i class="fas fa-trash-alt"></i>
          </div>
          <h3 class="inv-confirm-title">Delete ${label}?</h3>
          <p class="inv-confirm-msg">This will permanently remove ${label}. This cannot be undone.</p>
          <div class="inv-confirm-btns">
            <button class="as-btn cancel"
                    onclick="document.getElementById('um-purge-confirm-overlay').remove(); window._umPurgeResolve(false)">
              Cancel
            </button>
            <button class="inv-sample-delete-btn"
                    onclick="document.getElementById('um-purge-confirm-overlay').remove(); window._umPurgeResolve(true)">
              <i class="fas fa-trash"></i> Delete
            </button>
          </div>
        </div>`;
      window._umPurgeResolve = resolve;
      overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
      document.body.appendChild(overlay);
    });
  }

  return {
    open, close, switchTab,
    filterUsers, filterRoleUsers, filterDeleteUsers,
    selectForRole, saveRole,
    selectForDelete, checkDeleteConfirm, deleteUser,
    purgeAuditLogs, togglePurgeMenu,
  };

})();

window.UserManagement = UserManagement;
