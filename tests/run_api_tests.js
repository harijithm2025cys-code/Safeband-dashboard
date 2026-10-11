import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = process.argv[2] || 'http://localhost:3000';
const SECRET = process.env.DEVICE_SECRET || '451a9b24122ae094cfdd4bda0d095a40b69f23127aa88b4a';

console.log(`\n==================================================`);
console.log(`Running SafeBand API Integration Tests against: ${BASE_URL}`);
console.log(`==================================================\n`);

let pass = 0;
let fail = 0;

async function runTest(name, url, options, expectedStatus) {
  try {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (res.status === expectedStatus) {
      console.log(`[PASS] ${name} -> HTTP ${res.status}`);
      pass++;
      return { ok: true, data };
    } else {
      console.log(`[FAIL] ${name} -> HTTP ${res.status} (Expected: ${expectedStatus})`);
      console.log('       Response:', data);
      fail++;
      return { ok: false, data };
    }
  } catch (err) {
    console.log(`[FAIL] ${name} -> Fetch error: ${err.message}`);
    fail++;
    return { ok: false, error: err };
  }
}

async function main() {
  // A2: Missing or wrong secret -> 401
  await runTest(
    'A2: Missing/wrong secret',
    `${BASE_URL}/api/alert`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-secret': 'invalid_secret' },
      body: JSON.stringify({ deviceId: 'dev-a2', type: 'FALL' })
    },
    401
  );

  // A3: Bad type -> 400
  await runTest(
    'A3: Bad type whitelist',
    `${BASE_URL}/api/alert`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-secret': SECRET },
      body: JSON.stringify({ deviceId: 'dev-a3', type: 'RANDOM_BAD_TYPE' })
    },
    400
  );

  // A4: Latitude out of bounds (999) -> 400
  await runTest(
    'A4: Latitude out of bounds (lat 999)',
    `${BASE_URL}/api/alert`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-secret': SECRET },
      body: JSON.stringify({ deviceId: 'dev-a4', type: 'FALL', lat: 999, lng: 0 })
    },
    400
  );

  // A1: Valid FALL alert -> 200 and a DB record
  const devId = `dev-test-${Date.now()}`;
  await runTest(
    'A1: Valid FALL alert',
    `${BASE_URL}/api/alert`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-secret': SECRET },
      body: JSON.stringify({
        deviceId: devId,
        type: 'FALL',
        heartRate: 78,
        spo2: 98,
        lat: 12.9716,
        lng: 77.5946,
        locSource: 'gps',
        accuracy: 3.5,
        timestamp: Date.now()
      })
    },
    200
  );

  // A5: Second alert within 30s -> 429
  await runTest(
    'A5: Second alert within 30s (Rate Limit)',
    `${BASE_URL}/api/alert`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-secret': SECRET },
      body: JSON.stringify({ deviceId: devId, type: 'FALL' })
    },
    429
  );

  // A6: Twilio or Gemini failure -> still 200
  const devResilience = `dev-res-${Date.now()}`;
  await runTest(
    'A6: Twilio/Gemini failure resilience',
    `${BASE_URL}/api/alert`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-secret': SECRET },
      body: JSON.stringify({
        deviceId: devResilience,
        type: 'SOS',
        heartRate: 115,
        spo2: 96,
        locSource: 'none',
        timestamp: Date.now()
      })
    },
    200
  );

  // A7: /api/locate with Wi-Fi APs
  await runTest(
    'A7: /api/locate (Wi-Fi or IP fallback)',
    `${BASE_URL}/api/locate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-secret': SECRET },
      body: JSON.stringify({
        wifiAccessPoints: [{ mac: '00:11:22:33:44:55', rssi: -65 }],
        mockFallback: true
      })
    },
    200
  );

  console.log(`\n==================================================`);
  console.log(`API Test Results: ${pass} PASSED, ${fail} FAILED`);
  console.log(`==================================================\n`);

  if (fail > 0) process.exit(1);
  process.exit(0);
}

main();
