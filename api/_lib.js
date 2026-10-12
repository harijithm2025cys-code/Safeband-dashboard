const admin = require('firebase-admin');

function db() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),
      databaseURL: process.env.VITE_FIREBASE_DATABASE_URL,
    });
  }
  return admin.database();
}

function guard(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return false; }
  const s = req.headers['x-device-secret'];
  if (!process.env.DEVICE_SECRET || s !== process.env.DEVICE_SECRET) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}

// null/undefined -> null, in range -> number, anything else -> NaN (invalid)
const num = (v, lo, hi) => (v === null || v === undefined ? null : typeof v === 'number' && v >= lo && v <= hi ? v : NaN);

function clean(b) {
  if (!b || typeof b !== 'object') return { err: 'body' };
  if (typeof b.deviceId !== 'string' || !/^[\w-]{1,40}$/.test(b.deviceId)) return { err: 'deviceId' };
  const o = {
    deviceId: b.deviceId,
    heartRate: num(b.heartRate, 20, 250),
    spo2: num(b.spo2, 50, 100),
    lat: num(b.lat, -90, 90),
    lng: num(b.lng, -180, 180),
    accuracy: num(b.accuracy, 0, 1e6),
  };
  for (const k of ['heartRate', 'spo2', 'lat', 'lng', 'accuracy']) if (Number.isNaN(o[k])) return { err: k };
  if ((o.lat === null) !== (o.lng === null)) return { err: 'lat/lng' };
  const src = b.locSource ?? 'none';
  if (!['gps', 'wifi', 'ip', 'last', 'none'].includes(src)) return { err: 'locSource' };
  o.locSource = o.lat === null ? 'none' : src;
  return { v: o };
}

module.exports = { db, guard, clean };
