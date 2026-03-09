/* ============================================================
   panels/admin.js — Admin dashboard panel
   LabGuy Application
   ============================================================ */

const AdminPanel = (() => {

  function open() {
    openPanel('panel-admin');
    _loadLabs();
  }

  // ── Load & display labs ───────────────────────────────
  function _loadLabs() {
    const container = document.getElementById('lab-browser');
    if (!container) return;
    container.innerHTML = `<div class="lab-empty"><i class="fas fa-spinner fa-spin"></i><p>Loading...</p></div>`;

    window.fbDB.ref('Labs').once('value').then(snap => {
      if (!snap.exists()) {
        container.innerHTML = `<div class="lab-empty"><i class="fas fa-snowflake"></i><p>No laboratories found.</p></div>`;
        return;
      }
      container.innerHTML = '';
      snap.forEach(labSnap => {
        container.appendChild(_buildLabCard(labSnap.key, labSnap.val()));
      });
    }).catch(err => {
      console.error('Failed to load labs:', err);
      container.innerHTML = `<div class="lab-empty"><i class="fas fa-exclamation-triangle"></i><p>Failed to load labs.</p></div>`;
    });
  }

  // ── Build a lab card ──────────────────────────────────
  function _buildLabCard(labName, labData) {
    const card = document.createElement('div');
    card.className = 'lab-card';
    const stats = _countSpots(labData);

    card.innerHTML = `
      <div class="lab-card-header" onclick="this.closest('.lab-card').classList.toggle('expanded')">
        <div class="lab-card-title">
          <i class="fas fa-snowflake lab-icon"></i>
          <span>${labName}</span>
        </div>
        <div class="lab-card-meta">
          <span class="lab-stat occupied-stat">${stats.occupied} occupied</span>
          <span class="lab-stat empty-stat">${stats.empty} empty</span>
          <i class="fas fa-chevron-down lab-chevron"></i>
        </div>
      </div>
      <div class="lab-card-tree">
        ${_renderTree(labData, 0)}
      </div>`;
    return card;
  }

  // ── Render tree — collapsible nodes ──────────────────
  let _nodeId = 0;

  function _renderTree(node, depth) {
    if (!node || typeof node !== 'object') return '';
    const SKIP = ['status', 'createdAt', 'spots'];
    const keys = Object.keys(node).filter(k => !SKIP.includes(k));
    if (!keys.length) return '';

    const icons  = ['layer-group','cube','box-open','archive','vial','circle'];
    const colors = ['#7c83fd','#fd9644','#45aaf2','#2ecc71','#a55eea','#a55eea'];
    const indent = depth * 14;

    return keys.map(key => {
      const child   = node[key];
      const status  = child?.status;
      const hasKids = typeof child === 'object' &&
                      Object.keys(child).some(k => !SKIP.includes(k));
      const nid     = ++_nodeId;

      let badge = '';
      if (status === 'occupied') badge = `<span class="lab-spot occupied">Occupied</span>`;
      else if (status === 'empty') badge = `<span class="lab-spot empty">Empty</span>`;

      const chevron = hasKids
        ? `<i class="fas fa-chevron-right lab-node-chevron" id="chev-${nid}"></i>`
        : `<span style="width:14px;display:inline-block"></span>`;

      const children = hasKids
        ? `<div class="lab-node-children" id="children-${nid}">${_renderTree(child, depth + 1)}</div>`
        : '';

      const clickHandler = hasKids
        ? `onclick="AdminPanel.toggleNode(${nid})"`
        : '';

      return `
        <div class="lab-tree-row" style="padding-left:${indent + 8}px" ${clickHandler}>
          ${chevron}
          <i class="fas fa-${icons[Math.min(depth, icons.length-1)]}"
             style="color:${colors[Math.min(depth,colors.length-1)]};font-size:11px;flex-shrink:0"></i>
          <span class="lab-tree-name ${hasKids ? 'has-kids' : ''}">${key}</span>
          ${badge}
        </div>
        ${children}`;
    }).join('');
  }

  // ── Toggle a tree node open/closed ────────────────────
  function toggleNode(nid) {
    const children = document.getElementById(`children-${nid}`);
    const chevron  = document.getElementById(`chev-${nid}`);
    if (!children) return;
    const open = children.classList.toggle('open');
    if (chevron) chevron.classList.toggle('rotated', open);
  }

  // ── Count occupied/empty at deepest level ─────────────
  function _countSpots(node) {
    let occupied = 0, empty = 0;
    function walk(n) {
      if (!n || typeof n !== 'object') return;
      if (n.status === 'occupied') { occupied++; return; }
      if (n.status === 'empty')    { empty++;    return; }
      Object.values(n).forEach(v => { if (typeof v === 'object') walk(v); });
    }
    walk(node);
    return { occupied, empty };
  }

  // ── Add New Laboratory modal ──────────────────────────
  function addLaboratory() {
    document.getElementById('lab-modal-overlay')?.remove();
    _unitCount = 0;

    const overlay = document.createElement('div');
    overlay.id = 'lab-modal-overlay';
    overlay.innerHTML = `
      <div class="lab-modal" id="lab-modal">
        <div class="lab-modal-header">
          <div class="lab-modal-icon"><i class="fas fa-snowflake"></i></div>
          <div>
            <h3>Add a New Laboratory</h3>
            <p class="lab-modal-subtitle">Define the name and count at each level</p>
          </div>
          <button class="lab-modal-close" onclick="AdminPanel.closeModal()">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="lab-modal-body">
          <div class="lab-modal-field">
            <label>Laboratory Name</label>
            <input id="new-lab-name" class="lab-modal-input"
                   type="text" placeholder="e.g. -80, -20, RT Storage"/>
          </div>

          <div class="lab-modal-divider"><span>Storage Levels</span></div>

          <div id="lab-units-list"></div>

          <button class="lab-add-unit-btn" onclick="AdminPanel.addUnitRow()">
            <i class="fas fa-plus"></i> Add Next Level
          </button>
        </div>

        <div class="lab-modal-actions">
          <button class="lab-modal-btn cancel" onclick="AdminPanel.closeModal()">Cancel</button>
          <button class="lab-modal-btn confirm" onclick="AdminPanel.saveLab()">
            <i class="fas fa-check"></i> Create Lab
          </button>
        </div>
      </div>`;

    overlay.addEventListener('click', e => { if (e.target === overlay) AdminPanel.closeModal(); });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
    addUnitRow();
    document.getElementById('new-lab-name').focus();
  }

  // ── Add a level row ───────────────────────────────────
  let _unitCount = 0;

  function addUnitRow() {
    const list = document.getElementById('lab-units-list');
    if (!list) return;
    _unitCount++;
    const id     = _unitCount;
    const depth  = id - 1;
    const indent = depth * 20;
    const icons  = ['layer-group','cube','box-open','archive','vial'];
    const colors = ['#7c83fd','#fd9644','#45aaf2','#2ecc71','#a55eea'];
    const icon   = icons[Math.min(depth, icons.length-1)];
    const color  = colors[Math.min(depth, colors.length-1)];

    const row = document.createElement('div');
    row.className = 'lab-unit-entry';
    row.id = `unit-row-${id}`;
    row.style.marginLeft = indent + 'px';
    row.innerHTML = `
      <div class="lab-unit-entry-connector ${depth > 0 ? 'show' : ''}"></div>
      <div class="lab-unit-entry-fields">
        <div class="lab-unit-entry-icon" style="color:${color}">
          <i class="fas fa-${icon}"></i>
        </div>
        <div class="lab-modal-field" style="flex:1">
          <label>Level ${id} — Name</label>
          <input class="lab-modal-input unit-name-input"
                 type="text" placeholder="e.g. Shelves, Towers, Drawers"/>
        </div>
        <div class="lab-modal-field lab-modal-field-sm">
          <label>Count</label>
          <input class="lab-modal-input unit-count-input"
                 type="number" min="1" placeholder="e.g. 6"/>
        </div>
        ${id > 1 ? `
        <button class="lab-unit-remove-btn" onclick="AdminPanel.removeUnitRow(${id})" title="Remove">
          <i class="fas fa-times"></i>
        </button>` : ''}
      </div>`;

    list.appendChild(row);
    requestAnimationFrame(() => row.classList.add('visible'));
    setTimeout(() => row.querySelector('.unit-name-input')?.focus(), 150);
  }

  // ── Remove row and everything below ───────────────────
  function removeUnitRow(id) {
    const list = document.getElementById('lab-units-list');
    if (!list) return;
    list.querySelectorAll('.lab-unit-entry').forEach(row => {
      const rowId = parseInt(row.id.replace('unit-row-',''));
      if (rowId >= id) {
        row.classList.remove('visible');
        setTimeout(() => row.remove(), 200);
      }
    });
    _unitCount = id - 1;
  }

  // ── Build nested structure from counts ────────────────
  // e.g. [{name:'Shelves', count:3}, {name:'Towers', count:6}]
  // generates: { Shelves1: { Towers1:{}, Towers2:{}... }, Shelves2:... }
  function _buildStructure(levels) {
    if (!levels.length) return {};

    const [current, ...rest] = levels;
    const result = {};

    for (let i = 1; i <= current.count; i++) {
      const key = `${current.name}${i}`;
      if (rest.length) {
        result[key] = _buildStructure(rest);
      } else {
        // Deepest level — create spots with status empty
        result[key] = { status: 'empty' };
      }
    }
    return result;
  }

  // ── Save to Firebase ──────────────────────────────────
  async function saveLab() {
    const labName = document.getElementById('new-lab-name').value.trim();
    if (!labName) {
      showToast('Please enter a laboratory name.', 'warn');
      document.getElementById('new-lab-name').focus();
      return;
    }

    // Gather levels
    const rows   = [...document.querySelectorAll('.lab-unit-entry')];
    const levels = [];
    let valid = true;

    rows.forEach(row => {
      const name  = row.querySelector('.unit-name-input').value.trim();
      const count = parseInt(row.querySelector('.unit-count-input').value) || 0;
      if (!name || count < 1) { valid = false; return; }
      levels.push({ name, count });
    });

    if (!valid || !levels.length) {
      showToast('Please fill in all levels with a name and count ≥ 1.', 'warn');
      return;
    }

    try {
      const confirmBtn = document.querySelector('.lab-modal-btn.confirm');
      confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
      confirmBtn.disabled  = true;

      const structure = _buildStructure(levels);
      await window.fbDB.ref(`Labs/${labName}`).set(structure);

      showToast(`Lab "${labName}" created!`, 'success');
      closeModal();
      _loadLabs(); // refresh the browser
    } catch (err) {
      console.error('Failed to create lab:', err);
      showToast('Failed to create lab. Check your permissions.', 'error');
      const confirmBtn = document.querySelector('.lab-modal-btn.confirm');
      if (confirmBtn) {
        confirmBtn.innerHTML = '<i class="fas fa-check"></i> Create Lab';
        confirmBtn.disabled  = false;
      }
    }
  }

  // ── Close modal ───────────────────────────────────────
  function closeModal() {
    _unitCount = 0;
    const overlay = document.getElementById('lab-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 250);
  }

  function defineSampleMetadata() { showToast('Define Sample Metadata — coming soon', 'info'); }
  function openUserManagement()   { showToast('User Management — coming soon', 'info'); }

  return {
    open, addLaboratory, addUnitRow, removeUnitRow,
    saveLab, closeModal, toggleNode,
    defineSampleMetadata, openUserManagement,
  };
})();

window.AdminPanel = AdminPanel;
