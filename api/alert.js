import {
  verifyDeviceSecret,
  checkAlertRateLimit,
  getFirebaseDb,
  generateCaregiverSummary,
  sendTwilioNotification
} from './_lib.js';

export default async function handler(req, res) {
  // Support CORS if needed
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-device-secret');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 1. Verify Device Secret (A2 test)
  if (!verifyDeviceSecret(req)) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing x-device-secret' });
  }

  const body = req.body || {};
  const { deviceId, type, heartRate, spo2, lat, lng, locSource, accuracy, timestamp } = body;

  const validDeviceId = (deviceId && typeof deviceId === 'string') ? deviceId : 'safeband-01';

  // 2. Validate Type Whitelist (A3 test)
  const allowedTypes = ['FALL', 'LOW_SPO2', 'SOS'];
  if (!type || !allowedTypes.includes(type)) {
    return res.status(400).json({ error: `Bad Request: type must be one of ${allowedTypes.join(', ')}` });
  }

  // 3. Validate Coordinates (A4 test)
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

  // 4. Rate Limiting: 1 alert per device per 30s (A5 test)
  if (!checkAlertRateLimit(validDeviceId)) {
    return res.status(429).json({ error: 'Too Many Requests: Rate limit is 1 alert per device per 30 seconds' });
  }

  const alertRecord = {
    deviceId: validDeviceId,
    type,
    heartRate: (heartRate !== undefined && heartRate !== null) ? Number(heartRate) : null,
    spo2: (spo2 !== undefined && spo2 !== null) ? Number(spo2) : null,
    lat: (lat !== undefined && lat !== null) ? Number(lat) : null,
    lng: (lng !== undefined && lng !== null) ? Number(lng) : null,
    locSource: locSource || 'none',
    accuracy: accuracy ? Number(accuracy) : null,
    timestamp: timestamp ? Number(timestamp) : Date.now(),
    receivedAt: Date.now(),
    acknowledged: false
  };

  // 5. Save to Firebase Realtime Database (/alerts and /devices/{id}/latest)
  let savedKey = null;
  const db = getFirebaseDb();
  if (db) {
    try {
      const alertRef = db.ref('alerts').push();
      savedKey = alertRef.key;
      alertRecord.id = savedKey;
      await alertRef.set(alertRecord);

      await db.ref(`devices/${validDeviceId}/latest`).update({
        lastAlert: alertRecord,
        updatedAt: Date.now()
      });
    } catch (dbErr) {
      console.error('[Firebase DB] Error saving alert:', dbErr.message);
    }
  }

  // 6. Generate 2-line Caregiver Summary with Gemini (fallback on failure)
  let summary = '';
  try {
    summary = await generateCaregiverSummary(alertRecord);
  } catch (err) {
    summary = `SafeBand Alert: ${type} detected. Please check on the wearer immediately.`;
  }

  // 7. Send Twilio WhatsApp message (Twilio or Gemini failure must NOT fail the request!) (A6 test)
  let twilioResult = null;
  try {
    twilioResult = await sendTwilioNotification(alertRecord, summary);
  } catch (err) {
    console.error('[Twilio] Notification error bypassed:', err.message);
  }

  // A1: 200 and a DB record
  return res.status(200).json({
    success: true,
    alertId: savedKey,
    summary,
    twilio: twilioResult,
    alert: alertRecord
  });
}
