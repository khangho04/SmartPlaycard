#pragma once

#include <ArduinoJson.h>
#include <Preferences.h>
#include <esp_system.h>
#include <limits.h>

// Same protocol as the app: CAS the entire card, including a permanent receipt.
// /transactions is an idempotent projection, never the authority for applying money.
Preferences moneyPreferences;
String pendingMoney;
String moneyError;
bool moneyStorageReady = false;
bool moneyPermissionDenied = false;
int moneyBefore = 0;
int moneyAfter = 0;
String moneyCardName;

void initializeMoneyStorage()
{
  moneyStorageReady = moneyPreferences.begin("smarttap-money", false);
  if (moneyStorageReady) pendingMoney = moneyPreferences.getString("pending", "");
  else Serial.println("Money operations disabled: NVS unavailable");
}

bool moneyDatabaseOK()
{
  int code = firebaseClient.lastError().code();
  if (code == 401 || code == 403) {
    moneyPermissionDenied = true;
    moneyError = "PERMISSION_DENIED";
    Serial.println("PERMISSION_DENIED: money operations stopped; Rules unchanged");
  }
  return code == 0;
}

bool nonnegativeInt(JsonVariantConst value, int &result, bool optional = false)
{
  if (optional && value.isNull()) { result = 0; return true; }
  if (!value.is<int>()) return false;
  result = value.as<int>();
  return result >= 0;
}

bool resumeMoneyOperation()
{
  if (!moneyStorageReady || moneyPermissionDenied || pendingMoney.length() == 0 || !firebaseReady()) return false;
  JsonDocument intent;
  if (deserializeJson(intent, pendingMoney)) { moneyError = "INVALID PENDING DATA"; return false; }
  String uid = intent["uid"].as<String>();
  String id = intent["id"].as<String>();
  String type = intent["type"].as<String>();
  int amount = intent["amount"] | 0;
  bool play = type == "PLAY";
  if (uid.length() == 0 || id.length() == 0 || (type != "TOPUP" && !play) ||
      (play ? amount != GAME_PRICE : amount < MIN_TOPUP || amount > MAX_TOPUP)) {
    moneyError = "INVALID PENDING DATA";
    return false;
  }

  for (int attempt = 0; attempt < 5; ++attempt) {
    String path = "/cards/" + uid;
    String raw = Database.get<String>(firebaseClient, path);
    String etag = firebaseClient.etag(); // Capture immediately, before another request.
    if (!moneyDatabaseOK()) return false;
    if (etag.length() == 0) { moneyError = "MISSING ETAG"; return false; }
    JsonDocument card;
    if (deserializeJson(card, raw) || !card.is<JsonObject>()) { moneyError = "CARD DATA ERROR"; return false; }
    if (!card["_operations"].isNull() && !card["_operations"].is<JsonObject>()) { moneyError = "RECEIPT DATA ERROR"; return false; }

    JsonObject receipt = card["_operations"][id].as<JsonObject>();
    if (!receipt.isNull()) {
      if (receipt["requestId"].as<String>() != id || receipt["uid"].as<String>() != uid ||
          receipt["type"].as<String>() != type || receipt["amount"].as<int>() != amount ||
          !nonnegativeInt(receipt["balanceBefore"], moneyBefore) || !nonnegativeInt(receipt["balanceAfter"], moneyAfter) ||
          (int64_t(moneyAfter) - moneyBefore) != (receipt["status"] == "REJECTED" ? 0 : (play ? -int64_t(amount) : int64_t(amount)))) {
        moneyError = "RECEIPT MISMATCH"; return false;
      }
    } else {
      // Never use cashierCard.balance for arithmetic: it is display-only cache.
      String rejection;
      if (!card["active"].isNull() && (!card["active"].is<bool>() || !card["active"].as<bool>())) rejection = "CARD BLOCKED";
      int count, total;
      const char *countKey = play ? "playCount" : "topupCount";
      const char *totalKey = play ? "totalSpent" : "totalTopup";
      if (!nonnegativeInt(card["balance"], moneyBefore) ||
          !nonnegativeInt(card[countKey], count, true) || !nonnegativeInt(card[totalKey], total, true)) {
        moneyError = "INVALID MONEY DATA"; return false;
      }
      int64_t after = int64_t(moneyBefore) + (play ? -int64_t(amount) : int64_t(amount));
      if (after < 0) rejection = "INSUFFICIENT BALANCE";
      if (after > INT_MAX || count == INT_MAX || int64_t(total) + amount > INT_MAX) {
        rejection = "MONEY LIMIT";
      }
      moneyAfter = rejection.length() == 0 ? int(after) : moneyBefore;
      if (rejection.length() == 0) {
        card["balance"] = moneyAfter;
        card[countKey] = count + 1;
        card[totalKey] = total + amount;
        card[play ? "lastPlayedAt" : "lastTopupAt"] = intent["time"];
        card[play ? "lastPlayedAtEpoch" : "lastTopupAtEpoch"] = intent["timestamp"];
      }
      receipt = card["_operations"][id].to<JsonObject>();
      receipt["requestId"] = id;
      receipt["uid"] = uid;
      receipt["type"] = type;
      receipt["amount"] = amount;
      receipt["balanceBefore"] = moneyBefore;
      receipt["balanceAfter"] = moneyAfter;
      receipt["timestamp"] = intent["timestamp"];
      receipt["time"] = intent["time"];
      receipt["cardName"] = card["name"].is<String>() ? card["name"].as<String>() : "Card " + uid;
      receipt["deviceId"] = DEVICE_ID;
      receipt["source"] = "ESP32";
      receipt["paymentMethod"] = play ? "card" : "cashier";
      receipt["status"] = rejection.length() == 0 ? "COMMITTED" : "REJECTED";
      if (rejection.length() > 0) receipt["reason"] = rejection;
      if (play) receipt["gameDurationSeconds"] = GAME_DURATION_SECONDS;
      if (card.overflowed()) { moneyError = "NOT ENOUGH MEMORY"; return false; }
      String payload;
      serializeJson(card, payload);
      if (payload.length() != measureJson(card)) { moneyError = "NOT ENOUGH MEMORY"; return false; }
      bool saved = Database.set<object_t>(firebaseClient, path, object_t(payload), etag);
      bool clean = moneyDatabaseOK();
      if (!saved || !clean) {
        if (moneyPermissionDenied) return false;
        // 412 or a lost response: read again using the SAME intent/receipt ID.
        // A committed receipt prevents a second balance change on the next pass.
        app.loop();
        continue;
      }
    }

    if (receipt["status"] == "REJECTED") {
      // A CASed rejection invalidates older in-flight ETags for this operation.
      // The request cannot unexpectedly charge later when the card is funded.
      moneyError = receipt["reason"].as<String>();
      if (moneyPreferences.remove("pending")) pendingMoney = "";
      return false;
    }
    moneyCardName = receipt["cardName"].as<String>();
    String log;
    serializeJson(receipt, log);
    if (log.length() != measureJson(receipt)) { moneyError = "NOT ENOUGH MEMORY"; return false; }
    bool logged = Database.set<object_t>(firebaseClient, "/transactions/" + id, object_t(log));
    if (!moneyDatabaseOK() || !logged) { moneyError = "HISTORY SYNC PENDING"; return false; }
    if (!moneyPreferences.remove("pending")) { moneyError = "NVS CLEANUP PENDING"; return false; }
    pendingMoney = "";
    moneyError = "";
    return true;
  }
  moneyError = "SYNC PENDING";
  return false;
}

