const { guard } = require('./_lib');

module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  const aps = Array.isArray(req.body?.wifiAccessPoints) ? req.body.wifiAccessPoints.slice(0, 10) : [];
  const key = process.env.LOCATION_API_KEY;

  if (key && aps.length >= 2) {
    try {
      const r = await fetch(`https://www.googleapis.com/geolocation/v1/geolocate?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          considerIp: false,
          wifiAccessPoints: aps.map((a) => ({ macAddress: String(a.mac), signalStrength: Number(a.rssi) })),
        }),
      });
      if (r.ok) {
        const j = await r.json();
        return res.json({ lat: j.location.lat, lng: j.location.lng, accuracy: j.accuracy, source: 'wifi' });
      }
    } catch { /* fall through to IP */ }
  }

  try {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const j = await (await fetch(`https://ipwho.is/${ip}`)).json();
    if (j.success) return res.json({ lat: j.latitude, lng: j.longitude, accuracy: 5000, source: 'ip' });
  } catch { /* nothing else to try */ }

  res.status(404).json({ error: 'location unavailable' });
};
