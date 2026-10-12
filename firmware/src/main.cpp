// SafeBand firmware - ESP32 (PlatformIO / Arduino)
// Sensors: MPU6050, MAX30102, NEO-6M, SSD1306 OLED, vibration motor, 1 button
// Network runs in its own FreeRTOS task so sensors/display never block.

#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_MPU6050.h>
#include <MAX30105.h>
#include <heartRate.h>
#include <TinyGPSPlus.h>
#include <time.h>
#include <sys/time.h>
#include "config.h"
#include "secrets.h"

static_assert(DISPLAY_ROTATION == 0 || DISPLAY_ROTATION == 2, "DISPLAY_ROTATION must be 0 or 2 (landscape)");

// ------------------------------------------------------------------ types
struct Loc {
  bool valid;
  double lat, lng;
  float acc;
  char src[8];
  uint32_t ms;
};

struct AlertMsg {
  char type[10];
  float hr;
  int spo2;
  bool manual;
  Loc gps;
  uint32_t createdMs;
};

enum FallState { FS_IDLE, FS_IMPACT, FS_STILL, FS_COUNTDOWN };
enum Screen { SCR_WATCH, SCR_VITALS, SCR_LOCATION, SCR_STATUS, SCR_NUM };

// ------------------------------------------------------------------ globals
Adafruit_SSD1306 display(128, 64, &Wire, -1);
Adafruit_MPU6050 mpu;
MAX30105 ppg;
TinyGPSPlus gps;
HardwareSerial gpsSerial(2);
portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;
QueueHandle_t alertQ;

bool g_mpuOk = false, g_ppgOk = false, g_oledOk = false;

// shared between main loop and net task (guarded by mux when it matters)
Loc g_gps = {false, 0, 0, 0, "gps", 0};
Loc g_cached = {false, 0, 0, 0, "none", 0};  // result of /api/locate (wifi/ip)
Loc g_last = {false, 0, 0, 0, "last", 0};    // last known good position
volatile float g_hr = 0;
volatile int g_spo2 = 0;
volatile bool g_finger = false;
volatile int g_netEvent = 0;     // 1 = alert sent, 2 = alert failed
volatile int g_serverOk = -1;    // -1 unknown, 0 fail, 1 ok
volatile uint32_t g_alertsSent = 0;
volatile bool g_locateReq = false;

// fall detector
FallState g_state = FS_IDLE;
uint32_t g_t0 = 0, g_still0 = 0, g_cdStart = 0, g_lockoutUntil = 0;
bool g_cdManual = false;
float g_mag = 1.0f;
volatile float g_peak = 1.0f;

// button
int g_pressedLevel = LOW;
bool g_btn = false, g_holdFired = false, g_btnDebug = false;
uint32_t g_pressStart = 0, g_lastPress = 0;
uint8_t g_pressCount = 0;

// display
Screen g_screen = SCR_WATCH;
uint32_t g_lastAction = 0, g_msgUntil = 0;
char g_msg[24] = "";
bool g_dimmed = false;

// vibration patterns: alternating ON/OFF durations in ms, starting with ON
static const uint16_t PAT_SENT[] = {1000};
static const uint16_t PAT_SOS[] = {300, 200, 300, 200, 300};
static const uint16_t PAT_CANCEL[] = {150};
static const uint16_t* g_vp = nullptr;
static uint8_t g_vlen = 0, g_vidx = 0;
static uint32_t g_vnext = 0;

// ------------------------------------------------------------------ helpers
void wake() { g_lastAction = millis(); }

void showMsg(const char* s, uint32_t ms) {
  strncpy(g_msg, s, sizeof(g_msg) - 1);
  g_msg[sizeof(g_msg) - 1] = 0;
  g_msgUntil = millis() + ms;
  wake();
}

void vibePattern(const uint16_t* p, uint8_t n) {
  g_vp = p; g_vlen = n; g_vidx = 0; g_vnext = millis() + p[0];
  digitalWrite(PIN_VIBE, HIGH);
}

