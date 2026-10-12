const { db, guard, clean } = require('./_lib');

const TITLE = { FALL: 'Possible fall detected', LOW_SPO2: 'Low oxygen level', SOS: 'SOS button pressed' };
const SRC = { gps: 'GPS', wifi: 'approximate (Wi-Fi)', ip: 'approximate (internet)', last: 'last known position' };

async function summarize(a) {
  const facts = `${TITLE[a.type]}${a.manualTrigger ? ' (pressed manually)' : ''}. Heart rate ${a.heartRate ?? 'unknown'}, SpO2 ${a.spo2 ?? 'unknown'}%.`;
  const fallback = `${facts} Please call and check on them now.`;
  if (!process.env.GEMINI_API_KEY) return fallback;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: `Write a calm 2-sentence alert for a family caregiver. Plain words, no emojis. Facts: ${facts}` }] }] }),
    });
    clearTimeout(t);
    const j = await r.json();
    return j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || fallback;
  } catch { return fallback; }
}

async function whatsapp(text) {
  try {
    const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN;
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${tok}`).toString('base64') },
      body: new URLSearchParams({ From: process.env.TWILIO_WHATSAPP_FROM, To: process.env.CAREGIVER_WHATSAPP_TO, Body: text }),
    });
    return r.ok;
  } catch { return false; }
}

module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  const { v, err } = clean(req.body);
  if (err) return res.status(400).json({ error: 'invalid ' + err });
  const type = req.body.type;
  if (!TITLE[type]) return res.status(400).json({ error: 'invalid type' });

  try {
    const d = db();
    const lastRef = d.ref(`devices/${v.deviceId}/lastAlertAt`);
    if (Date.now() - ((await lastRef.get()).val() || 0) < 30000) return res.status(429).json({ error: 'rate limited' });
    await lastRef.set(Date.now());

    const alert = { ...v, type, manualTrigger: req.body.manualTrigger === true, acknowledged: false, ts: Date.now() };
    const ref = d.ref('alerts').push();
    await ref.set(alert);
    await d.ref(`devices/${v.deviceId}/latest`).update({ heartRate: v.heartRate, spo2: v.spo2, lat: v.lat, lng: v.lng, accuracy: v.accuracy, locSource: v.locSource, ts: alert.ts });

    const summary = await summarize(alert);
    const loc = v.lat === null ? 'location unavailable' : `${SRC[v.locSource] || v.locSource}: https://maps.google.com/?q=${v.lat},${v.lng}`;
    const sent = await whatsapp(`SafeBand: ${TITLE[type]}${alert.manualTrigger ? ' (manually triggered)' : ''}\n${summary}\nHR ${v.heartRate ?? '--'} | SpO2 ${v.spo2 ?? '--'}%\nLocation: ${loc}`);
    await ref.update({ summary, whatsapp: sent });
    res.json({ ok: true, id: ref.key, whatsapp: sent });
  } catch (e) {
    console.error('alert failed', e.message);
    res.status(500).json({ error: 'server error' });
  }
};
