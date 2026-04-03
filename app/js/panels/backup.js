/* ============================================================
   backup.js — Lab Archive Download
   LabGuy Application

   Generates a full JSON archive of the database including:
   - Lab structure
   - Metadata field definitions
   - Complete inventory with human-readable field names

   Accessible to admin and developer roles only.
   Located in Settings panel.
============================================================ */

const Backup = (() => {

  const PATHS = {
    inventory: 'Inventory',
    metadata:  'Metadata',
    order:     'MetadataOrder',
    labs:      'Labs',
    version:   'system/version',
  };

  // ── Trigger download ──────────────────────────────────
  async function download() {
    const role = App.currentUser?.role;
    if (role !== 'admin' && role !== 'developer') {
      showToast('You do not have permission to do this.', 'error');
      return;
    }

    showToast('Preparing lab archive...', 'info');

    try {
      const [invSnap, metaSnap, orderSnap, labsSnap, versionSnap] = await Promise.all([
        window.fbDB.ref(PATHS.inventory).once('value'),
        window.fbDB.ref(PATHS.metadata).once('value'),
        window.fbDB.ref(PATHS.order).once('value'),
        window.fbDB.ref(PATHS.labs).once('value'),
        window.fbDB.ref(PATHS.version).once('value'),
      ]);

      // ── Build metadata map: sanitizedKey → human label ─
      const metaMap = {};
      if (metaSnap.exists()) {
        Object.entries(metaSnap.val()).forEach(([key, label]) => {
          metaMap[key] = typeof label === 'string' ? label : key;
        });
      }

      // ── Ordered field labels ───────────────────────────
      let fieldOrder = Object.keys(metaMap);
      if (orderSnap.exists()) {
        const order = orderSnap.val();
        fieldOrder  = [
          ...order.filter(k => metaMap[k]),
          ...fieldOrder.filter(k => !order.includes(k)),
        ];
      }

      // ── Inventory as flat array with readable keys ─────
      const inventory = [];
      if (invSnap.exists()) {
        Object.entries(invSnap.val()).forEach(([id, data]) => {
          const sample = { _id: id };
          fieldOrder.forEach(key => {
            const label      = metaMap[key];
            sample[label]    = data[key] ?? '';
          });
          sample['Location'] = data.Location ?? '';
          inventory.push(sample);
        });
      }

      // ── Labs structure ─────────────────────────────────
      const labs = labsSnap.exists() ? labsSnap.val() : {};

      // ── Metadata field list ────────────────────────────
      const metadataFields = fieldOrder.map(key => ({
        label: metaMap[key],
        internal_key: key,
      }));

      // ── Version ────────────────────────────────────────
      const version = versionSnap.exists()
        ? `v${Number(versionSnap.val()).toFixed(1)}`
        : 'v1.0';

      // ── Assemble archive ───────────────────────────────
      const now     = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const timeStr = now.toLocaleString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
      });

      const archive = {
        _info: [
          "LabGuy Lab Archive",
          "─────────────────────────────────────────────────────────",
          "This file is a complete snapshot of your LabGuy database.",
          "Keep it in a safe location. It can be used to restore or",
          "migrate your data to another platform if ever necessary.",
          "─────────────────────────────────────────────────────────",
          "Fields beginning with '_' are system fields.",
          "The 'internal_key' in metadata_fields maps to the key",
          "used in each inventory sample for database restoration.",
          "─────────────────────────────────────────────────────────",
        ],
        _generated:        timeStr,
        _labguy_version:   version,
        _total_samples:    inventory.length,
        _total_labs:       Object.keys(labs).length,
        _total_fields:     metadataFields.length,

        metadata_fields:   metadataFields,
        inventory:         inventory,
        labs:              labs,
      };

      // ── Download ───────────────────────────────────────
      const blob     = new Blob(
        [JSON.stringify(archive, null, 2)],
        { type: 'application/json' }
      );
      const url      = URL.createObjectURL(blob);
      const a        = document.createElement('a');
      a.href         = url;
      a.download     = `LabGuy_Archive_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast(`Archive downloaded — ${inventory.length} samples, ${Object.keys(labs).length} labs.`, 'success');

    } catch (err) {
      console.error('[Backup] Archive failed:', err);
      showToast('Archive download failed. Please try again.', 'error');
    }
  }

  return { download };

})();

window.Backup = Backup;
