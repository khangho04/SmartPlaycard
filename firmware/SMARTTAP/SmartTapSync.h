#pragma once
#include <ArduinoJson.h>
#include <Preferences.h>
#include <esp_system.h>
static_assert(SMARTTAP_RELAY_PIN != BTN_LEFT && SMARTTAP_RELAY_PIN != BTN_OK && SMARTTAP_RELAY_PIN != BTN_RIGHT && SMARTTAP_RELAY_PIN != TFT_BLK && SMARTTAP_RELAY_PIN != TFT_CS && SMARTTAP_RELAY_PIN != TFT_DC && SMARTTAP_RELAY_PIN != TFT_RST && SMARTTAP_RELAY_PIN != PIN_SCK && SMARTTAP_RELAY_PIN != PIN_MISO && SMARTTAP_RELAY_PIN != PIN_MOSI && SMARTTAP_RELAY_PIN != RC522_SS && SMARTTAP_RELAY_PIN != RC522_RST, "Relay GPIO conflicts with existing hardware");
static_assert(SMARTTAP_RELAY_PULSE_MS > 0 && SMARTTAP_RELAY_PULSE_MS <= 5000, "Relay pulse must be 1..5000 ms");

String configuredGameId, configuredBranchId, configuredVersion;
bool configuredEnabled = false;
bool deviceRegistered = false;
unsigned long configCheckedAt = 0;
Preferences syncPreferences;
bool syncStorageReady = false;
bool sessionActive = false;
bool sessionConfirmed = false;
String sessionUid, sessionOperationId;
unsigned long sessionStartedAt = 0;
unsigned long sessionDurationMs = 0;
String eventQueue;

