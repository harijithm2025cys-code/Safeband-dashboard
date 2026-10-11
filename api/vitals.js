import { verifyDeviceSecret, getFirebaseDb } from './_lib.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-device-secret');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 1. Verify Device Secret
  if (!verifyDeviceSecret(req)) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing x-device-secret' });
  }

  const body = req.body || {};
  const { deviceId, heartRate, spo2, lat, lng, locSource, accuracy, timestamp } = body;
  const validDeviceId = (deviceId && typeof deviceId === 'string') ? deviceId : 'safeband-01';

  // 2. Validate Coordinates
  if (lat !== undefined && lat !== null) {
    const latNum = Number(lat);
    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      return res.status(400).json({ error: 'Bad Request: lat must be between -90 and 90' });
    }
  }

  if (lng !== undefined && lng !== null) {
    const lngNum = Number(lng);
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      return res.status(400).json({ error: 'Bad Request: lng must be between -180 and 180' });
    }
  }

  const vitalsRecord = {
    deviceId: validDeviceId,
    heartRate: (heartRate !== undefined && heartRate !== null) ? Number(heartRate) : null,
    spo2: (spo2 !== undefined && spo2 !== null) ? Number(spo2) : null,
    lat: (lat !== undefined && lat !== null) ? Number(lat) : null,
    lng: (lng !== undefined && lng !== null) ? Number(lng) : null,
    locSource: locSource || 'none',
    accuracy: accuracy ? Number(accuracy) : null,
    timestamp: timestamp ? Number(timestamp) : Date.now(),
    updatedAt: Date.now()
  };

  const db = getFirebaseDb();
  if (db) {
    try {
      await db.ref(`devices/${validDeviceId}/latest`).update({
        vitals: vitalsRecord,
        updatedAt: Date.now()
      });

      // Append to historical timeline (keep clean)
      await db.ref(`devices/${validDeviceId}/history`).push().set(vitalsRecord);
    } catch (err) {
      console.error('[Firebase DB] Error updating vitals:', err.message);
    }
  }

  return res.status(200).json({
    success: true,
    vitals: vitalsRecord
  });
}
