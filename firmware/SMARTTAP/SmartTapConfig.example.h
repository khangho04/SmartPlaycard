#pragma once
// Copy to SmartTapConfig.h on the trusted firmware build computer.
// Create a different Firebase Email/Password account for each ESP32.
#define SMARTTAP_WIFI_SSID ""
#define SMARTTAP_WIFI_PASSWORD ""
#define SMARTTAP_API_KEY ""
#define SMARTTAP_DEVICE_EMAIL ""
#define SMARTTAP_DEVICE_PASSWORD ""
#define SMARTTAP_DATABASE_URL "https://rfid-001-270d9-default-rtdb.asia-southeast1.firebasedatabase.app"
#define SMARTTAP_DEVICE_ID "GAME001"
// Paste a current trusted CA PEM for Firebase HTTPS; no setInsecure fallback.
#define SMARTTAP_ROOT_CA ""
// GPIO 26 is unused by the current RC522, display and buttons.
#define SMARTTAP_RELAY_PIN 26
#define SMARTTAP_RELAY_ACTIVE_LEVEL HIGH
#define SMARTTAP_RELAY_PULSE_MS 100
// Optional isolated feedback lines; -1 means no feedback installed.
#define SMARTTAP_RUNNING_PIN -1
#define SMARTTAP_ERROR_PIN -1
#define SMARTTAP_FEEDBACK_ACTIVE_LEVEL HIGH
#define SMARTTAP_START_TIMEOUT_MS 5000
