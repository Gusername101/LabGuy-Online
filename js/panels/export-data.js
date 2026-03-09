/* ============================================================
   export-data.js — Export Data Widget
   LabGuy Application

   Exports all inventory samples to:
   - .xlsx (Excel) via SheetJS
   - .pdf  via jsPDF + autotable

   Features:
   - Filter by lab
   - Choose which fields to include
   - Preview row count before exporting
============================================================ */

const ExportData = (() => {

  const INV_PATH  = 'Inventory';
  const META_PATH = 'Metadata';
  const ORDER_PATH = 'MetadataOrder';
  const LABS_PATH = 'Labs';

  let _samples   = [];   // raw inventory rows
  let _fields    = [];   // { key, label }
  let _labs      = [];   // lab names for filter
  let _labFilter = 'all';

  const _sanitizeKey = str => str.replace(/[.#$\/\[\]]/g, '_').trim();

  // ── Open modal ────────────────────────────────────────
  async function open() {
    document.getElementById('export-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'export-overlay';
    overlay.innerHTML = `
      <div class="export-modal">
        <div class="export-header">
          <div class="inv-sample-icon"><i class="fas fa-file-export"></i></div>
          <div>
            <h3 class="inv-sample-title">Export Data</h3>
            <p class="inv-sample-sub">Download your inventory as Excel or PDF</p>
          </div>
          <button class="as-close" onclick="ExportData.close()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="export-body" id="export-body">
          <div style="text-align:center;padding:30px;color:var(--text-muted)">
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
    const [invSnap, metaSnap, orderSnap, labsSnap] = await Promise.all([
      window.fbDB.ref(INV_PATH).once('value'),
      window.fbDB.ref(META_PATH).once('value'),
      window.fbDB.ref(ORDER_PATH).once('value'),
      window.fbDB.ref(LABS_PATH).once('value'),
    ]);

    // Build samples array
    _samples = [];
    if (invSnap.exists()) {
      invSnap.forEach(child => {
        _samples.push({ _id: child.key, ...child.val() });
      });
    }

    // Build ordered fields (exclude Location)
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

    // Build lab list for filter
    _labs = labsSnap.exists() ? Object.keys(labsSnap.val()).sort() : [];
    _labFilter = 'all';
  }

  // ── Render body ───────────────────────────────────────
  function _renderBody() {
    const body = document.getElementById('export-body');
    if (!body) return;

    const filtered = _getFiltered();

    body.innerHTML = `
      <!-- Lab filter -->
      <div class="export-section">
        <div class="export-section-label"><i class="fas fa-filter"></i> Filter by Lab</div>
        <div class="export-lab-pills">
          <button class="export-lab-pill ${_labFilter === 'all' ? 'active' : ''}"
                  onclick="ExportData.setLabFilter('all')">All Labs</button>
          ${_labs.map(lab => `
            <button class="export-lab-pill ${_labFilter === lab ? 'active' : ''}"
                    onclick="ExportData.setLabFilter('${lab}')">
              ${lab}
            </button>`).join('')}
        </div>
      </div>

      <!-- Field selector -->
      <div class="export-section">
        <div class="export-section-label" style="display:flex;justify-content:space-between">
          <span><i class="fas fa-columns"></i> Include Fields</span>
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

      <!-- Summary -->
      <div class="export-summary">
        <i class="fas fa-table"></i>
        <strong>${filtered.length}</strong> sample${filtered.length !== 1 ? 's' : ''} ·
        <strong>${_fields.filter(f => f.selected).length}</strong> field${_fields.filter(f => f.selected).length !== 1 ? 's' : ''}
        will be exported
      </div>`;
  }

  // ── Helpers ───────────────────────────────────────────
  function _getFiltered() {
    if (_labFilter === 'all') return _samples;
    return _samples.filter(s => {
      const loc = s.Location || '';
      return loc.startsWith(_labFilter + '/') || loc === _labFilter;
    });
  }

  function _getSelectedFields() {
    return _fields.filter(f => f.selected);
  }

  function _buildRows() {
    const filtered = _getFiltered();
    const fields   = _getSelectedFields();
    return filtered.map(s => {
      const row = { 'Sample ID': s._id };
      fields.forEach(f => { row[f.label] = s[f.key] ?? ''; });
      return row;
    });
  }

  function setLabFilter(lab) {
    _labFilter = lab;
    _renderBody();
  }

  function toggleField(idx, val) {
    _fields[idx].selected = val;
    _renderBody();
  }

  function selectAllFields(val) {
    _fields.forEach(f => f.selected = val);
    _renderBody();
  }

  // ── Export Excel ──────────────────────────────────────
  function exportXLS() {
    const rows = _buildRows();
    if (!rows.length) { showToast('No samples to export.', 'warn'); return; }

    // Truncate any cell value over 500 chars to avoid SheetJS max cell size error
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

    // Auto column widths (capped at 60)
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

    try {
      if (!window.jspdf || !window.jspdf.jsPDF) {
        showToast('PDF library not loaded. Try refreshing the page.', 'error');
        return;
      }

      showToast('Generating PDF...', 'info');

      // Use setTimeout to let the toast render before blocking PDF work
      setTimeout(() => {
        try {
          const { jsPDF } = window.jspdf;
          const headers = Object.keys(rows[0]);

          // Dynamically size page width to fit all columns (min a4 landscape = 297mm)
          const colWidth  = 28; // mm per column
          const pageWidth = Math.max(297, headers.length * colWidth + 20);
          const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [210, pageWidth] });

          // Header bar
          const pw = doc.internal.pageSize.getWidth();
          doc.setFillColor(19, 19, 31);
          doc.rect(0, 0, pw, 22, 'F');
          doc.setTextColor(46, 204, 113);
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.text('LabGuy — Inventory Export', 14, 13);
          doc.setTextColor(160, 160, 160);
          doc.setFontSize(8);
          doc.text('Generated: ' + new Date().toLocaleString() + '  ·  ' + rows.length + ' samples', 14, 20);

          // Table
          const body = rows.map(r => headers.map(h => String(r[h] ?? '')));

          // Truncate long cell values so no row exceeds page height
          const safeBody = body.map(row =>
            row.map(cell => cell.length > 80 ? cell.slice(0, 80) + '…' : cell)
          );

          doc.autoTable({
            startY:     25,
            head:       [headers],
            body:       safeBody,
            theme:      'grid',
            styles:     {
              fontSize: 6,
              cellPadding: 1.5,
              textColor: [220, 220, 220],
              fillColor: false,
              overflow: 'linebreak',
              cellWidth: 'wrap',
              minCellHeight: 6,
            },
            headStyles: { fillColor: [30, 30, 50], textColor: [46, 204, 113], fontStyle: 'bold', fontSize: 7 },
            alternateRowStyles: { fillColor: [30, 30, 46] },
            margin: { left: 10, right: 10 },
            tableWidth: pageWidth - 20,
          });

          const filename = 'LabGuy_Export_' + _dateStr() + '.pdf';
          doc.save(filename);
          showToast('Exported ' + rows.length + ' samples to PDF!', 'success');
        } catch (inner) {
          console.error('[ExportData] PDF generation failed:', inner);
          showToast('PDF failed: ' + inner.message, 'error');
        }
      }, 100);

    } catch (err) {
      console.error('[ExportData] PDF error:', err);
      showToast('PDF export failed. Try XLS instead.', 'error');
    }
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

  return { open, close, setLabFilter, toggleField, selectAllFields, exportXLS, exportPDF };
})();

window.ExportData = ExportData;
