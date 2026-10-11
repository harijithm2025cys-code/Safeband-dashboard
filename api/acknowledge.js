import { getFirebaseDb } from './_lib.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { alertId, deviceId } = req.body || {};
  if (!alertId) {
    return res.status(400).json({ error: 'Missing alertId' });
  }

  const db = getFirebaseDb();
  if (db) {
    try {
      await db.ref(`alerts/${alertId}`).update({
        acknowledged: true,
        acknowledgedAt: Date.now()
      });

      if (deviceId) {
        await db.ref(`devices/${deviceId}/latest/lastAlert`).update({
          acknowledged: true,
          acknowledgedAt: Date.now()
        });
      }

      return res.status(200).json({ success: true, alertId, acknowledged: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(200).json({ success: true, alertId, acknowledged: true, note: 'Mock mode acknowledged' });
}