void vibeUpdate(uint32_t now) {
  if (g_state == FS_COUNTDOWN) {
    uint32_t el = now - g_cdStart;
    uint32_t rem = COUNTDOWN_MS > el ? COUNTDOWN_MS - el : 0;
    uint32_t per = rem > 3000 ? 1000 : 400;      // faster beeps in last 3 s
    digitalWrite(PIN_VIBE, (el % per) < 200);
    g_vp = nullptr;
    return;
  }
  if (!g_vp) return;
  if (now >= g_vnext) {
    g_vidx++;
    if (g_vidx >= g_vlen) { digitalWrite(PIN_VIBE, LOW); g_vp = nullptr; return; }
    digitalWrite(PIN_VIBE, (g_vidx % 2 == 0) ? HIGH : LOW);
    g_vnext = now + g_vp[g_vidx];
  }
}

bool isoNow(char* out, size_t n) {
  time_t t; time(&t);
  if (t < 1700000000) return false;
  struct tm tmv; gmtime_r(&t, &tmv);
  strftime(out, n, "%Y-%m-%dT%H:%M:%SZ", &tmv);
  return true;
}

void queueAlert(const char* type, bool manual, float hrOv = -1, int spo2Ov = -1) {
  AlertMsg m;
  memset(&m, 0, sizeof(m));
  strncpy(m.type, type, sizeof(m.type) - 1);
  m.hr = g_finger ? g_hr : 0;
  m.spo2 = g_finger ? g_spo2 : 0;
  if (hrOv >= 0) m.hr = hrOv;
  if (spo2Ov >= 0) m.spo2 = spo2Ov;
  m.manual = manual;
  portENTER_CRITICAL(&mux); m.gps = g_gps; portEXIT_CRITICAL(&mux);
  m.createdMs = millis();
  if (xQueueSend(alertQ, &m, 0) != pdTRUE) Serial.println("[alert] queue full, dropped");
  showMsg(WiFi.status() == WL_CONNECTED ? "SENDING..." : "QUEUED (no WiFi)", 2000);
  Serial.printf("[alert] %s queued (manual=%d)\n", type, manual);
}

// Location choice: GPS -> cached wifi/ip -> last known -> none. Never blocks.
void pickLocation(const Loc& gpsSnap, Loc& out) {
  portENTER_CRITICAL(&mux);
  Loc c = g_cached, last = g_last;
  portEXIT_CRITICAL(&mux);
  uint32_t now = millis();
  if (gpsSnap.valid) out = gpsSnap;
  else if (c.valid && now - c.ms < CACHE_MAX_AGE_MS) out = c;
  else if (last.valid) { out = last; strcpy(out.src, "last"); }
  else { out = Loc{}; strcpy(out.src, "none"); }
}

