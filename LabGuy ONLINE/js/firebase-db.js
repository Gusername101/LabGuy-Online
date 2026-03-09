/* ============================================================
   firebase-db.js — Firebase Realtime Database helpers
   LabGuy Application

   Actual DB schema:
   /users/{uid}
     email:     string
     full_name: string
     role:      string  ("admin" | "user")
     inbox/     {notifId: {...}}
     settings/
       auto_populate_samples: bool
       last_updated:          timestamp
   ============================================================ */

const FirebaseDB = (() => {

  const db = () => window.fbDB;

  // ── Helpers ─────────────────────────────────────────────

  // Split "Jared Keller" → { firstName: "Jared", lastName: "Keller" }
  function _splitName(full_name) {
    const parts     = (full_name || '').trim().split(' ');
    const firstName = parts[0] || '';
    const lastName  = parts.slice(1).join(' ') || '';
    return { firstName, lastName };
  }

  // Build a firstName/lastName profile from the raw DB record
  function _normalizeProfile(raw) {
    // Handle both {full_name} and {firstName, lastName} structures
    const { firstName, lastName } = raw.full_name
      ? _splitName(raw.full_name)
      : { firstName: raw.firstName || 'User', lastName: raw.lastName || '' };
    return {
      ...raw,
      firstName,
      lastName,
      // keep full_name as source of truth
    };
  }

  // ── User profiles ───────────────────────────────────────

  async function createProfile(uid, data) {
    // Support both full_name directly or firstName+lastName
    const full_name = data.full_name
      || `${data.firstName || ''} ${data.lastName || ''}`.trim()
      || (data.email || 'User').split('@')[0];

    const record = {
      full_name,
      email: data.email,
      role:  data.role || 'user',
      settings: {
        auto_populate: false,
        last_updated:  Date.now(),
      },
    };
    await db().ref(`users/${uid}`).set(record);
  }

  async function getProfile(uid) {
    const snap = await db().ref(`users/${uid}`).once('value');
    if (!snap.exists()) return null;
    return _normalizeProfile(snap.val());
  }

  async function updateProfile(uid, updates) {
    // If updating name fields, merge back to full_name
    if (updates.firstName || updates.lastName) {
      const current = await getProfile(uid);
      const firstName = updates.firstName || current.firstName;
      const lastName  = updates.lastName  || current.lastName;
      updates.full_name = `${firstName} ${lastName}`.trim();
      delete updates.firstName;
      delete updates.lastName;
    }
    await db().ref(`users/${uid}`).update(updates);
  }

  async function setRole(uid, role) {
    await db().ref(`users/${uid}/role`).set(role);
  }

  async function getAllUsers() {
    const snap = await db().ref('users').once('value');
    if (!snap.exists()) return [];
    return Object.entries(snap.val()).map(([uid, data]) => ({
      uid,
      ..._normalizeProfile(data),
    }));
  }

  function listenToProfile(uid, callback) {
    const ref = db().ref(`users/${uid}`);
    ref.on('value', snap => {
      callback(snap.exists() ? _normalizeProfile(snap.val()) : null);
    });
    return () => ref.off();
  }

  // ── Inbox (notifications) ───────────────────────────────
  // DB path: /users/{uid}/inbox/{notifId}

  async function sendNotif(targetUid, payload) {
    const ref = db().ref(`users/${targetUid}/inbox`).push();
    await ref.set({ ...payload, createdAt: Date.now(), read: false });
    return ref.key;
  }

  async function getInbox(uid) {
    const snap = await db().ref(`users/${uid}/inbox`).once('value');
    if (!snap.exists()) return [];
    return Object.entries(snap.val())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  function listenInbox(uid, callback) {
    const ref = db().ref(`users/${uid}/inbox`);
    ref.on('value', snap => {
      if (!snap.exists()) { callback([]); return; }
      const items = Object.entries(snap.val())
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b.createdAt - a.createdAt);
      callback(items);
    });
    return () => ref.off();
  }

  async function dismissNotif(uid, notifId) {
    await db().ref(`users/${uid}/inbox/${notifId}`).remove();
  }

  async function markNotifRead(uid, notifId) {
    await db().ref(`users/${uid}/inbox/${notifId}/read`).set(true);
  }

  // ── User settings ───────────────────────────────────────

  async function getSettings(uid) {
    const snap = await db().ref(`users/${uid}/settings`).once('value');
    return snap.exists() ? snap.val() : {};
  }

  async function updateSettings(uid, updates) {
    await db().ref(`users/${uid}/settings`).update({
      ...updates,
      last_updated: Date.now(),
    });
  }

  // ── Dashboard layout ────────────────────────────────────

  async function saveLayout(uid, widgets) {
    await db().ref(`dashboards/${uid}/widgets`).set(widgets);
  }

  async function loadLayout(uid) {
    const snap = await db().ref(`dashboards/${uid}/widgets`).once('value');
    return snap.exists() ? snap.val() : [];
  }

  // ── Samples ─────────────────────────────────────────────

  async function addSample(labId, data) {
    const ref = db().ref(`Labs/${labId}/samples`).push();
    await ref.set({ ...data, createdAt: Date.now() });
    return ref.key;
  }

  async function getSamples(labId) {
    const snap = await db().ref(`Labs/${labId}/samples`).once('value');
    if (!snap.exists()) return [];
    return Object.entries(snap.val()).map(([id, data]) => ({ id, ...data }));
  }

  async function updateSample(labId, sampleId, updates) {
    await db().ref(`labs/${labId}/samples/${sampleId}`).update(updates);
  }

  async function deleteSample(labId, sampleId) {
    await db().ref(`labs/${labId}/samples/${sampleId}`).remove();
  }

  // ── Inventory ───────────────────────────────────────────

  async function addInventoryItem(labId, data) {
    const ref = db().ref(`Labs/${labId}/inventory`).push();
    await ref.set({ ...data, createdAt: Date.now() });
    return ref.key;
  }

  async function getInventory(labId) {
    const snap = await db().ref(`Labs/${labId}/inventory`).once('value');
    if (!snap.exists()) return [];
    return Object.entries(snap.val()).map(([id, data]) => ({ id, ...data }));
  }

  async function updateInventoryItem(labId, itemId, updates) {
    await db().ref(`labs/${labId}/inventory/${itemId}`).update(updates);
  }

  async function deleteInventoryItem(labId, itemId) {
    await db().ref(`labs/${labId}/inventory/${itemId}`).remove();
  }

  return {
    // Users
    createProfile, getProfile, updateProfile, setRole, getAllUsers, listenToProfile,
    // Inbox
    sendNotif, getInbox, listenInbox, dismissNotif, markNotifRead,
    // Settings
    getSettings, updateSettings,
    // Dashboard
    saveLayout, loadLayout,
    // Samples
    addSample, getSamples, updateSample, deleteSample,
    // Inventory
    addInventoryItem, getInventory, updateInventoryItem, deleteInventoryItem,
  };
})();

