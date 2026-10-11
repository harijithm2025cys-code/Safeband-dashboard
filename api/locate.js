import { verifyDeviceSecret } from './_lib.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-device-secret');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 1. Verify device secret if provided
  if (req.headers['x-device-secret'] && !verifyDeviceSecret(req)) {
    return res.status(401).json({ error: 'Unauthorized: Invalid x-device-secret' });
  }

  const body = req.body || {};
  const aps = body.wifiAccessPoints || body.aps || [];

  // 2. Wi-Fi Geolocation if LOCATION_API_KEY is present
  const locationApiKey = process.env.LOCATION_API_KEY;
  if (locationApiKey && Array.isArray(aps) && aps.length > 0) {
    try {
      const formattedAps = aps.map(ap => ({
        macAddress: ap.mac || ap.bssid || ap.macAddress,
        signalStrength: ap.rssi || ap.signalStrength || -70
      })).filter(ap => Boolean(ap.macAddress));

      if (formattedAps.length > 0) {
        const googleResp = await fetch(
          `https://www.googleapis.com/geolocation/v1/geolocate?key=${locationApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              considerIp: true,
              wifiAccessPoints: formattedAps
            })
          }
        );

        if (googleResp.ok) {
          const data = await googleResp.json();
          if (data && data.location && data.location.lat && data.location.lng) {
            return res.status(200).json({
              lat: data.location.lat,
              lng: data.location.lng,
              accuracy: data.accuracy || 35.0,
              source: 'wifi'
            });
          }
        }
      }
    } catch (err) {
      console.error('[Locate] Wi-Fi Geolocation failed, trying IP fallback:', err.message);
    }
  }

  // 3. Fall back to IP Geolocation lookup
  try {
    const rawIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
    const clientIp = rawIp.split(',')[0].trim();

    // Query free IP geolocation endpoint (ip-api.com)
    const ipUrl = (clientIp && !clientIp.startsWith('127.') && clientIp !== '::1')
      ? `http://ip-api.com/json/${clientIp}?fields=status,lat,lon,city,country`
      : 'http://ip-api.com/json/?fields=status,lat,lon,city,country'; // Server's external IP for local dev

    const ipResp = await fetch(ipUrl, { signal: AbortSignal.timeout(4000) });
    if (ipResp.ok) {
      const ipData = await ipResp.json();
      if (ipData && ipData.status === 'success' && ipData.lat && ipData.lon) {
        return res.status(200).json({
          lat: ipData.lat,
          lng: ipData.lon,
          accuracy: 5000.0, // Standard IP accuracy ~5km
          source: 'ip',
          city: ipData.city,
          country: ipData.country
        });
      }
    }
  } catch (err) {
    console.error('[Locate] IP fallback failed:', err.message);
  }

  // 4. Fallback default if both fail or mock environment
  if (body.mockFallback) {
    return res.status(200).json({
      lat: 12.9716,
      lng: 77.5946,
      accuracy: 25.0,
      source: 'wifi'
    });
  }

  return res.status(404).json({
    error: 'Location could not be determined',
    source: 'none'
  });
}
