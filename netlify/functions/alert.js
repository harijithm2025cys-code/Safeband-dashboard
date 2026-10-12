const {
  db,
  jsonResponse,
  checkSecret,
  validateAlert,
  labelForSource,
  parseBody
} = require('./_lib');

const ALERT_RATE_MS = 30000;

function fallbackSummary(type, hr, spo2, locSource, manual) {
  const hrS = (hr === null || hr === undefined) ? 'an unknown heart rate' : (hr + ' bpm');
  const spS = (spo2 === null || spo2 === undefined) ? 'an unknown oxygen level' : (spo2 + ' percent oxygen');
  const locS = labelForSource(locSource);
  if (type === 'FALL') {
    return (manual ? 'A fall was reported manually from the band. ' : 'A fall was detected on the band. ') +
           'Heart rate is ' + hrS + ' and oxygen level is ' + spS + '. Location: ' + locS + '.';
  }
  if (type === 'LOW_SPO2') {
    return 'Oxygen level is low at ' + spS + ' on the band. Heart rate is ' + hrS + '. Location: ' + locS + '.';
  }
  return 'An emergency alert was sent from the band. Heart rate is ' + hrS + ' and oxygen is ' + spS +
         '. Location: ' + locS + '.';
}

async function geminiSummary(type, hr, spo2, locSource, manual) {
  const fallback = fallbackSummary(type, hr, spo2, locSource, manual);
  const key = process.env.GEMINI_API_KEY;
  if (!key) return fallback;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text:
                'Write two calm sentences for a family caregiver. ' +
                'Alert type: ' + type + '. ' +
                'Manual trigger: ' + (manual ? 'yes' : 'no') + '. ' +
                'Heart rate: ' + (hr === null ? 'unknown' : hr + ' bpm') + '. ' +
                'SpO2: ' + (spo2 === null ? 'unknown' : spo2 + ' percent') + '. ' +
                'Location: ' + labelForSource(locSource) + '. ' +
                'No emojis, no markdown.'
            }]
          }]
        }),
        signal: ctrl.signal
      }
    );
    clearTimeout(to);
    if (!r.ok) return fallback;
    const j = await r.json();
    const text = j && j.candidates && j.candidates[0] &&
                 j.candidates[0].content && j.candidates[0].content.parts &&
                 j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].text;
    if (typeof text === 'string' && text.trim().length > 0) {
      return text.trim().replace(/[*_`#]/g, '').slice(0, 400);
    }
    return fallback;
  } catch (e) {
    return fallback;
  }
}

async function sendWhatsApp(title, summary, hr, spo2, lat, lng, locSource, manual) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const to = process.env.CAREGIVER_WHATSAPP_TO;
  if (!sid || !token || !from || !to) return false;

  let body = title;
  if (manual) body += ' (manually triggered)';
  body += '\n' + summary;
  body += '\nHR ' + (hr === null || hr === undefined ? 'unknown' : hr + ' bpm') +
          '  ·  SpO2 ' + (spo2 === null || spo2 === undefined ? 'unknown' : spo2 + '%');
  body += '\nLocation: ' + labelForSource(locSource);
  if (typeof lat === 'number' && typeof lng === 'number') {
    body += '\nhttps://www.google.com/maps?q=' + lat + ',' + lng;
  }

  try {
    const ctrl = new AbortController();
    const to2 = setTimeout(() => ctrl.abort(), 5000);
    const url = 'https://api.twilio.com/2010-04-01/Accounts/' + sid + '/Messages.json';
    const auth = Buffer.from(sid + ':' + token).toString('base64');
    const form = new URLSearchParams();
    form.set('From', from);
    form.set('To', to);
    form.set('Body', body);
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + auth,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: form.toString(),
      signal: ctrl.signal
    });
    clearTimeout(to2);
    return r.ok;
  } catch (e) {
    return false;
  }
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return jsonResponse(405, { error: 'method' });
    }
    if (!checkSecret(event)) {
      return jsonResponse(401, { error: 'unauthorized' });
    }
    const body = parseBody(event);
    if (!body) {
      return jsonResponse(400, { error: 'body' });
    }
    const err = validateAlert(body);
    if (err) {
      return jsonResponse(400, { error: err });
    }

    const now = Date.now();
    const deviceId = body.deviceId;
    const lastRef = db().ref('devices/' + deviceId + '/lastAlertAt');
    const snap = await lastRef.get();
    const last = snap && snap.exists() ? snap.val() : 0;
    if (typeof last === 'number' && (now - last) < ALERT_RATE_MS) {
      return jsonResponse(429, { error: 'rate' });
    }
    await lastRef.set(now);

    const type = body.type;
    const manual = body.manualTrigger === true;
    const hr = (body.heartRate === undefined) ? null : body.heartRate;
    const spo2 = (body.spo2 === undefined) ? null : body.spo2;
    const lat = (body.lat === undefined) ? null : body.lat;
    const lng = (body.lng === undefined) ? null : body.lng;
    const locSource = (body.locSource === undefined) ? 'none' : (body.locSource || 'none');

    const titleMap = {
      FALL: 'SafeBand: Fall detected',
      LOW_SPO2: 'SafeBand: Low oxygen',
      SOS: 'SafeBand: Emergency SOS'
    };
    const title = titleMap[type] || 'SafeBand alert';

    const summary = await geminiSummary(type, hr, spo2, locSource, manual);
    const sent = await sendWhatsApp(title, summary, hr, spo2, lat, lng, locSource, manual);

    const alert = {
      type: type,
      manualTrigger: manual,
      heartRate: hr,
      spo2: spo2,
      lat: lat,
      lng: lng,
      locSource: locSource,
      summary: summary,
      whatsapp: sent,
      acknowledged: false,
      ts: now
    };

    const push = await db().ref('alerts').push(alert);

    const latestUpdate = {
      heartRate: hr,
      spo2: spo2,
      lat: lat,
      lng: lng,
      locSource: locSource,
      ts: now
    };
    await db().ref('devices/' + deviceId + '/latest').update(latestUpdate);

    return jsonResponse(200, { ok: true, id: push.key });
  } catch (e) {
    return jsonResponse(500, { error: 'server' });
  }
};