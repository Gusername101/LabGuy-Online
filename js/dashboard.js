/* ============================================================
   dashboard.js — Widget grid with drag, drop & resize + previews
   LabGuy Application
   ============================================================ */

const Dashboard = (() => {

  const COLS = 4;
  const ROWS = 4;
  let _slots      = [];
  let _draggedPos = null;
  let _dragOverPos= null;
  let _resizing   = null;
  let _ghost      = null;
  let _resizePreview = null;

  // ── Build 4×4 grid ────────────────────────────────────
  function buildGrid() {
    const grid = document.getElementById('widget-grid');
    if (!grid) return;
    grid.innerHTML = '';
    _slots = [];

    for (let r = 0; r < ROWS; r++) {
      _slots[r] = [];
      for (let c = 0; c < COLS; c++) {
        const slot = document.createElement('div');
        slot.className = 'widget-slot';
        slot.dataset.row  = r;
        slot.dataset.col  = c;
        slot.dataset.spanW = 1;
        slot.dataset.spanH = 1;
        slot.innerHTML = `<span class="plus-icon"><i class="fas fa-plus"></i></span>`;
        slot._clickHandler = _onSlotClick;
        slot.addEventListener('click', slot._clickHandler);
        _slots[r][c] = slot;
        grid.appendChild(slot);
      }
    }
  }

  // ── Persist layout to Firebase ───────────────────────
  function _saveLayout() {
    const uid = window.fbAuth?.currentUser?.uid;
    if (!uid) return;
    const widgets = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const slot = _slots[r][c];
        if (slot.classList.contains('filled')) {
          widgets.push({
            row:   r,
            col:   c,
            spanW: parseInt(slot.dataset.spanW) || 1,
            spanH: parseInt(slot.dataset.spanH) || 1,
            name:  slot.dataset.widgetName,
            icon:  slot.dataset.widgetIcon,
          });
        }
      }
    }
    window.fbDB.ref(`dashboards/${uid}/widgets`).set(widgets);
  }

  async function _loadLayout() {
    const uid = window.fbAuth?.currentUser?.uid;
    if (!uid) return;
    const snap = await window.fbDB.ref(`dashboards/${uid}/widgets`).once('value');
    if (!snap.exists()) return;
    const widgets = snap.val();
    if (!Array.isArray(widgets)) return;
    widgets.forEach(w => {
      // Validate position is within grid bounds
      if (w.row < 0 || w.col < 0 || w.row >= ROWS || w.col >= COLS) return;
      if (w.row + w.spanH > ROWS || w.col + w.spanW > COLS) return;
      if (_isAreaFree(w.row, w.col, w.spanW, w.spanH)) {
        _placeWidget(w.row, w.col, w.spanW, w.spanH, w.name, w.icon);
      }
    });
  }

  function _onSlotClick(e) {
    const slot = e.currentTarget;
    if (!slot.classList.contains('filled') && !slot.dataset.covered) {
      openPanel('panel-widgets');
    }
  }

  // ── Add widget ────────────────────────────────────────
  // Default sizes for widgets that need more space
  const WIDGET_DEFAULTS = {
    'Inventory':    { w: 4, h: 2 },
    'Lab Capacity': { w: 2, h: 2 },
  };

  function addWidget(name, icon) {
    const def = WIDGET_DEFAULTS[name] || { w: 1, h: 1 };
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (_isAreaFree(r, c, def.w, def.h)) {
          _placeWidget(r, c, def.w, def.h, name, icon);
          _saveLayout();
          closeAllPanels();
          showToast(`${name} added`, 'success');
          return;
        }
      }
    }
    // If default size doesn't fit, try 1x1 fallback
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (_isAreaFree(r, c, 1, 1)) {
          _placeWidget(r, c, 1, 1, name, icon);
          _saveLayout();
          closeAllPanels();
          showToast(`${name} added (resized to fit)`, 'success');
          return;
        }
      }
    }
    showToast('Dashboard is full!', 'warn');
  }

  // ── Place widget ──────────────────────────────────────
  function _placeWidget(row, col, spanW, spanH, name, icon) {
    const slot = _slots[row][col];
    // Remove the empty slot click listener before placing widget
    if (slot._clickHandler) {
      slot.removeEventListener('click', slot._clickHandler);
      slot._clickHandler = null;
    }

    slot.classList.add('filled');
    slot.dataset.spanW = spanW;
    slot.dataset.spanH = spanH;
    slot.dataset.widgetName = name;
    slot.dataset.widgetIcon = icon;
    slot.style.gridColumn = `${col + 1} / span ${spanW}`;
    slot.style.gridRow    = `${row + 1} / span ${spanH}`;

    if (name === 'Inventory') {
      slot.innerHTML = `
        <button class="widget-slot-remove" onclick="Dashboard.removeWidget(${row},${col})" title="Remove">
          <i class="fas fa-times"></i>
        </button>
        <div class="widget-drag-handle" title="Drag to move">
          <i class="fas fa-grip-vertical"></i>
        </div>
        <div class="widget-resize-handle" title="Resize"></div>`;
      Inventory.renderWidget(slot);
    } else if (name === 'Lab Capacity') {
      slot.innerHTML = `
        <button class="widget-slot-remove" onclick="Dashboard.removeWidget(${row},${col})" title="Remove">
          <i class="fas fa-times"></i>
        </button>
        <div class="widget-drag-handle" title="Drag to move">
          <i class="fas fa-grip-vertical"></i>
        </div>
        <div class="widget-resize-handle" title="Resize"></div>`;
      LabCapacity._updateWidget();
    } else {
      slot.innerHTML = `
        <button class="widget-slot-remove" onclick="Dashboard.removeWidget(${row},${col})" title="Remove">
          <i class="fas fa-times"></i>
        </button>
        <div class="widget-drag-handle" title="Drag to move">
          <i class="fas fa-grip-vertical"></i>
        </div>
        <i class="fas ${icon} widget-slot-icon"></i>
        <span class="widget-slot-name">${name}</span>
        <div class="widget-resize-handle" title="Resize"></div>`;
    }

    // Mark covered cells
    for (let rr = row; rr < row + spanH; rr++) {
      for (let cc = col; cc < col + spanW; cc++) {
        if (rr === row && cc === col) continue;
        _slots[rr][cc].dataset.covered = '1';
        _slots[rr][cc].style.display = 'none';
      }
    }

    slot.querySelector('.widget-drag-handle')
        ?.addEventListener('mousedown', (e) => _startDrag(e, row, col));
    slot.querySelector('.widget-resize-handle')
        ?.addEventListener('mousedown', (e) => _startResize(e, row, col));

    // Widget click — fire on slot but ignore control buttons
    slot.addEventListener('click', (e) => {
      if (e.target.closest('.widget-slot-remove')) return;
      if (e.target.closest('.widget-drag-handle'))  return;
      if (e.target.closest('.widget-resize-handle')) return;
      _onWidgetClick(name);
    });
  }

  // ── Widget click routing ──────────────────────────────
  function _onWidgetClick(name) {
    const handlers = {
      'Excel Import':  () => ExcelImport.openImporter(),
      'Add Sample':    () => AddSample.open(),
      'Lab Capacity':  () => LabCapacity.openDetail(),
      'Inventory':     () => {}, // handled by renderWidget
      'Export Data':   () => ExportData.open(),
    };
    const handler = handlers[name];
    if (handler) handler();
    else showToast(`${name} — coming soon`, 'info');
  }

  // ── Remove widget ─────────────────────────────────────
  function removeWidget(row, col, silent = false) {
    const slot = _slots[row][col];
    const spanW = parseInt(slot.dataset.spanW) || 1;
    const spanH = parseInt(slot.dataset.spanH) || 1;

    for (let rr = row; rr < row + spanH; rr++) {
      for (let cc = col; cc < col + spanW; cc++) {
        const s = _slots[rr][cc];
        s.dataset.covered  = '';
        s.style.display    = '';
        s.style.gridColumn = '';
        s.style.gridRow    = '';
      }
    }

    // Clone to wipe ALL stale event listeners before resetting
    const fresh = slot.cloneNode(false);
    fresh.className        = 'widget-slot';
    fresh.dataset.row      = row;
    fresh.dataset.col      = col;
    fresh.dataset.spanW    = 1;
    fresh.dataset.spanH    = 1;
    fresh.dataset.widgetName = '';
    fresh.dataset.widgetIcon = '';
    fresh.dataset.covered  = '';
    fresh.style.cssText    = '';
    fresh.innerHTML = `<span class="plus-icon"><i class="fas fa-plus"></i></span>`;
    fresh._clickHandler = _onSlotClick;
    fresh.addEventListener('click', fresh._clickHandler);
    slot.parentNode.replaceChild(fresh, slot);
    _slots[row][col] = fresh;
    if (!silent) { _saveLayout(); showToast('Widget removed', 'info'); }
  }

  // ── Area free check ───────────────────────────────────
  function _isAreaFree(row, col, spanW, spanH, exRow, exCol, exW, exH) {
    for (let rr = row; rr < row + spanH; rr++) {
      for (let cc = col; cc < col + spanW; cc++) {
        if (rr >= ROWS || cc >= COLS) return false;
        if (exRow !== undefined &&
            rr >= exRow && rr < exRow + exH &&
            cc >= exCol && cc < exCol + exW) continue;
        const s = _slots[rr][cc];
        if (s.classList.contains('filled') || s.dataset.covered === '1') return false;
      }
    }
    return true;
  }

  // ── Cell size helper ──────────────────────────────────
  function _cellSize() {
    const grid = document.getElementById('widget-grid');
    const rect = grid.getBoundingClientRect();
    const gap  = 16;
    return {
      w: (rect.width  - gap * (COLS - 1)) / COLS,
      h: (rect.height - gap * (ROWS - 1)) / ROWS,
      gap,
    };
  }

  // ════════════════════════════════════════════════════
  // RESIZE PREVIEW
  // ════════════════════════════════════════════════════
  function _showResizePreview(row, col, spanW, spanH, valid) {
    if (!_resizePreview) {
      _resizePreview = document.createElement('div');
      _resizePreview.id = 'resize-preview';
      document.getElementById('widget-grid').appendChild(_resizePreview);
    }
    const { w, h, gap } = _cellSize();
    _resizePreview.style.left    = (col * (w + gap)) + 'px';
    _resizePreview.style.top     = (row * (h + gap)) + 'px';
    _resizePreview.style.width   = (spanW * w + (spanW - 1) * gap) + 'px';
    _resizePreview.style.height  = (spanH * h + (spanH - 1) * gap) + 'px';
    _resizePreview.style.display = 'flex';
    _resizePreview.className     = valid ? 'valid' : 'invalid';
    _resizePreview.textContent   = `${spanW} × ${spanH}`;
  }

  function _hideResizePreview() {
    if (_resizePreview) _resizePreview.style.display = 'none';
  }

  // ════════════════════════════════════════════════════
  // DRAG
  // ════════════════════════════════════════════════════
  function _startDrag(e, row, col) {
    e.preventDefault();
    _draggedPos = { row, col };
    _slots[row][col].classList.add('dragging');

    _ghost = document.createElement('div');
    _ghost.id = 'drag-ghost';
    const slot = _slots[row][col];
    _ghost.innerHTML = `<i class="fas ${slot.dataset.widgetIcon}"></i><span>${slot.dataset.widgetName}</span>`;
    document.body.appendChild(_ghost);
    _moveGhost(e);

    document.addEventListener('mousemove', _onDragMove);
    document.addEventListener('mouseup',   _onDragEnd);
  }

  function _onDragMove(e) {
    _moveGhost(e);
    _ghost.style.display = 'none';
    const target = document.elementFromPoint(e.clientX, e.clientY);
    _ghost.style.display = '';
    const slot   = target?.closest('.widget-slot');
    const newPos = slot ? { row: +slot.dataset.row, col: +slot.dataset.col } : null;

    if (_dragOverPos) {
      _slots[_dragOverPos.row][_dragOverPos.col].classList.remove('drag-over');
      _dragOverPos = null;
    }
    if (newPos && !(newPos.row === _draggedPos.row && newPos.col === _draggedPos.col)) {
      const targetSlot = _slots[newPos.row][newPos.col];
      if (!targetSlot.dataset.covered) {
        targetSlot.classList.add('drag-over');
        _dragOverPos = newPos;
      }
    }
  }

  function _onDragEnd() {
    document.removeEventListener('mousemove', _onDragMove);
    document.removeEventListener('mouseup',   _onDragEnd);
    _ghost?.remove(); _ghost = null;

    const from = _draggedPos;
    const to   = _dragOverPos;
    if (from) _slots[from.row][from.col].classList.remove('dragging');
    if (to)   _slots[to.row][to.col].classList.remove('drag-over');
    if (from && to) _swapWidgets(from, to);
    _draggedPos  = null;
    _dragOverPos = null;
  }

  function _swapWidgets(from, to) {
    const fromSlot = _slots[from.row][from.col];
    const toSlot   = _slots[to.row][to.col];
    const fromFilled = fromSlot.classList.contains('filled');
    const toFilled   = toSlot.classList.contains('filled');
    const fromName = fromSlot.dataset.widgetName;
    const fromIcon = fromSlot.dataset.widgetIcon;
    const fromW    = parseInt(fromSlot.dataset.spanW) || 1;
    const fromH    = parseInt(fromSlot.dataset.spanH) || 1;
    const toName   = toSlot.dataset.widgetName;
    const toIcon   = toSlot.dataset.widgetIcon;
    const toW      = parseInt(toSlot.dataset.spanW) || 1;
    const toH      = parseInt(toSlot.dataset.spanH) || 1;

    // Check bounds — widget must fit entirely within the grid at the destination
    const fromFitsAtTo = (to.row + fromH <= ROWS) && (to.col + fromW <= COLS);
    const toFitsAtFrom = (from.row + toH <= ROWS) && (from.col + toW <= COLS);

    if (fromFilled && !fromFitsAtTo) {
      showToast('Widget doesn\'t fit there — would overflow the grid!', 'warn');
      return;
    }

    if (fromFilled) removeWidget(from.row, from.col, true);
    if (toFilled)   removeWidget(to.row,   to.col,   true);

    if (fromFilled) _placeWidget(to.row,   to.col,   fromW, fromH, fromName, fromIcon);
    if (toFilled && toFitsAtFrom) _placeWidget(from.row, from.col, toW, toH, toName, toIcon);
    else if (toFilled && !toFitsAtFrom) {
      // Try to place the displaced widget somewhere else
      let placed = false;
      for (let r = 0; r < ROWS && !placed; r++) {
        for (let c = 0; c < COLS && !placed; c++) {
          if (r + toH <= ROWS && c + toW <= COLS && _isAreaFree(r, c, toW, toH)) {
            _placeWidget(r, c, toW, toH, toName, toIcon);
            placed = true;
          }
        }
      }
      if (!placed) showToast(`${toName} couldn\'t be repositioned — no space available`, 'warn');
    }
    _saveLayout();
  }

  // ════════════════════════════════════════════════════
  // RESIZE
  // ════════════════════════════════════════════════════
  function _startResize(e, row, col) {
    e.preventDefault();
    e.stopPropagation();
    const slot = _slots[row][col];
    _resizing = {
      row, col,
      startW:   parseInt(slot.dataset.spanW) || 1,
      startH:   parseInt(slot.dataset.spanH) || 1,
      originX:  e.clientX,
      originY:  e.clientY,
      currentW: parseInt(slot.dataset.spanW) || 1,
      currentH: parseInt(slot.dataset.spanH) || 1,
    };
    document.addEventListener('mousemove', _onResizeMove);
    document.addEventListener('mouseup',   _onResizeEnd);
  }

  function _onResizeMove(e) {
    if (!_resizing) return;
    const { row, col, startW, startH, originX, originY } = _resizing;
    const { w, h, gap } = _cellSize();
    const newW = Math.min(COLS - col, Math.max(1, startW + Math.round((e.clientX - originX) / (w + gap))));
    const newH = Math.min(ROWS - row, Math.max(1, startH + Math.round((e.clientY - originY) / (h + gap))));
    const valid = _isAreaFree(row, col, newW, newH, row, col, _resizing.currentW, _resizing.currentH);
    _showResizePreview(row, col, newW, newH, valid);
    if (!valid || (newW === _resizing.currentW && newH === _resizing.currentH)) return;
    const name = _slots[row][col].dataset.widgetName;
    const icon = _slots[row][col].dataset.widgetIcon;
    removeWidget(row, col, true);
    _placeWidget(row, col, newW, newH, name, icon);
    _resizing.currentW = newW;
    _resizing.currentH = newH;
    _slots[row][col].querySelector('.widget-resize-handle')
      .addEventListener('mousedown', (ev) => _startResize(ev, row, col));
  }

  function _onResizeEnd() {
    document.removeEventListener('mousemove', _onResizeMove);
    document.removeEventListener('mouseup',   _onResizeEnd);
    _hideResizePreview();
    if (_resizing) _saveLayout();
    _resizing = null;
  }

  function _moveGhost(e) {
    if (!_ghost) return;
    _ghost.style.left = (e.clientX + 14) + 'px';
    _ghost.style.top  = (e.clientY + 14) + 'px';
  }

  function init() {
    buildGrid();
    WidgetPanel.init();
    _loadLayout();
  }

  return { init, addWidget, removeWidget };
})();

window.Dashboard = Dashboard;
