import admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

// In-memory alert rate limiter (1 alert per device per 30s)
const alertTimestamps = new Map();

export function verifyDeviceSecret(req) {
  const secretHeader = req.headers['x-device-secret'];
  const expectedSecret = process.env.DEVICE_SECRET;
  if (!expectedSecret) return true; // development fallback if not set
  return secretHeader === expectedSecret;
}

export function checkAlertRateLimit(deviceId) {
  const now = Date.now();
  const lastTime = alertTimestamps.get(deviceId) || 0;
  if (now - lastTime < 30000) {
    return false; // Rate limited (within 30s)
  }
  alertTimestamps.set(deviceId, now);
  return true;
}

// Reset rate limit (useful for testing)
export function resetRateLimit(deviceId) {
  if (deviceId) alertTimestamps.delete(deviceId);
  else alertTimestamps.clear();
}

let dbInstance = null;

export function getFirebaseDb() {
  if (dbInstance) return dbInstance;

  try {
    if (!admin.apps.length) {
      const saEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      const dbUrl = process.env.VITE_FIREBASE_DATABASE_URL || process.env.FIREBASE_DATABASE_URL;

      if (saEnv) {
        let serviceAccount;
        try {
          serviceAccount = typeof saEnv === 'string' ? JSON.parse(saEnv) : saEnv;
        } catch {
          // If multiline JSON or escaped string
          serviceAccount = JSON.parse(saEnv.replace(/\\n/g, '\n'));
        }

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          databaseURL: dbUrl
        });
      } else {
        admin.initializeApp({
          databaseURL: dbUrl
        });
      }
    }
    dbInstance = admin.database();
    return dbInstance;
  } catch (err) {
    console.error('[Firebase Admin] Initialization warning:', err.message);
    return null;
  }
}

export async function generateCaregiverSummary(alert) {
  const defaultFallback = `SafeBand Alert: ${alert.type} detected on device ${alert.deviceId || 'safeband-01'}.\nImmediate caregiver attention is advised.`;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return defaultFallback;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are the SafeBand caregiver alert assistant.
Generate a strictly 2-line caregiver summary for this incident:
Device: ${alert.deviceId}
Event Type: ${alert.type}
Heart Rate: ${alert.heartRate || 'N/A'} BPM
SpO2: ${alert.spo2 || 'N/A'} %
Location Source: ${alert.locSource || 'unknown'}
Coordinates: ${alert.lat && alert.lng ? `${alert.lat}, ${alert.lng}` : 'Not available'}

Keep the response to exactly two concise, calm, actionable lines for the caregiver.`;

    const result = await model.generateContent(prompt);
    const text = result?.response?.text()?.trim();
    if (text) {
      // Ensure max 2 lines
      return text.split('\n').filter(Boolean).slice(0, 2).join('\n');
    }
    return defaultFallback;
  } catch (err) {
    console.error('[Gemini] Generation failed, using fallback:', err.message);
    return defaultFallback;
  }
}

export function getLocationSourceLabel(locSource) {
  switch ((locSource || '').toLowerCase()) {
    case 'gps':
      return 'Precise (GPS fix)';
    case 'wifi':
      return 'Approximate (Wi-Fi triangulation)';
    case 'ip':
      return 'Approximate (IP geolocation)';
    case 'last':
      return 'Last known historical location';
    default:
      return 'Location unavailable';
  }
}

export async function sendTwilioNotification(alert, summary) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const to = process.env.CAREGIVER_WHATSAPP_TO;

  if (!sid || !token || !from || !to) {
    return { success: false, reason: 'Twilio credentials not configured' };
  }

  try {
    const client = twilio(sid, token);
    const locLabel = getLocationSourceLabel(alert.locSource);
    const mapsLink = (alert.lat && alert.lng)
      ? `\n📍 Map: https://www.google.com/maps?q=${alert.lat},${alert.lng}`
      : '\n📍 Location: Not available';

    const vitalsText = (alert.heartRate || alert.spo2)
      ? `💓 Vitals: HR ${alert.heartRate ? alert.heartRate + ' BPM' : 'N/A'} | SpO2 ${alert.spo2 ? alert.spo2 + '%' : 'N/A'}`
      : '💓 Vitals: Sensor unattached / null';

    const messageBody = `🚨 *SafeBand Alert: ${alert.type}*\n` +
      `Device: ${alert.deviceId || 'safeband-01'}\n` +
      `Summary: ${summary}\n` +
      `${vitalsText}\n` +
      `📡 Fix: ${locLabel}${mapsLink}`;

    const msg = await client.messages.create({
      body: messageBody,
      from: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
      to: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`
    });

    return { success: true, sid: msg.sid };
  } catch (err) {
    console.error('[Twilio] Notification failed, proceeding without error:', err.message);
    return { success: false, error: err.message };
  }
}
