// =========================================================================
//  SafeBand v2 - ESP32 firmware (optimised)
//  ESP32 Arduino core 3.x. Same pins as before. Posts to /api/vitals and
//  /api/alert (Vercel API) with the x-device-secret header. Single file: secrets are in the block near the top.
//
//  Screen flow:  HOME -> (button or fall) -> COUNTDOWN 10 s -> SOS screen -> HOME
//    * Press during COUNTDOWN  = cancel, back to HOME immediately
//    * Press during SOS screen = back to HOME immediately (alert still sends)
//    * SOS screen also returns to HOME by itself after SOS_SCREEN_MS
// =========================================================================
#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>

#include <MPU6050_light.h>
#include <MAX30105.h>
#include <spo2_algorithm.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_GFX.h>
#include <TinyGPSPlus.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"

// ====================== SECRETS: FILL THESE IN ======================
// This file now has everything in one place. Do NOT commit it or share it
// with real values filled in.
#define WIFI_SSID      "XXX"
#define WIFI_PASS      "123456780ab"
#define API_BASE_URL   "https://YOUR-SITE.vercel.app"   // your Vercel URL, no trailing slash
#define DEVICE_SECRET  "paste-a-NEW-long-random-secret-here"
#define DEVICE_ID      "safeband-01"

// ====================== PIN MAP (unchanged) ======================
#define PIN_SDA        21
#define PIN_SCL        22
#define PIN_GPS_RX     16
#define PIN_GPS_TX     17
#define PIN_BUZZER     32
#define PIN_VIBRATOR   33
#define PIN_SOS_BUTTON 35   // input-only pin: needs the external resistor
#define PIN_LED_RED    25
#define PIN_LED_GREEN  26

// ====================== OLED ======================
#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT 64
#define OLED_ADDR     0x3C

// ====================== SENSORS ======================
#define MPU_ADDR            0x68
#define MAX_BRIGHTNESS      0x0F
#define MAX_SAMPLE_AVG      4
#define MAX_LED_MODE        2
#define MAX_SAMPLE_RATE     100      // 100 / 4 = 25 samples per second (what the SpO2 algorithm expects)
#define MAX_PULSE_WIDTH     411
#define MAX_ADC_RANGE       4096
#define FINGER_IR_THRESHOLD 20000

// ====================== FALL THRESHOLDS (unchanged) ======================
#define FREE_FALL_THRESHOLD    0.6f
#define IMPACT_THRESHOLD       2.0f
#define FREE_FALL_DURATION_MS  60
#define IMPACT_WINDOW_MS       600
#define STILL_BAND_G           0.15f   // |mag - 1 g| below this counts as lying still
#define STILL_MS               3000

// ====================== TIMING ======================
#define CANCEL_WINDOW_MS   10000
#define BTN_DEBOUNCE_MS    40
#define LOCKOUT_AFTER_MS   3000    // no new fall detection right after going home
#define SOS_SCREEN_MS      30000   // SOS screen returns home by itself after this
#define SOS_BUZZ_MS        10000   // buzzer stops after this even if screen stays
#define VITALS_COMPUTE_MS  2000    // HR/SpO2 recalculated this often
#define UPLOAD_PERIOD_MS   5000    // /vitals upload period (dashboard "connected" check expects <= 10 s)
#define SOS_RETRY_MS       3000
#define SOS_MAX_ATTEMPTS   6

#define SEND_FALL_TELEMETRY 1      // adds accelPeakG + fallState to /vitals (set 0 if your API rejects extra fields)

// ====================== NTP ======================
#define NTP_SERVER      "pool.ntp.org"
#define GMT_OFFSET_SEC  19800
#define DST_OFFSET_SEC  0

// ====================== BUZZER ======================
#define BUZZER_FREQ       1500
#define BUZZER_RESOLUTION 8

