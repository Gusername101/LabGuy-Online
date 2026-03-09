/* ============================================================
   bulk-add.js — Mass sample upload (Inventory widget)
   LabGuy Application

   Separate from AddSample (quick single-sample widget).
   Flow:
   1. Spreadsheet editor — all samples at once, auto-populate aware
   2. Placement — Auto or Manual per sample
   3. Confirm & Save all
   ============================================================ */

const BulkAdd = (() => {

  const META_PATH  = 'Metadata';
  const ORDER_PATH = 'MetadataOrder';
  const INV_PATH   = 'Inventory';
  const LABS_PATH  = 'Labs';

  // Natural sort: "Cell2" < "Cell10" < "Cell11"
  const _natSort = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  const _sortedKeys = (obj, skip = []) => Object.keys(obj).filter(k => !skip.includes(k)).sort(_natSort);

  let _fields        = [];
  let _startId       = null;
  let _labs          = {};
  let _count         = 1;
  let _rows          = [];
  let _placements    = [];
  let _currentSample = 0;
  let _step          = 1;
  let _autoPopulate  = false;

  // ── Open ──────────────────────────────────────────────
  async function open(count = 1) {
    document.getElementById('bulkadd-overlay')?.remove();

    _count         = count;
    _rows          = Array.from({ length: count }, () => ({}));
    _placements    = [];
    _currentSample = 0;
    _step          = 1;

    const [metaSnap, orderSnap, labsSnap, apSnap] = await Promise.all([
      window.fbDB.ref(META_PATH).once('value'),
      window.fbDB.ref(ORDER_PATH).once('value'),
      window.fbDB.ref(LABS_PATH).once('value'),
      window.fbDB.ref(`users/${App.currentUser?.uid}/settings/auto_populate`).once('value'),
    ]);

    const metaVal   = metaSnap.exists() ? metaSnap.val() : {};
    const allFields = Object.entries(metaVal).map(([key, label]) => ({
      key, label: typeof label === 'string' ? label : key
    }));
    if (orderSnap.exists()) {
      const order   = orderSnap.val();
      const ordered = order.map(k => allFields.find(f => f.key === k)).filter(Boolean);
      allFields.forEach(f => { if (!ordered.find(o => o.key === f.key)) ordered.push(f); });
      _fields = ordered;
    } else {
      _fields = allFields;
    }

    _labs         = labsSnap.exists() ? labsSnap.val() : {};
    _autoPopulate = apSnap.exists() ? apSnap.val() : false;

    // Guard — no labs created yet
    if (!Object.keys(_labs).length) {
      showToast('No labs have been created yet. Ask an Admin to set up a lab first.', 'warn');
      return;
    }

    _buildModal();
    _renderStep();
  }

  // ── Modal shell ───────────────────────────────────────
  function _buildModal() {
    const overlay = document.createElement('div');
    overlay.id = 'bulkadd-overlay';
    overlay.innerHTML = `
      <div class="as-modal as-modal-wide">
        <div class="as-header">
          <div class="as-icon"><i class="fas fa-table"></i></div>
          <div>
            <h3 id="ba-title">Add Samples</h3>
            <p class="as-subtitle" id="ba-subtitle"></p>
          </div>
          <button class="as-close" onclick="BulkAdd.close()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="as-steps">
          <div class="as-step" id="ba-step-1">
            <div class="as-step-dot">1</div>
            <span>Details</span>
          </div>
          <div class="as-step-line"></div>
          <div class="as-step" id="ba-step-2">
            <div class="as-step-dot">2</div>
            <span>Location</span>
          </div>
          <div class="as-step-line"></div>
          <div class="as-step" id="ba-step-3">
            <div class="as-step-dot">3</div>
            <span>Confirm</span>
          </div>
        </div>
        <div class="as-body" id="ba-body"></div>
        <div class="as-footer">
          <button class="as-btn secondary" id="ba-back-btn" onclick="BulkAdd.back()" style="display:none">
            <i class="fas fa-arrow-left"></i> Back
          </button>
          <div style="flex:1"></div>
          <button class="as-btn cancel" onclick="BulkAdd.close()">Cancel</button>
          <button class="as-btn primary" id="ba-next-btn" onclick="BulkAdd.next()">
            Next <i class="fas fa-arrow-right"></i>
          </button>
        </div>
      </div>`;

    overlay.addEventListener('click', e => { if (e.target === overlay) BulkAdd.close(); });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
  }

  // ── Render step ───────────────────────────────────────
  function _renderStep() {
    [1,2,3].forEach(i => {
      const el = document.getElementById(`ba-step-${i}`);
      if (!el) return;
      el.classList.toggle('active',    i === _step);
      el.classList.toggle('completed', i < _step);
    });

    const backBtn = document.getElementById('ba-back-btn');
    const nextBtn = document.getElementById('ba-next-btn');
    if (backBtn) backBtn.style.display = _step > 1 ? '' : 'none';
    if (nextBtn) nextBtn.style.display = '';

    if (_step === 1) {
      document.getElementById('ba-title').textContent    = `Add ${_count} Sample${_count > 1 ? 's' : ''}`;
      document.getElementById('ba-subtitle').textContent =
        `${_count} samples · ${_autoPopulate ? '✦ Auto-populate on' : 'Auto-populate off'}`;
      nextBtn.innerHTML = 'Next <i class="fas fa-arrow-right"></i>';
      _renderSpreadsheet();

    } else if (_step === 2) {
      document.getElementById('ba-title').textContent    = 'Choose Location';
      document.getElementById('ba-subtitle').textContent = `Sample ${_currentSample + 1} of ${_count}`;
      nextBtn.innerHTML = 'Next <i class="fas fa-arrow-right"></i>';
      nextBtn.style.display = 'none';
      _renderPlacement();

    } else if (_step === 3) {
      document.getElementById('ba-title').textContent    = 'Confirm';
      document.getElementById('ba-subtitle').textContent = `Review ${_count} samples before saving`;
      nextBtn.innerHTML = `<i class="fas fa-check"></i> Save ${_count} Sample${_count > 1 ? 's' : ''}`;
      _renderConfirm();
    }
  }

  // ══════════════════════════════════════════════════════
  // STEP 1 — SPREADSHEET
  // ══════════════════════════════════════════════════════
  function _renderSpreadsheet() {
    const body = document.getElementById('ba-body');
    if (!_fields.length) {
      body.innerHTML = `<div class="as-empty">
        <i class="fas fa-database"></i>
        <p>No metadata fields defined yet.<br>Ask an Admin to add fields first.</p>
      </div>`;
      return;
    }

    body.innerHTML = `
      <div class="as-sheet-wrap">
        <table class="as-sheet" id="ba-sheet">
          <thead>
            <tr>
              <th class="as-sh-num">#</th>
              ${_fields.map(f => `<th class="as-sh-th" title="${f.label}">${f.label}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${_rows.map((row, i) => _buildRow(i, row)).join('')}
          </tbody>
        </table>
      </div>
      ${_autoPopulate ? `<div class="as-ap-banner">
        <i class="fas fa-magic"></i>
        Auto-populate is on — Tab to the next row and it copies the row above. Change only what differs.
      </div>` : ''}`;
  }

  function _buildRow(rowIdx, data) {
    return `<tr class="as-sh-row" data-row="${rowIdx}">
      <td class="as-sh-num">${rowIdx + 1}</td>
      ${_fields.map(f => `
        <td class="as-sh-cell">
          <input class="as-sh-input"
                 data-row="${rowIdx}" data-key="${f.key}"
                 value="${(data[f.key] || '').replace(/"/g, '&quot;')}"
                 placeholder="—"
                 oninput="BulkAdd._onCellInput(this)"
                 onfocus="BulkAdd._onCellFocus(this)"
                 onkeydown="BulkAdd._onCellKey(event, this)"/>
        </td>`).join('')}
    </tr>`;
  }

  function _onCellInput(input) {
    _rows[parseInt(input.dataset.row)][input.dataset.key] = input.value;
  }

  function _onCellFocus(input) {
    document.querySelectorAll('#ba-sheet .as-sh-row').forEach(r => r.classList.remove('focused'));
    input.closest('.as-sh-row')?.classList.add('focused');
  }

  function _onCellKey(e, input) {
    const row    = parseInt(input.dataset.row);
    const key    = input.dataset.key;
    const colIdx = _fields.findIndex(f => f.key === key);

    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      if (colIdx + 1 < _fields.length) {
        _focusCell(row, colIdx + 1);
      } else if (row + 1 < _count) {
        if (_autoPopulate) _populateFromPrev(row + 1);
        _focusCell(row + 1, 0);
      }
    }
    if (e.key === 'ArrowDown' && row + 1 < _count) {
      e.preventDefault();
      if (_autoPopulate) _populateFromPrev(row + 1);
      _focusCell(row + 1, colIdx);
    }
    if (e.key === 'ArrowUp' && row > 0) {
      e.preventDefault();
      _focusCell(row - 1, colIdx);
    }
  }

  function _focusCell(row, colIdx) {
    const input = document.querySelector(
      `#ba-sheet .as-sh-input[data-row="${row}"][data-key="${_fields[colIdx]?.key}"]`
    );
    if (input) {
      input.value = _rows[row][_fields[colIdx].key] || '';
      input.focus();
      input.select();
    }
  }

  function _populateFromPrev(rowIdx) {
    if (rowIdx === 0) return;
    const prev = _rows[rowIdx - 1];
    _fields.forEach(f => {
      if (!_rows[rowIdx][f.key]) _rows[rowIdx][f.key] = prev[f.key] || '';
    });
    _fields.forEach(f => {
      const input = document.querySelector(
        `#ba-sheet .as-sh-input[data-row="${rowIdx}"][data-key="${f.key}"]`
      );
      if (input && !input.value) input.value = _rows[rowIdx][f.key] || '';
    });
  }

  // ══════════════════════════════════════════════════════
  // STEP 2 — PLACEMENT
  // ══════════════════════════════════════════════════════
  function _renderPlacement() {
    const body = document.getElementById('ba-body');
    body.innerHTML = `
      <div class="as-placement">
        <div class="as-sample-counter">
          <span class="as-sample-counter-label" style="font-size:11px;margin-right:4px">Placing</span>
          <span class="as-sample-counter-num">${_currentSample + 1}</span>
          <span class="as-sample-counter-sep">/</span>
          <span class="as-sample-counter-total">${_count}</span>
        </div>
        <div class="as-placement-options">
          <button class="as-place-btn" onclick="BulkAdd.chooseAuto()">
            <i class="fas fa-magic"></i>
            <span class="as-place-title">Auto Place</span>
            <span class="as-place-desc">System finds the next available empty slot</span>
          </button>
          <button class="as-place-btn" onclick="BulkAdd.chooseManual()">
            <i class="fas fa-hand-pointer"></i>
            <span class="as-place-title">Manual Place</span>
            <span class="as-place-desc">Navigate the storage tree and pick a spot</span>
          </button>
        </div>
        <div id="ba-placement-content"></div>
      </div>`;
  }

  async function chooseAuto() {
    const labNames = Object.keys(_labs);
    if (labNames.length > 1) {
      document.getElementById('ba-placement-content').innerHTML = `
        <div class="as-lab-picker">
          <p class="as-lab-picker-label">Which lab?</p>
          <div class="as-lab-grid">
            ${labNames.map(n => `
              <button class="as-lab-chip" onclick="BulkAdd.autoInLab('${n}')">
                <i class="fas fa-snowflake"></i> ${n}
              </button>`).join('')}
          </div>
        </div>`;
    } else if (labNames.length === 1) {
      await autoInLab(labNames[0]);
    } else {
      showToast('No labs found.', 'warn');
    }
  }

  async function autoInLab(labName) {
    // Only fetch fresh from Firebase on first sample, then use local cache
    // so already-claimed slots aren't found again
    if (_currentSample === 0) {
      const snap = await window.fbDB.ref(LABS_PATH).once('value');
      _labs = snap.exists() ? snap.val() : {};
    }
    const found = _findNextEmpty(_labs[labName], labName);
    if (!found) { showToast(`No empty slots in ${labName}!`, 'warn'); return; }

    // Mark slot as occupied in local cache immediately so next sample skips it
    _setNestedValue(_labs, found.path, 'occupied');

    _placements[_currentSample] = found;
    _showResult(found.path);
  }

  // Set a nested path value in _labs cache using slash-separated path
  function _setNestedValue(obj, path, value) {
    const parts = path.split('/');
    let node = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]]) return;
      node = node[parts[i]];
    }
    const last = parts[parts.length - 1];
    if (node[last] && typeof node[last] === 'object') {
      node[last].status = value;
    }
  }

  function _showResult(path) {
    document.getElementById('ba-placement-content').innerHTML = `
      <div class="as-auto-result">
        <i class="fas fa-check-circle" style="color:var(--accent-green);font-size:22px"></i>
        <div>
          <p class="as-auto-label">Location selected:</p>
          <p class="as-auto-path">${path}</p>
        </div>
      </div>`;
    document.getElementById('ba-next-btn').style.display = '';
    if (_currentSample + 1 < _count) {
      setTimeout(() => { _currentSample++; _renderStep(); }, 700);
    } else {
      setTimeout(() => { _step = 3; _renderStep(); }, 500);
    }
  }

  function _findNextEmpty(node, pathSoFar) {
    if (!node || typeof node !== 'object') return null;
    const SKIP = ['createdAt', 'spots'];
    for (const key of _sortedKeys(node, SKIP)) {
      const child    = node[key];
      const fullPath = `${pathSoFar}/${key}`;
      if (child?.status === 'empty') return { labName: pathSoFar.split('/')[0], path: fullPath, positionName: key };
      if (typeof child === 'object' && child.status !== 'occupied') {
        const found = _findNextEmpty(child, fullPath);
        if (found) return found;
      }
    }
    return null;
  }

  let _manualPath = [];
  function chooseManual() { _manualPath = []; _renderTree(); }

  function _renderTree() {
    const content = document.getElementById('ba-placement-content');
    const SKIP    = ['createdAt', 'spots', 'status'];
    const crumbs  = ['Home', ..._manualPath];

    content.innerHTML = `
      <div class="as-manual">
        <div class="as-breadcrumb">
          ${crumbs.map((c, i) => `
            <button class="as-crumb ${i === crumbs.length-1 ? 'active' : ''}"
                    onclick="BulkAdd.navTo(${i})">${c}</button>
            ${i < crumbs.length-1 ? '<i class="fas fa-chevron-right as-crumb-sep"></i>' : ''}
          `).join('')}
        </div>
        <div class="as-tree-grid ${_isLeafLevel() ? 'leaf-grid' : ''}">
          ${_getTreeButtons()}
        </div>
      </div>`;
  }

  function _currentNode() {
    let n = _labs;
    for (const k of _manualPath) n = n[k];
    return n;
  }

  function _isLeafLevel() {
    const SKIP = ['createdAt', 'spots', 'status'];
    const node = _currentNode();
    const keys = _sortedKeys(node || {}, SKIP);
    return keys.length > 0 && keys.every(k => {
      const c = node[k];
      return c && typeof c === 'object' && 'status' in c &&
             Object.keys(c).filter(x => !SKIP.includes(x)).length === 0;
    });
  }

  function _getTreeButtons() {
    const SKIP = ['createdAt', 'spots', 'status'];
    const node = _currentNode();
    const keys = _sortedKeys(node || {}, SKIP);
    const leaf = _isLeafLevel();
    return keys.map(key => {
      const child = node[key];
      if (leaf) {
        const occ = child?.status === 'occupied';
        const emp = child?.status === 'empty';
        return `<button class="as-slot-btn ${occ ? 'occupied' : 'empty'}"
                        ${emp ? `onclick="BulkAdd.selectSlot('${key}')"` : 'disabled'}>
          <span class="as-slot-name">${key}</span>
          <span class="as-slot-status">${occ ? 'Occupied' : 'Empty'}</span>
        </button>`;
      }
      return `<button class="as-node-btn" onclick="BulkAdd.navInto('${key}')">
        <i class="fas fa-folder"></i><span>${key}</span><i class="fas fa-chevron-right"></i>
      </button>`;
    }).join('') || '<p class="as-empty-node">No items at this level.</p>';
  }

  function navInto(key) { _manualPath.push(key); _renderTree(); }
  function navTo(idx)   { _manualPath = idx === 0 ? [] : _manualPath.slice(0, idx); _renderTree(); }
  function selectSlot(name) {
    const path = [..._manualPath, name].join('/');
    _placements[_currentSample] = { labName: _manualPath[0], path, positionName: name };
    _setNestedValue(_labs, path, 'occupied');
    _showResult(path);
  }

  // ══════════════════════════════════════════════════════
  // STEP 3 — CONFIRM
  // ══════════════════════════════════════════════════════
  function _renderConfirm() {
    const body    = document.getElementById('ba-body');
    const placed  = _placements.filter(Boolean).length;
    const unplaced = _count - placed;

    body.innerHTML = `
      <div class="as-confirm-multi">
        <div class="as-confirm-summary">
          <div class="as-confirm-stat">
            <span class="as-confirm-stat-val">${_count}</span>
            <span class="as-confirm-stat-label">Total</span>
          </div>
          <div class="as-confirm-stat">
            <span class="as-confirm-stat-val" style="color:#2ecc71">${placed}</span>
            <span class="as-confirm-stat-label">Placed</span>
          </div>
          <div class="as-confirm-stat">
            <span class="as-confirm-stat-val" style="color:${unplaced > 0 ? '#e74c3c' : '#2ecc71'}">${unplaced}</span>
            <span class="as-confirm-stat-label">Unplaced</span>
          </div>
        </div>
        <div class="as-confirm-table-wrap">
          <table class="as-confirm-table">
            <thead><tr>
              <th>#</th>
              <th>Location</th>
              ${_fields.slice(0, 4).map(f => `<th>${f.label}</th>`).join('')}
              ${_fields.length > 4 ? `<th style="color:var(--text-muted)">+${_fields.length - 4} more</th>` : ''}
            </tr></thead>
            <tbody>
              ${_rows.map((row, i) => `
                <tr>
                  <td style="color:var(--text-muted);font-weight:700">${i + 1}</td>
                  <td><span class="inv-loc-pill">${_placements[i]?.positionName || '—'}</span></td>
                  ${_fields.slice(0, 4).map(f => `<td>${row[f.key] || '—'}</td>`).join('')}
                  ${_fields.length > 4 ? '<td style="color:var(--text-muted)">…</td>' : ''}
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${unplaced > 0 ? `<p class="as-confirm-warn">
          <i class="fas fa-exclamation-triangle"></i>
          ${unplaced} sample${unplaced > 1 ? 's' : ''} without a location will be skipped.
        </p>` : ''}
      </div>`;
  }

  // ══════════════════════════════════════════════════════
  // NAVIGATION & SAVE
  // ══════════════════════════════════════════════════════
  function next() {
    if (_step === 1) {
      // Flush any unsaved inputs
      document.querySelectorAll('#ba-sheet .as-sh-input').forEach(input => {
        _rows[parseInt(input.dataset.row)][input.dataset.key] = input.value;
      });
      _currentSample = 0;
      _step = 2;
      _renderStep();
    } else if (_step === 2) {
      if (_currentSample + 1 < _count) { _currentSample++; _renderStep(); }
      else { _step = 3; _renderStep(); }
    } else if (_step === 3) {
      _saveAll();
    }
  }

  function back() {
    if (_step === 2)      { _step = 1; document.getElementById('ba-next-btn').style.display = ''; }
    else if (_step === 3) { _step = 2; _currentSample = _count - 1; }
    _renderStep();
  }

  async function _saveAll() {
    const btn = document.getElementById('ba-next-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    btn.disabled  = true;

    try {
      const invSnap = await window.fbDB.ref(INV_PATH).once('value');
      let nextId    = 1;
      if (invSnap.exists()) {
        const keys = Object.keys(invSnap.val()).map(Number).filter(n => !isNaN(n));
        nextId = keys.length ? Math.max(...keys) + 1 : 1;
      }

      const sanitize = k => k.replace(/[.#$\/\[\]]/g, '_').trim();
      const updates  = {};
      let   saved    = 0;

      for (let i = 0; i < _count; i++) {
        const p = _placements[i];
        if (!p) continue;
        const sample = { Location: p.path };
        Object.entries(_rows[i]).forEach(([k, v]) => { sample[sanitize(k)] = v; });
        updates[`${INV_PATH}/${nextId + saved}`]         = sample;
        updates[`${LABS_PATH}/${p.path}/status`]         = 'occupied';
        saved++;
      }

      await window.fbDB.ref('/').update(updates);
      showToast(`${saved} sample${saved !== 1 ? 's' : ''} saved!`, 'success');
      close();
    } catch (err) {
      console.error('Bulk save failed:', err);
      showToast(`Save failed: ${err.message}`, 'error');
      btn.innerHTML = `<i class="fas fa-check"></i> Save ${_count} Samples`;
      btn.disabled  = false;
    }
  }

  function close() {
    const overlay = document.getElementById('bulkadd-overlay');
    if (!overlay) return;
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 250);
  }

  // ── Open with pre-filled data (from Excel Import) ────
  async function openWithData(preFilledRows, startId) {
    document.getElementById('bulkadd-overlay')?.remove();

    _count         = preFilledRows.length;
    _rows          = preFilledRows;
    _placements    = [];
    _currentSample = 0;
    _step          = 2; // Skip straight to placement
    _startId       = startId;

    const [metaSnap, orderSnap, labsSnap] = await Promise.all([
      window.fbDB.ref('Metadata').once('value'),
      window.fbDB.ref('MetadataOrder').once('value'),
      window.fbDB.ref('Labs').once('value'),
    ]);

    // Build fields so confirm step works
    const metaVal   = metaSnap.exists() ? metaSnap.val() : {};
    const allFields = Object.entries(metaVal).map(([key, label]) => ({ key, label: typeof label === 'string' ? label : key }));
    if (orderSnap.exists()) {
      const order   = orderSnap.val();
      const ordered = order.map(k => allFields.find(f => f.key === k)).filter(Boolean);
      allFields.forEach(f => { if (!ordered.find(o => o.key === f.key)) ordered.push(f); });
      _fields = ordered;
    } else {
      _fields = allFields;
    }

    _labs = labsSnap.exists() ? labsSnap.val() : {};

    _buildModal();
    _renderStep();
  }

  return {
    open, openWithData, close, next, back,
    chooseAuto, autoInLab, chooseManual,
    navInto, navTo, selectSlot,
    _onCellInput, _onCellFocus, _onCellKey,
  };

})();

window.BulkAdd = BulkAdd;
