/* ============================================================
   trash.js — Trash Can Panel
   LabGuy Application

   DB Schema:
   /Trash/{sampleId}/
     data: { ...original sample fields including Location }
     deletedBy: uid
     deletedByName: string
     deletedAt: timestamp

   Flow:
   - Delete from Inventory → moves to /Trash instead of wiping
   - Restore → moves back to /Inventory, re-occupies slot
     (if slot taken → manual placement tree)
   - Delete Permanently → wipes from /Trash forever
   - Empty Trash → wipes all /Trash entries forever
   ============================================================ */

const TrashCan = (() => {

  const TRASH_PATH = 'Trash';
  const INV_PATH   = 'Inventory';
  const LABS_PATH  = 'Labs';

  let _items    = {};   // { sampleId: { data, deletedBy, deletedByName, deletedAt } }
  let _filtered = [];
  let _selected = new Set();
  let _listener = null;
  let _searchTerm = '';

  // ── Start / stop listener ─────────────────────────────
  function startListening() {
    _listener = window.fbDB.ref(TRASH_PATH).on('value', snap => {
      _items = snap.exists() ? snap.val() : {};
      _applyFilter();
      _render();
      _updateBadge();
    });
  }

  function stopListening() {
    if (_listener) {
      window.fbDB.ref(TRASH_PATH).off('value', _listener);
      _listener = null;
    }
  }

  // ── Badge on nav icon ─────────────────────────────────
  function _updateBadge() {
    const count = Object.keys(_items).length;
    let badge = document.getElementById('trash-badge');
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.id = 'trash-badge';
        badge.className = 'notif-badge';
        document.getElementById('nav-trash-btn')?.appendChild(badge);
      }
      badge.textContent = count > 99 ? '99+' : count;
    } else {
      badge?.remove();
    }
  }

  // ── Filter ────────────────────────────────────────────
  function _applyFilter() {
    const term = _searchTerm.toLowerCase().trim();
    _filtered  = Object.entries(_items).map(([id, item]) => ({ id, ...item }));
    if (term) {
      _filtered = _filtered.filter(item =>
        String(item.id).includes(term) ||
        String(item.deletedByName || '').toLowerCase().includes(term) ||
        String(item.data?.Location || '').toLowerCase().includes(term)
      );
    }
    // Sort newest first
    _filtered.sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
  }

  function onSearch(val) {
    _searchTerm = val;
    _applyFilter();
    _render();
  }

  // ── Render panel content ──────────────────────────────
  function _render() {
    const container = document.getElementById('trash-content');
    if (!container) return;

    const total = Object.keys(_items).length;

    if (!total) {
      container.innerHTML = `
        <div class="trash-empty-state">
          <i class="fas fa-trash-alt"></i>
          <p>Trash is empty</p>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="trash-toolbar">
        <div class="trash-search-wrap">
          <i class="fas fa-search trash-search-icon"></i>
          <input class="trash-search" placeholder="Search deleted samples…"
                 oninput="TrashCan.onSearch(this.value)" value="${_searchTerm}"/>
        </div>
        <span class="trash-count">${total} item${total !== 1 ? 's' : ''}</span>
      </div>

      <div class="trash-actions">
        <button class="trash-btn trash-btn-restore" onclick="TrashCan.restoreSelected()">
          <i class="fas fa-undo"></i> Restore Selected
        </button>
        <button class="trash-btn trash-btn-delete" onclick="TrashCan.deleteSelected()">
          <i class="fas fa-trash"></i> Delete Selected
        </button>
        <button class="trash-btn trash-btn-empty" onclick="TrashCan.emptyTrash()">
          <i class="fas fa-fire"></i> Empty Trash
        </button>
      </div>

      <div class="trash-select-row">
        <label class="trash-select-all">
          <input type="checkbox" id="trash-select-all"
                 onchange="TrashCan.toggleSelectAll(this.checked)"/>
          <span>Select All</span>
        </label>
      </div>

      <div class="trash-list" id="trash-list">
        ${_filtered.map(item => _buildRow(item)).join('')}
      </div>`;
  }

  function _buildRow(item) {
    const date     = item.deletedAt
      ? new Date(item.deletedAt).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
      : '—';
    const location = item.data?.Location || '—';
    const locParts = location.split('/');
    const lab      = locParts[0] || '—';
    const slot     = locParts[locParts.length - 1] || '—';
    const checked  = _selected.has(item.id);

    return `
      <div class="trash-row ${checked ? 'selected' : ''}" data-id="${item.id}">
        <input type="checkbox" class="trash-checkbox" ${checked ? 'checked' : ''}
               onchange="TrashCan.toggleSelect('${item.id}', this.checked)"/>
        <div class="trash-row-info" onclick="TrashCan.openDetail('${item.id}')">
          <div class="trash-row-main">
            <span class="trash-sample-id">Sample #${item.id}</span>
            <span class="trash-loc-pill">${lab} › ${slot}</span>
          </div>
          <div class="trash-row-meta">
            <span><i class="fas fa-user"></i> ${item.deletedByName || 'Unknown'}</span>
            <span><i class="fas fa-calendar"></i> ${date}</span>
          </div>
        </div>
        <button class="trash-row-restore" title="Restore"
                onclick="TrashCan.restoreOne('${item.id}')">
          <i class="fas fa-undo"></i>
        </button>
      </div>`;
  }

  // ── Selection ─────────────────────────────────────────
  function toggleSelect(id, checked) {
    if (checked) _selected.add(id);
    else         _selected.delete(id);
    // Update row highlight
    document.querySelector(`.trash-row[data-id="${id}"]`)
      ?.classList.toggle('selected', checked);
  }

  function toggleSelectAll(checked) {
    _selected.clear();
    if (checked) _filtered.forEach(item => _selected.add(item.id));
    document.querySelectorAll('.trash-checkbox').forEach(cb => {
      cb.checked = checked;
      cb.closest('.trash-row')?.classList.toggle('selected', checked);
    });
  }

  // ── Detail view ───────────────────────────────────────
  function openDetail(id) {
    const item = _items[id];
    if (!item) return;

    document.getElementById('trash-detail-overlay')?.remove();
    const date = item.deletedAt
      ? new Date(item.deletedAt).toLocaleString()
      : '—';

    // Build field list from sample data (exclude Location)
    const fields = Object.entries(item.data || {})
      .filter(([k]) => k !== 'Location')
      .map(([k, v]) => `
        <div class="inv-sf-row">
          <label class="inv-sf-label">${k.replace(/_/g, ' ')}</label>
          <div class="trash-detail-val">${v || '—'}</div>
        </div>`).join('');

    const overlay = document.createElement('div');
    overlay.id = 'trash-detail-overlay';
    overlay.innerHTML = `
      <div class="inv-sample-modal">
        <div class="inv-sample-header">
          <div class="inv-sample-icon" style="background:rgba(231,76,60,0.1);border-color:rgba(231,76,60,0.25);color:#e74c3c">
            <i class="fas fa-trash-alt"></i>
          </div>
          <div>
            <h3 class="inv-sample-title">Sample #${id}</h3>
            <p class="inv-sample-sub">Deleted by ${item.deletedByName || 'Unknown'} · ${date}</p>
          </div>
          <button class="as-close" onclick="document.getElementById('trash-detail-overlay').remove()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="inv-sample-body">
          <div class="trash-detail-location">
            <i class="fas fa-map-marker-alt"></i>
            <div>
              <div class="inv-sf-label">Original Location</div>
              <div class="trash-detail-loc-path">${item.data?.Location || '—'}</div>
            </div>
          </div>
          <div class="panel-divider" style="margin:14px 0"></div>
          <div class="inv-sample-fields">${fields}</div>
        </div>
        <div class="inv-sample-footer">
          <button class="inv-sample-delete-btn"
                  onclick="TrashCan.deleteOne('${id}'); document.getElementById('trash-detail-overlay').remove()">
            <i class="fas fa-trash"></i> Delete Permanently
          </button>
          <div style="flex:1"></div>
          <button class="as-btn cancel"
                  onclick="document.getElementById('trash-detail-overlay').remove()">Close</button>
          <button class="as-btn primary"
                  onclick="TrashCan.restoreOne('${id}'); document.getElementById('trash-detail-overlay').remove()">
            <i class="fas fa-undo"></i> Restore
          </button>
        </div>
      </div>`;

    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
  }

  // ── Restore one ───────────────────────────────────────
  async function restoreOne(id) {
    const item = _items[id];
    if (!item) return;
    await _restoreItem(id, item);
  }

  // ── Restore selected ──────────────────────────────────
  async function restoreSelected() {
    if (!_selected.size) { showToast('No samples selected.', 'warn'); return; }
    for (const id of [..._selected]) {
      await _restoreItem(id, _items[id]);
    }
    _selected.clear();
  }

  // ── Core restore logic ────────────────────────────────
  async function _restoreItem(id, item) {
    if (!item) return;
    const location = item.data?.Location;

    // Check if original slot is still free
    if (location) {
      const slotSnap = await window.fbDB.ref(`${LABS_PATH}/${location}/status`).once('value');
      const status   = slotSnap.exists() ? slotSnap.val() : 'empty';

      if (status === 'occupied') {
        // Slot taken — open manual placement
        showToast(`Sample #${id}'s original slot is occupied. Please choose a new location.`, 'warn');
        _openRestorePlacement(id, item);
        return;
      }
    }

    // Slot free — restore directly
    await _commitRestore(id, item, location);
  }

  async function _commitRestore(id, item, newLocation) {
    try {
      const updates = {};
      const sampleData = { ...item.data };
      if (newLocation) sampleData.Location = newLocation;

      updates[`${INV_PATH}/${id}`]  = sampleData;
      updates[`${TRASH_PATH}/${id}`] = null;
      if (newLocation) updates[`${LABS_PATH}/${newLocation}/status`] = 'occupied';

      await window.fbDB.ref('/').update(updates);
      showToast(`Sample #${id} restored!`, 'success');
    } catch (err) {
      showToast(`Restore failed: ${err.message}`, 'error');
    }
  }

  // ── Restore placement tree (slot conflict) ────────────
  let _restoreId       = null;
  let _restoreItemData = null;
  let _restorePath     = [];
  let _restoreLabs     = {};

  async function _openRestorePlacement(id, item) {
    _restoreId       = id;
    _restoreItemData = item;
    _restorePath = [];

    const snap  = await window.fbDB.ref(LABS_PATH).once('value');
    _restoreLabs = snap.exists() ? snap.val() : {};

    document.getElementById('trash-restore-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'trash-restore-overlay';
    overlay.innerHTML = `
      <div class="inv-sample-modal">
        <div class="inv-sample-header">
          <div class="inv-sample-icon"><i class="fas fa-map-marker-alt"></i></div>
          <div>
            <h3 class="inv-sample-title">Choose New Location</h3>
            <p class="inv-sample-sub">Original slot for Sample #${id} is occupied</p>
          </div>
          <button class="as-close" onclick="document.getElementById('trash-restore-overlay').remove()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="inv-sample-body" id="trash-restore-body"></div>
        <div class="inv-sample-footer">
          <button class="as-btn cancel"
                  onclick="document.getElementById('trash-restore-overlay').remove()">
            Cancel
          </button>
        </div>
      </div>`;

    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
    _renderRestoreTree();
  }

  function _renderRestoreTree() {
    const body = document.getElementById('trash-restore-body');
    if (!body) return;
    const SKIP    = ['createdAt', 'spots', 'status'];
    const natSort = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    const crumbs  = ['Home', ..._restorePath];

    let node = _restoreLabs;
    for (const k of _restorePath) node = node[k];

    const keys   = Object.keys(node || {}).filter(k => !SKIP.includes(k)).sort(natSort);
    const isLeaf = keys.length > 0 && keys.every(k => {
      const c = node[k];
      return c && typeof c === 'object' && 'status' in c &&
             Object.keys(c).filter(x => !SKIP.includes(x)).length === 0;
    });

    body.innerHTML = `
      <div class="as-manual">
        <div class="as-breadcrumb">
          ${crumbs.map((c, i) => `
            <button class="as-crumb ${i === crumbs.length-1 ? 'active' : ''}"
                    onclick="TrashCan._restoreNavTo(${i})">${c}</button>
            ${i < crumbs.length-1 ? '<i class="fas fa-chevron-right as-crumb-sep"></i>' : ''}
          `).join('')}
        </div>
        <div class="as-tree-grid ${isLeaf ? 'leaf-grid' : ''}">
          ${keys.map(key => {
            const child = node[key];
            if (isLeaf) {
              const occ = child?.status === 'occupied';
              const emp = child?.status === 'empty';
              return `<button class="as-slot-btn ${occ ? 'occupied' : 'empty'}"
                              ${emp ? `onclick="TrashCan._restoreSelectSlot('${key}')"` : 'disabled'}>
                <span class="as-slot-name">${key}</span>
                <span class="as-slot-status">${occ ? 'Occupied' : 'Empty'}</span>
              </button>`;
            }
            return `<button class="as-node-btn" onclick="TrashCan._restoreNavInto('${key}')">
              <i class="fas fa-folder"></i><span>${key}</span><i class="fas fa-chevron-right"></i>
            </button>`;
          }).join('')}
        </div>
      </div>`;
  }

  function _restoreNavInto(key) { _restorePath.push(key); _renderRestoreTree(); }
  function _restoreNavTo(idx)   {
    _restorePath = idx === 0 ? [] : _restorePath.slice(0, idx);
    _renderRestoreTree();
  }
  async function _restoreSelectSlot(name) {
    const newPath = [..._restorePath, name].join('/');
    document.getElementById('trash-restore-overlay')?.remove();
    await _commitRestore(_restoreId, _restoreItemData, newPath);
  }

  // ── Delete one permanently ────────────────────────────
  async function deleteOne(id) {
    const confirmed = await _confirmDialog(
      'Delete Permanently?',
      `Sample #${id} will be gone forever. This cannot be undone.`,
      'Delete Forever',
      'danger'
    );
    if (!confirmed) return;
    try {
      await window.fbDB.ref(`${TRASH_PATH}/${id}`).remove();
      showToast(`Sample #${id} permanently deleted.`, 'success');
    } catch (err) {
      showToast(`Delete failed: ${err.message}`, 'error');
    }
  }

  // ── Delete selected permanently ───────────────────────
  async function deleteSelected() {
    if (!_selected.size) { showToast('No samples selected.', 'warn'); return; }
    const count = _selected.size;
    const confirmed = await _confirmDialog(
      `Delete ${count} Sample${count > 1 ? 's' : ''} Permanently?`,
      'These samples will be gone forever. This cannot be undone.',
      'Delete Forever',
      'danger'
    );
    if (!confirmed) return;
    try {
      const updates = {};
      _selected.forEach(id => { updates[`${TRASH_PATH}/${id}`] = null; });
      await window.fbDB.ref('/').update(updates);
      showToast(`${count} sample${count > 1 ? 's' : ''} permanently deleted.`, 'success');
      _selected.clear();
    } catch (err) {
      showToast(`Delete failed: ${err.message}`, 'error');
    }
  }

  // ── Empty trash ───────────────────────────────────────
  async function emptyTrash() {
    const count = Object.keys(_items).length;
    if (!count) { showToast('Trash is already empty.', 'info'); return; }

    const confirmed = await _confirmDialog(
      'Empty Entire Trash?',
      `This will permanently delete all ${count} sample${count > 1 ? 's' : ''} in the trash. This is irreversible and cannot be undone.`,
      'Empty Trash',
      'danger'
    );
    if (!confirmed) return;

    try {
      await window.fbDB.ref(TRASH_PATH).remove();
      showToast('Trash emptied.', 'success');
    } catch (err) {
      showToast(`Failed: ${err.message}`, 'error');
    }
  }

  // ── Confirm dialog ────────────────────────────────────
  function _confirmDialog(title, message, confirmLabel, type = 'danger') {
    return new Promise(resolve => {
      document.getElementById('trash-confirm-overlay')?.remove();
      const overlay = document.createElement('div');
      overlay.id = 'trash-confirm-overlay';
      overlay.innerHTML = `
        <div class="inv-confirm-modal">
          <div class="inv-confirm-icon">
            <i class="fas fa-exclamation-triangle"></i>
          </div>
          <h3 class="inv-confirm-title">${title}</h3>
          <p class="inv-confirm-msg">${message}</p>
          <div class="inv-confirm-btns">
            <button class="as-btn cancel"
                    onclick="document.getElementById('trash-confirm-overlay').remove(); window._trashConfirmResolve(false)">
              Cancel
            </button>
            <button class="inv-sample-delete-btn"
                    onclick="document.getElementById('trash-confirm-overlay').remove(); window._trashConfirmResolve(true)">
              <i class="fas fa-trash"></i> ${confirmLabel}
            </button>
          </div>
        </div>`;
      window._trashConfirmResolve = resolve;
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('show'));
    });
  }

  return {
    startListening, stopListening,
    onSearch, openDetail,
    restoreOne, restoreSelected,
    deleteOne, deleteSelected, emptyTrash,
    toggleSelect, toggleSelectAll,
    _restoreNavInto, _restoreNavTo, _restoreSelectSlot,
  };

})();

window.TrashCan = TrashCan;
