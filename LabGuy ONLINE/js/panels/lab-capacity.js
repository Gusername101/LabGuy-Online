/* ============================================================
   lab-capacity.js — Lab Capacity widget + navigable detail modal
   LabGuy Application
   ============================================================ */

const LabCapacity = (() => {

  let _rawData    = null;
  let _listener   = null;
  let _breadcrumb = []; // [{name, node}]

  // ── Count spots recursively ───────────────────────────
  function _countSpots(node) {
    let occupied = 0, empty = 0;
    function walk(n) {
      if (!n || typeof n !== 'object') return;
      if (n.status === 'occupied') { occupied++; return; }
      if (n.status === 'empty')    { empty++;    return; }
      Object.values(n).forEach(v => { if (typeof v === 'object') walk(v); });
    }
    walk(node);
    return { occupied, empty, total: occupied + empty };
  }

  // ── Is this a leaf node (deepest level)? ─────────────
  function _isLeaf(node) {
    if (!node || typeof node !== 'object') return true;
    return 'status' in node;
  }

  // ── Get child keys (skip status/metadata fields) ──────
  const _natSort = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

  function _getChildren(node) {
    if (!node || typeof node !== 'object') return [];
    const SKIP = ['status', 'createdAt'];
    return Object.keys(node).filter(k => !SKIP.includes(k) && typeof node[k] === 'object').sort(_natSort);
  }

  // ── Overall stats for widget tile ─────────────────────
  function _getOverall() {
    if (!_rawData) return { pct: 0, occupied: 0, total: 0 };
    let occupied = 0, total = 0;
    Object.values(_rawData).forEach(lab => {
      const s = _countSpots(lab);
      occupied += s.occupied;
      total    += s.total;
    });
    return { occupied, total, pct: total > 0 ? Math.round((occupied / total) * 100) : 0 };
  }

  // ── Color based on fill % ─────────────────────────────
  function _color(pct) {
    return pct >= 90 ? '#e74c3c' : pct >= 70 ? '#fd9644' : '#2ecc71';
  }

  // ── Start live listener ───────────────────────────────
  function startListening() {
    if (_listener) return;
    _listener = window.fbDB.ref('Labs').on('value', snap => {
      _rawData = snap.exists() ? snap.val() : {};
      _updateWidget();
    });
  }

  function stopListening() {
    if (_listener) {
      window.fbDB.ref('Labs').off('value', _listener);
      _listener = null;
    }
  }

  // ── Update widget tile ────────────────────────────────
  function _updateWidget() {
    const slot = document.querySelector('.widget-slot.filled[data-widget-name="Lab Capacity"]');
    if (!slot) return;

    let content = slot.querySelector('.lc-widget-content');
    if (!content) {
      content = document.createElement('div');
      content.className = 'lc-widget-content';
      slot.appendChild(content);
    }

    const { pct, occupied, total } = _getOverall();
    const c = _color(pct);

    content.innerHTML = `
      <div class="lc-widget-label">Lab Capacity</div>
      <div class="lc-widget-pct" style="color:${c}">${pct}<span>%</span></div>
      <div class="lc-widget-bar-wrap">
        <div class="lc-widget-bar">
          <div class="lc-widget-bar-fill" style="width:${pct}%;background:${c}"></div>
        </div>
      </div>
      <div class="lc-widget-stats">
        <span style="color:#fd9644"><i class="fas fa-box"></i> ${occupied.toLocaleString()} used</span>
        <span style="color:#2ecc71"><i class="fas fa-box-open"></i> ${(total - occupied).toLocaleString()} free</span>
      </div>`;
  }

  // ── Open modal ────────────────────────────────────────
  function openDetail() {
    document.getElementById('lc-overlay')?.remove();
    _breadcrumb = [{ name: 'All Labs', node: _rawData || {} }];

    const overlay = document.createElement('div');
    overlay.id = 'lc-overlay';
    overlay.innerHTML = `
      <div class="lc-modal">
        <div class="lc-modal-header">
          <div class="lc-header-left">
            <div class="lc-header-icon"><i class="fas fa-flask"></i></div>
            <div>
              <h2 class="lc-modal-title">Lab Capacity</h2>
              <p class="lc-modal-sub">Real-time storage navigator</p>
            </div>
          </div>
          <button class="lc-close" onclick="LabCapacity.close()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="lc-breadcrumb" id="lc-breadcrumb"></div>
        <div class="lc-modal-body" id="lc-modal-body"></div>
      </div>`;

    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));

    // Load data if needed then render
    if (_rawData) {
      _render();
    } else {
      window.fbDB.ref('Labs').once('value').then(snap => {
        _rawData = snap.exists() ? snap.val() : {};
        _breadcrumb[0].node = _rawData;
        _render();
      });
    }
  }

  function close() {
    const overlay = document.getElementById('lc-overlay');
    if (!overlay) return;
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 300);
  }

  // ── Navigate into a child ─────────────────────────────
  function navigateTo(name, node) {
    _breadcrumb.push({ name, node });
    _render();
  }

  function navigateToCrumb(index) {
    _breadcrumb = _breadcrumb.slice(0, index + 1);
    _render();
  }

  // ── Main render ───────────────────────────────────────
  function _render() {
    _renderBreadcrumb();
    _renderBody();
  }

  function _renderBreadcrumb() {
    const el = document.getElementById('lc-breadcrumb');
    if (!el) return;
    el.innerHTML = _breadcrumb.map((crumb, i) => {
      const isLast = i === _breadcrumb.length - 1;
      return `
        ${i > 0 ? '<i class="fas fa-chevron-right lc-crumb-sep"></i>' : ''}
        <button class="lc-crumb ${isLast ? 'active' : ''}"
                onclick="LabCapacity.navigateToCrumb(${i})">
          ${i === 0 ? '<i class="fas fa-home"></i> ' : ''}${crumb.name}
        </button>`;
    }).join('');
  }

  function _renderBody() {
    const el   = document.getElementById('lc-modal-body');
    if (!el) return;

    const current = _breadcrumb[_breadcrumb.length - 1];
    const node    = current.node;
    const children = _getChildren(node);

    // Summary for current level
    const stats = _countSpots(node);
    const pct   = stats.total > 0 ? Math.round((stats.occupied / stats.total) * 100) : 0;
    const c     = _color(pct);

    let html = `
      <div class="lc-level-summary">
        <div class="lc-summary-row">
          <div class="lc-summary-card">
            <div class="lc-summary-label">Total</div>
            <div class="lc-summary-value">${stats.total.toLocaleString()}</div>
          </div>
          <div class="lc-summary-card">
            <div class="lc-summary-label">Occupied</div>
            <div class="lc-summary-value" style="color:#fd9644">${stats.occupied.toLocaleString()}</div>
          </div>
          <div class="lc-summary-card">
            <div class="lc-summary-label">Available</div>
            <div class="lc-summary-value" style="color:#2ecc71">${stats.empty.toLocaleString()}</div>
          </div>
          <div class="lc-summary-card">
            <div class="lc-summary-label">Usage</div>
            <div class="lc-summary-value" style="color:${c}">${pct}%</div>
          </div>
        </div>
        <div class="lc-overall-bar">
          <div class="lc-overall-fill" id="lc-overall-fill"
               style="background:linear-gradient(90deg,${c}aa,${c})"></div>
          <span class="lc-overall-label">${pct}% Full — ${stats.occupied.toLocaleString()} / ${stats.total.toLocaleString()}</span>
        </div>
      </div>`;

    if (!children.length) {
      // Leaf level — show status grid
      html += _renderLeafGrid(node);
    } else {
      // Show children as cards
      html += `<div class="lc-children-title">
        <i class="fas fa-layer-group"></i>
        ${_breadcrumb.length === 1 ? 'Laboratories' : 'Contents'}
      </div>
      <div class="lc-children-grid">`;

      children.forEach((key, i) => {
        const child     = node[key];
        const cs        = _countSpots(child);
        const cpct      = cs.total > 0 ? Math.round((cs.occupied / cs.total) * 100) : 0;
        const cc        = _color(cpct);
        const childKids = _getChildren(child);
        const isDeepest = childKids.length === 0;

        html += `
          <div class="lc-child-card ${isDeepest ? 'lc-leaf-card' : ''}"
               style="animation-delay:${i * 40}ms"
               onclick="LabCapacity.navigateTo('${key}', LabCapacity._getNode(${_breadcrumb.length - 1}, '${key}'))">
            <div class="lc-child-header">
              <span class="lc-child-name">${key}</span>
              <span class="lc-child-pct" style="color:${cc}">${cpct}%</span>
            </div>
            <div class="lc-child-bar">
              <div class="lc-child-fill" style="width:${cpct}%;background:${cc}"></div>
            </div>
            <div class="lc-child-meta">
              <span style="color:#fd9644"><i class="fas fa-box"></i> ${cs.occupied}</span>
              <span style="color:#2ecc71"><i class="fas fa-box-open"></i> ${cs.empty}</span>
              <span style="color:var(--text-muted)">${cs.total} total</span>
              ${!isDeepest ? '<span class="lc-drill"><i class="fas fa-chevron-right"></i></span>' : ''}
            </div>
          </div>`;
      });

      html += `</div>`;
    }

    el.innerHTML = html;

    // Animate overall bar
    setTimeout(() => {
      const fill = document.getElementById('lc-overall-fill');
      if (fill) {
        fill.style.transition = 'width 0.8s cubic-bezier(0.4,0,0.2,1)';
        fill.style.width = pct + '%';
      }
    }, 80);
  }

  // ── Leaf grid (deepest level — show individual spots) ─
  function _renderLeafGrid(node) {
      const SKIP = ['status', 'createdAt'];
    const entries = Object.entries(node).filter(([k]) => !SKIP.includes(k));

    if (!entries.length) {
      // node itself IS the spot
      const isOcc = node.status === 'occupied';
      return `<div class="lc-spot-single ${isOcc ? 'occupied' : 'empty'}">
        <i class="fas fa-${isOcc ? 'box' : 'box-open'}"></i>
        <span>${isOcc ? 'Occupied' : 'Empty'}</span>
      </div>`;
    }

    return `
      <div class="lc-children-title"><i class="fas fa-th"></i> Spots</div>
      <div class="lc-spot-grid">
        ${entries.map(([key, val]) => {
          const isOcc = val?.status === 'occupied';
          return `<div class="lc-spot ${isOcc ? 'occupied' : 'empty'}" title="${key}">
            <span class="lc-spot-name">${key}</span>
            <i class="fas fa-${isOcc ? 'lock' : 'lock-open'}"></i>
          </div>`;
        }).join('')}
      </div>`;
  }

  // ── Helper to get node from breadcrumb path ───────────
  function _getNode(crumbIndex, childKey) {
    return _breadcrumb[crumbIndex].node[childKey];
  }

  return {
    startListening, stopListening,
    openDetail, close,
    navigateTo, navigateToCrumb,
    _getNode, _updateWidget,
  };

})();

window.LabCapacity = LabCapacity;