// ====================== STATE ======================
enum AppState : uint8_t { ST_HOME, ST_COUNTDOWN, ST_SOS };
enum SendStatus : uint8_t { SS_NONE, SS_NOWIFI, SS_SENDING, SS_SENT, SS_FAILED };
enum FallPhase : uint8_t { FP_IDLE, FP_FREEFALL, FP_IMPACT_WAIT };

volatile AppState   g_state = ST_HOME;
volatile SendStatus g_sendStatus = SS_NONE;
volatile bool       g_sendRequested = false;
volatile uint8_t    g_sendAttempts = 0;
volatile bool       g_wifiUp = false;

volatile uint32_t g_cdStart = 0;      // countdown start
volatile uint32_t g_sosStart = 0;     // SOS screen start
volatile uint32_t g_lockoutUntil = 0;
char              g_reason[40] = "";

volatile int   g_heartRate = 0;
volatile int   g_spo2 = 0;
volatile bool  g_finger = false;
volatile float g_peakG = 1.0f;

volatile bool   g_gpsOk = false;
volatile double g_lat = 0, g_lng = 0;
portMUX_TYPE    g_gpsMux = portMUX_INITIALIZER_UNLOCKED;

int g_btnPressedLevel = LOW;
bool g_oledOk = false, g_mpuOk = false, g_ppgOk = false;

SemaphoreHandle_t g_i2c;              // one owner of the I2C bus at a time
TinyGPSPlus       g_gps;
HardwareSerial    g_gpsSerial(2);
MPU6050           g_mpu(Wire);
MAX30105          g_pulse;
Adafruit_SSD1306  g_display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

static inline void i2cLock()   { xSemaphoreTake(g_i2c, portMAX_DELAY); }
static inline void i2cUnlock() { xSemaphoreGive(g_i2c); }

// ====================== TIME HELPERS (never block) ======================
bool timeNow(struct tm &t) { return getLocalTime(&t, 0); }   // 0 ms: no 5 s freeze when NTP is not synced

void fmtTime(char *out, size_t n) {
    struct tm t;
    if (!timeNow(t)) { snprintf(out, n, "--:--"); return; }
    strftime(out, n, "%I:%M %p", &t);
    if (out[0] == '0') memmove(out, out + 1, strlen(out));
}

void fmtDate(char *out, size_t n) {
    struct tm t;
    if (!timeNow(t)) { snprintf(out, n, "---"); return; }
    strftime(out, n, "%d %b %Y", &t);
}

// ====================== OUTPUT HELPERS (non-blocking) ======================
void outputs(bool buzzer, bool vib) {
    ledcWrite(PIN_BUZZER, buzzer ? 128 : 0);
    digitalWrite(PIN_VIBRATOR, vib ? HIGH : LOW);
}

void leds(bool red, bool green) {
    digitalWrite(PIN_LED_RED,   red   ? HIGH : LOW);
    digitalWrite(PIN_LED_GREEN, green ? HIGH : LOW);
}

void silence() { outputs(false, false); }

// ====================== STATE TRANSITIONS ======================
void startCountdown(const char *reason) {
    strncpy(g_reason, reason, sizeof(g_reason) - 1);
    g_reason[sizeof(g_reason) - 1] = 0;
    g_cdStart = millis();
    g_state = ST_COUNTDOWN;
    Serial.printf("[state] COUNTDOWN (%s)\n", g_reason);
}

void startSOS() {
    g_sosStart = millis();
    g_sendAttempts = 0;
    g_sendStatus = g_wifiUp ? SS_SENDING : SS_NOWIFI;
    g_sendRequested = true;
    g_state = ST_SOS;
    Serial.printf("[state] SOS (%s)\n", g_reason);
}

void goHome(const char *why) {
    silence();
    g_state = ST_HOME;
    g_lockoutUntil = millis() + LOCKOUT_AFTER_MS;
    Serial.printf("[state] HOME (%s)\n", why);
}

