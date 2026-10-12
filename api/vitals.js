const { db, sendJson, readBody, checkSecret, validateVitals } = require('./_lib');

module.exports = async (req, res) => {
    try {
        if (req.method !== 'POST') { sendJson(res, 405, { error: 'method' }); return; }
        if (!checkSecret(req)) { sendJson(res, 401, { error: 'unauthorized' }); return; }

        const body = await readBody(req);
        if (!body) { sendJson(res, 400, { error: 'body' }); return; }

        const err = validateVitals(body);
        if (err) { sendJson(res, 400, { error: err }); return; }

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
        sendJson(res, 200, { ok: true });
    } catch (e) {
        sendJson(res, 500, { error: 'server' });
    }
};