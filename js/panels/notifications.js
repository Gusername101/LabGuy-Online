/* ============================================================
   notifications.js — Admin privilege request notifications
   LabGuy Application

   Flow:
   - Regular user clicks "Request Admin Access" in Settings
   - Request written to /adminRequests/{requestId}
   - All admins/developers see it in their Notifications panel
   - Approving: sets user role to 'admin', deletes request for everyone
   - Rejecting: deletes request for everyone, notifies requester via toast
   ============================================================ */

const NotifPanel = (() => {

  const REQ_PATH = 'adminRequests';
  let _listener  = null;

  // ── Start listening for requests (admins/devs only) ───
  function startListening() {
    const role = App.currentUser?.role;
    if (role !== 'admin' && role !== 'developer') {
      _renderEmpty();
      return;
    }

    _listener = window.fbDB.ref(REQ_PATH).on('value', snap => {
      const requests = [];
      if (snap.exists()) {
        snap.forEach(child => {
          requests.push({ id: child.key, ...child.val() });
        });
      }
      _render(requests);
      _updateBadge(requests.length);
    });
  }

  // ── Stop listening (on logout) ────────────────────────
  function stopListening() {
    if (_listener) {
      window.fbDB.ref(REQ_PATH).off('value', _listener);
      _listener = null;
    }
    _updateBadge(0);
  }

  // ── Render request cards ──────────────────────────────
  function _render(requests) {
    const list = document.getElementById('notif-list');
    const foot = document.getElementById('notif-count');
    if (!list) return;

    if (!requests.length) {
      _renderEmpty();
      if (foot) foot.textContent = '0 notifications';
      return;
    }

    list.innerHTML = requests.map(r => {
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

    if (foot) {
      const today = new Date().toLocaleDateString('en-US', { month:'2-digit', day:'2-digit', year:'numeric' });
      foot.textContent = `${requests.length} notification${requests.length !== 1 ? 's' : ''} · ${today}`;
    }
  }

  function _renderEmpty() {
    const list = document.getElementById('notif-list');
    if (list) list.innerHTML = `
      <div class="notif-empty">
        <i class="fas fa-bell-slash"></i>
        <p>No pending requests</p>
      </div>`;
  }

  // ── Approve request ───────────────────────────────────
  async function approve(requestId, uid, name) {
    try {
      // Promote user to admin and clear pending flag
      await window.fbDB.ref(`users/${uid}/role`).set('admin');
      await window.fbDB.ref(`users/${uid}/pendingAdminRequest`).remove();
      // Delete request — removes it for ALL admins instantly
      await window.fbDB.ref(`${REQ_PATH}/${requestId}`).remove();
      // Write audit log
      await window.fbDB.ref('audit_logs').push({
        type:      'role_change',
        message:   `${App.currentUser?.full_name} approved admin request from ${name}`,
        timestamp: Date.now(),
        by:        App.currentUser?.uid,
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

  // ── Nav badge ─────────────────────────────────────────
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

  return { startListening, stopListening, approve, reject };

})();

window.NotifPanel = NotifPanel;
