#pragma once

// ---------- Pins ----------
#define PIN_SDA      21
#define PIN_SCL      22
#define PIN_GPS_RX   16   // ESP32 RX  <- NEO-6M TX
#define PIN_GPS_TX   17   // ESP32 TX  -> NEO-6M RX
#define PIN_VIBE     32   // vibration motor (via transistor), active HIGH
#define PIN_BUTTON   35   // input-only pin, needs the EXTERNAL resistor

// ---------- Button ----------
// Idle level is auto-detected at boot (keep the button RELEASED while powering on).
// BUTTON_ACTIVE_LOW is only the fallback if auto-detect is disabled.
#define BUTTON_AUTODETECT   1
#define BUTTON_ACTIVE_LOW   1
#define DEBOUNCE_MS         30
#define MULTI_GAP_MS        700    // 2+ presses with gaps below this = manual fall
#define HOLD_SOS_MS         3000   // hold this long = immediate SOS

// ---------- Display (landscape only: 0 or 2) ----------
#define DISPLAY_ROTATION    0
#define SCREEN_RETURN_MS    10000  // back to watch face after no button use
#define DIM_AFTER_MS        30000

// ---------- Fall detection ----------
#define IMU_PERIOD_MS       10     // 100 Hz
#define FALL_IMPACT_G       2.5f
#define IMPACT_SETTLE_MS    700
#define STILL_BAND_G        0.25f  // |mag - 1g| must stay below this
#define STILL_MS            2000
#define STILL_TIMEOUT_MS    8000
#define COUNTDOWN_MS        10000  // cancel window
#define CANCEL_LOCKOUT_MS   5000
#define AFTER_ALERT_LOCKOUT 30000

// ---------- Vitals ----------
#define FINGER_IR_MIN       50000
#define SPO2_LOW_PERCENT    90
#define SPO2_LOW_HOLD_MS    10000
#define SPO2_ALERT_COOLDOWN 300000

// ---------- GPS / location ----------
#define HDOP_MAX            5.0f
#define LOCATE_EVERY_MS     60000
#define CACHE_MAX_AGE_MS    600000

// ---------- Network ----------
#define VITALS_EVERY_MS     5000
#define TZ_INFO             "IST-5:30"
