// Public Firebase web config (safe to expose).
module.exports = (req, res) => {
  const e = process.env;
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    apiKey: e.VITE_FIREBASE_API_KEY || "AIzaSyAOLQIjGcLEQJEjaFy96NkgVZ_zohsUmzI",
    authDomain: e.VITE_FIREBASE_AUTH_DOMAIN || "safeband-148ee.firebaseapp.com",
    databaseURL: e.VITE_FIREBASE_DATABASE_URL || "https://safeband-148ee-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: e.VITE_FIREBASE_PROJECT_ID || "safeband-148ee",
    storageBucket: e.VITE_FIREBASE_STORAGE_BUCKET || "safeband-148ee.firebasestorage.app",
    messagingSenderId: e.VITE_FIREBASE_MESSAGING_SENDER_ID || "728992274955",
    appId: e.VITE_FIREBASE_APP_ID || "1:728992274955:web:881ee38c9d32fe741f050e",
  });
};