// ====================== TASK: LOGIC (button + IMU + state machine) ======================
void taskLogic(void *) {
    TickType_t last = xTaskGetTickCount();
    FallPhase phase = FP_IDLE;
    uint32_t phaseT = 0, stillSince = 0, btnChg = 0;
    bool btnRaw = false, btnStable = false;

    for (;;) {
        vTaskDelayUntil(&last, pdMS_TO_TICKS(10));
        uint32_t now = millis();

        // ---- debounced button: "pressed" is true for exactly one tick per press ----
        bool raw = (digitalRead(PIN_SOS_BUTTON) == g_btnPressedLevel);
        if (raw != btnRaw) { btnRaw = raw; btnChg = now; }
        bool pressed = false;
        if (now - btnChg >= BTN_DEBOUNCE_MS && btnRaw != btnStable) {
            btnStable = btnRaw;
            pressed = btnStable;
        }

        // ---- IMU magnitude in g ----
        float mag = 1.0f;
        if (g_mpuOk) {
            i2cLock();
            g_mpu.update();
            float ax = g_mpu.getAccX(), ay = g_mpu.getAccY(), az = g_mpu.getAccZ();
            i2cUnlock();
            mag = sqrtf(ax * ax + ay * ay + az * az);
            if (mag > g_peakG) g_peakG = mag;
        }

        // ---- state machine ----
        switch (g_state) {

        case ST_HOME:
            if (pressed) { startCountdown("Manual trigger"); stillSince = 0; phase = FP_IDLE; break; }
            if (now < g_lockoutUntil) { phase = FP_IDLE; break; }

            switch (phase) {
            case FP_IDLE:
                if (mag < FREE_FALL_THRESHOLD) { phase = FP_FREEFALL; phaseT = now; }
                break;
            case FP_FREEFALL:
                if (mag >= FREE_FALL_THRESHOLD) phase = FP_IDLE;                       // too short: ignore
                else if (now - phaseT >= FREE_FALL_DURATION_MS) { phase = FP_IMPACT_WAIT; phaseT = now; }
                break;
            case FP_IMPACT_WAIT:
                if (mag > IMPACT_THRESHOLD) {
                    Serial.printf("[fall] impact %.2f g\n", mag);
                    startCountdown("Impact after free fall");
                    stillSince = 0; phase = FP_IDLE;
                } else if (now - phaseT > IMPACT_WINDOW_MS) phase = FP_IDLE;
                break;
            }
            break;

        case ST_COUNTDOWN:
            if (pressed) { goHome("cancelled by button"); break; }
            // lying still during the countdown = more likely a real fall
            if (fabsf(mag - 1.0f) < STILL_BAND_G) { if (!stillSince) stillSince = now; }
            else stillSince = 0;
            if (now - g_cdStart >= CANCEL_WINDOW_MS) {
                if (stillSince && now - stillSince >= STILL_MS && strcmp(g_reason, "Impact after free fall") == 0)
                    strncpy(g_reason, "Fall with post-fall stillness", sizeof(g_reason) - 1);
                startSOS();
            }
            break;

        case ST_SOS:
            if (pressed)                           goHome("button on SOS screen");
            else if (now - g_sosStart >= SOS_SCREEN_MS) goHome("SOS screen timeout");
            break;
        }

        // ---- feedback (buzzer / vibration / LEDs), always driven from the state ----
        switch (g_state) {
        case ST_COUNTDOWN: {
            uint32_t el = now - g_cdStart;
            uint32_t rem = el < CANCEL_WINDOW_MS ? CANCEL_WINDOW_MS - el : 0;
            uint32_t period = rem > 3000 ? 1000 : 400;           // faster beeps in the last 3 s
            bool on = el < 800 || (el % period) < 200;
            outputs(on, on);
            leds(true, false);
            break;
        }
        case ST_SOS: {
            uint32_t el = now - g_sosStart;
            bool beep = el < SOS_BUZZ_MS && (el % 1000) < 300;
            outputs(beep, el < 1000);
            leds(true, false);
            break;
        }
        default:
            // HOME: make sure nothing is left on, green LED = Wi-Fi connected
            outputs(false, false);
            leds(false, g_wifiUp);
            break;
        }
    }
}

