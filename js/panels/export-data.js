/* ============================================================
   export-data.js — Export Data Widget
   LabGuy Application

   Flow:
   1. Load all inventory + metadata
   2. Search bar + metadata filters narrow rows
   3. Column selector chooses which fields to include
   4. Preview table shows exactly what will be exported
   5. Export to Excel or PDF
============================================================ */

const ExportData = (() => {

  const INV_PATH   = 'Inventory';
  const META_PATH  = 'Metadata';
  const ORDER_PATH = 'MetadataOrder';

  let _samples     = [];   // all inventory rows { _id, ...fields }
  let _fields      = [];   // { key, label, selected }
  let _searchTerm  = '';
  let _activeFilters  = []; // [{ key, label, value }]
  let _selectedIds   = new Set(); // manually selected sample IDs
  let _selectMode    = false;

  const _sanitizeKey = str => str.replace(/[.#$\/\[\]]/g, '_').trim();

  // ── Open ──────────────────────────────────────────────
  async function open() {
    document.getElementById('export-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'export-overlay';
    overlay.innerHTML = `
      <div class="export-modal export-modal-wide">
        <div class="export-header">
          <div class="inv-sample-icon"><i class="fas fa-file-export"></i></div>
          <div>
            <h3 class="inv-sample-title">Export Data</h3>
            <p class="inv-sample-sub">Filter, preview, then export your inventory</p>
          </div>
          <button class="as-close" onclick="ExportData.close()">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="export-body" id="export-body">
          <div style="text-align:center;padding:40px;color:var(--text-muted)">
            <i class="fas fa-spinner fa-spin" style="font-size:24px"></i>
            <p style="margin-top:10px">Loading inventory...</p>
          </div>
        </div>

        <div class="export-footer">
          <button class="as-btn cancel" onclick="ExportData.close()">Cancel</button>
          <button class="as-btn secondary" onclick="ExportData.exportXLS()">
            <i class="fas fa-file-excel"></i> Export Excel
          </button>
          <button class="as-btn primary" onclick="ExportData.exportPDF()">
            <i class="fas fa-file-pdf"></i> Export PDF
          </button>
        </div>
      </div>`;

    overlay.addEventListener('click', e => { if (e.target === overlay) ExportData.close(); });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));

    await _loadData();
    _renderBody();
  }

  // ── Load data ─────────────────────────────────────────
  async function _loadData() {
    const [invSnap, metaSnap, orderSnap] = await Promise.all([
      window.fbDB.ref(INV_PATH).once('value'),
      window.fbDB.ref(META_PATH).once('value'),
      window.fbDB.ref(ORDER_PATH).once('value'),
    ]);

    _samples = [];
    if (invSnap.exists()) {
      const val = invSnap.val();
      Object.entries(val).forEach(([key, data]) => {
        _samples.push({ _id: key, ...data });
      });
    }

    const metaVal   = metaSnap.exists() ? metaSnap.val() : {};
    const allFields = Object.entries(metaVal).map(([key, label]) => ({
      key, label: typeof label === 'string' ? label : key, selected: true
    }));
    if (orderSnap.exists()) {
      const order   = orderSnap.val();
      const ordered = order.map(k => allFields.find(f => f.key === k)).filter(Boolean);
      allFields.forEach(f => { if (!ordered.find(o => o.key === f.key)) ordered.push(f); });
      _fields = ordered;
    } else {
      _fields = allFields;
    }

    _metaFilters = {};
    _fields.forEach(f => { _metaFilters[f.key] = ''; });
    _searchTerm   = '';
    _selectedIds  = new Set();
    _selectMode   = false;
  }

  // ── Render full body ──────────────────────────────────
  function _renderBody() {
    const body = document.getElementById('export-body');
    if (!body) return;

    const filtered  = _getFiltered();
    const selFields = _fields.filter(f => f.selected);

    const chipHtml = _activeFilters.map((f, i) => `
      <div class="export-filter-chip">
        <span class="export-chip-label">${f.label}</span>
        <span class="export-chip-eq">=</span>
        <span class="export-chip-val">${f.value}</span>
        <button class="export-chip-remove" onclick="ExportData.removeFilter(${i})">
          <i class="fas fa-times"></i>
        </button>
      </div>`).join('');

    body.innerHTML = `
      <!-- Search bar -->
      <div class="export-top-bar">
        <div class="export-search-wrap">
          <i class="fas fa-search export-search-icon"></i>
          <input class="export-search" placeholder="Search all fields…"
                 value="${_searchTerm}"
                 oninput="ExportData.onSearch(this.value)"/>
          ${_searchTerm ? `<button class="export-search-clear" onclick="ExportData.onSearch('')"><i class="fas fa-times"></i></button>` : ''}
        </div>
        <button class="export-tiny-btn ${_selectMode ? 'active-green' : ''}" onclick="ExportData.toggleSelectMode()" style="white-space:nowrap">
          <i class="fas fa-check-square"></i> ${_selectMode ? `${_selectedIds.size} selected` : 'Pick Samples'}
        </button>
        <span class="export-count-badge">${_selectMode && _selectedIds.size ? _selectedIds.size : filtered.length} / ${_samples.length} samples</span>
      </div>

      <!-- Filter builder -->
      <div class="export-filter-builder">
        <select class="export-filter-select" id="export-filter-key">
          <option value="">Select field…</option>
          ${_fields.map(f => `<option value="${f.key}">${f.label}</option>`).join('')}
        </select>
        <input class="export-filter-input" id="export-filter-val" placeholder="Type value…"
               onkeydown="if(event.key==='Enter') ExportData.addFilter()"/>
        <button class="export-add-filter-btn" onclick="ExportData.addFilter()">
          <i class="fas fa-plus"></i> Add Filter
        </button>
      </div>

      <!-- Active filter chips -->
      ${_activeFilters.length ? `<div class="export-chips-row">${chipHtml}</div>` : ''}

      <!-- Two column layout -->
      <div class="export-layout">

        <!-- LEFT: Column selector -->
        <div class="export-left">
          <div class="export-section-label" style="display:flex;justify-content:space-between;align-items:center">
            <span><i class="fas fa-columns"></i> Include Columns</span>
            <span>
              <button class="export-tiny-btn" onclick="ExportData.selectAllFields(true)">All</button>
              <button class="export-tiny-btn" onclick="ExportData.selectAllFields(false)">None</button>
            </span>
          </div>
          <div class="export-field-grid">
            ${_fields.map((f, i) => `
              <label class="export-field-pill ${f.selected ? 'active' : ''}">
                <input type="checkbox" ${f.selected ? 'checked' : ''}
                       onchange="ExportData.toggleField(${i}, this.checked)" style="display:none"/>
                ${f.label}
              </label>`).join('')}
          </div>
        </div>

        <!-- RIGHT: Preview table -->
        <div class="export-right">
          <div class="export-section-label">
            <i class="fas fa-table"></i> Preview
            <span class="export-preview-note">${filtered.length} row${filtered.length !== 1 ? 's' : ''} · ${selFields.length} column${selFields.length !== 1 ? 's' : ''}</span>
          </div>
          <div class="export-preview-wrap">
            ${filtered.length ? `
              <table class="export-preview-table">
                <thead><tr>
                  ${_selectMode ? '<th style="width:28px"></th>' : ''}
                  <th>#</th>
                  ${selFields.map(f => `<th>${f.label}</th>`).join('')}
                </tr></thead>
                <tbody>
                  ${filtered.slice(0, 100).map(s => `
                    <tr class="${_selectMode && _selectedIds.has(s._id) ? 'export-row-selected' : ''}"
                        ${_selectMode ? `onclick="ExportData.toggleRow('${s._id}')" style="cursor:pointer"` : ''}>
                      ${_selectMode ? `<td><input type="checkbox" class="export-row-check" ${_selectedIds.has(s._id) ? 'checked' : ''} onclick="event.stopPropagation();ExportData.toggleRow('${s._id}')"/></td>` : ''}
                      <td class="export-id-cell">${s._id}</td>
                      ${selFields.map(f => `<td>${s[f.key] ?? ''}</td>`).join('')}
                    </tr>`).join('')}
                </tbody>
              </table>
              ${filtered.length > 100 ? `<div class="export-preview-more">Showing first 100 of ${filtered.length} rows</div>` : ''}
            ` : `
              <div class="export-preview-empty">
                <i class="fas fa-search"></i>
                <p>No samples match your filters</p>
              </div>`}
          </div>
        </div>

      </div>`;
  }

  // ── Filter logic ──────────────────────────────────────
  function _getFiltered() {
    return _samples.filter(s => {
      if (_searchTerm) {
        const term = _searchTerm.toLowerCase();
        const match = Object.values(s).some(v => String(v ?? '').toLowerCase().includes(term));
        if (!match) return false;
      }
      for (const f of _activeFilters) {
        if (String(s[f.key] ?? '').toLowerCase() !== f.value.toLowerCase()) return false;
      }
      return true;
    });
  }

  function _buildRows() {
    const filtered = _selectMode && _selectedIds.size
      ? _samples.filter(s => _selectedIds.has(s._id))
      : _getFiltered();
    const fields   = _fields.filter(f => f.selected);
    return filtered.map(s => {
      const row = { 'Sample ID': s._id };
      fields.forEach(f => { row[f.label] = s[f.key] ?? ''; });
      return row;
    });
  }

  // ── Event handlers ────────────────────────────────────
  function onSearch(val) { _searchTerm = val; _renderBody(); }

  function toggleSelectMode() {
    _selectMode = !_selectMode;
    if (!_selectMode) _selectedIds.clear();
    _renderBody();
  }

  function toggleRow(id) {
    if (_selectedIds.has(id)) _selectedIds.delete(id);
    else _selectedIds.add(id);
    // Re-render just the badge + selected state without full rebuild
    document.querySelectorAll('.export-row-selected').forEach(r => r.classList.remove('export-row-selected'));
    document.querySelectorAll('[data-id]').forEach(r => {
      if (_selectedIds.has(r.dataset.id)) r.classList.add('export-row-selected');
    });
    _renderBody();
  }

  function addFilter() {
    const keyEl = document.getElementById('export-filter-key');
    const valEl = document.getElementById('export-filter-val');
    if (!keyEl || !valEl) return;
    const key   = keyEl.value;
    const value = valEl.value.trim();
    if (!key || !value) { showToast('Pick a field and enter a value.', 'warn'); return; }
    const field = _fields.find(f => f.key === key);
    _activeFilters.push({ key, label: field?.label || key, value });
    _renderBody();
  }

  function removeFilter(idx) {
    _activeFilters.splice(idx, 1);
    _renderBody();
  }

  function toggleField(idx, val) { _fields[idx].selected = val; _renderBody(); }
  function selectAllFields(val) { _fields.forEach(f => f.selected = val); _renderBody(); }

  // ── Export Excel ──────────────────────────────────────
  function exportXLS() {
    const rows = _buildRows();
    if (!rows.length) { showToast('No samples to export.', 'warn'); return; }

    const safeRows = rows.map(row => {
      const safe = {};
      Object.entries(row).forEach(([k, v]) => {
        const str = String(v ?? '');
        safe[k] = str.length > 500 ? str.slice(0, 500) + '…' : str;
      });
      return safe;
    });

    const ws = XLSX.utils.json_to_sheet(safeRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
    const cols = Object.keys(safeRows[0]).map(key => ({
      wch: Math.min(60, Math.max(key.length, ...safeRows.map(r => String(r[key] ?? '').length)) + 2)
    }));
    ws['!cols'] = cols;

    const filename = `LabGuy_Export_${_dateStr()}.xlsx`;
    XLSX.writeFile(wb, filename);
    showToast(`Exported ${rows.length} samples to Excel!`, 'success');
  }

  // ── Export PDF ────────────────────────────────────────
  function exportPDF() {
    const rows = _buildRows();
    if (!rows.length) { showToast('No samples to export.', 'warn'); return; }
    if (!window.jspdf?.jsPDF) { showToast('PDF library not loaded. Try refreshing.', 'error'); return; }

    showToast('Generating PDF...', 'info');
    setTimeout(() => {
      try {
        const { jsPDF } = window.jspdf;
        const headers   = Object.keys(rows[0]);
        const colWidth  = 28;
        const pageWidth = Math.max(297, headers.length * colWidth + 20);
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [210, pageWidth] });

        const pw = doc.internal.pageSize.getWidth();
        doc.setFillColor(19, 19, 31);
        doc.rect(0, 0, pw, 22, 'F');
        doc.setTextColor(46, 204, 113);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('LabGuy \u2014 Inventory Export', 14, 13);
        doc.setTextColor(160, 160, 160);
        doc.setFontSize(8);
        doc.text('Generated: ' + new Date().toLocaleString() + '  \u00B7  ' + rows.length + ' samples', 14, 20);

        const body     = rows.map(r => headers.map(h => String(r[h] ?? '')));
        const safeBody = body.map(row => row.map(c => c.length > 80 ? c.slice(0, 80) + '…' : c));

        doc.autoTable({
          startY: 25, head: [headers], body: safeBody, theme: 'grid',
          styles: { fontSize: 6, cellPadding: 1.5, textColor: [220,220,220], fillColor: [22,22,36], overflow: 'linebreak', minCellHeight: 6 },
          headStyles: { fillColor: [19,19,31], textColor: [46,204,113], fontStyle: 'bold', fontSize: 7 },
          alternateRowStyles: { fillColor: [30,30,48], textColor: [220,220,220] },
          margin: { left: 10, right: 10 },
          tableWidth: pageWidth - 20,
        });

        doc.save('LabGuy_Export_' + _dateStr() + '.pdf');
        showToast('Exported ' + rows.length + ' samples to PDF!', 'success');
      } catch (err) {
        showToast('PDF failed: ' + err.message, 'error');
      }
    }, 100);
  }

  function _dateStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  // ── Close ─────────────────────────────────────────────
  function close() {
    const overlay = document.getElementById('export-overlay');
    if (!overlay) return;
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 250);
  }

  return { open, close, onSearch, addFilter, removeFilter, toggleField, selectAllFields, toggleSelectMode, toggleRow, exportXLS, exportPDF };
})();

window.ExportData = ExportData;
