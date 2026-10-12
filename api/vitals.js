const { db, checkSecret, validateVitals, parseBody } = require('./_lib');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!checkSecret(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const body = parseBody(req);
    if (!body) {
      return res.status(400).json({ error: 'Invalid or missing JSON body' });
    }

    const err = validateVitals(body);
    if (err) {
      return res.status(400).json({ error: 'Validation failed on ' + err });
    }

    const now = Date.now();
    const payload = {
      heartRate: (body.heartRate === undefined || body.heartRate === null) ? null : body.heartRate,
      spo2: (body.spo2 === undefined || body.spo2 === null) ? null : body.spo2,
      lat: (body.lat === undefined || body.lat === null) ? null : body.lat,
      lng: (body.lng === undefined || body.lng === null) ? null : body.lng,
      accuracy: (body.accuracy === undefined || body.accuracy === null) ? null : body.accuracy,
      locSource: (body.locSource === undefined || body.locSource === null) ? null : body.locSource,
      accelPeakG: (body.accelPeakG === undefined || body.accelPeakG === null) ? null : body.accelPeakG,
      fallState: (body.fallState === undefined || body.fallState === null) ? null : body.fallState,
      ts: now
    };

    await db().ref('devices/' + body.deviceId + '/latest').update(payload);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
