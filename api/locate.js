const { sendJson, readBody } = require('./_lib');

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
            body: JSON.stringify({ considerIp: false, wifiAccessPoints: wifiAccessPoints }),
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
    } catch (e) { return null; }
}

async function tryIp(req) {
    try {
        let ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '';
        if (typeof ip === 'string' && ip.indexOf(',') !== -1) ip = ip.split(',')[0].trim();
        if (!ip || ip === '::1' || ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.')) return null;
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 5000);
        const r = await fetch('https://ipwho.is/' + encodeURIComponent(ip), { signal: ctrl.signal });
        clearTimeout(to);
        if (!r.ok) return null;
        const j = await r.json();
        if (j && j.success !== false && typeof j.latitude === 'number' && typeof j.longitude === 'number') {
            const acc = 25000;
            return { lat: j.latitude, lng: j.longitude, accuracy: acc, source: 'ip' };
        }
        return null;
    } catch (e) { return null; }
}

module.exports = async (req, res) => {
    try {
        if (req.method !== 'POST') { sendJson(res, 405, { error: 'method' }); return; }
        const body = await readBody(req);
        const aps = (body && Array.isArray(body.wifiAccessPoints)) ? body.wifiAccessPoints : [];

        const key = process.env.LOCATION_API_KEY || '';
        const g = await tryGoogle(aps, key);
        if (g) { sendJson(res, 200, g); return; }

        const ip = await tryIp(req);
        if (ip) { sendJson(res, 200, ip); return; }

        sendJson(res, 404, { error: 'no_location' });
    } catch (e) {
        sendJson(res, 500, { error: 'server' });
    }
};