// ====================== TASK: VITALS (continuous sampling, sliding window) ======================
static uint32_t irRing[100], redRing[100], irOrd[100], redOrd[100];

void taskVitals(void *) {
    int head = 0, count = 0, idx = 0;
    int hrBuf[3] = {0}, spBuf[3] = {0};
    uint32_t lastCalc = 0;

    for (;;) {
        vTaskDelay(pdMS_TO_TICKS(40));
        if (!g_ppgOk) continue;

        bool gotSample = false;
        uint32_t latestIr = 0;
        i2cLock();
        g_pulse.check();
        while (g_pulse.available()) {
            uint32_t red = g_pulse.getFIFORed();
            uint32_t ir  = g_pulse.getFIFOIR();
            g_pulse.nextSample();
            latestIr = ir; gotSample = true;
            irRing[head] = ir; redRing[head] = red;
            head = (head + 1) % 100;
            if (count < 100) count++;
        }
        i2cUnlock();
        if (!gotSample) continue;

        bool finger = latestIr > FINGER_IR_THRESHOLD;
        g_finger = finger;

        if (!finger) {                       // finger removed: clear everything
            count = 0; head = 0;
            memset(hrBuf, 0, sizeof(hrBuf)); memset(spBuf, 0, sizeof(spBuf));
            g_heartRate = 0; g_spo2 = 0;
            continue;
        }

        if (count >= 100 && millis() - lastCalc >= VITALS_COMPUTE_MS) {
            lastCalc = millis();
            int start = head;                // oldest sample
            for (int i = 0; i < 100; i++) {
                irOrd[i]  = irRing[(start + i) % 100];
                redOrd[i] = redRing[(start + i) % 100];
            }
            int32_t sp, hr; int8_t spV, hrV;
            maxim_heart_rate_and_oxygen_saturation(irOrd, 100, redOrd, &sp, &spV, &hr, &hrV);

            hrBuf[idx] = (hrV && hr >= 40 && hr <= 200) ? hr : 0;
            spBuf[idx] = (spV && sp >= 70 && sp <= 100) ? sp : 0;
            idx = (idx + 1) % 3;

            int hrS = 0, spS = 0, hrC = 0, spC = 0;
            for (int i = 0; i < 3; i++) {
                if (hrBuf[i] > 0) { hrS += hrBuf[i]; hrC++; }
                if (spBuf[i] > 0) { spS += spBuf[i]; spC++; }
            }
            if (hrC) g_heartRate = hrS / hrC;
            if (spC) g_spo2 = spS / spC;
        }
    }
}

// ====================== TASK: GPS (always draining the UART) ======================
void taskGPS(void *) {
    for (;;) {
        while (g_gpsSerial.available()) g_gps.encode(g_gpsSerial.read());
        bool ok = g_gps.location.isValid() && g_gps.location.age() < 10000;   // stale fix = not valid
        portENTER_CRITICAL(&g_gpsMux);
        g_gpsOk = ok;
        if (ok) { g_lat = g_gps.location.lat(); g_lng = g_gps.location.lng(); }
        portEXIT_CRITICAL(&g_gpsMux);
        vTaskDelay(pdMS_TO_TICKS(20));
    }
}

void readGPS(double &lat, double &lng, bool &ok) {
    portENTER_CRITICAL(&g_gpsMux);
    ok = g_gpsOk; lat = g_lat; lng = g_lng;
    portEXIT_CRITICAL(&g_gpsMux);
}

// ====================== TASK: OLED ======================
void showDisplay() { i2cLock(); g_display.display(); i2cUnlock(); }

