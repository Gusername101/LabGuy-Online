/* ============================================================
   notifications.js — Notifications panel
   LabGuy Application

   Two notification types:
   1. Admin requests  — written to /adminRequests/{id}
                        visible to admins/developers only
   2. Personal notifs — written to /userNotifications/{uid}/{id}
                        visible only to that user
                        e.g. "Your admin request was approved"
   ============================================================ */

const NotifPanel = (() => {

  const REQ_PATH   = 'adminRequests';
  const NOTIF_PATH = 'userNotifications';

  let _reqListener   = null;
  let _notifListener = null;
  let _personalNotifs = [];

  // ── Start listening ───────────────────────────────────
  function startListening() {
    const user = App.currentUser;
    const role = user?.role;

    // All users listen for their own personal notifications
    if (user?.uid) {
      _notifListener = window.fbDB.ref(`${NOTIF_PATH}/${user.uid}`).on('value', snap => {
        _personalNotifs = [];
        if (snap.exists()) {
          snap.forEach(child => {
            _personalNotifs.push({ id: child.key, ...child.val() });
          });
          _personalNotifs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        }
        _refreshBadge();
        _refreshIfOpen();
      });
    }

    // Admins/devs also listen for access requests
    if (role === 'admin' || role === 'developer') {
      _reqListener = window.fbDB.ref(REQ_PATH).on('value', snap => {
        const requests = [];
        if (snap.exists()) {
          snap.forEach(child => requests.push({ id: child.key, ...child.val() }));
        }
        _render(requests);
        _refreshBadge();
      });
    } else {
      _renderPersonalOnly();
    }
  }

  function stopListening() {
    if (_reqListener) {
      window.fbDB.ref(REQ_PATH).off('value', _reqListener);
      _reqListener = null;
    }
    if (_notifListener && App.currentUser?.uid) {
      window.fbDB.ref(`${NOTIF_PATH}/${App.currentUser.uid}`).off('value', _notifListener);
      _notifListener = null;
    }
    _personalNotifs = [];
    _updateBadge(0);
  }

  // ── Refresh panel if open ─────────────────────────────
  function _refreshIfOpen() {
    if (App.activePanel === 'panel-notifications') {
      const role = App.currentUser?.role;
      if (role === 'admin' || role === 'developer') return; // handled by req listener
      _renderPersonalOnly();
    }
  }

  // ── Render for admins (requests + personal notifs) ────
  function _render(requests) {
    const list = document.getElementById('notif-list');
    const foot = document.getElementById('notif-count');
    if (!list) return;

    const reqCards = requests.map(r => {
      const date = new Date(r.timestamp).toLocaleDateString('en-US', {
        month: '2-digit', day: '2-digit', year: 'numeric'
      });
      return `
        <div class="notif-card" id="notif-card-${r.id}">
          <div class="notif-date">
            <i class="fas fa-calendar-alt" style="font-size:10px"></i> ${date}
          </div>
          <div class="notif-msg">
            <strong>${r.name}</strong> (${r.email}) has requested admin privileges.
          </div>
          <div class="notif-actions">
            <span class="notif-actions-label">
              <i class="fas fa-cog" style="font-size:10px"></i> Actions:
            </span>
            <button class="notif-btn approve"
                    onclick="NotifPanel.approve('${r.id}', '${r.uid}', '${r.name}')">
              <i class="fas fa-check"></i> Approve
            </button>
            <button class="notif-btn reject"
                    onclick="NotifPanel.reject('${r.id}', '${r.uid}', '${r.name}')">
              <i class="fas fa-times"></i> Reject
            </button>
          </div>
        </div>`;
    }).join('');

    const personalCards = _personalNotifs.map(n => _buildPersonalCard(n)).join('');
    const total = requests.length + _personalNotifs.length;

    if (!total) {
      _renderEmpty();
      if (foot) foot.textContent = '0 notifications';
      return;
    }

    list.innerHTML = reqCards + personalCards;

    if (foot) {
      const today = new Date().toLocaleDateString('en-US', { month:'2-digit', day:'2-digit', year:'numeric' });
      foot.textContent = `${total} notification${total !== 1 ? 's' : ''} · ${today}`;
    }
  }

  // ── Render for regular users (personal notifs only) ───
  function _renderPersonalOnly() {
    const list = document.getElementById('notif-list');
    const foot = document.getElementById('notif-count');
    if (!list) return;

    if (!_personalNotifs.length) {
      _renderEmpty();
      if (foot) foot.textContent = '0 notifications';
      return;
    }

    list.innerHTML = _personalNotifs.map(n => _buildPersonalCard(n)).join('');

    if (foot) {
      const today = new Date().toLocaleDateString('en-US', { month:'2-digit', day:'2-digit', year:'numeric' });
      foot.textContent = `${_personalNotifs.length} notification${_personalNotifs.length !== 1 ? 's' : ''} · ${today}`;
    }
  }

  // ── Build a personal notification card ───────────────
  function _buildPersonalCard(n) {
    const date = n.timestamp
      ? new Date(n.timestamp).toLocaleDateString('en-US', { month:'2-digit', day:'2-digit', year:'numeric' })
      : '—';
    const iconColor = n.type === 'role_approved' ? 'var(--accent-green)' : 'var(--accent-blue)';
    const icon      = n.type === 'role_approved' ? 'fa-user-shield' : 'fa-bell';

    return `
      <div class="notif-card notif-card-personal" id="pnotif-${n.id}">
        <div class="notif-personal-header">
          <i class="fas ${icon}" style="color:${iconColor}"></i>
          <strong>${n.title || 'Notification'}</strong>
          <span class="notif-date" style="margin-left:auto">
            <i class="fas fa-calendar-alt" style="font-size:10px"></i> ${date}
          </span>
        </div>
        <div class="notif-msg" style="margin-top:8px">${n.body || ''}</div>
        <div class="notif-actions" style="justify-content:flex-end">
          <button class="notif-btn approve"
                  onclick="NotifPanel.dismissPersonal('${n.id}')">
            <i class="fas fa-check"></i> Dismiss
          </button>
        </div>
      </div>`;
  }

  function _renderEmpty() {
    const list = document.getElementById('notif-list');
    if (list) list.innerHTML = `
      <div class="notif-empty">
        <i class="fas fa-bell-slash"></i>
        <p>No notifications</p>
      </div>`;
  }

  // ── Approve request ───────────────────────────────────
  async function approve(requestId, uid, name) {
    try {
      await window.fbDB.ref(`users/${uid}/role`).set('admin');
      await window.fbDB.ref(`users/${uid}/pendingAdminRequest`).remove();
      await window.fbDB.ref(`${REQ_PATH}/${requestId}`).remove();
      await window.fbDB.ref('audit_logs').push({
        type:      'role_change',
        message:   `${App.currentUser?.full_name} approved admin request from ${name}`,
        timestamp: Date.now(),
        by:        App.currentUser?.uid,
      });

      // Send personal notification to the newly promoted user
      await _sendPersonalNotif(uid, {
        type:      'role_approved',
        title:     '🎉 Admin Access Granted!',
        body:      `Your request for admin access has been approved by <strong>${App.currentUser?.full_name || 'an administrator'}</strong>.<br><br>
                   As an Admin you can now:<br>
                   <ul class="notif-perm-list">
                     <li><i class="fas fa-flask"></i> Create and manage storage labs</li>
                     <li><i class="fas fa-table"></i> Define and edit metadata fields</li>
                     <li><i class="fas fa-users-cog"></i> Manage user roles and access</li>
                     <li><i class="fas fa-history"></i> View and purge the full audit log</li>
                     <li><i class="fas fa-bell"></i> Review and action access requests</li>
                   </ul>
                   Welcome to the team — refresh the page to see your new permissions!`,
        timestamp: Date.now(),
      });

      showToast(`${name} has been granted admin access.`, 'success');
    } catch (err) {
      console.error('Approve failed:', err);
      showToast('Failed to approve request.', 'error');
    }
  }

  // ── Reject request ────────────────────────────────────
  async function reject(requestId, uid, name) {
    try {
      await window.fbDB.ref(`users/${uid}/pendingAdminRequest`).remove();
      await window.fbDB.ref(`${REQ_PATH}/${requestId}`).remove();
      await window.fbDB.ref('audit_logs').push({
        type:      'request_rejected',
        message:   `${App.currentUser?.full_name} rejected admin request from ${name}`,
        timestamp: Date.now(),
        by:        App.currentUser?.uid,
      });
      showToast(`${name}'s request has been rejected.`, 'info');
    } catch (err) {
      console.error('Reject failed:', err);
      showToast('Failed to reject request.', 'error');
    }
  }

  // ── Send personal notification ────────────────────────
  async function _sendPersonalNotif(uid, data) {
    await window.fbDB.ref(`${NOTIF_PATH}/${uid}`).push(data);
  }

  // ── Dismiss personal notification ─────────────────────
  async function dismissPersonal(notifId) {
    const uid = App.currentUser?.uid;
    if (!uid) return;
    try {
      await window.fbDB.ref(`${NOTIF_PATH}/${uid}/${notifId}`).remove();
      showToast('Notification dismissed.', 'success');
    } catch (err) {
      showToast('Failed to dismiss.', 'error');
    }
  }

  // ── Badge ─────────────────────────────────────────────
  function _refreshBadge() {
    const role     = App.currentUser?.role;
    const isElevated = role === 'admin' || role === 'developer';
    // Count: personal notifs + (for admins) pending requests shown via listener
    // The req listener handles its own badge update via _render — just count personal here
    const count = _personalNotifs.length;
    // For elevated users the badge is updated in _render, add personal on top
    if (!isElevated) _updateBadge(count);
  }

  function _updateBadge(count) {
    let badge = document.getElementById('notif-nav-badge');
    const btn = document.querySelector('[data-panel="panel-notifications"]');
    if (!btn) return;
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.id = 'notif-nav-badge';
        badge.className = 'notif-nav-badge';
        btn.appendChild(badge);
      }
      badge.textContent = count;
    } else {
      badge?.remove();
    }
  }

  return { startListening, stopListening, approve, reject, dismissPersonal };

})();

window.NotifPanel = NotifPanel;
