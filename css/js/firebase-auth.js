/* ============================================================
   firebase-auth.js — Firebase Authentication service
   LabGuy Application

   Handles: login, register, logout, password reset,
            auth state observation
   ============================================================ */

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { auth } from "./firebase-config.js";
import { UserService } from "./firebase-db.js";

// ── Observe auth state across page loads ─────────────────
// Callback receives user object or null
function observeAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

// ── Login ─────────────────────────────────────────────────
async function loginUser(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const profile    = await UserService.getProfile(credential.user.uid);
  return { firebaseUser: credential.user, profile };
}

// ── Register ──────────────────────────────────────────────
async function registerUser(firstName, lastName, email, password) {
  // Create Firebase Auth account
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const uid        = credential.user.uid;

  // Set display name in Firebase Auth
  await updateProfile(credential.user, {
    displayName: `${firstName} ${lastName}`,
  });

  // Write user profile to Realtime Database
  const profile = {
    firstName,
    lastName,
    email,
    role:      "user",   // default role; admin can elevate
    createdAt: Date.now(),
  };
  await UserService.createProfile(uid, profile);

  return { firebaseUser: credential.user, profile };
}

// ── Logout ────────────────────────────────────────────────
async function logoutUser() {
  await signOut(auth);
}

// ── Password reset ────────────────────────────────────────
async function sendPasswordReset(email) {
  await sendPasswordResetEmail(auth, email);
}

// ── Get current user (sync, may be null) ─────────────────
function getCurrentUser() {
  return auth.currentUser;
}

export {
  observeAuthState,
  loginUser,
  registerUser,
  logoutUser,
  sendPasswordReset,
  getCurrentUser,
};