void drawSOS() {
    g_display.clearDisplay();
    g_display.fillScreen(WHITE);
    g_display.setTextColor(BLACK);
    g_display.setTextSize(2);
    g_display.setCursor(30, 2);
    g_display.print("SOS!");
    g_display.setTextSize(1);
    g_display.setCursor(4, 24);
    switch (g_sendStatus) {
        case SS_SENT:    g_display.print("Alert sent to family"); break;
        case SS_FAILED:  g_display.print("Send failed"); break;
        case SS_NOWIFI:  g_display.print("No WiFi, will retry"); break;
        default:         g_display.print("Sending alert..."); break;
    }
    g_display.setCursor(4, 38);
    g_display.print("HR "); g_display.print((int)g_heartRate);
    g_display.print("  SpO2 "); g_display.print((int)g_spo2);
    g_display.setCursor(4, 53);
    g_display.print("Press = home screen");
    showDisplay();
}

void drawCountdown(uint32_t now) {
    uint32_t el = now - g_cdStart;
    int rem = el < CANCEL_WINDOW_MS ? (int)((CANCEL_WINDOW_MS - el + 999) / 1000) : 0;
    g_display.clearDisplay();
    g_display.setTextColor(WHITE);
    g_display.setTextSize(2);
    g_display.setCursor(30, 0);
    g_display.print("FALL?");
    g_display.setTextSize(1);
    g_display.setCursor(20, 20);
    g_display.print("Press to cancel");
    g_display.setTextSize(3);
    g_display.setCursor(rem >= 10 ? 46 : 55, 36);
    g_display.print(rem);
    showDisplay();
}

void drawHome() {
    char tm[16], dt[16];
    fmtTime(tm, sizeof(tm));
    fmtDate(dt, sizeof(dt));

    g_display.clearDisplay();
    g_display.fillRect(0, 0, SCREEN_WIDTH, 12, WHITE);
    g_display.setTextColor(BLACK);
    g_display.setTextSize(1);
    g_display.setCursor(2, 3);
    g_display.print("Watch");
    if (g_gpsOk) { g_display.setCursor(SCREEN_WIDTH - 55, 3); g_display.print("GPS"); }
    if (g_wifiUp) { g_display.setCursor(SCREEN_WIDTH - 25, 3); g_display.print("WiFi"); }

    g_display.setTextColor(WHITE);
    g_display.setTextSize(2);
    g_display.setCursor(0, 16);
    g_display.print(tm);
    g_display.setTextSize(1);
    g_display.setCursor(0, 36);
    g_display.print(dt);
    g_display.drawLine(0, 44, SCREEN_WIDTH, 44, WHITE);

    int hrL = g_heartRate, spL = g_spo2;
    bool fg = g_finger;
    g_display.setCursor(0, 52);
    if (fg && hrL > 0) { g_display.print("\x03 "); g_display.print(hrL); g_display.print(" bpm"); }
    else                 g_display.print("\x03 -- bpm");
    g_display.setCursor(64, 52);
    g_display.print("O2 ");
    if (fg && spL > 0) { g_display.print(spL); g_display.print("%"); if (spL < 90) g_display.print(" !"); }
    else g_display.print("--%");
    showDisplay();
}

void taskOLED(void *) {
    TickType_t last = xTaskGetTickCount();
    for (;;) {
        vTaskDelayUntil(&last, pdMS_TO_TICKS(200));    // 5 fps: reacts to the button within 0.2 s
        if (!g_oledOk) continue;
        switch (g_state) {
            case ST_SOS:       drawSOS(); break;
            case ST_COUNTDOWN: drawCountdown(millis()); break;
            default:           drawHome(); break;
        }
    }
}

