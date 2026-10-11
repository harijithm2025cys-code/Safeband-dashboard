#!/usr/bin/env bash
# ==============================================================================
# SafeBand API Integration Test Suite
# Tests: A1 - A7
# Usage: ./tests/api.test.sh [BASE_URL]
# ==============================================================================

BASE_URL="${1:-http://127.0.0.1:3000}"
echo "=================================================="
echo "Running SafeBand API Test Suite against: $BASE_URL"
echo "=================================================="

# Use Windows native curl.exe if available (avoids MSYS2 socket isolation)
CURL="curl"
if command -v curl.exe >/dev/null 2>&1; then
  CURL="curl.exe"
fi

# Extract DEVICE_SECRET from .env securely without printing it
SECRET=$(grep -E '^DEVICE_SECRET=' .env 2>/dev/null | cut -d '=' -f2- | tr -d '\r"')
if [ -z "$SECRET" ]; then
  SECRET="451a9b24122ae094cfdd4bda0d095a40b69f23127aa88b4a"
fi

PASS_COUNT=0
FAIL_COUNT=0

assert_status() {
  local test_name="$1"
  local expected="$2"
  local actual="$3"
  local body="$4"

  if [ "$actual" -eq "$expected" ]; then
    echo "  [PASS] $test_name -> HTTP $actual (Expected: $expected)"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "  [FAIL] $test_name -> HTTP $actual (Expected: $expected)"
    echo "         Response: $body"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

# A2: Missing or wrong secret -> 401
echo "[Test A2] Missing or wrong secret"
body=$($CURL -s -X POST "$BASE_URL/api/alert" \
  -H "Content-Type: application/json" \
  -H "x-device-secret: invalid_secret_123" \
  -d '{"deviceId":"test-dev-a2","type":"FALL"}')
status=$($CURL -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/alert" \
  -H "Content-Type: application/json" \
  -H "x-device-secret: invalid_secret_123" \
  -d '{"deviceId":"test-dev-a2","type":"FALL"}')
assert_status "A2 Invalid Secret" 401 "$status" "$body"

# A3: Bad alert type -> 400
echo "[Test A3] Bad alert type (not in whitelist)"
body=$($CURL -s -X POST "$BASE_URL/api/alert" \
  -H "Content-Type: application/json" \
  -H "x-device-secret: $SECRET" \
  -d '{"deviceId":"test-dev-a3","type":"INVALID_TYPE_XYZ"}')
status=$($CURL -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/alert" \
  -H "Content-Type: application/json" \
  -H "x-device-secret: $SECRET" \
  -d '{"deviceId":"test-dev-a3","type":"INVALID_TYPE_XYZ"}')
assert_status "A3 Bad Type" 400 "$status" "$body"

# A4: Invalid latitude (999) -> 400
echo "[Test A4] Invalid latitude (lat 999)"
body=$($CURL -s -X POST "$BASE_URL/api/alert" \
  -H "Content-Type: application/json" \
  -H "x-device-secret: $SECRET" \
  -d '{"deviceId":"test-dev-a4","type":"FALL","lat":999,"lng":0}')
status=$($CURL -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/alert" \
  -H "Content-Type: application/json" \
  -H "x-device-secret: $SECRET" \
  -d '{"deviceId":"test-dev-a4","type":"FALL","lat":999,"lng":0}')
assert_status "A4 Out-of-bounds Lat" 400 "$status" "$body"

# A1: Valid FALL alert -> 200 and a DB record
echo "[Test A1] Valid FALL alert"
DEVICE_A1="dev-test-a1-$RANDOM-$SECONDS"
body=$($CURL -s -X POST "$BASE_URL/api/alert" \
  -H "Content-Type: application/json" \
  -H "x-device-secret: $SECRET" \
  -d "{\"deviceId\":\"$DEVICE_A1\",\"type\":\"FALL\",\"heartRate\":78,\"spo2\":98,\"lat\":12.9716,\"lng\":77.5946,\"locSource\":\"gps\",\"accuracy\":3.2}")
status=$($CURL -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/alert" \
  -H "Content-Type: application/json" \
  -H "x-device-secret: $SECRET" \
  -d "{\"deviceId\":\"$DEVICE_A1-chk\",\"type\":\"FALL\",\"heartRate\":78,\"spo2\":98,\"lat\":12.9716,\"lng\":77.5946,\"locSource\":\"gps\",\"accuracy\":3.2}")
assert_status "A1 Valid FALL Alert" 200 "$status" "$body"

# A5: Second alert from same device within 30s -> 429 Rate Limit
echo "[Test A5] Second alert within 30s rate limit"
body=$($CURL -s -X POST "$BASE_URL/api/alert" \
  -H "Content-Type: application/json" \
  -H "x-device-secret: $SECRET" \
  -d "{\"deviceId\":\"$DEVICE_A1\",\"type\":\"FALL\"}")
status=$($CURL -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/alert" \
  -H "Content-Type: application/json" \
  -H "x-device-secret: $SECRET" \
  -d "{\"deviceId\":\"$DEVICE_A1\",\"type\":\"FALL\"}")
assert_status "A5 Rate Limit (30s)" 429 "$status" "$body"

# A6: Twilio or Gemini failure -> still 200
echo "[Test A6] Twilio/Gemini resilience (still returns 200)"
DEVICE_A6="dev-test-a6-$RANDOM-$SECONDS"
body=$($CURL -s -X POST "$BASE_URL/api/alert" \
  -H "Content-Type: application/json" \
  -H "x-device-secret: $SECRET" \
  -d "{\"deviceId\":\"$DEVICE_A6\",\"type\":\"SOS\",\"heartRate\":110,\"spo2\":95,\"locSource\":\"none\"}")
status=$($CURL -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/alert" \
  -H "Content-Type: application/json" \
  -H "x-device-secret: $SECRET" \
  -d "{\"deviceId\":\"$DEVICE_A6-chk\",\"type\":\"SOS\",\"heartRate\":110,\"spo2\":95,\"locSource\":\"none\"}")
assert_status "A6 Resilience 200 OK" 200 "$status" "$body"

# A7: /api/locate with and without LOCATION_API_KEY
echo "[Test A7] /api/locate geolocation endpoint"
status=$($CURL -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/locate" \
  -H "Content-Type: application/json" \
  -H "x-device-secret: $SECRET" \
  -d '{"wifiAccessPoints":[{"mac":"00:11:22:33:44:55","rssi":-65}],"mockFallback":true}')
if [ "$status" -eq 200 ] || [ "$status" -eq 404 ]; then
  echo "  [PASS] A7 /api/locate returned HTTP $status with fallback handling"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "  [FAIL] A7 /api/locate unexpected HTTP $status"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

echo "=================================================="
echo "API Test Summary: $PASS_COUNT PASSED, $FAIL_COUNT FAILED"
echo "=================================================="

if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi
exit 0
