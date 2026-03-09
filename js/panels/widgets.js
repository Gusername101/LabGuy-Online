/* ============================================================
   panels/widgets.js — Widget picker panel logic
   LabGuy Application
   ============================================================ */

const WidgetPanel = (() => {

  const WIDGETS = [
    { icon: 'fa-plus-circle',  name: 'Add Sample',       desc: 'Quick access widget to add new samples' },
    { icon: 'fa-file-excel',   name: 'Excel Import',      desc: 'Import samples via Excel datasheets' },
    { icon: 'fa-boxes',        name: 'Inventory',         desc: 'View and manage inventory items' },
    { icon: 'fa-file-export',  name: 'Export Data',       desc: 'Export inventory data to Excel or PDF with filtering options' },
    { icon: 'fa-flask',        name: 'Lab Capacity',       desc: 'Monitor lab storage capacity and usage' },
  ];

  function render() {
    const list = document.getElementById('widget-list');
    if (!list) return;
    list.innerHTML = WIDGETS.map(w => `
      <div class="widget-list-item">
        <div class="widget-item-icon"><i class="fas ${w.icon}"></i></div>
        <div class="widget-item-info">
          <h4>${w.name}</h4>
          <p>${w.desc}</p>
          <button class="widget-add-btn"
            onclick="Dashboard.addWidget('${w.name}', '${w.icon}')">
            Add
          </button>
        </div>
      </div>
    `).join('');
  }

  function init() { render(); }

  return { init };
})();

window.WidgetPanel = WidgetPanel;
