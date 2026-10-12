const admin = require('firebase-admin');

let initialized = false;

function initAdmin() {
  if (initialized) return admin;
  if (!admin.apps || admin.apps.length === 0) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON missing');
    const svc = JSON.parse(raw);
    if (svc.private_key && svc.private_key.indexOf('\\n') !== -1) {
      svc.private_key = svc.private_key.replace(/\\n/g, '\n');
    }
    admin.initializeApp({
      credential: admin.credential.cert(svc),
      databaseURL: process.env.VITE_FIREBASE_DATABASE_URL
    });
  }
  initialized = true;
  return admin;
}

function db() {
  return initAdmin().database();
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(body)
  };
}

function checkSecret(event) {
  const headers = event.headers || {};
  const s = headers['x-device-secret'] || headers['X-Device-Secret'];
  const expected = process.env.DEVICE_SECRET || '';
  if (!expected) return false;
  return typeof s === 'string' && s.length === expected.length && s === expected;
}

function isInt(n) { return typeof n === 'number' && Number.isFinite(n) && Math.floor(n) === n; }
function isNum(n) { return typeof n === 'number' && Number.isFinite(n); }
function isBool(b) { return typeof b === 'boolean'; }

function validateVitals(b) {
  if (!b || typeof b !== 'object') return 'body';
  if (typeof b.deviceId !== 'string' || !/^[\w-]{1,40}$/.test(b.deviceId)) return 'deviceId';
  if (b.heartRate !== null && b.heartRate !== undefined && !(isInt(b.heartRate) && b.heartRate >= 20 && b.heartRate <= 250)) return 'heartRate';
  if (b.spo2 !== null && b.spo2 !== undefined && !(isInt(b.spo2) && b.spo2 >= 50 && b.spo2 <= 100)) return 'spo2';
  if (b.lat !== null && b.lat !== undefined && !(isNum(b.lat) && b.lat >= -90 && b.lat <= 90)) return 'lat';
  if (b.lng !== null && b.lng !== undefined && !(isNum(b.lng) && b.lng >= -180 && b.lng <= 180)) return 'lng';
  if (b.accuracy !== null && b.accuracy !== undefined && !(isNum(b.accuracy) && b.accuracy >= 0 && b.accuracy <= 1e6)) return 'accuracy';
  const latN = b.lat === null || b.lat === undefined;
  const lngN = b.lng === null || b.lng === undefined;
  if (latN !== lngN) return 'latlng';
  if (b.locSource !== undefined && b.locSource !== null) {
    const ok = ['gps', 'wifi', 'ip', 'last', 'none'].indexOf(b.locSource) !== -1;
    if (!ok) return 'locSource';
  }
  if (b.accelPeakG !== null && b.accelPeakG !== undefined && !(isNum(b.accelPeakG) && b.accelPeakG >= 0 && b.accelPeakG <= 40)) return 'accelPeakG';
  if (b.fallState !== undefined && b.fallState !== null) {
    const ok = ['IDLE', 'COUNTDOWN', 'ALERT'].indexOf(b.fallState) !== -1;
    if (!ok) return 'fallState';
  }
  return null;
}

function validateAlert(b) {
  const base = validateVitals(b);
  if (base) return base;
  if (typeof b.type !== 'string') return 'type';
  const ok = ['FALL', 'LOW_SPO2', 'SOS'].indexOf(b.type) !== -1;
  if (!ok) return 'type';
  if (b.manualTrigger !== undefined && !isBool(b.manualTrigger)) return 'manualTrigger';
  return null;
}

function labelForSource(src) {
  switch (src) {
    case 'gps': return 'GPS';
    case 'wifi': return 'approximate (Wi-Fi)';
    case 'ip': return 'approximate (internet)';
    case 'last': return 'last known position';
    default: return 'location unavailable';
  }
}

function parseBody(event) {
  if (!event.body) return null;
  try {
    return JSON.parse(event.body);
  } catch (e) {
    return null;
  }
}

module.exports = {
  db,
  jsonResponse,
  checkSecret,
  validateVitals,
  validateAlert,
  labelForSource,
  parseBody,
  isNum
};