String newEventId() {
  char value[40];
  snprintf(value, sizeof(value), "%08lx%08lx%08lx%08lx", (unsigned long)esp_random(), (unsigned long)esp_random(), (unsigned long)esp_random(), (unsigned long)esp_random());
  return String(value);
}
bool queueDeviceEvent(const String &type, const String &uid, const String &operationId = "") {
  if (!syncStorageReady || uid.length() == 0) return false;
  JsonDocument queue;
  if (eventQueue.length() && deserializeJson(queue, eventQueue)) return false;
  if (!queue.is<JsonArray>()) queue.to<JsonArray>();
  if (queue.size() >= 32) return false; // Stop accepting payments when durable event queue is full.
  JsonObject e = queue.as<JsonArray>().add<JsonObject>();
  e["id"] = newEventId(); e["type"] = type; e["uid"] = uid;
  e["operationId"] = operationId; e["timestamp"] = getEpoch();
  e["deviceId"] = DEVICE_ID;
  String encoded; serializeJson(queue, encoded);
  if (queue.overflowed() || syncPreferences.putString("events", encoded) != encoded.length()) return false;
  eventQueue = encoded; return true;
}
void initializeSync() {
  digitalWrite(SMARTTAP_RELAY_PIN, SMARTTAP_RELAY_ACTIVE_LEVEL == HIGH ? LOW : HIGH);
  pinMode(SMARTTAP_RELAY_PIN, OUTPUT);
  if (SMARTTAP_RUNNING_PIN >= 0) pinMode(SMARTTAP_RUNNING_PIN, SMARTTAP_FEEDBACK_ACTIVE_LEVEL == HIGH ? INPUT_PULLDOWN : INPUT_PULLUP);
  if (SMARTTAP_ERROR_PIN >= 0) pinMode(SMARTTAP_ERROR_PIN, SMARTTAP_FEEDBACK_ACTIVE_LEVEL == HIGH ? INPUT_PULLDOWN : INPUT_PULLUP);
  syncStorageReady = syncPreferences.begin("smarttap-sync", false);
  if (!syncStorageReady) return;
  eventQueue = syncPreferences.getString("events", "");
  String interrupted = syncPreferences.getString("session", "");
  if (interrupted.length()) {
    JsonDocument s;
    if (!deserializeJson(s, interrupted) && queueDeviceEvent("SESSION_ERROR", s["uid"].as<String>(), s["operationId"].as<String>())) {
      // A crash around a pulse is ambiguous; never pulse again automatically.
      syncPreferences.remove("session");
    } else syncStorageReady = false;
  }
}
void syncGameConfiguration(bool force = false) {
  static unsigned long lastAttempt = 0;
  if (!firebaseReady() || sessionActive || (!force && millis() - lastAttempt < 10000)) return;
  lastAttempt = millis();
  String provisionRaw = Database.get<String>(firebaseClient, "/deviceProvision/" + String(DEVICE_ID));
  JsonDocument provision;
  if (firebaseClient.lastError().code() != 0 || deserializeJson(provision, provisionRaw) || provision["enabled"] != true) { configuredEnabled = false; return; }
  configuredBranchId = provision["branchId"].as<String>();
  String raw = Database.get<String>(firebaseClient, "/catalog/deviceConfig/" + String(DEVICE_ID));
  if (firebaseClient.lastError().code() != 0) { configuredEnabled = false; return; }
  JsonDocument c;
  if (deserializeJson(c, raw) || !c["version"].is<String>() || !c["gameId"].is<String>() ||
      !c["branchId"].is<String>() || !c["price"].is<int>() || !c["durationSeconds"].is<int>() || !c["enabled"].is<bool>()) { configuredEnabled = false; return; }
  int price = c["price"], duration = c["durationSeconds"];
  if (price < 0 || price > 5000000 || duration < 1 || duration > 86400) { configuredEnabled = false; return; }
  if (c["branchId"].as<String>() != configuredBranchId) { configuredEnabled = false; return; }
  GAME_PRICE = price; GAME_DURATION_SECONDS = duration; gameName = c["name"].as<String>();
  configuredGameId = c["gameId"].as<String>(); configuredBranchId = c["branchId"].as<String>(); configuredVersion = c["version"].as<String>();
  configuredEnabled = c["enabled"].as<bool>(); configCheckedAt = millis();
  JsonDocument ack; ack["name"] = gameName; ack["price"] = GAME_PRICE;
  ack["gameDurationSeconds"] = GAME_DURATION_SECONDS; ack["gameId"] = configuredGameId;
  ack["branchId"] = configuredBranchId; ack["configVersion"] = configuredVersion;
  ack["relayPin"] = SMARTTAP_RELAY_PIN; ack["hasRunningFeedback"] = SMARTTAP_RUNNING_PIN >= 0;
  String encoded; serializeJson(ack, encoded);
  if (!Database.update<object_t>(firebaseClient, "/devices/" + String(DEVICE_ID), object_t(encoded))) configuredEnabled = false;
}
bool dispatchPlay(JsonObject receipt) {
  if (receipt["type"] != "PLAY") return true;
  const String id = receipt["requestId"].as<String>();
  // Last handled ID prevents an NVS-cleanup/history retry issuing a second pulse.
  if (syncPreferences.getString("handled", "") == id) return true;
  const String uid = receipt["uid"].as<String>();
  if (!syncStorageReady || sessionActive || !configuredEnabled || receipt["configVersion"].as<String>() != configuredVersion || (SMARTTAP_ERROR_PIN >= 0 && digitalRead(SMARTTAP_ERROR_PIN) == SMARTTAP_FEEDBACK_ACTIVE_LEVEL)) {
    queueDeviceEvent("SESSION_ERROR", uid, id); return false;
  }
  JsonDocument record; record["uid"] = uid; record["operationId"] = id;
  String encoded; serializeJson(record, encoded);
  if (syncPreferences.putString("session", encoded) != encoded.length()) return false;
  // Persist before pulsing: crash recovery reports uncertainty instead of replaying the pulse.
  if (syncPreferences.putString("handled", id) != id.length()) return false;
  sessionUid = uid; sessionOperationId = id; sessionStartedAt = millis();
  sessionDurationMs = receipt["gameDurationSeconds"].as<unsigned long>() * 1000UL;
  sessionActive = true; sessionConfirmed = false;
  digitalWrite(SMARTTAP_RELAY_PIN, SMARTTAP_RELAY_ACTIVE_LEVEL);
  delay(SMARTTAP_RELAY_PULSE_MS);
  digitalWrite(SMARTTAP_RELAY_PIN, SMARTTAP_RELAY_ACTIVE_LEVEL == HIGH ? LOW : HIGH);
  queueDeviceEvent("SESSION_PULSE_SENT", uid, id);
  return true;
}
void syncSessionStatus(const char *status, bool playing) {
  if (!firebaseReady()) return;
  JsonDocument s; s["status"] = status; s["playing"] = playing;
  s["activeUid"] = sessionActive ? sessionUid : "";
  s["activeOperationId"] = sessionActive ? sessionOperationId : "";
  s["sessionConfirmed"] = sessionConfirmed;
  String encoded; serializeJson(s, encoded);
  Database.update<object_t>(firebaseClient, "/devices/" + String(DEVICE_ID), object_t(encoded));
}
void tickSession() {
  if (!sessionActive) return;
  const unsigned long elapsed = millis() - sessionStartedAt;
  bool hardwareError = SMARTTAP_ERROR_PIN >= 0 && digitalRead(SMARTTAP_ERROR_PIN) == SMARTTAP_FEEDBACK_ACTIVE_LEVEL;
  bool running = SMARTTAP_RUNNING_PIN >= 0 && digitalRead(SMARTTAP_RUNNING_PIN) == SMARTTAP_FEEDBACK_ACTIVE_LEVEL;
  if (!sessionConfirmed && running) {
    if (queueDeviceEvent("SESSION_STARTED", sessionUid, sessionOperationId)) sessionConfirmed = true;
  }
  if (hardwareError || (SMARTTAP_RUNNING_PIN >= 0 && !sessionConfirmed && elapsed > SMARTTAP_START_TIMEOUT_MS)) {
    if (!queueDeviceEvent("SESSION_ERROR", sessionUid, sessionOperationId)) return;
    sessionActive = false; syncPreferences.remove("session"); syncSessionStatus("error", false); return;
  }
  if ((sessionConfirmed && !running) || (SMARTTAP_RUNNING_PIN < 0 && elapsed >= sessionDurationMs)) {
    if (!queueDeviceEvent(sessionConfirmed ? "SESSION_ENDED" : "SESSION_WINDOW_ENDED", sessionUid, sessionOperationId)) return;
    sessionActive = false; syncPreferences.remove("session"); syncSessionStatus("online", false); return;
  }
  static unsigned long lastStatus = 0;
  if (millis() - lastStatus > 2000) { lastStatus = millis(); syncSessionStatus(sessionConfirmed ? "playing" : "awaiting_confirmation", sessionConfirmed); }
}
void flushDeviceEvents() {
  static unsigned long lastFlush = 0;
  if (!syncStorageReady || !firebaseReady() || !eventQueue.length() || millis() - lastFlush < 2000) return;
  lastFlush = millis(); JsonDocument q;
  if (deserializeJson(q, eventQueue) || !q.is<JsonArray>() || q.size() == 0) return;
  JsonObject e = q[0]; String id = e["id"].as<String>(); String encoded; serializeJson(e, encoded);
  String path = "/deviceEvents/" + String(DEVICE_ID) + "/" + id;
  bool sent = Database.set<object_t>(firebaseClient, path, object_t(encoded), "null_etag");
  if (!sent && firebaseClient.lastError().code() == 412) {
    String existing = Database.get<String>(firebaseClient, path); JsonDocument old;
    sent = firebaseClient.lastError().code() == 0 && !deserializeJson(old, existing) && old["id"].as<String>() == id;
  }
  if (!sent) return;
  q.as<JsonArray>().remove(0); String next; serializeJson(q, next);
  if (syncPreferences.putString("events", next) == next.length()) eventQueue = next;
}
