const { db, guard, clean } = require('./_lib');

module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  const { v, err } = clean(req.body);
  if (err) return res.status(400).json({ error: 'invalid ' + err });
  try {
    const updateData = {
      heartRate: v.heartRate, spo2: v.spo2, lat: v.lat, lng: v.lng,
      accuracy: v.accuracy, locSource: v.locSource, ts: Date.now(),
    };
    if (v.accelPeakG !== null && v.accelPeakG !== undefined) updateData.accelPeakG = v.accelPeakG;
    if (v.fallState !== null && v.fallState !== undefined) updateData.fallState = v.fallState;
    await db().ref(`devices/${v.deviceId}/latest`).update(updateData);
    res.json({ ok: true });
  } catch (e) {
    console.error('vitals failed', e.message);
    res.status(500).json({ error: 'server error' });
  }
};
