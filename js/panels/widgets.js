/* ============================================================
   panels/widgets.js — Widget picker panel logic
   LabGuy Application
   ============================================================ */

const WidgetPanel = (() => {

  const WIDGETS = [
    { icon: 'fa-boxes',        name: 'Inventory',    desc: 'View and manage inventory items',                              size: '2×2' },
    { icon: 'fa-plus-circle',  name: 'Add Sample',   desc: 'Quick access widget to add new samples',                      size: '1×1' },
    { icon: 'fa-flask',        name: 'Lab Capacity', desc: 'Monitor lab storage capacity and usage',                      size: '1×1' },
    { icon: 'fa-file-excel',   name: 'Import Data',  desc: 'Import samples via Excel or CSV datasheets',                  size: '1×1' },
    { icon: 'fa-file-export',  name: 'Export Data',  desc: 'Export inventory data to Excel or PDF with filtering options', size: '1×1' },
  ];

  function render() {
    const list = document.getElementById('widget-list');
    if (!list) return;
    list.innerHTML = `
      <p class="widget-drag-hint">
        <i class="fas fa-hand-pointer"></i> Drag a widget onto any empty grid cell to place it
      </p>` +
    WIDGETS.map(w => `
      <div class="widget-list-item"
           draggable="true"
           data-name="${w.name}"
           data-icon="${w.icon}">
        <div class="widget-item-icon"><i class="fas ${w.icon}"></i></div>
        <div class="widget-item-info">
          <div class="widget-item-title-row">
            <h4>${w.name}</h4>
            <span class="widget-size-badge">${w.size}</span>
          </div>
          <p>${w.desc}</p>
        </div>
        <div class="widget-drag-grip"><i class="fas fa-grip-vertical"></i></div>
      </div>
    `).join('');

    // Wire up drag events
    list.querySelectorAll('.widget-list-item').forEach(item => {
      item.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', JSON.stringify({
          name: item.dataset.name,
          icon: item.dataset.icon,
        }));
        e.dataTransfer.effectAllowed = 'copy';
        item.classList.add('dragging');
        Dashboard.onPickerDragStart(item.dataset.name, item.dataset.icon);
        // Close panel so grid is exposed for dropping
        setTimeout(() => closeAllPanels(), 50);
      });
      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        Dashboard.onPickerDragEnd();
      });
    });
  }

  function init() { render(); }

  return { init };
})();

window.WidgetPanel = WidgetPanel;