window.FirebaseDB = FirebaseDB;
console.log('FirebaseDB service ready ✓');

// ── LAB MANAGEMENT (appended) ──────────────────────────────
const LabService = (() => {
  const db = () => window.fbDB;

  // Labs live at /labs/{labName}/units/{unitName}/spots (count)
  // Subunits live at /labs/{labName}/units/{unitName}/children/{childName}/spots

  async function getLabs() {
    const snap = await db().ref('Labs').once('value');
    if (!snap.exists()) return {};
    return snap.val();
  }

  function listenLabs(callback) {
    const ref = db().ref('Labs');
    ref.on('value', snap => callback(snap.exists() ? snap.val() : {}));
    return () => ref.off('value');
  }

  async function addLab(labName) {
    await db().ref(`Labs/${labName}`).set({ createdAt: Date.now() });
  }

  async function deleteLab(labName) {
    await db().ref(`Labs/${labName}`).remove();
  }

  async function addUnit(labName, unitName, spots) {
    await db().ref(`Labs/${labName}/units/${unitName}`).set({
      spots,
      createdAt: Date.now()
    });
  }

  async function deleteUnit(labName, unitPath) {
    // unitPath e.g. "units/Shelves1" or "units/Shelves1/children/Towers1"
    await db().ref(`Labs/${labName}/${unitPath}`).remove();
  }

  async function addChildUnit(labName, parentPath, childName, spots) {
    // parentPath e.g. "units/Shelves1"
    await db().ref(`Labs/${labName}/${parentPath}/children/${childName}`).set({
      spots,
      createdAt: Date.now()
    });
  }

  return { getLabs, listenLabs, addLab, deleteLab, addUnit, addChildUnit, deleteUnit };
})();

window.LabService = LabService;