// ====================== NETWORK ======================
bool postJSON(const char *path, const String &body, bool tooManyIsOk = false) {
    if (WiFi.status() != WL_CONNECTED) return false;
    WiFiClientSecure client;
    client.setInsecure();                 // prototype only: pin the server certificate for production
    HTTPClient http;
    String url = String(API_BASE_URL) + path;
    if (!http.begin(client, url)) return false;
    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-device-secret", DEVICE_SECRET);
    http.setConnectTimeout(5000);
    http.setTimeout(8000);
    int code = http.POST(body);
    bool ok = (code >= 200 && code < 300) || (tooManyIsOk && code == 429);   // 429 = already delivered recently
    if (!ok) {
        String r = http.getString();
        if (r.length() > 80) r = r.substring(0, 80);   // never dump a whole web page to the monitor
        r.replace('\n', ' ');
        Serial.printf("HTTP %d %s -> %s\n", code, path, r.c_str());
    }
    http.end();
    return ok;
}

const char *stateName() {
    switch (g_state) { case ST_COUNTDOWN: return "COUNTDOWN"; case ST_SOS: return "ALERT"; default: return "IDLE"; }
}

void putVitalsAndLocation(JsonDocument &doc) {
    double lat = 0, lng = 0; bool ok = false;
    readGPS(lat, lng, ok);
    bool fg = g_finger;
    if (fg && g_heartRate > 0) doc["heartRate"] = (int)g_heartRate; else doc["heartRate"] = nullptr;
    if (fg && g_spo2 > 0)      doc["spo2"] = (int)g_spo2;           else doc["spo2"] = nullptr;
    if (ok) { doc["lat"] = lat; doc["lng"] = lng; doc["accuracy"] = 10; doc["locSource"] = "gps"; }
    else    { doc["lat"] = nullptr; doc["lng"] = nullptr; doc["accuracy"] = nullptr; doc["locSource"] = "none"; }
}

String buildVitalsJSON() {
    DynamicJsonDocument doc(512);
    doc["deviceId"] = DEVICE_ID;
    putVitalsAndLocation(doc);
#if SEND_FALL_TELEMETRY
    float peak = g_peakG; g_peakG = 1.0f;
    doc["accelPeakG"] = roundf(peak * 100.0f) / 100.0f;
    doc["fallState"]  = stateName();
#endif
    String out; serializeJson(doc, out);
    return out;
}

String buildAlertJSON() {
    DynamicJsonDocument doc(512);
    doc["deviceId"] = DEVICE_ID;
    doc["type"] = "FALL";
    doc["manualTrigger"] = (strcmp(g_reason, "Manual trigger") == 0);
    putVitalsAndLocation(doc);
    String out; serializeJson(doc, out);
    return out;
}

void taskNet(void *) {
    uint32_t lastUpload = 0, nextSosTry = 0, lastWifiTry = 0;
    bool ntpStarted = false;

    for (;;) {
        uint32_t now = millis();
        bool up = (WiFi.status() == WL_CONNECTED);
        if (up != g_wifiUp) {
            g_wifiUp = up;
            Serial.println(up ? "WiFi connected" : "WiFi lost");
            if (up) lastUpload = 0;
        }

        if (!up) {
            if (g_sendRequested) g_sendStatus = SS_NOWIFI;
            if (now - lastWifiTry > 10000) {            // non-blocking reconnect
                lastWifiTry = now;
                WiFi.disconnect();
                WiFi.begin(WIFI_SSID, WIFI_PASS);
            }
        } else {
            if (!ntpStarted) { configTime(GMT_OFFSET_SEC, DST_OFFSET_SEC, NTP_SERVER); ntpStarted = true; }

            if (g_sendRequested) {                      // the alert always goes first, with retries
                if (now >= nextSosTry) {
                    g_sendStatus = SS_SENDING;
                    bool ok = postJSON("/api/alert", buildAlertJSON(), true);
                    Serial.println(ok ? "SOS sent" : "SOS failed");
                    if (ok) { g_sendRequested = false; g_sendStatus = SS_SENT; }
                    else if (++g_sendAttempts >= SOS_MAX_ATTEMPTS) { g_sendRequested = false; g_sendStatus = SS_FAILED; }
                    else nextSosTry = millis() + SOS_RETRY_MS;
                }
            } else if (now - lastUpload >= UPLOAD_PERIOD_MS) {
                lastUpload = now;
                Serial.println(postJSON("/api/vitals", buildVitalsJSON()) ? "Vitals sent" : "Vitals failed");
            }
        }
        vTaskDelay(pdMS_TO_TICKS(100));
    }
}

