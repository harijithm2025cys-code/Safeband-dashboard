// Public Firebase web config (safe to expose). Lets the static page read it from Vercel env vars.
module.exports = (req, res) => {
  const e = process.env;
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    apiKey: e.VITE_FIREBASE_API_KEY,
    authDomain: e.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: e.VITE_FIREBASE_DATABASE_URL,
    projectId: e.VITE_FIREBASE_PROJECT_ID,
    appId: e.VITE_FIREBASE_APP_ID,
  });
};