// ------------------------------------------------------------------ network task
int postJson(const char* path, const String& body, String* resp = nullptr) {
  WiFiClientSecure client;
  client.setInsecure();  // prototype only: pin the root CA for production
  HTTPClient http;
  String url = String(API_BASE_URL) + path;
  if (!http.begin(client, url)) return -1;
  http.setTimeout(6000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-secret", DEVICE_SECRET);
  int code = http.POST(body);
  if (resp && code > 0) *resp = http.getString();
  http.end();
  return code;
}

void fillCommon(JsonDocument& d, float hr, int spo2, const Loc& l) {
  d["deviceId"] = DEVICE_ID;
  if (hr > 0) d["heartRate"] = (int)roundf(hr); else d["heartRate"] = nullptr;
  if (spo2 > 0) d["spo2"] = spo2; else d["spo2"] = nullptr;
  if (l.valid) {
    d["lat"] = l.lat; d["lng"] = l.lng;
    if (l.acc > 0) d["accuracy"] = l.acc; else d["accuracy"] = nullptr;
    d["locSource"] = l.src;
  } else {
    d["lat"] = nullptr; d["lng"] = nullptr; d["accuracy"] = nullptr;
    d["locSource"] = "none";
  }
  char ts[25];
  if (isoNow(ts, sizeof(ts))) d["timestamp"] = ts;
}

// 1 = delivered, 0 = temporary failure (retry later), -1 = rejected (drop)
int sendAlert(const AlertMsg& m) {
  Loc l; pickLocation(m.gps, l);
  JsonDocument d;
  fillCommon(d, m.hr, m.spo2, l);
  d["type"] = m.type;
  d["manualTrigger"] = m.manual;
  String body; serializeJson(d, body);
  for (int a = 0; a < 3; a++) {
    int code = postJson("/api/alert", body);
    Serial.printf("[net] alert try %d -> HTTP %d\n", a + 1, code);
    if ((code >= 200 && code < 300) || code == 429) { g_serverOk = 1; return 1; }
    g_serverOk = 0;
    if (code >= 400 && code < 500) return -1;
    vTaskDelay(pdMS_TO_TICKS(1000 << a));  // 1 s, 2 s, 4 s
  }
  return 0;
}

void sendVitals() {
  Loc snap; portENTER_CRITICAL(&mux); snap = g_gps; portEXIT_CRITICAL(&mux);
  Loc l; pickLocation(snap, l);
  JsonDocument d;
  fillCommon(d, g_finger ? g_hr : 0, g_finger ? g_spo2 : 0, l);
  d["accelPeakG"] = roundf(g_peak * 100.0f) / 100.0f;
  const char* fs = "IDLE";
  if (g_state == FS_IMPACT) fs = "IMPACT";
  else if (g_state == FS_STILL) fs = "STILL";
  else if (g_state == FS_COUNTDOWN) fs = "COUNTDOWN";
  d["fallState"] = fs;
  String body; serializeJson(d, body);
  g_peak = 1.0f;
  int code = postJson("/api/vitals", body);
  g_serverOk = (code >= 200 && code < 300) ? 1 : 0;
}

void doLocate() {
  int n = WiFi.scanNetworks(false, false, false, 300);
  if (n <= 0) { WiFi.scanDelete(); Serial.println("[locate] no networks"); return; }
  JsonDocument d;
  JsonArray arr = d["wifiAccessPoints"].to<JsonArray>();
  for (int i = 0; i < n && i < 10; i++) {
    JsonObject o = arr.add<JsonObject>();
    o["mac"] = WiFi.BSSIDstr(i);
    o["rssi"] = WiFi.RSSI(i);
  }
  WiFi.scanDelete();
  String body, resp; serializeJson(d, body);
  int code = postJson("/api/locate", body, &resp);
  Serial.printf("[locate] HTTP %d\n", code);
  if (code != 200) return;
  JsonDocument r;
  if (deserializeJson(r, resp) || !r["lat"].is<float>() || !r["lng"].is<float>()) return;
  Loc l;
  l.valid = true; l.lat = r["lat"]; l.lng = r["lng"];
  l.acc = r["accuracy"] | 0.0f;
  const char* s = r["source"] | "ip";
  strncpy(l.src, s, sizeof(l.src) - 1); l.src[sizeof(l.src) - 1] = 0;
  l.ms = millis();
  portENTER_CRITICAL(&mux); g_cached = l; g_last = l; portEXIT_CRITICAL(&mux);
  Serial.printf("[locate] %s %.5f,%.5f (~%.0fm)\n", l.src, l.lat, l.lng, l.acc);
}

void netTask(void*) {
  bool timeInit = false;
  uint32_t lastVitals = 0, lastReconnect = millis(), lastLocate = 0, nextTry = 0;
  AlertMsg pending; bool hasPending = false; uint8_t rounds = 0;
  for (;;) {
    uint32_t now = millis();
    bool up = WiFi.status() == WL_CONNECTED;

    if (!up && now - lastReconnect > 10000) {
      Serial.println("[wifi] reconnecting...");
      WiFi.disconnect(); WiFi.begin(WIFI_SSID, WIFI_PASS);
      lastReconnect = now;
    }
    if (up && !timeInit) {
      configTzTime(TZ_INFO, "pool.ntp.org", "time.google.com");
      timeInit = true;
      Serial.printf("[wifi] connected, IP %s\n", WiFi.localIP().toString().c_str());
    }

    if (!hasPending && xQueueReceive(alertQ, &pending, 0) == pdTRUE) {
      hasPending = true; rounds = 0; nextTry = 0;
    }

    if (hasPending && up && now >= nextTry) {
      int r = sendAlert(pending);
      if (r == 1) { g_netEvent = 1; g_alertsSent++; hasPending = false; }
      else if (r == -1) { g_netEvent = 2; hasPending = false; }
      else if (++rounds >= 5) { g_netEvent = 2; hasPending = false; }
      else nextTry = millis() + 15000;
    } else if (!hasPending && up) {
      bool gpsValid; portENTER_CRITICAL(&mux); gpsValid = g_gps.valid; portEXIT_CRITICAL(&mux);
      if (!gpsValid && (g_locateReq || lastLocate == 0 || now - lastLocate >= LOCATE_EVERY_MS)) {
        g_locateReq = false; lastLocate = now;
        doLocate();
      } else if (now - lastVitals >= VITALS_EVERY_MS) {
        lastVitals = now;
        sendVitals();
      }
    }
    vTaskDelay(pdMS_TO_TICKS(50));
  }
}

// ------------------------------------------------------------------ fall logic
void startCountdown(bool manual) {
  g_state = FS_COUNTDOWN;
  g_cdStart = millis();
  g_cdManual = manual;
  g_screen = SCR_WATCH;
  wake();
  Serial.printf("[fall] countdown started (%s)\n", manual ? "manual" : "auto");
}

void cancelAlert() {
  g_state = FS_IDLE;
  g_lockoutUntil = millis() + CANCEL_LOCKOUT_MS;
  showMsg("CANCELLED", 1500);
  vibePattern(PAT_CANCEL, 1);
  Serial.println("[fall] cancelled by button");
}

void fallFeed(float mag, uint32_t now) {
  if (g_state == FS_COUNTDOWN) return;
  if (now < g_lockoutUntil) { g_state = FS_IDLE; return; }
  switch (g_state) {
    case FS_IDLE:
      if (mag > FALL_IMPACT_G) { g_state = FS_IMPACT; g_t0 = now; Serial.printf("[fall] impact %.2f g\n", mag); }
      break;
    case FS_IMPACT:
      if (now - g_t0 >= IMPACT_SETTLE_MS) { g_state = FS_STILL; g_still0 = now; g_t0 = now; }
      break;
    case FS_STILL:
      if (fabsf(mag - 1.0f) > STILL_BAND_G) g_still0 = now;  // moved: restart stillness timer
      if (now - g_still0 >= STILL_MS) startCountdown(false);
      else if (now - g_t0 >= STILL_TIMEOUT_MS) { g_state = FS_IDLE; Serial.println("[fall] person moving, ignored"); }
      break;
    default: break;
  }
}

void updateFall(uint32_t now) {
  if (g_state == FS_COUNTDOWN && now - g_cdStart >= COUNTDOWN_MS) {
    digitalWrite(PIN_VIBE, LOW);
    queueAlert("FALL", g_cdManual);
    g_state = FS_IDLE;
    g_lockoutUntil = now + AFTER_ALERT_LOCKOUT;
  }
}

void pollImu(uint32_t now) {
  static uint32_t last = 0;
  if (!g_mpuOk || now - last < IMU_PERIOD_MS) return;
  last = now;
  sensors_event_t a, g, t;
  mpu.getEvent(&a, &g, &t);
  float m = sqrtf(a.acceleration.x * a.acceleration.x +
                  a.acceleration.y * a.acceleration.y +
                  a.acceleration.z * a.acceleration.z) / 9.80665f;
  g_mag = m;
  if (m > g_peak) g_peak = m;
  fallFeed(m, now);
}

// ------------------------------------------------------------------ vitals
static float rates[4] = {0, 0, 0, 0};
static uint8_t rateIdx = 0;
static uint32_t lastBeat = 0;
static float dcIR = 0, dcRed = 0, sumIR = 0, sumRed = 0;
static int accN = 0;

void resetPpg() {
  memset(rates, 0, sizeof(rates)); rateIdx = 0; lastBeat = 0;
  dcIR = dcRed = sumIR = sumRed = 0; accN = 0;
  g_hr = 0; g_spo2 = 0;
}

void pollPpg() {
  if (!g_ppgOk) return;
  ppg.check();
  while (ppg.available()) {
    uint32_t red = ppg.getFIFORed(), ir = ppg.getFIFOIR();
    ppg.nextSample();
    if (ir < FINGER_IR_MIN) {
      if (g_finger) resetPpg();
      g_finger = false;
      continue;
    }
    g_finger = true;

    if (checkForBeat(ir)) {
      uint32_t t = millis();
      if (lastBeat) {
        float bpm = 60000.0f / (t - lastBeat);
        if (bpm > 25 && bpm < 220) {
          rates[rateIdx++ % 4] = bpm;
          float s = 0; int c = 0;
          for (int i = 0; i < 4; i++) if (rates[i] > 0) { s += rates[i]; c++; }
          if (c) g_hr = s / c;
        }
      }
      lastBeat = t;
    }

    // SpO2 estimate (ratio of ratios). Uncalibrated: demo value, not medical grade.
    if (dcIR == 0) { dcIR = ir; dcRed = red; }
    dcIR += (ir - dcIR) * 0.05f;
    dcRed += (red - dcRed) * 0.05f;
    sumIR += (ir - dcIR) * (ir - dcIR);
    sumRed += (red - dcRed) * (red - dcRed);
    if (++accN >= 100) {
      float acIR = sqrtf(sumIR / accN), acRed = sqrtf(sumRed / accN);
      if (acIR > 0 && dcIR > 0 && dcRed > 0) {
        float R = (acRed / dcRed) / (acIR / dcIR);
        float s = 110.0f - 25.0f * R;
        if (s > 70 && s <= 100.5f) {
          if (s > 100) s = 100;
          g_spo2 = g_spo2 == 0 ? (int)s : (int)(0.7f * g_spo2 + 0.3f * s);
        }
      }
      sumIR = sumRed = 0; accN = 0;
    }
  }
}

void checkSpo2(uint32_t now) {
  static uint32_t lowStart = 0, lastAlert = 0;
  bool low = g_finger && g_spo2 > 0 && g_spo2 < SPO2_LOW_PERCENT;
  if (!low) { lowStart = 0; return; }
  if (!lowStart) lowStart = now;
  if (now - lowStart >= SPO2_LOW_HOLD_MS && (lastAlert == 0 || now - lastAlert >= SPO2_ALERT_COOLDOWN)) {
    lastAlert = now; lowStart = 0;
    queueAlert("LOW_SPO2", false);
  }
}

// ------------------------------------------------------------------ GPS
void pollGps(uint32_t now) {
  while (gpsSerial.available()) gps.encode(gpsSerial.read());
  static uint32_t last = 0;
  if (now - last < 1000) return;
  last = now;
  Loc l;
  l.valid = gps.location.isValid() && gps.location.age() < 10000 &&
            gps.hdop.isValid() && gps.hdop.hdop() < HDOP_MAX;
  l.lat = gps.location.lat();
  l.lng = gps.location.lng();
  l.acc = gps.hdop.isValid() ? gps.hdop.hdop() * 5.0f : 0;
  strcpy(l.src, "gps");
  l.ms = now;
  portENTER_CRITICAL(&mux);
  g_gps = l;
  if (l.valid) { g_last = l; strcpy(g_last.src, "last"); }
  portEXIT_CRITICAL(&mux);
}

// ------------------------------------------------------------------ button
void singlePress() {
  wake();
  g_screen = (Screen)((g_screen + 1) % SCR_NUM);
  if (g_btnDebug) Serial.println("[btn] SINGLE -> next screen");
}

void triggerSos() {
  wake();
  if (g_state == FS_COUNTDOWN) { g_state = FS_IDLE; digitalWrite(PIN_VIBE, LOW); }
  queueAlert("SOS", true);
  vibePattern(PAT_SOS, 5);
  showMsg("SOS SENT", 2500);
  if (g_btnDebug) Serial.println("[btn] HOLD -> SOS");
}

void registerPress(uint32_t now) {
  wake();
  if (g_state == FS_COUNTDOWN) {      // one press during countdown cancels
    g_pressCount = 0;
    cancelAlert();
    if (g_btnDebug) Serial.println("[btn] SINGLE -> cancel");
    return;
  }
  if (g_pressCount > 0 && now - g_lastPress > MULTI_GAP_MS) g_pressCount = 0;
  g_pressCount++;
  g_lastPress = now;
  if (g_pressCount >= 2) {            // 2+ quick presses start a manual fall countdown
    g_pressCount = 0;
    if (g_btnDebug) Serial.println("[btn] MULTI -> manual fall");
    startCountdown(true);
  }
}

void pollButton(uint32_t now) {
  bool raw = (digitalRead(PIN_BUTTON) == g_pressedLevel);
  static bool last = false;
  static uint32_t chg = 0;
  if (raw != last) { last = raw; chg = now; }
  if (now - chg >= DEBOUNCE_MS && raw != g_btn) {
    g_btn = raw;
    if (g_btn) {
      g_pressStart = now; g_holdFired = false;
      if (g_btnDebug) Serial.println("[btn] down");
    } else {
      if (!g_holdFired) registerPress(now);
      if (g_btnDebug) Serial.println("[btn] up");
    }
  }
  if (g_btn && !g_holdFired && now - g_pressStart >= HOLD_SOS_MS) {
    g_holdFired = true;
    triggerSos();
  }
  if (g_pressCount == 1 && now - g_lastPress >= MULTI_GAP_MS) {
    g_pressCount = 0;
    singlePress();
  }
}

void detectButtonPolarity() {
#if BUTTON_AUTODETECT
  int high = 0;
  for (int i = 0; i < 25; i++) { high += digitalRead(PIN_BUTTON); delay(20); }
  int idle = (high > 12) ? HIGH : LOW;
  g_pressedLevel = !idle;
  Serial.printf("[btn] idle level %s, pressed = %s\n", idle ? "HIGH" : "LOW", g_pressedLevel ? "HIGH" : "LOW");
#else
  g_pressedLevel = BUTTON_ACTIVE_LOW ? LOW : HIGH;
#endif
}

// ------------------------------------------------------------------ display
void drawCentered(const char* s, int y, int size) {
  int16_t x1, y1; uint16_t w, h;
  display.setTextSize(size);
  display.getTextBounds(s, 0, y, &x1, &y1, &w, &h);
  display.setCursor(max(0, (128 - (int)w) / 2), y);
  display.print(s);
}

void drawWatch() {
  struct tm t;
  bool ok = getLocalTime(&t, 0);
  char b[24];
  if (ok) snprintf(b, sizeof(b), "%02d:%02d", t.tm_hour, t.tm_min); else strcpy(b, "--:--");
  display.setTextSize(3); display.setCursor(19, 6); display.print(b);
  if (ok) { display.setTextSize(1); display.setCursor(111, 21); display.printf("%02d", t.tm_sec); }
  if (ok) strftime(b, sizeof(b), "%a %d %b %Y", &t); else strcpy(b, "Syncing time...");
  drawCentered(b, 36, 1);
  display.drawFastHLine(0, 48, 128, SSD1306_WHITE);
  snprintf(b, sizeof(b), "W:%s G:%s %s", WiFi.status() == WL_CONNECTED ? "OK" : "--",
           g_gps.valid ? "FIX" : "--", g_state == FS_IDLE ? "READY" : "CHECK");
  display.setTextSize(1); display.setCursor(0, 54); display.print(b);
}

void drawVitals() {
  display.setTextSize(1); display.setCursor(0, 0); display.print("VITALS");
  display.setTextSize(2);
  display.setCursor(0, 14);
  if (g_finger && g_hr > 0) display.printf("HR:%d", (int)g_hr); else display.print("HR:--");
  display.setCursor(0, 34);
  if (g_finger && g_spo2 > 0) display.printf("O2:%d%%", g_spo2); else display.print("O2:--");
  display.setTextSize(1); display.setCursor(0, 56);
  display.print(g_finger ? "Finger detected" : "Place finger on sensor");
}

void drawLocation() {
  Loc snap; portENTER_CRITICAL(&mux); snap = g_gps; portEXIT_CRITICAL(&mux);
  Loc l; pickLocation(snap, l);
  display.setTextSize(1); display.setCursor(0, 0); display.print("LOCATION");
  char s[8]; strncpy(s, l.src, 8); s[7] = 0;
  for (char* p = s; *p; p++) *p = toupper(*p);
  display.setCursor(0, 14); display.printf("Src: %s", s);
  if (l.valid) {
    display.setCursor(0, 26); display.printf("Lat: %.5f", l.lat);
    display.setCursor(0, 38); display.printf("Lng: %.5f", l.lng);
    display.setCursor(0, 50);
    if (l.acc > 0) display.printf("~%.0f m  age %us", l.acc, (unsigned)((millis() - l.ms) / 1000));
    else display.printf("age %us", (unsigned)((millis() - l.ms) / 1000));
  } else {
    display.setCursor(0, 32); display.print("No position yet");
  }
}

void drawStatus() {
  display.setTextSize(1); display.setCursor(0, 0); display.print("STATUS");
  display.setCursor(0, 14);
  if (WiFi.status() == WL_CONNECTED) display.printf("WiFi: %d dBm", WiFi.RSSI()); else display.print("WiFi: offline");
  display.setCursor(0, 26);
  display.printf("Server: %s", g_serverOk < 0 ? "?" : (g_serverOk ? "OK" : "ERROR"));
  display.setCursor(0, 38); display.printf("Alerts sent: %u", (unsigned)g_alertsSent);
  display.setCursor(0, 50); display.printf("Up: %um", (unsigned)(millis() / 60000));
}

void drawCountdown(uint32_t now) {
  uint32_t el = now - g_cdStart;
  int rem = (int)((COUNTDOWN_MS > el ? COUNTDOWN_MS - el : 0) + 999) / 1000;
  char b[8]; snprintf(b, sizeof(b), "%d", rem);
  drawCentered(g_cdManual ? "MANUAL FALL" : "FALL DETECTED", 0, 1);
  drawCentered(b, 16, 4);
  drawCentered("1 press = CANCEL", 56, 1);
}

void drawDisplay(uint32_t now) {
  static uint32_t last = 0;
  if (!g_oledOk || now - last < 200) return;
  last = now;
  if (g_screen != SCR_WATCH && now - g_lastAction > SCREEN_RETURN_MS) g_screen = SCR_WATCH;
  bool wantDim = g_state != FS_COUNTDOWN && now >= g_msgUntil && now - g_lastAction > DIM_AFTER_MS;
  if (wantDim != g_dimmed) { display.dim(wantDim); g_dimmed = wantDim; }
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  if (g_state == FS_COUNTDOWN) drawCountdown(now);
  else if (now < g_msgUntil) drawCentered(g_msg, 24, strlen(g_msg) > 10 ? 1 : 2);
  else switch (g_screen) {
    case SCR_WATCH: drawWatch(); break;
    case SCR_VITALS: drawVitals(); break;
    case SCR_LOCATION: drawLocation(); break;
    case SCR_STATUS: drawStatus(); break;
    default: drawWatch(); break;
  }
  display.display();
}

void netEvents() {
  if (g_netEvent == 1) { g_netEvent = 0; showMsg("ALERT SENT", 2500); vibePattern(PAT_SENT, 1); }
  else if (g_netEvent == 2) { g_netEvent = 0; showMsg("SEND FAILED", 2500); }
}

// ------------------------------------------------------------------ serial test console
void printStatus() {
  Loc snap; portENTER_CRITICAL(&mux); snap = g_gps; portEXIT_CRITICAL(&mux);
  Loc l; pickLocation(snap, l);
  Serial.printf("wifi=%s rssi=%d | server=%d | state=%d mag=%.2fg\n",
                WiFi.status() == WL_CONNECTED ? "up" : "down", WiFi.RSSI(), (int)g_serverOk, (int)g_state, g_mag);
  Serial.printf("finger=%d hr=%.0f spo2=%d | loc=%s valid=%d %.5f,%.5f\n",
                g_finger, (float)g_hr, (int)g_spo2, l.src, l.valid, l.lat, l.lng);
  Serial.printf("sensors: mpu=%d ppg=%d oled=%d | alerts sent=%u\n", g_mpuOk, g_ppgOk, g_oledOk, (unsigned)g_alertsSent);
}

void handleCmd(String c) {
  c.trim(); c.toLowerCase();
  if (c == "help") {
    Serial.println("status | test fall | test manual fall | test spo2 | test sos | test wifi | test gps");
    Serial.println("test locate | test button | test vibe | rotate 0|2 | set time HH:MM");
  } else if (c == "status") printStatus();
  else if (c == "test fall") startCountdown(false);
  else if (c == "test manual fall") startCountdown(true);
  else if (c == "test spo2") queueAlert("LOW_SPO2", false, 72, 85);
  else if (c == "test sos") triggerSos();
  else if (c == "test wifi") {
    Serial.printf("SSID %s status %d rssi %d ip %s\n", WIFI_SSID, (int)WiFi.status(), WiFi.RSSI(), WiFi.localIP().toString().c_str());
  } else if (c == "test gps") {
    Serial.printf("chars=%u sats=%d valid=%d hdop=%.1f lat=%.5f lng=%.5f\n", (unsigned)gps.charsProcessed(),
                  (int)gps.satellites.value(), g_gps.valid, gps.hdop.hdop(), gps.location.lat(), gps.location.lng());
  } else if (c == "test locate") { g_locateReq = true; Serial.println("locate requested"); }
  else if (c == "test button") { g_btnDebug = !g_btnDebug; Serial.printf("button debug %s (raw=%d pressed=%d)\n", g_btnDebug ? "ON" : "OFF", digitalRead(PIN_BUTTON), g_pressedLevel); }
  else if (c == "test vibe") vibePattern(PAT_SOS, 5);
  else if (c.startsWith("rotate ")) {
    int r = c.substring(7).toInt();
    if (r == 0 || r == 2) { display.setRotation(r); Serial.printf("rotation %d (put this in config.h)\n", r); }
    else Serial.println("use 0 or 2 (landscape only)");
  } else if (c.startsWith("set time")) {
    int h, m;
    if (sscanf(c.c_str(), "set time %d:%d", &h, &m) == 2 && h >= 0 && h < 24 && m >= 0 && m < 60) {
      time_t n = time(nullptr); struct tm t; localtime_r(&n, &t);
      if (t.tm_year < 120) { t.tm_year = 126; t.tm_mon = 0; t.tm_mday = 1; }
      t.tm_hour = h; t.tm_min = m; t.tm_sec = 0;
      struct timeval tv = {mktime(&t), 0};
      settimeofday(&tv, nullptr);
      Serial.println("time set");
    } else Serial.println("usage: set time HH:MM");
  } else Serial.println("unknown command, type help");
}

void serialConsole() {
  static String line;
  while (Serial.available()) {
    char ch = Serial.read();
    if (ch == '\n' || ch == '\r') { if (line.length()) handleCmd(line); line = ""; }
    else if (line.length() < 60) line += ch;
  }
}

// ------------------------------------------------------------------ setup / loop
void setup() {
  Serial.begin(115200);
  delay(200);
  pinMode(PIN_VIBE, OUTPUT); digitalWrite(PIN_VIBE, LOW);
  pinMode(PIN_BUTTON, INPUT);  // GPIO35: no internal pull, external resistor required
  setenv("TZ", TZ_INFO, 1); tzset();

  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(400000);

  g_oledOk = display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  if (g_oledOk) {
    display.setRotation(DISPLAY_ROTATION);
    display.clearDisplay(); display.setTextColor(SSD1306_WHITE);
    drawCentered("SafeBand", 20, 2);
    drawCentered("starting...", 44, 1);
    display.display();
  } else Serial.println("OLED not found");

  detectButtonPolarity();

  g_mpuOk = mpu.begin(0x68);
  if (g_mpuOk) { mpu.setAccelerometerRange(MPU6050_RANGE_16_G); mpu.setFilterBandwidth(MPU6050_BAND_44_HZ); }
  else Serial.println("MPU6050 not found");

  g_ppgOk = ppg.begin(Wire, I2C_SPEED_FAST);
  if (g_ppgOk) ppg.setup(0x0F, 8, 2, 400, 411, 4096);  // low LED + averaging avoids IR saturation
  else Serial.println("MAX30102 not found");

  gpsSerial.begin(9600, SERIAL_8N1, PIN_GPS_RX, PIN_GPS_TX);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  alertQ = xQueueCreate(5, sizeof(AlertMsg));
  xTaskCreatePinnedToCore(netTask, "net", 16384, nullptr, 1, nullptr, 0);

  wake();
  vibePattern(PAT_CANCEL, 1);
  Serial.println("SafeBand ready. Type 'help' for test commands.");
}

void loop() {
  uint32_t now = millis();
  serialConsole();
  pollGps(now);
  pollImu(now);
  pollPpg();
  pollButton(now);
  updateFall(now);
  checkSpo2(now);
  netEvents();
  vibeUpdate(now);
  drawDisplay(now);
}