bool applyMoneyOperation(const String &uid, const String &type, int amount)
{
  if (!moneyStorageReady || moneyPermissionDenied) { moneyError = "MONEY OPERATIONS STOPPED"; return false; }
  if (pendingMoney.length() > 0) { moneyError = "PREVIOUS PAYMENT PENDING"; return false; }
  if (!firebaseReady()) { moneyError = "NETWORK ERROR"; return false; }
  // Reject obvious invalid requests before persisting an intent.
  if ((type == "TOPUP" && (amount < MIN_TOPUP || amount > MAX_TOPUP)) ||
      (type == "PLAY" && amount != GAME_PRICE) || (type != "TOPUP" && type != "PLAY")) return false;
  JsonDocument intent;
  char randomId[40];
  snprintf(randomId, sizeof(randomId), "%08lx%08lx%08lx%08lx", (unsigned long)esp_random(),
    (unsigned long)esp_random(), (unsigned long)esp_random(), (unsigned long)esp_random());
  intent["id"] = String(DEVICE_ID) + "-" + randomId;
  intent["uid"] = uid;
  intent["type"] = type;
  intent["amount"] = amount;
  intent["timestamp"] = getEpoch();
  intent["time"] = getDateTime();
  String encoded;
  serializeJson(intent, encoded);
  if (intent.overflowed() || encoded.length() != measureJson(intent) ||
      moneyPreferences.putString("pending", encoded) != encoded.length()) {
    moneyError = "NVS WRITE ERROR"; return false;
  }
  pendingMoney = encoded;
  return resumeMoneyOperation();
}

void recoverMoneyOperation()
{
  static unsigned long lastAttempt = 0;
  if (pendingMoney.length() == 0 || moneyPermissionDenied || millis() - lastAttempt < 5000) return;
  lastAttempt = millis();
  if (resumeMoneyOperation()) {
    Serial.println("Pending money operation confirmed; no duplicate charge");
    // Display cache only. Any future operation still reads and CASes Firebase.
    if (cashierUID.length() > 0) {
      FirebaseCard latest = getCardFromFirebase(cashierUID);
      if (!latest.readError && latest.exists) cashierCard = latest;
    }
  } else Serial.println("Money operation pending: " + moneyError);
}
