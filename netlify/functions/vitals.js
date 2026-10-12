const { db, jsonResponse, checkSecret, validateVitals, parseBody } = require('./_lib');

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'method' });
    if (!checkSecret(event)) return jsonResponse(401, { error: 'unauthorized' });

    const body = parseBody(event);
    if (!body) return jsonResponse(400, { error: 'body' });

    const err = validateVitals(body);
    if (err) return jsonResponse(400, { error: err });

    const now = Date.now();
    const payload = {
      heartRate: body.heartRate === undefined ? null : body.heartRate,
      spo2: body.spo2 === undefined ? null : body.spo2,
      lat: body.lat === undefined ? null : body.lat,
      lng: body.lng === undefined ? null : body.lng,
      accuracy: body.accuracy === undefined ? null : body.accuracy,
      locSource: body.locSource === undefined ? null : body.locSource,
      accelPeakG: body.accelPeakG === undefined ? null : body.accelPeakG,
      fallState: body.fallState === undefined ? null : body.fallState,
      ts: now
    };
    await db().ref('devices/' + body.deviceId + '/latest').update(payload);
    return jsonResponse(200, { ok: true });
  } catch (e) {
    return jsonResponse(500, { error: 'server' });
  }
};