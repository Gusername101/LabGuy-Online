/* ============================================================
   inventory.js — Inventory table widget
   LabGuy Application

   - Reads /Inventory, /Metadata, /MetadataOrder from Firebase
   - Renders a scrollable table with all metadata columns
   - Search: general or per-field
   - Add Samples button → opens count picker → launches AddSample
   ============================================================ */

const Inventory = (() => {

  let _samples  = {};  // { id: {Location, ...fields} }
  let _fields   = [];  // [{key, label}] in display order
  let _filtered = [];  // current filtered rows
  let _searchTerm  = '';
  let _searchField = '__all__';
  let _invListener = null;

  // ── Start live listener ───────────────────────────────
  async function startListening() {
    await _loadFields();

    _invListener = window.fbDB.ref('Inventory').on('value', snap => {
      _samples = snap.exists() ? snap.val() : {};
      _applyFilter();
      _renderTable();
    });
  }

  function stopListening() {
    if (_invListener) {
      window.fbDB.ref('Inventory').off('value', _invListener);
      _invListener = null;
    }
  }

  // ── Load metadata field definitions ───────────────────
  async function _loadFields() {
    const [metaSnap, orderSnap] = await Promise.all([
      window.fbDB.ref('Metadata').once('value'),
      window.fbDB.ref('MetadataOrder').once('value'),
    ]);

    const metaVal  = metaSnap.exists()  ? metaSnap.val()  : {};
    const orderVal = orderSnap.exists() ? orderSnap.val() : [];

    const all = Object.entries(metaVal).map(([key, label]) => ({ key, label }));

    if (Array.isArray(orderVal) && orderVal.length) {
      const ordered = orderVal.map(k => all.find(f => f.key === k)).filter(Boolean);
      const rest    = all.filter(f => !orderVal.includes(f.key));
      _fields = [...ordered, ...rest];
    } else {
      _fields = all.sort((a, b) => a.label.localeCompare(b.label));
    }
  }

  // ── Find widget container ─────────────────────────────
  function _getContainer() {
    return document.querySelector('.inv-widget-wrap');
  }

  // ── Render the full widget ────────────────────────────
  function renderWidget(slot) {
    const wrap = document.createElement('div');
    wrap.className = 'inv-widget-wrap';
    wrap.innerHTML = `
        <div class="inv-toolbar">
          <div class="inv-search-wrap">
            <i class="fas fa-search inv-search-icon"></i>
            <input class="inv-search" id="inv-search-input" placeholder="Search inventory…"
                   oninput="Inventory.onSearch(this.value)"/>
          </div>
          <select class="inv-filter-select" id="inv-filter-select"
                  onchange="Inventory.onFilterField(this.value)">
            <option value="__all__">All Fields</option>
          </select>
          <button class="inv-add-btn" onclick="Inventory.openAddSamples()">
            <i class="fas fa-plus"></i> Add Samples
          </button>
          <button class="inv-menu-btn" onclick="Inventory.openMenu(this)" title="More options">
            <i class="fas fa-ellipsis-v"></i>
          </button>
        </div>
        <div class="inv-table-wrap" id="inv-table-wrap">
          <table class="inv-table" id="inv-table">
            <thead id="inv-thead"></thead>
            <tbody id="inv-tbody"></tbody>
          </table>
        </div>
        <div class="inv-footer" id="inv-footer">Loading…</div>`;
    slot.appendChild(wrap);
    startListening().then(() => {
      _buildFilterOptions();
    });
  }

  // ── Build filter dropdown options ─────────────────────
  function _buildFilterOptions() {
    const sel = document.getElementById('inv-filter-select');
    if (!sel) return;
    sel.innerHTML = `<option value="__all__">All Fields</option>
      <option value="Location">Location</option>
      ${_fields.map(f => `<option value="${f.key}">${f.label}</option>`).join('')}`;
  }

  // ── Apply search filter ───────────────────────────────
  function _applyFilter() {
    const term = _searchTerm.toLowerCase().trim();
    const rows = Object.entries(_samples).map(([id, data]) => ({ id, ...data }));

    if (!term) {
      _filtered = rows;
      return;
    }

    _filtered = rows.filter(row => {
      if (_searchField === '__all__') {
        return Object.values(row).some(v =>
          String(v ?? '').toLowerCase().includes(term)
        );
      }
      return String(row[_searchField] ?? '').toLowerCase().includes(term);
    });
  }

  // ── Render table ──────────────────────────────────────
  function _renderTable() {
    const thead  = document.getElementById('inv-thead');
    const tbody  = document.getElementById('inv-tbody');
    const footer = document.getElementById('inv-footer');
    if (!thead || !tbody) return;

    // Header
    thead.innerHTML = `<tr>
      <th class="inv-th inv-th-id">#</th>
      ${_fields.map(f => `<th class="inv-th">${f.label}</th>`).join('')}
    </tr>`;

    // Body
    if (!_filtered.length) {
      const cols = _fields.length + 2;
      tbody.innerHTML = `<tr><td colspan="${cols}" class="inv-empty">
        ${_searchTerm ? '<i class="fas fa-search"></i> No results found' : '<i class="fas fa-box-open"></i> No samples in inventory'}
      </td></tr>`;
    } else {
      tbody.innerHTML = _filtered.map(row => `
        <tr class="inv-row" data-id="${row.id}" onclick="Inventory.openSample('${row.id}')">
          <td class="inv-td inv-td-id">${row.id}</td>
          ${_fields.map(f => `<td class="inv-td">${row[f.key] ?? '—'}</td>`).join('')}
        </tr>`).join('');
    }

    // Footer
    const total = Object.keys(_samples).length;
    if (footer) footer.textContent =
      `${_filtered.length} of ${total} sample${total !== 1 ? 's' : ''}`;
  }

  // ── Search handlers ───────────────────────────────────
  function onSearch(val) {
    _searchTerm = val;
    _applyFilter();
    _renderTable();
  }

  function onFilterField(val) {
    _searchField = val;
    _applyFilter();
    _renderTable();
  }

  // ── Add Samples picker ────────────────────────────────
  function openAddSamples() {
    document.getElementById('inv-add-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'inv-add-overlay';
    overlay.innerHTML = `
      <div class="inv-add-modal">
        <div class="inv-add-header">
          <div class="inv-add-icon"><i class="fas fa-plus"></i></div>
          <div>
            <h3 class="inv-add-title">Add Samples</h3>
            <p class="inv-add-sub">How many samples are you adding?</p>
          </div>
          <button class="lc-close" onclick="document.getElementById('inv-add-overlay').remove()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="inv-add-body">
          <div class="inv-count-row">
            <button class="inv-count-btn" onclick="Inventory._adjustCount(-1)">
              <i class="fas fa-minus"></i>
            </button>
            <input class="inv-count-input" id="inv-count-input" type="number"
                   min="1" max="100" value="1"
                   onchange="Inventory._clampCount(this)"/>
            <button class="inv-count-btn" onclick="Inventory._adjustCount(1)">
              <i class="fas fa-plus"></i>
            </button>
          </div>
          <p class="inv-add-hint">Enter between 1 and 100 samples.</p>
        </div>
        <div class="inv-add-footer">
          <button class="inv-cancel-btn"
                  onclick="document.getElementById('inv-add-overlay').remove()">
            Cancel
          </button>
          <button class="inv-confirm-btn" onclick="Inventory._confirmAddSamples()">
            <i class="fas fa-arrow-right"></i> Continue
          </button>
        </div>
      </div>`;

    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
  }

  function _adjustCount(delta) {
    const input = document.getElementById('inv-count-input');
    if (!input) return;
    const val = Math.min(100, Math.max(1, (parseInt(input.value) || 1) + delta));
    input.value = val;
  }

  function _clampCount(input) {
    input.value = Math.min(100, Math.max(1, parseInt(input.value) || 1));
  }

  function _confirmAddSamples() {
    const count = parseInt(document.getElementById('inv-count-input')?.value) || 1;
    document.getElementById('inv-add-overlay')?.remove();
    // Hand off to AddSample with count
    BulkAdd.open(count);
  }


  // ══════════════════════════════════════════════════════
  // SAMPLE DETAIL MODAL
  // ══════════════════════════════════════════════════════
  function openSample(id) {
    document.getElementById('inv-sample-overlay')?.remove();
    const sample = _samples[id];
    if (!sample) return;

    const overlay = document.createElement('div');
    overlay.id = 'inv-sample-overlay';
    overlay.innerHTML = `
      <div class="inv-sample-modal">
        <div class="inv-sample-header">
          <div class="inv-sample-icon"><i class="fas fa-vial"></i></div>
          <div>
            <h3 class="inv-sample-title">Sample #${id}</h3>
            <p class="inv-sample-sub">View and edit sample details</p>
          </div>
          <button class="as-close" onclick="Inventory.closeSample()">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="inv-sample-body" id="inv-sample-body">
          <div class="inv-sample-fields" id="inv-sample-fields">
            ${_fields.map(f => `
              <div class="inv-sf-row">
                <label class="inv-sf-label">${f.label}</label>
                <input class="inv-sf-input" data-key="${f.key}"
                       value="${(sample[f.key] || '').replace(/"/g, '&quot;')}"
                       placeholder="—"/>
              </div>`).join('')}
          </div>
        </div>

        <div class="inv-sample-footer">
          <button class="inv-sample-delete-btn" onclick="Inventory.deleteSample('${id}')">
            <i class="fas fa-trash"></i> Delete
          </button>
          <button class="inv-sample-move-btn" onclick="Inventory.moveSample('${id}')">
            <i class="fas fa-map-marker-alt"></i> Move
          </button>
          <div style="flex:1"></div>
          <button class="as-btn cancel" onclick="Inventory.closeSample()">Cancel</button>
          <button class="as-btn primary" onclick="Inventory.saveSample('${id}')">
            <i class="fas fa-check"></i> Save Changes
          </button>
        </div>
      </div>`;

    overlay.addEventListener('click', e => { if (e.target === overlay) Inventory.closeSample(); });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
  }

  function closeSample() {
    const overlay = document.getElementById('inv-sample-overlay');
    if (!overlay) return;
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 250);
  }

  // ── Save edits ────────────────────────────────────────
  async function saveSample(id) {
    const sample = _samples[id];
    if (!sample) return;

    const updates = {};
    const sanitize = k => k.replace(/[.#$\/\[\]]/g, '_').trim();

    document.querySelectorAll('#inv-sample-fields .inv-sf-input').forEach(input => {
      updates[`Inventory/${id}/${sanitize(input.dataset.key)}`] = input.value;
    });

    try {
      await window.fbDB.ref('/').update(updates);

      // Audit log
      const user = App.currentUser;
      await window.fbDB.ref('audit_logs').push({
        action:    'edit_sample',
        sampleId:  id,
        uid:       user?.uid  || 'unknown',
        name:      user?.full_name || user?.email || 'Unknown',
        timestamp: Date.now(),
        note:      `Sample #${id} was edited`,
      });

      showToast(`Sample #${id} saved!`, 'success');
      closeSample();
    } catch (err) {
      showToast(`Save failed: ${err.message}`, 'error');
    }
  }

  // ── Delete sample ─────────────────────────────────────
  async function deleteSample(id) {
    const sample = _samples[id];
    if (!sample) return;

    // Confirm dialog
    const confirmed = await _confirm(
      `Delete Sample #${id}?`,
      'This cannot be undone. The storage slot will be freed.'
    );
    if (!confirmed) return;

    try {
      const user = App.currentUser;
      const updates = {};

      // Soft delete — move to /Trash
      updates[`Trash/${id}`] = {
        data:          { ...sample },
        deletedByName: user?.full_name || user?.email || 'Unknown',
        deletedBy:     user?.uid || 'unknown',
        deletedAt:     Date.now(),
      };
      updates[`Inventory/${id}`] = null;

      // Free up the storage slot
      if (sample.Location) {
        updates[`Labs/${sample.Location}/status`] = 'empty';
      }

      await window.fbDB.ref('/').update(updates);

      // Audit log
      await window.fbDB.ref('audit_logs').push({
        action:    'delete_sample',
        sampleId:  id,
        uid:       user?.uid || 'unknown',
        name:      user?.full_name || user?.email || 'Unknown',
        timestamp: Date.now(),
        note:      `Sample #${id} was deleted`,
      });

      showToast(`Sample #${id} moved to Trash.`, 'success');
      closeSample();
    } catch (err) {
      showToast(`Delete failed: ${err.message}`, 'error');
    }
  }

  // ── Move sample ───────────────────────────────────────
  let _moveId   = null;
  let _movePath = [];
  let _moveLabs = {};

  async function moveSample(id) {
    _moveId   = id;
    _movePath = [];

    const snap = await window.fbDB.ref('Labs').once('value');
    _moveLabs  = snap.exists() ? snap.val() : {};

    // Replace modal body with placement tree
    const body = document.getElementById('inv-sample-body');
    if (!body) return;

    // Update header
    document.querySelector('.inv-sample-sub').textContent = `Choose new location for Sample #${id}`;

    // Hide save, show confirm move button
    document.querySelector('.inv-sample-footer').innerHTML = `
      <button class="as-btn cancel" onclick="Inventory._cancelMove('${id}')">
        <i class="fas fa-arrow-left"></i> Back
      </button>
      <div style="flex:1"></div>
      <button class="as-btn cancel" onclick="Inventory.closeSample()">Cancel</button>`;

    _renderMoveTree();
  }

  function _renderMoveTree() {
    const body = document.getElementById('inv-sample-body');
    if (!body) return;
    const SKIP = ['createdAt', 'spots', 'status'];
    const natSort = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    const crumbs = ['Home', ..._movePath];

    // Current location of the sample being moved (e.g. "BD/Shelves1/Cell3")
    const currentLocation = _samples[_moveId]?.Location || '';
    const currentSlotName = currentLocation.split('/').pop();

    let currentNode = _moveLabs;
    for (const key of _movePath) currentNode = currentNode[key];

    const keys   = Object.keys(currentNode || {}).filter(k => !SKIP.includes(k)).sort(natSort);
    const isLeaf = keys.length > 0 && keys.every(k => {
      const c = currentNode[k];
      return c && typeof c === 'object' && 'status' in c &&
             Object.keys(c).filter(x => !SKIP.includes(x)).length === 0;
    });

    body.innerHTML = `
      <div class="as-manual">
        <div class="as-breadcrumb">
          ${crumbs.map((c, i) => `
            <button class="as-crumb ${i === crumbs.length-1 ? 'active' : ''}"
                    onclick="Inventory._moveNavTo(${i})">${c}</button>
            ${i < crumbs.length-1 ? '<i class="fas fa-chevron-right as-crumb-sep"></i>' : ''}
          `).join('')}
        </div>
        <div class="as-tree-grid ${isLeaf ? 'leaf-grid' : ''}">
          ${keys.map(key => {
            const child = currentNode[key];
            if (isLeaf) {
              const isCurrent = key === currentSlotName &&
                                currentLocation.startsWith([..._movePath, key].join('/'));
              const occ = child?.status === 'occupied';
              const emp = child?.status === 'empty';
              return `<button class="as-slot-btn ${isCurrent ? 'current-slot' : occ ? 'occupied' : 'empty'}"
                              ${emp ? `onclick="Inventory._selectMoveSlot('${key}')"` : 'disabled'}>
                <span class="as-slot-name">${key}</span>
                <span class="as-slot-status">${isCurrent ? 'Current Location' : occ ? 'Occupied' : 'Empty'}</span>
              </button>`;
            }
            return `<button class="as-node-btn" onclick="Inventory._moveNavInto('${key}')">
              <i class="fas fa-folder"></i><span>${key}</span><i class="fas fa-chevron-right"></i>
            </button>`;
          }).join('')}
        </div>
      </div>`;
  }

  function _moveNavInto(key) { _movePath.push(key); _renderMoveTree(); }
  function _moveNavTo(idx)   { _movePath = idx === 0 ? [] : _movePath.slice(0, idx); _renderMoveTree(); }

  async function _selectMoveSlot(positionName) {
    const newPath = [..._movePath, positionName].join('/');
    const id      = _moveId;
    const sample  = _samples[id];
    const oldPath = sample?.Location;

    try {
      const updates = {};
      updates[`Inventory/${id}/Location`]     = newPath;
      if (oldPath) updates[`Labs/${oldPath}/status`] = 'empty';
      updates[`Labs/${newPath}/status`]        = 'occupied';

      await window.fbDB.ref('/').update(updates);

      // Audit log
      const user = App.currentUser;
      await window.fbDB.ref('audit_logs').push({
        action:    'move_sample',
        sampleId:  id,
        uid:       user?.uid || 'unknown',
        name:      user?.full_name || user?.email || 'Unknown',
        timestamp: Date.now(),
        note:      `Sample #${id} moved to ${newPath}`,
      });

      showToast(`Sample #${id} moved to ${positionName}!`, 'success');
      closeSample();
    } catch (err) {
      showToast(`Move failed: ${err.message}`, 'error');
    }
  }

  function _cancelMove(id) {
    // Restore original detail view
    openSample(id);
  }

  // ── Simple confirm dialog ─────────────────────────────
  function _confirm(title, message) {
    return new Promise(resolve => {
      document.getElementById('inv-confirm-overlay')?.remove();
      const overlay = document.createElement('div');
      overlay.id = 'inv-confirm-overlay';
      overlay.innerHTML = `
        <div class="inv-confirm-modal">
          <div class="inv-confirm-icon"><i class="fas fa-exclamation-triangle"></i></div>
          <h3 class="inv-confirm-title">${title}</h3>
          <p class="inv-confirm-msg">${message}</p>
          <div class="inv-confirm-btns">
            <button class="as-btn cancel" onclick="document.getElementById('inv-confirm-overlay').remove(); window._invConfirmResolve(false)">
              Cancel
            </button>
            <button class="inv-sample-delete-btn" onclick="document.getElementById('inv-confirm-overlay').remove(); window._invConfirmResolve(true)">
              <i class="fas fa-trash"></i> Delete
            </button>
          </div>
        </div>`;
      window._invConfirmResolve = resolve;
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('show'));
    });
  }

  // ── More options menu ─────────────────────────────────
  function openMenu(btn) {
    showToast('More options — coming soon', 'info');
  }

  // ── Refresh fields (call after metadata changes) ──────
  async function refreshFields() {
    await _loadFields();
    _buildFilterOptions();
    _renderTable();
  }

  return {
    renderWidget, startListening, stopListening,
    onSearch, onFilterField,
    openAddSamples, _adjustCount, _clampCount, _confirmAddSamples,
    openMenu, refreshFields,
    openSample, closeSample, saveSample, deleteSample,
    moveSample, _moveNavInto, _moveNavTo, _selectMoveSlot, _cancelMove,
  };

})();

window.Inventory = Inventory;
