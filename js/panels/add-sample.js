/* ============================================================
   add-sample.js — Quick Add Single Sample Widget
   LabGuy Application

   Flow:
   1. Fill metadata form
   2. Choose placement: Auto or Manual
   3. Confirm & Save
   ============================================================ */

const AddSample = (() => {

  const META_PATH  = 'Metadata';
  const ORDER_PATH = 'MetadataOrder';
  const INV_PATH   = 'Inventory';
  const LABS_PATH  = 'Labs';

  const _natSort = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  const _sortedKeys = (obj, skip = []) => Object.keys(obj).filter(k => !skip.includes(k)).sort(_natSort);

  let _fields    = [];
  let _formData  = {};
  let _labs      = {};
  let _placement = null;
  let _step      = 1;

  // ── Open ──────────────────────────────────────────────
  async function open() {
    document.getElementById('addsample-overlay')?.remove();
    _formData  = {};
    _placement = null;
    _step      = 1;

    const [metaSnap, orderSnap, labsSnap] = await Promise.all([
      window.fbDB.ref(META_PATH).once('value'),
      window.fbDB.ref(ORDER_PATH).once('value'),
      window.fbDB.ref(LABS_PATH).once('value'),
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

    _labs = labsSnap.exists() ? labsSnap.val() : {};

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
    overlay.id = 'addsample-overlay';
    overlay.innerHTML = `
      <div class="as-modal">
        <div class="as-header">
          <div class="as-icon"><i class="fas fa-plus-circle"></i></div>
          <div>
            <h3 id="as-title">Add Sample</h3>
            <p class="as-subtitle" id="as-subtitle">Fill in the sample details</p>
          </div>
          <button class="as-close" onclick="AddSample.close()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="as-steps">
          <div class="as-step" id="as-step-1"><div class="as-step-dot">1</div><span>Details</span></div>
          <div class="as-step-line"></div>
          <div class="as-step" id="as-step-2"><div class="as-step-dot">2</div><span>Location</span></div>
          <div class="as-step-line"></div>
          <div class="as-step" id="as-step-3"><div class="as-step-dot">3</div><span>Confirm</span></div>
        </div>
        <div class="as-body" id="as-body"></div>
        <div class="as-footer">
          <button class="as-btn secondary" id="as-back-btn" onclick="AddSample.back()" style="display:none">
            <i class="fas fa-arrow-left"></i> Back
          </button>
          <div style="flex:1"></div>
          <button class="as-btn cancel" onclick="AddSample.close()">Cancel</button>
          <button class="as-btn primary" id="as-next-btn" onclick="AddSample.next()">
            Next <i class="fas fa-arrow-right"></i>
          </button>
        </div>
      </div>`;
    overlay.addEventListener('click', e => { if (e.target === overlay) AddSample.close(); });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
  }

  // ── Render step ───────────────────────────────────────
  function _renderStep() {
    [1,2,3].forEach(i => {
      const el = document.getElementById(`as-step-${i}`);
      if (!el) return;
      el.classList.toggle('active',    i === _step);
      el.classList.toggle('completed', i < _step);
    });
    document.getElementById('as-back-btn').style.display = _step > 1 ? '' : 'none';
    const nextBtn = document.getElementById('as-next-btn');
    nextBtn.style.display = '';

    if (_step === 1) {
      document.getElementById('as-title').textContent    = 'Sample Details';
      document.getElementById('as-subtitle').textContent = 'Fill in the metadata fields';
      nextBtn.innerHTML = 'Next <i class="fas fa-arrow-right"></i>';
      _renderForm();
    } else if (_step === 2) {
      document.getElementById('as-title').textContent    = 'Choose Location';
      document.getElementById('as-subtitle').textContent = 'Select where to store this sample';
      nextBtn.innerHTML = 'Next <i class="fas fa-arrow-right"></i>';
      nextBtn.style.display = 'none';
      _renderPlacement();
    } else if (_step === 3) {
      document.getElementById('as-title').textContent    = 'Confirm';
      document.getElementById('as-subtitle').textContent = 'Review and save your sample';
      nextBtn.innerHTML = '<i class="fas fa-check"></i> Save Sample';
      _renderConfirm();
    }
  }

  // ── Step 1: Form ──────────────────────────────────────
  function _renderForm() {
    const body = document.getElementById('as-body');
    if (!_fields.length) {
      body.innerHTML = `<div class="as-empty">
        <i class="fas fa-database"></i>
        <p>No metadata fields defined yet.<br>Ask an Admin to add fields first.</p>
      </div>`;
      return;
    }
    body.innerHTML = `
      <div class="as-form">
        ${_fields.map(f => `
          <div class="as-field">
            <label class="as-label">${f.label}</label>
            <input class="as-input" type="text" data-key="${f.key}"
                   placeholder="Enter ${f.label}"
                   value="${(_formData[f.key] || '').replace(/"/g, '&quot;')}"/>
          </div>`).join('')}
      </div>`;
    body.querySelectorAll('.as-input').forEach(input => {
      input.addEventListener('input', () => { _formData[input.dataset.key] = input.value; });
    });
    setTimeout(() => body.querySelector('.as-input')?.focus(), 100);
  }

  // ── Step 2: Placement ─────────────────────────────────
  function _renderPlacement() {
    const body = document.getElementById('as-body');
    body.innerHTML = `
      <div class="as-placement">
        <div class="as-placement-options">
          <button class="as-place-btn" onclick="AddSample.chooseAuto()">
            <i class="fas fa-magic"></i>
            <span class="as-place-title">Auto Place</span>
            <span class="as-place-desc">System finds the next available empty slot</span>
          </button>
          <button class="as-place-btn" onclick="AddSample.chooseManual()">
            <i class="fas fa-hand-pointer"></i>
            <span class="as-place-title">Manual Place</span>
            <span class="as-place-desc">Navigate the storage tree and pick a spot</span>
          </button>
        </div>
        <div id="as-placement-content"></div>
      </div>`;
  }

  async function chooseAuto() {
    const labNames = Object.keys(_labs);
    if (labNames.length > 1) {
      document.getElementById('as-placement-content').innerHTML = `
        <div class="as-lab-picker">
          <p class="as-lab-picker-label">Which lab?</p>
          <div class="as-lab-grid">
            ${labNames.map(n => `
              <button class="as-lab-chip" onclick="AddSample.autoInLab('${n}')">
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
    const snap = await window.fbDB.ref(LABS_PATH).once('value');
    _labs = snap.exists() ? snap.val() : {};
    const found = _findNextEmpty(_labs[labName], labName);
    if (!found) { showToast(`No empty slots in ${labName}!`, 'warn'); return; }
    _placement = found;
    document.getElementById('as-placement-content').innerHTML = `
      <div class="as-auto-result">
        <i class="fas fa-check-circle" style="color:var(--accent-green);font-size:22px"></i>
        <div>
          <p class="as-auto-label">Next available slot found:</p>
          <p class="as-auto-path">${found.path}</p>
        </div>
      </div>`;
    document.getElementById('as-next-btn').style.display = '';
    setTimeout(() => { _step = 3; _renderStep(); }, 500);
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
  function chooseManual() { _manualPath = []; _renderManualTree(); }

  function _renderManualTree() {
    const content = document.getElementById('as-placement-content');
    const SKIP    = ['createdAt', 'spots', 'status'];
    const crumbs  = ['Home', ..._manualPath];

    let currentNode = _labs;
    for (const key of _manualPath) currentNode = currentNode[key];
    const keys   = Object.keys(currentNode || {}).filter(k => !SKIP.includes(k));
    const isLeaf = keys.length > 0 && keys.every(k => {
      const c = currentNode[k];
      return c && typeof c === 'object' && 'status' in c &&
             Object.keys(c).filter(x => !SKIP.includes(x)).length === 0;
    });

    content.innerHTML = `
      <div class="as-manual">
        <div class="as-breadcrumb">
          ${crumbs.map((c, i) => `
            <button class="as-crumb ${i === crumbs.length-1 ? 'active' : ''}"
                    onclick="AddSample.navTo(${i})">${c}</button>
            ${i < crumbs.length-1 ? '<i class="fas fa-chevron-right as-crumb-sep"></i>' : ''}
          `).join('')}
        </div>
        <div class="as-tree-grid ${isLeaf ? 'leaf-grid' : ''}">
          ${keys.map(key => {
            const child = currentNode[key];
            if (isLeaf) {
              const occ = child?.status === 'occupied';
              const emp = child?.status === 'empty';
              return `<button class="as-slot-btn ${occ ? 'occupied' : 'empty'}"
                              ${emp ? `onclick="AddSample.selectSlot('${key}')"` : 'disabled'}>
                <span class="as-slot-name">${key}</span>
                <span class="as-slot-status">${occ ? 'Occupied' : 'Empty'}</span>
              </button>`;
            }
            return `<button class="as-node-btn" onclick="AddSample.navInto('${key}')">
              <i class="fas fa-folder"></i><span>${key}</span><i class="fas fa-chevron-right"></i>
            </button>`;
          }).join('')}
        </div>
        ${keys.length === 0 ? '<p class="as-empty-node">No items at this level.</p>' : ''}
      </div>`;
  }

  function navInto(key) { _manualPath.push(key); _renderManualTree(); }
  function navTo(idx)   { _manualPath = idx === 0 ? [] : _manualPath.slice(0, idx); _renderManualTree(); }

  function selectSlot(positionName) {
    const fullPath = [..._manualPath, positionName].join('/');
    _placement = { labName: _manualPath[0], path: fullPath, positionName };
    document.getElementById('as-placement-content').innerHTML = `
      <div class="as-auto-result">
        <i class="fas fa-check-circle" style="color:var(--accent-green);font-size:22px"></i>
        <div>
          <p class="as-auto-label">Selected location:</p>
          <p class="as-auto-path">${fullPath}</p>
        </div>
      </div>`;
    document.getElementById('as-next-btn').style.display = '';
    setTimeout(() => { _step = 3; _renderStep(); }, 400);
  }

  // ── Step 3: Confirm ───────────────────────────────────
  function _renderConfirm() {
    const body = document.getElementById('as-body');
    body.innerHTML = `
      <div class="as-confirm">
        <div class="as-confirm-location">
          <i class="fas fa-map-marker-alt"></i>
          <div>
            <p class="as-confirm-loc-label">Storage Location</p>
            <p class="as-confirm-loc-path">${_placement?.path || '—'}</p>
          </div>
        </div>
        <div class="as-confirm-fields">
          ${_fields.map(f => `
            <div class="as-confirm-row">
              <span class="as-confirm-key">${f.label}</span>
              <span class="as-confirm-val">${_formData[f.key] || '<em>—</em>'}</span>
            </div>`).join('')}
        </div>
      </div>`;
  }

  // ── Navigation ────────────────────────────────────────
  function next() {
    if (_step === 1) {
      document.querySelectorAll('.as-input').forEach(input => {
        _formData[input.dataset.key] = input.value;
      });
      _step = 2; _renderStep();
    } else if (_step === 3) {
      _saveSample();
    }
  }

  function back() {
    if (_step === 2)      { _step = 1; document.getElementById('as-next-btn').style.display = ''; }
    else if (_step === 3) { _step = 2; }
    _renderStep();
  }

  // ── Save ──────────────────────────────────────────────
  async function _saveSample() {
    const btn = document.getElementById('as-next-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    btn.disabled  = true;
    try {
      const invSnap = await window.fbDB.ref(INV_PATH).once('value');
      let nextId = 1;
      if (invSnap.exists()) {
        const keys = Object.keys(invSnap.val()).map(Number).filter(n => !isNaN(n));
        nextId = keys.length ? Math.max(...keys) + 1 : 1;
      }
      const sanitize = k => k.replace(/[.#$\/\[\]]/g, '_').trim();
      const sample   = { Location: _placement.path };
      Object.entries(_formData).forEach(([k, v]) => { sample[sanitize(k)] = v; });
      const updates = {};
      updates[`${INV_PATH}/${nextId}`]                  = sample;
      updates[`${LABS_PATH}/${_placement.path}/status`] = 'occupied';
      await window.fbDB.ref('/').update(updates);
      showToast(`Sample #${nextId} saved to ${_placement.positionName}!`, 'success');
      close();
    } catch (err) {
      console.error('Save failed:', err);
      showToast(`Save failed: ${err.message}`, 'error');
      btn.innerHTML = '<i class="fas fa-check"></i> Save Sample';
      btn.disabled  = false;
    }
  }

  function close() {
    const overlay = document.getElementById('addsample-overlay');
    if (!overlay) return;
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 250);
  }

  return { open, close, next, back, chooseAuto, autoInLab, chooseManual, navInto, navTo, selectSlot };
})();

window.AddSample = AddSample;
