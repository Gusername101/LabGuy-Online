/* ============================================================
   excel-import.js — Excel Import Widget
   LabGuy Application

   Flow:
   1. Drop/select Excel or CSV file
   2. Preview: shows new fields, existing fields, row count
   3. Ask placement preference: Auto or Manual per sample
   4. Import: saves new metadata fields + all rows to /Inventory
      - Auto: each row gets next available empty slot
      - Manual: opens placement tree per row (like BulkAdd)
   ============================================================ */

const ExcelImport = (() => {

  const META_PATH  = 'Metadata';
  const ORDER_PATH = 'MetadataOrder';
  const INV_PATH   = 'Inventory';
  const LABS_PATH  = 'Labs';

  let _parsedHeaders  = [];
  let _parsedRows     = [];
  let _newFields      = [];
  let _existingFields = [];
  let _placementMode  = null; // 'auto' | 'manual'
  let _labs           = {};

  const _sanitizeKey = str => str.replace(/[.#$\/\[\]]/g, '_').trim();
  const _natSort     = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

  // ── Open modal ────────────────────────────────────────
  function openImporter() {
    document.getElementById('excel-import-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'excel-import-overlay';
    overlay.innerHTML = `
      <div class="excel-modal">
        <div class="excel-modal-header">
          <div class="excel-modal-icon"><i class="fas fa-file-excel"></i></div>
          <div>
            <h3>Import Data</h3>
            <p class="excel-modal-subtitle" id="excel-subtitle">Upload your spreadsheet to import samples</p>
          </div>
          <button class="excel-modal-close" onclick="ExcelImport.close()">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="excel-dropzone" id="excel-dropzone"
             onclick="document.getElementById('excel-file-input').click()"
             ondragover="ExcelImport.onDragOver(event)"
             ondragleave="ExcelImport.onDragLeave(event)"
             ondrop="ExcelImport.onDrop(event)">
          <i class="fas fa-cloud-upload-alt excel-drop-icon"></i>
          <p class="excel-drop-title">Drop your Excel file here</p>
          <p class="excel-drop-sub">or click to browse — .xlsx, .xls, .csv</p>
          <input type="file" id="excel-file-input" accept=".xlsx,.xls,.csv"
                 style="display:none"
                 onchange="ExcelImport.onFileSelected(event)"/>
        </div>

        <!-- Step 2: Preview -->
        <div id="excel-preview" class="excel-preview" style="display:none">
          <div class="excel-preview-header">
            <div id="excel-file-info" class="excel-file-info"></div>
            <button class="excel-clear-btn" onclick="ExcelImport.clearFile()">
              <i class="fas fa-times"></i> Clear
            </button>
          </div>
          <div id="excel-new-fields-wrap" style="display:none">
            <div class="excel-section-label" style="color:var(--accent-green)">
              <i class="fas fa-plus-circle"></i> New Fields (will be added to Metadata)
            </div>
            <div id="excel-new-tags" class="excel-metadata-tags"></div>
          </div>
          <div id="excel-existing-wrap" style="display:none">
            <div class="excel-section-label" style="color:var(--text-muted)">
              <i class="fas fa-check-circle"></i> Already in Database
            </div>
            <div id="excel-existing-tags" class="excel-metadata-tags"></div>
          </div>
          <div id="excel-row-info" class="excel-row-info"></div>
        </div>

        <!-- Step 3: Placement choice -->
        <div id="excel-placement" style="display:none">
          <div class="excel-section-label">
            <i class="fas fa-map-marker-alt"></i> How should samples be placed?
          </div>
          <div class="as-placement-options" style="margin-top:10px">
            <button class="as-place-btn ${_placementMode === 'auto' ? 'selected' : ''}"
                    id="excel-auto-btn" onclick="ExcelImport.setPlacement('auto')">
              <i class="fas fa-magic"></i>
              <span class="as-place-title">Auto Place</span>
              <span class="as-place-desc">System fills next available slots in order</span>
            </button>
            <button class="as-place-btn ${_placementMode === 'manual' ? 'selected' : ''}"
                    id="excel-manual-btn" onclick="ExcelImport.setPlacement('manual')">
              <i class="fas fa-hand-pointer"></i>
              <span class="as-place-title">Manual Place</span>
              <span class="as-place-desc">Choose a location for each sample one by one</span>
            </button>
          </div>
        </div>

        <div class="excel-modal-actions">
          <button class="excel-btn cancel" onclick="ExcelImport.close()">Cancel</button>
          <button class="excel-btn confirm" id="excel-import-btn"
                  onclick="ExcelImport.importData()" disabled>
            <i class="fas fa-upload"></i> Import
          </button>
        </div>
      </div>`;

    overlay.addEventListener('click', e => { if (e.target === overlay) ExcelImport.close(); });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
  }

  // ── Drag & drop ───────────────────────────────────────
  function onDragOver(e) { e.preventDefault(); document.getElementById('excel-dropzone')?.classList.add('drag-over'); }
  function onDragLeave()  { document.getElementById('excel-dropzone')?.classList.remove('drag-over'); }
  function onDrop(e)      { e.preventDefault(); document.getElementById('excel-dropzone')?.classList.remove('drag-over'); const f = e.dataTransfer.files[0]; if (f) _processFile(f); }
  function onFileSelected(e) { const f = e.target.files[0]; if (f) _processFile(f); }

  // ── Process file ──────────────────────────────────────
  function _processFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'csv') {
      const reader = new FileReader();
      reader.onload = e => _parseCSV(e.target.result, file.name);
      reader.readAsText(file);
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = e => _parseXLSX(e.target.result, file.name);
      reader.readAsArrayBuffer(file);
    } else {
      showToast('Please upload a .xlsx, .xls, or .csv file.', 'warn');
    }
  }

  function _parseCSV(text, filename) {
    const lines = text.trim().split('\n');
    if (!lines.length) { showToast('File appears empty.', 'warn'); return; }
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows    = lines.slice(1).map(line =>
      line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    );
    _onParsed(headers, rows, filename);
  }

  function _parseXLSX(buffer, filename) {
    if (typeof XLSX === 'undefined') { showToast('XLSX library not loaded.', 'error'); return; }
    const wb    = XLSX.read(buffer, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data  = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    if (!data.length) { showToast('File appears empty.', 'warn'); return; }
    const headers = data[0].map(h => String(h ?? '').trim());
    const rows    = data.slice(1).map(row =>
      headers.map((_, i) => String(row[i] ?? '').trim())
    );
    _onParsed(headers, rows, filename);
  }

  async function _onParsed(headers, rows, filename) {
    _parsedHeaders = headers.filter(Boolean);
    _parsedRows    = rows.filter(r => r.some(v => v)); // skip fully empty rows

    // Check labs exist
    const labsSnap = await window.fbDB.ref(LABS_PATH).once('value');
    _labs = labsSnap.exists() ? labsSnap.val() : {};
    if (!Object.keys(_labs).length) {
      showToast('No labs found. Ask an Admin to create a lab first.', 'warn');
      return;
    }

    const snap = await window.fbDB.ref(META_PATH).once('value');
    let existingOriginals = [];
    if (snap.exists()) {
      existingOriginals = Object.values(snap.val()).map(v => String(v).toLowerCase().trim());
    }

    _newFields      = _parsedHeaders.filter(h => !existingOriginals.includes(h.toLowerCase().trim()));
    _existingFields = _parsedHeaders.filter(h =>  existingOriginals.includes(h.toLowerCase().trim()));

    _showPreview(filename);
  }

  function _showPreview(filename) {
    document.getElementById('excel-dropzone').style.display = 'none';
    document.getElementById('excel-preview').style.display  = '';
    document.getElementById('excel-placement').style.display = '';
    document.getElementById('excel-subtitle').textContent   = 'Review your import before confirming';

    document.getElementById('excel-file-info').innerHTML =
      `<i class="fas fa-file-excel" style="color:#2ecc71"></i> <strong>${filename}</strong>`;

    const newWrap = document.getElementById('excel-new-fields-wrap');
    if (_newFields.length) {
      newWrap.style.display = '';
      document.getElementById('excel-new-tags').innerHTML =
        _newFields.map(h => `<span class="excel-tag new">${h}</span>`).join('');
    } else { newWrap.style.display = 'none'; }

    const exWrap = document.getElementById('excel-existing-wrap');
    if (_existingFields.length) {
      exWrap.style.display = '';
      document.getElementById('excel-existing-tags').innerHTML =
        _existingFields.map(h => `<span class="excel-tag existing">${h}</span>`).join('');
    } else { exWrap.style.display = 'none'; }

    document.getElementById('excel-row-info').innerHTML =
      `<i class="fas fa-table"></i> <strong>${_parsedRows.length}</strong> sample rows detected`;
  }

  function setPlacement(mode) {
    _placementMode = mode;
    document.getElementById('excel-auto-btn')?.classList.toggle('selected', mode === 'auto');
    document.getElementById('excel-manual-btn')?.classList.toggle('selected', mode === 'manual');
    document.getElementById('excel-import-btn').disabled = false;
  }

  // ── Clear ─────────────────────────────────────────────
  function clearFile() {
    _parsedHeaders = []; _parsedRows = []; _newFields = []; _existingFields = []; _placementMode = null;
    document.getElementById('excel-dropzone').style.display  = '';
    document.getElementById('excel-preview').style.display   = 'none';
    document.getElementById('excel-placement').style.display = 'none';
    document.getElementById('excel-import-btn').disabled     = true;
    document.getElementById('excel-file-input').value        = '';
  }

  // ── Import ────────────────────────────────────────────
  async function importData() {
    if (!_placementMode) { showToast('Please choose a placement method.', 'warn'); return; }

    const btn = document.getElementById('excel-import-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importing...';
    btn.disabled  = true;

    try {
      // 1. Save new metadata fields
      if (_newFields.length) {
        const metaSnap  = await window.fbDB.ref(META_PATH).once('value');
        const orderSnap = await window.fbDB.ref(ORDER_PATH).once('value');
        const metaUpdates = {};
        _newFields.forEach(field => { metaUpdates[_sanitizeKey(field)] = field; });
        await window.fbDB.ref(META_PATH).update(metaUpdates);

        // Update MetadataOrder
        const existingOrder = orderSnap.exists() ? orderSnap.val() : [];
        const newOrder = [...existingOrder, ..._newFields.map(f => _sanitizeKey(f))];
        await window.fbDB.ref(ORDER_PATH).set(newOrder);
      }

      // 2. Get all field keys (new + existing) in order
      const allFieldKeys = _parsedHeaders.map(h => _sanitizeKey(h));

      // 3. Get next inventory ID
      const invSnap = await window.fbDB.ref(INV_PATH).once('value');
      let nextId = 1;
      if (invSnap.exists()) {
        const keys = Object.keys(invSnap.val()).map(Number).filter(n => !isNaN(n));
        nextId = keys.length ? Math.max(...keys) + 1 : 1;
      }

      // 4. Place samples
      if (_placementMode === 'auto') {
        await _autoImport(allFieldKeys, nextId);
      } else {
        // Build preFilledRows BEFORE close() wipes _parsedRows
        const preFilledRows = _parsedRows.map(row => {
          const obj = {};
          _parsedHeaders.forEach((h, i) => { obj[_sanitizeKey(h)] = row[i] || ''; });
          return obj;
        });
        close();
        BulkAdd.openWithData(preFilledRows, nextId);
      }
    } catch (err) {
      console.error('[ExcelImport] Failed:', err);
      showToast(`Import failed: ${err.message}`, 'error');
      btn.innerHTML = '<i class="fas fa-upload"></i> Import';
      btn.disabled  = false;
    }
  }

  // ── Auto import ───────────────────────────────────────
  async function _autoImport(fieldKeys, nextId) {
    const labsSnap = await window.fbDB.ref(LABS_PATH).once('value');
    const labs     = labsSnap.exists() ? labsSnap.val() : {};
    const updates  = {};
    let   saved    = 0;
    let   skipped  = 0;

    for (let i = 0; i < _parsedRows.length; i++) {
      const row      = _parsedRows[i];
      const labNames = Object.keys(labs).sort(_natSort);
      let   placed   = false;

      for (const labName of labNames) {
        const found = _findNextEmpty(labs[labName], labName);
        if (found) {
          // Mark occupied in local cache
          _setNestedStatus(labs, found.path, 'occupied');

          const sample = { Location: found.path };
          fieldKeys.forEach((k, idx) => { sample[k] = row[idx] || ''; });

          updates[`${INV_PATH}/${nextId + saved}`]         = sample;
          updates[`${LABS_PATH}/${found.path}/status`]     = 'occupied';
          saved++;
          placed = true;
          break;
        }
      }
      if (!placed) skipped++;
    }

    if (Object.keys(updates).length) {
      await window.fbDB.ref('/').update(updates);
    }

    if (skipped > 0) {
      showToast(`${saved} samples imported. ${skipped} skipped — not enough empty slots!`, 'warn');
    } else {
      showToast(`${saved} sample${saved !== 1 ? 's' : ''} imported successfully!`, 'success');
    }
    close();
  }

  function _findNextEmpty(node, pathSoFar) {
    if (!node || typeof node !== 'object') return null;
    const SKIP = ['createdAt', 'spots'];
    for (const key of Object.keys(node).sort(_natSort)) {
      if (SKIP.includes(key)) continue;
      const child    = node[key];
      const fullPath = `${pathSoFar}/${key}`;
      if (child?.status === 'empty') return { path: fullPath, positionName: key };
      if (typeof child === 'object' && child.status !== 'occupied') {
        const found = _findNextEmpty(child, fullPath);
        if (found) return found;
      }
    }
    return null;
  }

  function _setNestedStatus(obj, path, value) {
    const parts = path.split('/');
    let node = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]]) return;
      node = node[parts[i]];
    }
    const last = parts[parts.length - 1];
    if (node[last] && typeof node[last] === 'object') node[last].status = value;
  }

  // ── Close ─────────────────────────────────────────────
  function close() {
    clearFile();
    const overlay = document.getElementById('excel-import-overlay');
    if (!overlay) return;
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 250);
  }

  return {
    openImporter, close, clearFile, importData, setPlacement,
    onDragOver, onDragLeave, onDrop, onFileSelected,
  };
})();

window.ExcelImport = ExcelImport;
