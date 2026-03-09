/* ============================================================
   panels/metadata.js — Sample Metadata Field Manager
   LabGuy Application

   - View, search, add, rename, reorder, delete fields
   - Rename cascades across all /Inventory records
   - Field order stored at /MetadataOrder as an array
   ============================================================ */

const MetadataPanel = (() => {

  const META_PATH  = 'Metadata';
  const ORDER_PATH = 'MetadataOrder';
  const INV_PATH   = 'Inventory';

  let _fields      = []; // [{key, label}] in display order
  let _selected    = null;
  let _dragSrcIdx  = null;

  // ── Open ──────────────────────────────────────────────
  function open() {
    document.getElementById('metadata-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'metadata-overlay';
    overlay.innerHTML = `
      <div class="meta-modal">

        <div class="meta-header">
          <div class="meta-header-left">
            <div class="meta-icon"><i class="fas fa-database"></i></div>
            <div>
              <h3>Sample Metadata Fields</h3>
              <p class="meta-subtitle">Define and manage fields for sample entries</p>
            </div>
          </div>
          <button class="meta-close" onclick="MetadataPanel.close()">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <!-- Search + Add -->
        <div class="meta-toolbar">
          <div class="meta-search-wrap">
            <i class="fas fa-search meta-search-icon"></i>
            <input id="meta-search" class="meta-search" placeholder="Search fields..."
                   oninput="MetadataPanel.onSearch(this.value)"/>
          </div>
          <button class="meta-btn add" onclick="MetadataPanel.openAddField()">
            <i class="fas fa-plus"></i> Add Field
          </button>
        </div>

        <!-- Field list -->
        <div class="meta-list-wrap">
          <div class="meta-list-header">
            <span>Field Name</span>
            <span>Order</span>
          </div>
          <div id="meta-field-list" class="meta-field-list"></div>
        </div>

        <!-- Action bar -->
        <div class="meta-action-bar">
          <div class="meta-action-bar-left">
            <button class="meta-btn secondary" onclick="MetadataPanel.moveUp()"
                    title="Move selected field up">
              <i class="fas fa-arrow-up"></i> Move Up
            </button>
            <button class="meta-btn secondary" onclick="MetadataPanel.moveDown()"
                    title="Move selected field down">
              <i class="fas fa-arrow-down"></i> Move Down
            </button>
          </div>
          <div class="meta-action-bar-right">
            <button class="meta-btn warning" onclick="MetadataPanel.openRename()"
                    title="Rename selected field">
              <i class="fas fa-pen"></i> Rename
            </button>
            <button class="meta-btn danger" onclick="MetadataPanel.openDelete()"
                    title="Delete selected field">
              <i class="fas fa-trash"></i> Delete
            </button>
          </div>
        </div>

      </div>`;

    overlay.addEventListener('click', e => { if (e.target === overlay) MetadataPanel.close(); });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
    _loadFields();
  }

  // ── Load fields from Firebase ─────────────────────────
  async function _loadFields() {
    const [metaSnap, orderSnap] = await Promise.all([
      window.fbDB.ref(META_PATH).once('value'),
      window.fbDB.ref(ORDER_PATH).once('value'),
    ]);

    if (!metaSnap.exists()) {
      _fields = [];
      _renderList();
      return;
    }

    const metaVal = metaSnap.val();
    // metaVal is { sanitizedKey: originalLabel }
    const allFields = Object.entries(metaVal).map(([key, label]) => ({
      key,
      label: typeof label === 'string' ? label : key,
    }));

    // Apply saved order if it exists
    if (orderSnap.exists()) {
      const order = orderSnap.val(); // array of keys
      const ordered = [];
      order.forEach(k => {
        const f = allFields.find(f => f.key === k);
        if (f) ordered.push(f);
      });
      // Append any fields not in order yet
      allFields.forEach(f => {
        if (!ordered.find(o => o.key === f.key)) ordered.push(f);
      });
      _fields = ordered;
    } else {
      _fields = allFields.sort((a, b) => a.label.localeCompare(b.label));
    }

    _renderList();
  }

  // ── Render field list ─────────────────────────────────
  function _renderList(filter = '') {
    const list = document.getElementById('meta-field-list');
    if (!list) return;

    const filtered = filter
      ? _fields.filter(f => f.label.toLowerCase().includes(filter.toLowerCase()))
      : _fields;

    if (!filtered.length) {
      list.innerHTML = `<div class="meta-empty">
        <i class="fas fa-database"></i>
        <p>${filter ? 'No fields match your search' : 'No metadata fields yet — add one above'}</p>
      </div>`;
      return;
    }

    list.innerHTML = filtered.map((f, i) => `
      <div class="meta-field-row ${_selected === f.key ? 'selected' : ''}"
           data-key="${f.key}"
           draggable="true"
           onclick="MetadataPanel.selectField('${f.key}')"
           ondragstart="MetadataPanel.onDragStart(event, ${_fields.indexOf(f)})"
           ondragover="MetadataPanel.onDragOver(event)"
           ondrop="MetadataPanel.onDrop(event, ${_fields.indexOf(f)})"
           ondragend="MetadataPanel.onDragEnd()">
        <div class="meta-field-left">
          <i class="fas fa-grip-vertical meta-grip"></i>
          <span class="meta-field-label">${_highlight(f.label, filter)}</span>
        </div>
        <span class="meta-field-order">${_fields.indexOf(f) + 1}</span>
      </div>`).join('');
  }

  function _highlight(text, filter) {
    if (!filter) return text;
    const re = new RegExp(`(${filter})`, 'gi');
    return text.replace(re, '<mark>$1</mark>');
  }

  // ── Selection ─────────────────────────────────────────
  function selectField(key) {
    _selected = _selected === key ? null : key;
    _renderList(document.getElementById('meta-search')?.value || '');
  }

  // ── Search ────────────────────────────────────────────
  function onSearch(val) { _renderList(val); }

  // ── Reorder — move up/down ────────────────────────────
  function moveUp() {
    if (!_selected) { showToast('Select a field first.', 'warn'); return; }
    const idx = _fields.findIndex(f => f.key === _selected);
    if (idx <= 0) return;
    [_fields[idx - 1], _fields[idx]] = [_fields[idx], _fields[idx - 1]];
    _saveOrder();
    _renderList(document.getElementById('meta-search')?.value || '');
  }

  function moveDown() {
    if (!_selected) { showToast('Select a field first.', 'warn'); return; }
    const idx = _fields.findIndex(f => f.key === _selected);
    if (idx < 0 || idx >= _fields.length - 1) return;
    [_fields[idx], _fields[idx + 1]] = [_fields[idx + 1], _fields[idx]];
    _saveOrder();
    _renderList(document.getElementById('meta-search')?.value || '');
  }

  // ── Drag to reorder ───────────────────────────────────
  function onDragStart(e, idx) {
    _dragSrcIdx = idx;
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  }
  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-target');
  }
  function onDrop(e, idx) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-target');
    if (_dragSrcIdx === null || _dragSrcIdx === idx) return;
    const moved = _fields.splice(_dragSrcIdx, 1)[0];
    _fields.splice(idx, 0, moved);
    _dragSrcIdx = null;
    _saveOrder();
    _renderList(document.getElementById('meta-search')?.value || '');
  }
  function onDragEnd() {
    _dragSrcIdx = null;
    document.querySelectorAll('.meta-field-row').forEach(r => {
      r.classList.remove('dragging', 'drag-target');
    });
  }

  // ── Save order to Firebase ────────────────────────────
  async function _saveOrder() {
    const order = _fields.map(f => f.key);
    await window.fbDB.ref(ORDER_PATH).set(order);
  }

  // ── Add Field ─────────────────────────────────────────
  function openAddField() {
    _showPrompt({
      title:       'Add Metadata Field',
      icon:        'fa-plus-circle',
      label:       'Field Name',
      placeholder: 'e.g. Sample Type, Age, Location',
      confirmText: 'Add Field',
      onConfirm: async (value) => {
        if (!value) { showToast('Please enter a field name.', 'warn'); return false; }
        const key = value.replace(/[.#$\/\[\]]/g, '_').trim();
        // Check duplicate
        if (_fields.find(f => f.label.toLowerCase() === value.toLowerCase())) {
          showToast('A field with that name already exists.', 'warn');
          return false;
        }
        await window.fbDB.ref(`${META_PATH}/${key}`).set(value);
        showToast(`"${value}" added!`, 'success');
        await _loadFields();
        return true;
      }
    });
  }

  // ── Rename Field ──────────────────────────────────────
  function openRename() {
    if (!_selected) { showToast('Select a field to rename.', 'warn'); return; }
    const field = _fields.find(f => f.key === _selected);
    if (!field) return;

    _showPrompt({
      title:       'Rename Field',
      icon:        'fa-pen',
      label:       'New Field Name',
      placeholder: 'Enter new name',
      initial:     field.label,
      confirmText: 'Rename',
      onConfirm: async (newName) => {
        if (!newName || newName === field.label) return false;
        const newKey = newName.replace(/[.#$\/\[\]]/g, '_').trim();

        // Show loading state
        showToast('Renaming across all inventory records...', 'info');

        try {
          const updates = {};

          // 1. Update Metadata entry
          updates[`${META_PATH}/${field.key}`] = null;   // delete old key
          updates[`${META_PATH}/${newKey}`]     = newName; // add new key

          // 2. Update MetadataOrder
          const newOrder = _fields.map(f => f.key === field.key ? newKey : f.key);
          updates[ORDER_PATH] = newOrder;

          // 3. Cascade rename across all Inventory records
          const invSnap = await window.fbDB.ref(INV_PATH).once('value');
          if (invSnap.exists()) {
            invSnap.forEach(itemSnap => {
              const itemKey = itemSnap.key;
              const item    = itemSnap.val();
              if (item.hasOwnProperty(field.label)) {
                const oldValue = item[field.label];
                updates[`${INV_PATH}/${itemKey}/${field.label}`] = null;    // remove old
                updates[`${INV_PATH}/${itemKey}/${newName}`]     = oldValue; // add new
              }
            });
          }

          // 4. Single atomic write
          await window.fbDB.ref('/').update(updates);

          showToast(`"${field.label}" renamed to "${newName}"`, 'success');
          await _loadFields();
          _selected = newKey;
          return true;
        } catch (err) {
          console.error('Rename failed:', err);
          showToast(`Rename failed: ${err.message}`, 'error');
          return false;
        }
      }
    });
  }

  // ── Delete Field ──────────────────────────────────────
  function openDelete() {
    if (!_selected) { showToast('Select a field to delete.', 'warn'); return; }
    const field = _fields.find(f => f.key === _selected);
    if (!field) return;

    _showConfirm({
      title:   `Delete "${field.label}"?`,
      message: `This will permanently remove this field and its data from all inventory records. This cannot be undone.`,
      confirmText: 'Delete',
      danger: true,
      onConfirm: async () => {
        try {
          const updates = {};
          updates[`${META_PATH}/${field.key}`] = null;

          // Remove from order
          const newOrder = _fields.filter(f => f.key !== field.key).map(f => f.key);
          updates[ORDER_PATH] = newOrder;

          // Cascade delete across inventory
          const invSnap = await window.fbDB.ref(INV_PATH).once('value');
          if (invSnap.exists()) {
            invSnap.forEach(itemSnap => {
              const item = itemSnap.val();
              if (item.hasOwnProperty(field.label)) {
                updates[`${INV_PATH}/${itemSnap.key}/${field.label}`] = null;
              }
            });
          }

          await window.fbDB.ref('/').update(updates);
          showToast(`"${field.label}" deleted`, 'info');
          _selected = null;
          await _loadFields();
          return true;
        } catch (err) {
          console.error('Delete failed:', err);
          showToast(`Delete failed: ${err.message}`, 'error');
          return false;
        }
      }
    });
  }

  // ── Generic prompt modal ──────────────────────────────
  function _showPrompt({ title, icon, label, placeholder, initial = '', confirmText, onConfirm }) {
    document.getElementById('meta-prompt-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'meta-prompt-overlay';
    overlay.innerHTML = `
      <div class="meta-prompt">
        <div class="meta-prompt-header">
          <div class="meta-prompt-icon"><i class="fas ${icon}"></i></div>
          <h4>${title}</h4>
          <button class="meta-close sm" onclick="document.getElementById('meta-prompt-overlay').remove()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="meta-prompt-body">
          <label class="meta-prompt-label">${label}</label>
          <input id="meta-prompt-input" class="meta-prompt-input"
                 type="text" placeholder="${placeholder}" value="${initial}"/>
        </div>
        <div class="meta-prompt-actions">
          <button class="meta-btn secondary"
                  onclick="document.getElementById('meta-prompt-overlay').remove()">
            Cancel
          </button>
          <button class="meta-btn add" id="meta-prompt-confirm"
                  onclick="MetadataPanel._handlePromptConfirm()">
            ${confirmText}
          </button>
        </div>
      </div>`;

    overlay._onConfirm = onConfirm;
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
    setTimeout(() => {
      const input = document.getElementById('meta-prompt-input');
      input?.focus();
      input?.select();
    }, 100);

    // Enter key support
    document.getElementById('meta-prompt-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') MetadataPanel._handlePromptConfirm();
    });
  }

  async function _handlePromptConfirm() {
    const overlay = document.getElementById('meta-prompt-overlay');
    if (!overlay?._onConfirm) return;
    const value = document.getElementById('meta-prompt-input').value.trim();
    const btn   = document.getElementById('meta-prompt-confirm');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled  = true;
    const ok = await overlay._onConfirm(value);
    if (ok) overlay.remove();
    else {
      btn.innerHTML = btn.textContent;
      btn.disabled  = false;
    }
  }

  // ── Generic confirm modal ─────────────────────────────
  function _showConfirm({ title, message, confirmText, danger, onConfirm }) {
    document.getElementById('meta-confirm-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'meta-confirm-overlay';
    overlay.innerHTML = `
      <div class="meta-prompt">
        <div class="meta-prompt-header">
          <div class="meta-prompt-icon ${danger ? 'danger' : ''}">
            <i class="fas fa-exclamation-triangle"></i>
          </div>
          <h4>${title}</h4>
        </div>
        <p class="meta-confirm-msg">${message}</p>
        <div class="meta-prompt-actions">
          <button class="meta-btn secondary"
                  onclick="document.getElementById('meta-confirm-overlay').remove()">
            Cancel
          </button>
          <button class="meta-btn ${danger ? 'danger' : 'add'}" id="meta-confirm-btn"
                  onclick="MetadataPanel._handleConfirm()">
            ${confirmText}
          </button>
        </div>
      </div>`;

    overlay._onConfirm = onConfirm;
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
  }

  async function _handleConfirm() {
    const overlay = document.getElementById('meta-confirm-overlay');
    if (!overlay?._onConfirm) return;
    const btn = document.getElementById('meta-confirm-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled  = true;
    const ok = await overlay._onConfirm();
    if (ok) overlay.remove();
    else { btn.disabled = false; }
  }

  // ── Close ─────────────────────────────────────────────
  function close() {
    const overlay = document.getElementById('metadata-overlay');
    if (!overlay) return;
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 250);
  }

  return {
    open, close, selectField, onSearch,
    moveUp, moveDown, openAddField, openRename, openDelete,
    onDragStart, onDragOver, onDrop, onDragEnd,
    _handlePromptConfirm, _handleConfirm,
  };
})();

window.MetadataPanel = MetadataPanel;
