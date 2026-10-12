const {
  db, checkSecret, validateAlert, labelForSource, parseBody
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
    const to = setTimeout(() => ctrl.abort(), 3500);
    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
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

async function sendWhatsApp(type, summary, hr, spo2, lat, lng, locSource, manual) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  let from = process.env.TWILIO_WHATSAPP_FROM;
  let to = process.env.CAREGIVER_WHATSAPP_TO;
  if (!sid || !token || !from || !to) return false;

  if (!from.startsWith('whatsapp:')) from = 'whatsapp:' + from;
  if (!to.startsWith('whatsapp:')) to = 'whatsapp:' + to;

  const titleMap = {
    FALL: 'SafeBand: Fall detected',
    LOW_SPO2: 'SafeBand: Low oxygen',
    SOS: 'SafeBand: Emergency SOS'
  };
  let body = titleMap[type] || 'SafeBand alert';
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

    const err = validateAlert(body);
    if (err) {
      return res.status(400).json({ error: 'Validation failed on ' + err });
    }

    const now = Date.now();
    const deviceId = body.deviceId;
    const lastRef = db().ref('devices/' + deviceId + '/lastAlertAt');
    const snap = await lastRef.get();
    const last = snap && snap.exists() ? snap.val() : 0;
    if (typeof last === 'number' && (now - last) < ALERT_RATE_MS) {
      return res.status(429).json({ error: 'Rate limit exceeded: 1 alert per 30s' });
    }
    await lastRef.set(now);

    const type = body.type;
    const manual = body.manualTrigger === true;
    const hr = (body.heartRate === undefined || body.heartRate === null) ? null : body.heartRate;
    const spo2 = (body.spo2 === undefined || body.spo2 === null) ? null : body.spo2;
    const lat = (body.lat === undefined || body.lat === null) ? null : body.lat;
    const lng = (body.lng === undefined || body.lng === null) ? null : body.lng;
    const locSource = (body.locSource === undefined || body.locSource === null) ? 'none' : body.locSource;

    const summary = await geminiSummary(type, hr, spo2, locSource, manual);
    const sent = await sendWhatsApp(type, summary, hr, spo2, lat, lng, locSource, manual);

    const alert = {
      type,
      manualTrigger: manual,
      heartRate: hr,
      spo2: spo2,
      lat,
      lng,
      locSource,
      summary,
      whatsapp: sent,
      acknowledged: false,
      ts: now
    };
    if (body.accuracy !== undefined && body.accuracy !== null) {
      alert.accuracy = body.accuracy;
    }

    const push = await db().ref('alerts').push(alert);

    const latestUpdate = {
      heartRate: hr,
      spo2: spo2,
      lat,
      lng,
      accuracy: (body.accuracy === undefined || body.accuracy === null) ? null : body.accuracy,
      locSource,
      ts: now
    };
    await db().ref('devices/' + deviceId + '/latest').update(latestUpdate);

    return res.status(200).json({ ok: true, id: push.key });
  } catch (e) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
