const { checkSecret, parseBody } = require('./_lib');

async function tryGoogle(aps, key) {
  if (!key || !Array.isArray(aps) || aps.length < 2) return null;
  const wifiAccessPoints = [];
  for (const ap of aps) {
    if (!ap || typeof ap.mac !== 'string' || ap.mac.length === 0) continue;
    const rssi = (typeof ap.rssi === 'number') ? ap.rssi : -70;
    wifiAccessPoints.push({ macAddress: ap.mac, signalStrength: rssi });
  }
  if (wifiAccessPoints.length < 2) return null;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch('https://www.googleapis.com/geolocation/v1/geolocate?key=' + encodeURIComponent(key), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ considerIp: false, wifiAccessPoints }),
      signal: ctrl.signal
    });
    clearTimeout(to);
    if (!r.ok) return null;
    const j = await r.json();
    if (j && j.location && typeof j.location.lat === 'number' && typeof j.location.lng === 'number') {
      const acc = typeof j.accuracy === 'number' ? j.accuracy : 0;
      return { lat: j.location.lat, lng: j.location.lng, accuracy: acc, source: 'wifi' };
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function tryIp(req) {
  try {
    const headers = req.headers || {};
    let ip = headers['x-forwarded-for'] || headers['x-real-ip'] || headers['client-ip'] || '';
    if (typeof ip === 'string' && ip.indexOf(',') !== -1) ip = ip.split(',')[0].trim();

    let targetUrl = 'https://ipwho.is/';
    if (ip && !ip.startsWith('127.') && !ip.startsWith('10.') && !ip.startsWith('192.168.') && ip !== '::1') {
      targetUrl += encodeURIComponent(ip);
    }

    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(targetUrl, { signal: ctrl.signal });
    clearTimeout(to);
    if (!r.ok) return null;
    const j = await r.json();
    if (j && j.success !== false && typeof j.latitude === 'number' && typeof j.longitude === 'number') {
      return { lat: j.latitude, lng: j.longitude, accuracy: 25000, source: 'ip' };
    }
    return null;
  } catch (e) {
    return null;
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

    if (req.bodyParseError) {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }

    const body = parseBody(req) || {};
    const aps = (body && Array.isArray(body.wifiAccessPoints)) ? body.wifiAccessPoints : [];
    const key = process.env.LOCATION_API_KEY || '';

    const g = await tryGoogle(aps, key);
    if (g) return res.status(200).json(g);

    const ip = await tryIp(req);
    if (ip) return res.status(200).json(ip);

    return res.status(404).json({ error: 'no_location' });
  } catch (e) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