// ====================== SETUP ======================
void detectButtonPolarity() {
    int high = 0;
    for (int i = 0; i < 25; i++) { high += digitalRead(PIN_SOS_BUTTON); delay(20); }
    int idle = (high > 12) ? HIGH : LOW;
    g_btnPressedLevel = !idle;
    Serial.printf("Button idle=%s pressed=%s (keep it released at power-on)\n", idle ? "HIGH" : "LOW", g_btnPressedLevel ? "HIGH" : "LOW");
}

void setup() {
    Serial.begin(115200);
    delay(300);
    Serial.println("\n=== SafeBand v2 (optimised) ===");

    g_i2c = xSemaphoreCreateMutex();
    Wire.begin(PIN_SDA, PIN_SCL);
    Wire.setClock(400000);

    pinMode(PIN_VIBRATOR, OUTPUT);
    pinMode(PIN_LED_RED, OUTPUT);
    pinMode(PIN_LED_GREEN, OUTPUT);
    pinMode(PIN_SOS_BUTTON, INPUT);              // GPIO35 has no internal pull-up: external resistor is used
    ledcAttach(PIN_BUZZER, BUZZER_FREQ, BUZZER_RESOLUTION);
    silence();
    detectButtonPolarity();

    g_oledOk = g_display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
    if (g_oledOk) {
        g_display.clearDisplay();
        g_display.setTextColor(WHITE);
        g_display.setTextSize(2);
        g_display.setCursor(10, 22);
        g_display.print("SafeBand");
        g_display.display();
    } else Serial.println("!! OLED not found (continuing without display)");

    Wire.beginTransmission(MPU_ADDR);
    if (Wire.endTransmission() == 0 && g_mpu.begin() == 0) {
        Serial.println("MPU6050: keep the band still, calibrating...");
        g_mpu.calcOffsets(true, true);
        g_mpuOk = true;
    } else Serial.println("!! MPU6050 not found: fall detection disabled");

    g_ppgOk = g_pulse.begin(Wire, I2C_SPEED_FAST);
    if (g_ppgOk) g_pulse.setup(MAX_BRIGHTNESS, MAX_SAMPLE_AVG, MAX_LED_MODE, MAX_SAMPLE_RATE, MAX_PULSE_WIDTH, MAX_ADC_RANGE);
    else Serial.println("!! MAX30102 not found: vitals disabled");

    g_gpsSerial.setRxBufferSize(1024);
    g_gpsSerial.begin(9600, SERIAL_8N1, PIN_GPS_RX, PIN_GPS_TX);

    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.begin(WIFI_SSID, WIFI_PASS);             // connection finishes in the background

    xTaskCreatePinnedToCore(taskLogic,  "Logic",  6144,  NULL, 5, NULL, 1);
    xTaskCreatePinnedToCore(taskVitals, "Vitals", 6144,  NULL, 3, NULL, 0);
    xTaskCreatePinnedToCore(taskGPS,    "GPS",    3072,  NULL, 2, NULL, 0);
    xTaskCreatePinnedToCore(taskOLED,   "OLED",   4096,  NULL, 2, NULL, 0);
    xTaskCreatePinnedToCore(taskNet,    "Net",    10240, NULL, 4, NULL, 0);
    Serial.println("Ready.");
}

void loop() { vTaskDelay(pdMS_TO_TICKS(1000)); }
