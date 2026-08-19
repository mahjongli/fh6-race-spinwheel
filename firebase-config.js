// ============================================================
// FIREBASE CONFIG — fill this in with YOUR Firebase project's keys.
// See README.md for the 5-minute setup (it's free).
// Until you fill this in, the page still works for one person,
// spinning locally, but nothing syncs between browsers.
// ============================================================

const FIREBASE_CONFIG = {
  apiKey: "PASTE_YOUR_API_KEY",
  authDomain: "PASTE_YOUR_PROJECT.firebaseapp.com",
  projectId: "PASTE_YOUR_PROJECT_ID",
  storageBucket: "PASTE_YOUR_PROJECT.appspot.com",
  messagingSenderId: "PASTE_YOUR_SENDER_ID",
  appId: "PASTE_YOUR_APP_ID"
};

let db = null;
try {
  if (FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey.indexOf('PASTE_') !== 0) {
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.firestore();
  }
} catch (e) {
  console.warn('Firebase not configured yet:', e);
}
