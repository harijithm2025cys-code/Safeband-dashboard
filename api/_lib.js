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

let mockStore = {};

function getMockDb() {
  return {
    ref(path) {
      return {
        async get() {
          const val = mockStore[path];
          return {
            exists: () => val !== undefined,
            val: () => val
          };
        },
        async set(val) {
          mockStore[path] = val;
        },
        async update(obj) {
          if (!mockStore[path]) mockStore[path] = {};
          for (const [k, v] of Object.entries(obj)) {
            if (v === null) {
              delete mockStore[path][k];
            } else {
              mockStore[path][k] = v;
            }
          }
        },
        async push(val) {
          const key = '-Alert' + Date.now();
          mockStore['alerts/' + key] = val;
          return { key };
        }
      };
    }
  };
}

function db() {
  if (process.env.MOCK_DB === 'true') {
    return getMockDb();
  }
  return initAdmin().database();
}

function checkSecret(req) {
  const headers = req.headers || {};
  const s = headers['x-device-secret'] || headers['X-Device-Secret'];
  const expected = process.env.DEVICE_SECRET || '';
  if (!expected) return false;
  return typeof s === 'string' && s.length === expected.length && s === expected;
}

function isInt(n) {
  return typeof n === 'number' && Number.isFinite(n) && Math.floor(n) === n;
}

function isNum(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function isBool(b) {
  return typeof b === 'boolean';
}

function validateVitals(b) {
  if (!b || typeof b !== 'object') return 'body';
  if (typeof b.deviceId !== 'string' || !/^[\w-]{1,40}$/.test(b.deviceId)) return 'deviceId';

  // heartRate: int 20..250 or null
  if (b.heartRate !== null && b.heartRate !== undefined) {
    if (!isInt(b.heartRate) || b.heartRate < 20 || b.heartRate > 250) return 'heartRate';
  }

  // spo2: int 50..100 or null
  if (b.spo2 !== null && b.spo2 !== undefined) {
    if (!isInt(b.spo2) || b.spo2 < 50 || b.spo2 > 100) return 'spo2';
  }

  // lat: num -90..90 or null
  if (b.lat !== null && b.lat !== undefined) {
    if (!isNum(b.lat) || b.lat < -90 || b.lat > 90) return 'lat';
  }

  // lng: num -180..180 or null
  if (b.lng !== null && b.lng !== undefined) {
    if (!isNum(b.lng) || b.lng < -180 || b.lng > 180) return 'lng';
  }

  // lat and lng must both be null/undefined or both be numbers
  const latNull = b.lat === null || b.lat === undefined;
  const lngNull = b.lng === null || b.lng === undefined;
  if (latNull !== lngNull) return 'latlng';

  // accuracy: num >= 0 and <= 1e6 or null
  if (b.accuracy !== null && b.accuracy !== undefined) {
    if (!isNum(b.accuracy) || b.accuracy < 0 || b.accuracy > 1e6) return 'accuracy';
  }

  // locSource: "gps"|"wifi"|"ip"|"last"|"none" or null
  if (b.locSource !== undefined && b.locSource !== null) {
    const validLocs = ['gps', 'wifi', 'ip', 'last', 'none'];
    if (!validLocs.includes(b.locSource)) return 'locSource';
  }

  // accelPeakG: 0..40 or null (optional)
  if (b.accelPeakG !== null && b.accelPeakG !== undefined) {
    if (!isNum(b.accelPeakG) || b.accelPeakG < 0 || b.accelPeakG > 40) return 'accelPeakG';
  }

  // fallState: "IDLE"|"IMPACT"|"STILL"|"COUNTDOWN"|"ALERT" (optional)
  if (b.fallState !== undefined && b.fallState !== null) {
    const validStates = ['IDLE', 'IMPACT', 'STILL', 'COUNTDOWN', 'ALERT'];
    if (!validStates.includes(b.fallState)) return 'fallState';
  }

  return null;
}

function validateAlert(b) {
  const base = validateVitals(b);
  if (base) return base;
  if (typeof b.type !== 'string') return 'type';
  const validTypes = ['FALL', 'LOW_SPO2', 'SOS'];
  if (!validTypes.includes(b.type)) return 'type';
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

function parseBody(req) {
  if (!req || req.bodyParseError) return null;
  if (typeof req.body === 'object' && req.body !== null) return req.body;
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch (e) {
      return null;
    }
  }
  if (typeof req.rawBody === 'string' && req.rawBody.trim()) {
    try {
      return JSON.parse(req.rawBody);
    } catch (e) {
      return null;
    }
  }
  return null;
}

module.exports = {
  db,
  checkSecret,
  validateVitals,
  validateAlert,
  labelForSource,
  parseBody,
  isNum,
  isInt,
  isBool
};
