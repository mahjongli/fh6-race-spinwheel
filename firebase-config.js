// ============================================================
// FIREBASE CONFIG — fill this in with YOUR Firebase project's keys.
// See README.md for the 5-minute setup (it's free).
// Until you fill this in, the page still works for one person,
// spinning locally, but nothing syncs between browsers.
// ============================================================

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDSRED5fKdvLJk0xlsH_-uc2so2GxnDAz4",
  authDomain: "fh6-wheelspin.firebaseapp.com",
  projectId: "fh6-wheelspin",
  storageBucket: "fh6-wheelspin.firebasestorage.app",
  messagingSenderId: "436338309534",
  appId: "1:436338309534:web:1317453e5a54649ed57e8f"


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
