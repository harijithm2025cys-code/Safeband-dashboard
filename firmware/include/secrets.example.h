#pragma once
// Copy this file to secrets.h and fill in the real values.
// secrets.h must be listed in .gitignore.

#define WIFI_SSID      "your-wifi-name"
#define WIFI_PASS      "your-wifi-password"

// Your deployed website, no trailing slash
#define API_BASE_URL   "https://YOUR-SITE.vercel.app"

// Must match DEVICE_SECRET in the website's .env / Vercel settings
#define DEVICE_SECRET  "paste-the-same-secret-here"
#define DEVICE_ID      "safeband-01"
