#pragma once
#include <ArduinoJson.h>
#include <Preferences.h>
#include <esp_system.h>
// All money updates now happen in processDeviceRequest (trusted Cloud Function).
Preferences moneyPreferences;
String pendingMoney, moneyError, moneyCardName, moneyOperationId;
bool moneyStorageReady = false, moneyPermissionDenied = false;
int moneyBefore = 0, moneyAfter = 0;
void initializeMoneyStorage() {
  moneyStorageReady = moneyPreferences.begin("smarttap-money", false);
  if (moneyStorageReady) pendingMoney = moneyPreferences.getString("pending", "");
}
bool resumeMoneyOperation() {
  if (!moneyStorageReady || !pendingMoney.length() || !firebaseReady()) return false;
  JsonDocument intent;
  if (deserializeJson(intent, pendingMoney)) { moneyError = "INVALID PENDING DATA"; return false; }
  String id = intent["id"].as<String>(), uid = intent["uid"].as<String>(), type = intent["type"].as<String>();
  if (!id.length() || !uid.length() || (type != "PLAY" && type != "TOPUP" && type != "CREATE")) { moneyError = "INVALID PENDING DATA"; return false; }
  String path = "/deviceRequests/" + String(DEVICE_ID) + "/" + id;
  // Read first: a lost create response must not create a second request.
  String existing = Database.get<String>(firebaseClient, path);
  if (firebaseClient.lastError().code() != 0) { moneyError = "REQUEST READ ERROR"; return false; }
  if (!existing.length() || existing == "null") {
    if (!Database.set<object_t>(firebaseClient, path, object_t(pendingMoney), "null_etag")) { moneyError = "REQUEST SYNC PENDING"; return false; }
  }
  String raw = Database.get<String>(firebaseClient, "/deviceResults/" + String(DEVICE_ID) + "/" + id);
  if (firebaseClient.lastError().code() != 0 || !raw.length() || raw == "null") { moneyError = "WAITING FOR SERVER"; return false; }
  JsonDocument result;
  if (deserializeJson(result, raw)) { moneyError = "INVALID SERVER RESULT"; return false; }
  if (result["status"] == "REJECTED") {
    moneyError = result["reason"].as<String>();
    queueDeviceEvent("CARD_REJECTED", uid, id);
    if (moneyPreferences.remove("pending")) pendingMoney = "";
    return false;
  }
  if (result["status"] != "COMMITTED" || result["uid"].as<String>() != uid || result["requestId"].as<String>() != id) { moneyError = "RESULT MISMATCH"; return false; }
  moneyBefore = result["balanceBefore"] | 0; moneyAfter = result["balanceAfter"] | 0;
  moneyCardName = result["cardName"].as<String>(); moneyOperationId = id;
  if (type == "PLAY" && !dispatchPlay(result.as<JsonObject>())) { moneyError = "RELAY REQUIRES SUPPORT"; return false; }
  if (!moneyPreferences.remove("pending")) { moneyError = "NVS CLEANUP PENDING"; return false; }
  pendingMoney = ""; moneyError = ""; return true;
}
bool applyMoneyOperation(const String &uid, const String &type, int amount) {
  if (!moneyStorageReady || !syncStorageReady || pendingMoney.length() || !firebaseReady() || getEpoch() <= 0) { moneyError = "PREVIOUS REQUEST / NETWORK"; return false; }
  if (type != "PLAY" && type != "TOPUP" && type != "CREATE") return false;
  JsonDocument intent;
  intent["id"] = String(DEVICE_ID) + "-" + newEventId(); intent["uid"] = uid;
  intent["type"] = type; intent["amount"] = amount; intent["configVersion"] = configuredVersion;
  intent["timestamp"] = getEpoch(); intent["time"] = getDateTime();
  String encoded; serializeJson(intent, encoded);
  if (intent.overflowed() || moneyPreferences.putString("pending", encoded) != encoded.length()) { moneyError = "NVS WRITE ERROR"; return false; }
  pendingMoney = encoded;
  // Briefly wait for the server without blocking Firebase authentication processing.
  unsigned long started = millis();
  do { if (resumeMoneyOperation()) return true; if (!pendingMoney.length()) return false; app.loop(); delay(100); } while (millis() - started < 5000);
  return false;
}
void recoverMoneyOperation() {
  static unsigned long lastAttempt = 0;
  if (!pendingMoney.length() || millis() - lastAttempt < 5000) return;
  lastAttempt = millis();
  if (resumeMoneyOperation()) {
    Serial.println("Server confirmed pending operation; no duplicate pulse/credit");
    if (cashierUID.length()) { FirebaseCard latest = getCardFromFirebase(cashierUID); if (!latest.readError && latest.exists) cashierCard = latest; }
  } else Serial.println("Operation pending: " + moneyError);
}
