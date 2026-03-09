/* ============================================================
   firebase-config.js — Firebase initialization
   LabGuy Application
   ============================================================ */

const firebaseConfig = {
  apiKey:            "AIzaSyDRTuPT6lGlSpMTrLLj-85NNSWcAQ9_Qrs",
  authDomain:        "labguy-e436e.firebaseapp.com",
  databaseURL:       "https://labguy-e436e-default-rtdb.firebaseio.com",
  projectId:         "labguy-e436e",
  storageBucket:     "labguy-e436e.firebasestorage.app",
  messagingSenderId: "1059784920221",
  appId:             "1:1059784920221:web:e9ac940d93373ceb969874",
};

firebase.initializeApp(firebaseConfig);

// Expose service instances globally with clear, unique names
window.fbAuth = firebase.auth();       // Auth instance (has .onAuthStateChanged, etc.)
window.fbDB   = firebase.database();  // Database instance

console.log('Firebase initialized ✓');
