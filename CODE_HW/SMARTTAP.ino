#define ENABLE_DATABASE

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <FirebaseClient.h>

#include <SPI.h>
#include <MFRC522.h>

#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>

#include <time.h>


// =====================================================
// WIFI
// =====================================================

#define WIFI_SSID     "YOUR_WIFI_NAME"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"


// =====================================================
// FIREBASE
// =====================================================

#define DATABASE_URL \
"https://rfid-001-270d9-default-rtdb.asia-southeast1.firebasedatabase.app"

WiFiClientSecure sslClient;

using AsyncClient = AsyncClientClass;

AsyncClient firebaseClient(sslClient);

NoAuth noAuth;

FirebaseApp app;

RealtimeDatabase Database;


// =====================================================
// DEVICE
// =====================================================

#define DEVICE_ID "GAME001"
#define GAME_NAME "Racing Game"

const int GAME_PRICE = 20000;

const int GAME_DURATION_SECONDS = 180;


// =====================================================
// TOP-UP
// =====================================================

const int TOPUP_STEP    = 10000;
const int MIN_TOPUP     = 10000;
const int MAX_TOPUP     = 500000;
const int DEFAULT_TOPUP = 50000;


// =====================================================
// RC522
// =====================================================

#define RC522_SS   16
#define RC522_RST  17

#define PIN_SCK    18
#define PIN_MOSI   23
#define PIN_MISO   19

MFRC522 mfrc522(
  RC522_SS,
  RC522_RST
);


// =====================================================
// TFT
// =====================================================

#define TFT_CS   15
#define TFT_DC   2
#define TFT_RST  4
#define TFT_BLK  27

Adafruit_ST7789 tft =
  Adafruit_ST7789(
    TFT_CS,
    TFT_DC,
    TFT_RST
  );

const int SCREEN_W = 320;
const int SCREEN_H = 172;


// =====================================================
// BUTTONS
// =====================================================

#define BTN_LEFT   33
#define BTN_OK     25
#define BTN_RIGHT  32

const unsigned long DEBOUNCE_TIME = 40;


// LEFT
bool leftLastReading = HIGH;
bool leftStableState = HIGH;
unsigned long leftDebounceTime = 0;


// OK
bool okLastReading = HIGH;
bool okStableState = HIGH;
unsigned long okDebounceTime = 0;


// RIGHT
bool rightLastReading = HIGH;
bool rightStableState = HIGH;
unsigned long rightDebounceTime = 0;


// =====================================================
// MODE
// =====================================================

enum Mode
{
  MODE_GAME = 0,
  MODE_MAINTENANCE,
  MODE_CASHIER
};

Mode currentMode = MODE_GAME;


// =====================================================
// SCREEN
// =====================================================

enum ScreenState
{
  SCREEN_MODE_SELECT,
  SCREEN_GAME,
  SCREEN_MAINTENANCE,
  SCREEN_CASHIER,
  SCREEN_CASHIER_CARD,
  SCREEN_NEW_CARD,
  SCREEN_MESSAGE
};

ScreenState screenState =
  SCREEN_MODE_SELECT;


// =====================================================
// CARD
// =====================================================

struct FirebaseCard
{
  bool exists;
  bool readError;

  String name;

  int balance;

  bool active;
};

FirebaseCard cashierCard;

String cashierUID = "";

String pendingNewUID = "";

int topupAmount =
  DEFAULT_TOPUP;


// =====================================================
// RFID DUPLICATE PROTECTION
// =====================================================

String lastUID = "";

unsigned long lastScanTime = 0;

const unsigned long SAME_CARD_COOLDOWN =
  1800;


// =====================================================
// HEARTBEAT
// =====================================================

unsigned long lastHeartbeat = 0;

const unsigned long HEARTBEAT_INTERVAL =
  60000;


// =====================================================
// DEVICE STATE CACHE
// =====================================================

String lastDeviceStatus = "";
String lastDeviceMode = "";


// =====================================================
// NON-BLOCKING MESSAGE
// =====================================================

bool messageActive = false;

unsigned long messageStartTime = 0;
unsigned long messageDuration = 0;

ScreenState messageReturnScreen =
  SCREEN_MODE_SELECT;


// =====================================================
// TIME
// =====================================================

const long GMT_OFFSET_SEC =
  7 * 3600;

const int DAYLIGHT_OFFSET_SEC =
  0;


// =====================================================
// UID
// =====================================================

String uidToHex(
  MFRC522::Uid &uid
)
{
  String result = "";

  for (
    byte i = 0;
    i < uid.size;
    i++
  )
  {
    if (
      uid.uidByte[i] < 0x10
    )
    {
      result += "0";
    }

    result +=
      String(
        uid.uidByte[i],
        HEX
      );
  }

  result.toUpperCase();

  return result;
}


// =====================================================
// MONEY
// =====================================================

String formatMoney(
  long money
)
{
  String number =
    String(money);

  String result = "";

  int count = 0;

  for (
    int i =
      number.length() - 1;
    i >= 0;
    i--
  )
  {
    result =
      String(number[i]) +
      result;

    count++;

    if (
      count == 3 &&
      i != 0
    )
    {
      result =
        "." + result;

      count = 0;
    }
  }

  return
    result + " VND";
}


// =====================================================
// JSON ESCAPE
// =====================================================

String jsonEscape(
  String value
)
{
  value.replace(
    "\\",
    "\\\\"
  );

  value.replace(
    "\"",
    "\\\""
  );

  value.replace(
    "\n",
    "\\n"
  );

  value.replace(
    "\r",
    ""
  );

  return value;
}


// =====================================================
// TIME
// =====================================================

unsigned long getEpoch()
{
  time_t now =
    time(nullptr);

  if (
    now < 1000000000
  )
  {
    return 0;
  }

  return
    (unsigned long)now;
}


String formatTimeFromEpoch(
  time_t epoch
)
{
  if (
    epoch < 1000000000
  )
  {
    return
      "TIME_NOT_SYNCED";
  }

  struct tm timeinfo;

  localtime_r(
    &epoch,
    &timeinfo
  );

  char buffer[30];

  strftime(
    buffer,
    sizeof(buffer),
    "%Y-%m-%d %H:%M:%S",
    &timeinfo
  );

  return
    String(buffer);
}


String getDateTime()
{
  return
    formatTimeFromEpoch(
      time(nullptr)
    );
}


// =====================================================
// TIME INIT
// =====================================================

void initializeTime()
{
  configTime(
    GMT_OFFSET_SEC,
    DAYLIGHT_OFFSET_SEC,
    "pool.ntp.org",
    "time.google.com"
  );

  unsigned long start =
    millis();

  while (
    getEpoch() == 0 &&
    millis() - start < 5000
  )
  {
    delay(100);
  }
}


// =====================================================
// WIFI
// =====================================================

void connectWiFi()
{
  Serial.println(
    "Connecting WiFi..."
  );

  WiFi.begin(
    WIFI_SSID,
    WIFI_PASSWORD
  );

  unsigned long start =
    millis();

  while (
    WiFi.status() !=
      WL_CONNECTED &&
    millis() - start < 15000
  )
  {
    delay(100);
  }

  if (
    WiFi.status() ==
    WL_CONNECTED
  )
  {
    Serial.println(
      "WiFi connected"
    );

    Serial.println(
      WiFi.localIP()
    );
  }

  else
  {
    Serial.println(
      "WiFi failed"
    );
  }
}


// =====================================================
// FIREBASE
// =====================================================

void initializeFirebase()
{
  sslClient.setInsecure();

  sslClient.setConnectionTimeout(
    1000
  );

  sslClient.setHandshakeTimeout(
    5
  );

  initializeApp(
    firebaseClient,
    app,
    getAuth(noAuth)
  );

  app.getApp<
    RealtimeDatabase
  >(
    Database
  );

  Database.url(
    DATABASE_URL
  );
}


bool firebaseReady()
{
  if (
    WiFi.status() !=
    WL_CONNECTED
  )
  {
    return false;
  }

  app.loop();

  return
    app.ready();
}


// =====================================================
// OPTIONAL INT
// =====================================================

int getOptionalInt(
  const String &path,
  int defaultValue = 0
)
{
  int value =
    Database.get<int>(
      firebaseClient,
      path
    );

  if (
    firebaseClient
      .lastError()
      .code() != 0
  )
  {
    return
      defaultValue;
  }

  return value;
}


// =====================================================
// GET CARD
//
// OPTIMIZED:
// no repeated exists() per field
// =====================================================

FirebaseCard getCardFromFirebase(
  const String &uid
)
{
  FirebaseCard card;

  card.exists = false;
  card.readError = false;
  card.name = "";
  card.balance = 0;
  card.active = true;

  if (
    !firebaseReady()
  )
  {
    card.readError = true;

    return card;
  }


  String base =
    "/cards/" + uid;


  // -------------------------------------
  // First check node itself
  // -------------------------------------

  bool exists =
    Database.exists(
      firebaseClient,
      base
    );


  if (
    firebaseClient
      .lastError()
      .code() != 0
  )
  {
    card.readError = true;

    return card;
  }


  if (
    !exists
  )
  {
    return card;
  }


  card.exists = true;


  // -------------------------------------
  // NAME
  // -------------------------------------

  String name =
    Database.get<String>(
      firebaseClient,
      base + "/name"
    );


  if (
    firebaseClient
      .lastError()
      .code() != 0 ||
    name.length() == 0 ||
    name == "null"
  )
  {
    name =
      "Card " + uid;
  }


  // -------------------------------------
  // BALANCE
  // -------------------------------------

  int balance =
    Database.get<int>(
      firebaseClient,
      base + "/balance"
    );


  if (
    firebaseClient
      .lastError()
      .code() != 0
  )
  {
    balance = 0;
  }


  // -------------------------------------
  // ACTIVE
  // -------------------------------------

  bool active =
    Database.get<bool>(
      firebaseClient,
      base + "/active"
    );


  if (
    firebaseClient
      .lastError()
      .code() != 0
  )
  {
    // Old card compatibility
    active = true;
  }


  card.name =
    name;

  card.balance =
    balance;

  card.active =
    active;


  Serial.println();

  Serial.print(
    "CARD: "
  );

  Serial.println(
    uid
  );

  Serial.print(
    "Balance: "
  );

  Serial.println(
    balance
  );

  Serial.print(
    "Active: "
  );

  Serial.println(
    active
  );


  return card;
}


// =====================================================
// CREATE CARD
// =====================================================

bool createFirebaseCard(
  const String &uid
)
{
  if (
    !firebaseReady()
  )
  {
    return false;
  }


  String cardName =
    "Card " + uid;


  String json = "{";


  json +=
    "\"uid\":\"" +
    uid +
    "\",";


  json +=
    "\"name\":\"" +
    jsonEscape(cardName) +
    "\",";


  json +=
    "\"balance\":0,";


  json +=
    "\"active\":true,";


  json +=
    "\"createdAt\":\"" +
    getDateTime() +
    "\",";


  json +=
    "\"createdAtEpoch\":" +
    String(getEpoch()) +
    ",";


  json +=
    "\"updatedAt\":\"" +
    getDateTime() +
    "\",";


  json +=
    "\"playCount\":0,";


  json +=
    "\"topupCount\":0,";


  json +=
    "\"totalSpent\":0,";


  json +=
    "\"totalTopup\":0,";


  json +=
    "\"lastPlayedAt\":\"Never\",";


  json +=
    "\"lastTopupAt\":\"Never\"";


  json += "}";


  bool result =
    Database.set<object_t>(
      firebaseClient,
      "/cards/" + uid,
      object_t(json)
    );


  return
    result &&
    firebaseClient
      .lastError()
      .code() == 0;
}


// =====================================================
// PLAY UPDATE
// =====================================================

bool updateCardAfterPlay(
  const String &uid,
  int newBalance
)
{
  int count =
    getOptionalInt(
      "/cards/" +
      uid +
      "/playCount"
    );


  int spent =
    getOptionalInt(
      "/cards/" +
      uid +
      "/totalSpent"
    );


  String json = "{";


  json +=
    "\"balance\":" +
    String(newBalance) +
    ",";


  json +=
    "\"lastPlayedAt\":\"" +
    getDateTime() +
    "\",";


  json +=
    "\"lastPlayedAtEpoch\":" +
    String(getEpoch()) +
    ",";


  json +=
    "\"playCount\":" +
    String(count + 1) +
    ",";


  json +=
    "\"totalSpent\":" +
    String(
      spent +
      GAME_PRICE
    );


  json += "}";


  bool result =
    Database.update<object_t>(
      firebaseClient,
      "/cards/" + uid,
      object_t(json)
    );


  return
    result &&
    firebaseClient
      .lastError()
      .code() == 0;
}


// =====================================================
// TOPUP UPDATE
// =====================================================

bool updateCardAfterTopup(
  const String &uid,
  int amount,
  int newBalance
)
{
  int count =
    getOptionalInt(
      "/cards/" +
      uid +
      "/topupCount"
    );


  int total =
    getOptionalInt(
      "/cards/" +
      uid +
      "/totalTopup"
    );


  String json = "{";


  json +=
    "\"balance\":" +
    String(newBalance) +
    ",";


  json +=
    "\"lastTopupAt\":\"" +
    getDateTime() +
    "\",";


  json +=
    "\"lastTopupAtEpoch\":" +
    String(getEpoch()) +
    ",";


  json +=
    "\"topupCount\":" +
    String(count + 1) +
    ",";


  json +=
    "\"totalTopup\":" +
    String(
      total +
      amount
    );


  json += "}";


  bool result =
    Database.update<object_t>(
      firebaseClient,
      "/cards/" + uid,
      object_t(json)
    );


  return
    result &&
    firebaseClient
      .lastError()
      .code() == 0;
}


// =====================================================
// TRANSACTION
// =====================================================

void logTransaction(
  const String &type,
  const String &uid,
  const String &cardName,
  int amount,
  int before,
  int after
)
{
  if (
    !firebaseReady()
  )
  {
    return;
  }


  String json = "{";


  json +=
    "\"type\":\"" +
    type +
    "\",";


  json +=
    "\"uid\":\"" +
    uid +
    "\",";


  json +=
    "\"cardName\":\"" +
    jsonEscape(cardName) +
    "\",";


  json +=
    "\"deviceId\":\"" +
    String(DEVICE_ID) +
    "\",";


  json +=
    "\"amount\":" +
    String(amount) +
    ",";


  json +=
    "\"balanceBefore\":" +
    String(before) +
    ",";


  json +=
    "\"balanceAfter\":" +
    String(after) +
    ",";


  json +=
    "\"time\":\"" +
    getDateTime() +
    "\",";


  json +=
    "\"timestamp\":" +
    String(getEpoch());


  if (
    type == "PLAY"
  )
  {
    json +=
      ",\"gameDurationSeconds\":" +
      String(
        GAME_DURATION_SECONDS
      );
  }


  json += "}";


  Database.push<object_t>(
    firebaseClient,
    "/transactions",
    object_t(json)
  );
}


// =====================================================
// DEVICE STATE
//
// only update when changed
// =====================================================

void updateDeviceState(
  const String &status,
  const String &mode
)
{
  // No duplicated writes
  if (
    status ==
      lastDeviceStatus &&
    mode ==
      lastDeviceMode
  )
  {
    return;
  }


  if (
    !firebaseReady()
  )
  {
    return;
  }


  String json = "{";


  json +=
    "\"status\":\"" +
    status +
    "\",";


  json +=
    "\"mode\":\"" +
    mode +
    "\",";


  json +=
    "\"statusUpdatedAt\":\"" +
    getDateTime() +
    "\",";


  json +=
    "\"statusUpdatedAtEpoch\":" +
    String(getEpoch());


  json += "}";


  bool result =
    Database.update<object_t>(
      firebaseClient,
      "/devices/" +
      String(DEVICE_ID),
      object_t(json)
    );


  if (
    result
  )
  {
    lastDeviceStatus =
      status;

    lastDeviceMode =
      mode;
  }
}


// =====================================================
// DEVICE REGISTER
// =====================================================

void registerDeviceFirebase()
{
  if (
    !firebaseReady()
  )
  {
    return;
  }


  String json = "{";


  json +=
    "\"name\":\"" +
    String(GAME_NAME) +
    "\",";


  json +=
    "\"price\":" +
    String(GAME_PRICE) +
    ",";


  json +=
    "\"gameDurationSeconds\":" +
    String(
      GAME_DURATION_SECONDS
    ) +
    ",";


  json +=
    "\"status\":\"online\",";


  json +=
    "\"mode\":\"menu\",";


  json +=
    "\"bootAt\":\"" +
    getDateTime() +
    "\",";


  json +=
    "\"ipAddress\":\"" +
    WiFi.localIP().toString() +
    "\",";


  json +=
    "\"wifiRSSI\":" +
    String(WiFi.RSSI());


  json += "}";


  Database.set<object_t>(
    firebaseClient,
    "/devices/" +
    String(DEVICE_ID),
    object_t(json)
  );


  lastDeviceStatus =
    "online";

  lastDeviceMode =
    "menu";
}


// =====================================================
// HEARTBEAT
// =====================================================

void updateHeartbeat()
{
  if (
    millis() -
      lastHeartbeat <
      HEARTBEAT_INTERVAL
  )
  {
    return;
  }


  lastHeartbeat =
    millis();


  if (
    !firebaseReady()
  )
  {
    return;
  }


  String json = "{";


  json +=
    "\"lastSeen\":\"" +
    getDateTime() +
    "\",";


  json +=
    "\"lastSeenEpoch\":" +
    String(getEpoch()) +
    ",";


  json +=
    "\"wifiRSSI\":" +
    String(WiFi.RSSI());


  json += "}";


  Database.update<object_t>(
    firebaseClient,
    "/devices/" +
    String(DEVICE_ID),
    object_t(json)
  );
}


// =====================================================
// HEADER
// =====================================================

void drawHeader(
  const String &title
)
{
  tft.fillScreen(
    ST77XX_BLACK
  );


  tft.fillRoundRect(
    4,
    4,
    SCREEN_W - 8,
    38,
    8,
    ST77XX_BLUE
  );


  tft.setTextColor(
    ST77XX_WHITE
  );


  tft.setTextSize(2);


  tft.setCursor(
    10,
    14
  );


  tft.print(
    title
  );


  tft.setTextSize(1);


  tft.setCursor(
    260,
    18
  );


  tft.print(
    DEVICE_ID
  );
}


// =====================================================
// MODE SCREEN
// =====================================================

void showModeSelect()
{
  screenState =
    SCREEN_MODE_SELECT;


  updateDeviceState(
    "online",
    "menu"
  );


  drawHeader(
    "SELECT MODE"
  );


  // GAME
  if (
    currentMode ==
    MODE_GAME
  )
  {
    tft.fillRoundRect(
      10, 60,
      90, 55,
      8,
      ST77XX_GREEN
    );
  }

  else
  {
    tft.drawRoundRect(
      10, 60,
      90, 55,
      8,
      ST77XX_WHITE
    );
  }


  // MAINTENANCE
  if (
    currentMode ==
    MODE_MAINTENANCE
  )
  {
    tft.fillRoundRect(
      110, 60,
      100, 55,
      8,
      ST77XX_RED
    );
  }

  else
  {
    tft.drawRoundRect(
      110, 60,
      100, 55,
      8,
      ST77XX_WHITE
    );
  }


  // CASHIER
  if (
    currentMode ==
    MODE_CASHIER
  )
  {
    tft.fillRoundRect(
      220, 60,
      90, 55,
      8,
      ST77XX_CYAN
    );
  }

  else
  {
    tft.drawRoundRect(
      220, 60,
      90, 55,
      8,
      ST77XX_WHITE
    );
  }


  tft.setTextSize(1);

  tft.setTextColor(
    ST77XX_WHITE
  );


  tft.setCursor(
    38, 84
  );

  tft.print(
    "GAME"
  );


  tft.setCursor(
    120, 84
  );

  tft.print(
    "MAINTENANCE"
  );


  tft.setCursor(
    242, 84
  );

  tft.print(
    "CASHIER"
  );


  tft.setCursor(
    30, 140
  );

  tft.print(
    "< LEFT   OK SELECT   RIGHT >"
  );
}


// =====================================================
// GAME SCREEN
// =====================================================

void showGameScreen()
{
  screenState =
    SCREEN_GAME;


  updateDeviceState(
    "online",
    "game"
  );


  drawHeader(
    GAME_NAME
  );


  tft.setTextColor(
    ST77XX_GREEN
  );


  tft.setTextSize(2);


  tft.setCursor(
    20, 58
  );


  tft.print(
    "GAME MODE"
  );


  tft.setTextSize(1);

  tft.setTextColor(
    ST77XX_WHITE
  );


  tft.setCursor(
    20, 92
  );


  tft.print(
    "Tap RFID card to play"
  );


  tft.setCursor(
    20, 115
  );


  tft.print(
    "Price: "
  );


  tft.setTextColor(
    ST77XX_YELLOW
  );


  tft.print(
    formatMoney(
      GAME_PRICE
    )
  );


  tft.setTextColor(
    ST77XX_WHITE
  );


  tft.setCursor(
    20, 150
  );


  tft.print(
    "OK = Back"
  );
}


// =====================================================
// MAINTENANCE
// =====================================================

void showMaintenanceScreen()
{
  screenState =
    SCREEN_MAINTENANCE;


  updateDeviceState(
    "maintenance",
    "maintenance"
  );


  drawHeader(
    "MAINTENANCE"
  );


  tft.setTextColor(
    ST77XX_RED
  );


  tft.setTextSize(2);


  tft.setCursor(
    20, 60
  );


  tft.print(
    "OUT OF SERVICE"
  );


  tft.setTextSize(1);

  tft.setTextColor(
    ST77XX_WHITE
  );


  tft.setCursor(
    20, 100
  );


  tft.print(
    "RFID payment disabled"
  );


  tft.setCursor(
    20, 125
  );


  tft.print(
    "Machine under maintenance"
  );


  tft.setCursor(
    20, 150
  );


  tft.print(
    "OK = Back"
  );
}


// =====================================================
// CASHIER
// =====================================================

void showCashierScreen()
{
  screenState =
    SCREEN_CASHIER;


  updateDeviceState(
    "online",
    "cashier"
  );


  cashierUID = "";

  pendingNewUID = "";

  topupAmount =
    DEFAULT_TOPUP;


  drawHeader(
    "CASHIER"
  );


  tft.setTextColor(
    ST77XX_CYAN
  );


  tft.setTextSize(2);


  tft.setCursor(
    20, 55
  );


  tft.print(
    "SCAN CARD"
  );


  tft.setTextSize(1);

  tft.setTextColor(
    ST77XX_WHITE
  );


  tft.setCursor(
    20, 95
  );


  tft.print(
    "Existing card: Top-up"
  );


  tft.setCursor(
    20, 120
  );


  tft.print(
    "New card: Create"
  );


  tft.setCursor(
    20, 145
  );


  tft.print(
    "OK = Back"
  );
}


// =====================================================
// GENERIC MESSAGE
// =====================================================

void showTimedMessage(
  const String &title,
  const String &line1,
  const String &line2,
  uint16_t titleColor,
  unsigned long duration,
  ScreenState returnScreen
)
{
  drawHeader(
    title
  );


  tft.setTextColor(
    titleColor
  );


  tft.setTextSize(2);


  tft.setCursor(
    20,
    60
  );


  tft.print(
    line1
  );


  tft.setTextSize(1);

  tft.setTextColor(
    ST77XX_WHITE
  );


  if (
    line2.length() > 0
  )
  {
    tft.setCursor(
      20,
      110
    );


    tft.print(
      line2
    );
  }


  screenState =
    SCREEN_MESSAGE;


  messageActive =
    true;


  messageStartTime =
    millis();


  messageDuration =
    duration;


  messageReturnScreen =
    returnScreen;
}


// =====================================================
// RETURN SCREEN
// =====================================================

void returnFromMessage()
{
  messageActive = false;


  switch (
    messageReturnScreen
  )
  {
    case SCREEN_GAME:

      showGameScreen();

      break;


    case SCREEN_CASHIER:

      showCashierScreen();

      break;


    case SCREEN_MAINTENANCE:

      showMaintenanceScreen();

      break;


    default:

      showModeSelect();

      break;
  }
}


// =====================================================
// MESSAGE TIMER
// =====================================================

void handleMessageTimer()
{
  if (
    !messageActive
  )
  {
    return;
  }


  if (
    millis() -
      messageStartTime >=
      messageDuration
  )
  {
    returnFromMessage();
  }
}


// =====================================================
// GAME
// =====================================================

void processGame(
  const String &uid
)
{
  FirebaseCard card =
    getCardFromFirebase(
      uid
    );


  if (
    card.readError
  )
  {
    showTimedMessage(
      "NETWORK ERROR",
      "TRY AGAIN",
      "",
      ST77XX_RED,
      1200,
      SCREEN_GAME
    );

    return;
  }


  // White card
  if (
    !card.exists
  )
  {
    showTimedMessage(
      "NEW CARD",
      "NOT REGISTERED",
      "Go to CASHIER",
      ST77XX_YELLOW,
      1500,
      SCREEN_GAME
    );

    return;
  }


  // Real blocked card
  if (
    !card.active
  )
  {
    showTimedMessage(
      "CARD BLOCKED",
      "BLOCKED",
      "Contact cashier",
      ST77XX_RED,
      1500,
      SCREEN_GAME
    );

    return;
  }


  // Not enough money
  if (
    card.balance <
    GAME_PRICE
  )
  {
    showTimedMessage(
      "NO BALANCE",
      "INSUFFICIENT",
      "Top-up at CASHIER",
      ST77XX_RED,
      1500,
      SCREEN_GAME
    );

    return;
  }


  int before =
    card.balance;


  int after =
    before -
    GAME_PRICE;


  if (
    !updateCardAfterPlay(
      uid,
      after
    )
  )
  {
    showTimedMessage(
      "DATABASE ERROR",
      "PAYMENT FAILED",
      "",
      ST77XX_RED,
      1200,
      SCREEN_GAME
    );

    return;
  }


  // Log transaction
  logTransaction(
    "PLAY",
    uid,
    card.name,
    GAME_PRICE,
    before,
    after
  );


  drawHeader(
    "PAYMENT"
  );


  tft.setTextColor(
    ST77XX_GREEN
  );


  tft.setTextSize(2);


  tft.setCursor(
    20,
    50
  );


  tft.print(
    "SUCCESS"
  );


  tft.setTextSize(1);

  tft.setTextColor(
    ST77XX_WHITE
  );


  tft.setCursor(
    20,
    88
  );


  tft.print(
    "Paid: "
  );


  tft.print(
    formatMoney(
      GAME_PRICE
    )
  );


  tft.setCursor(
    20,
    118
  );


  tft.print(
    "Balance: "
  );


  tft.setTextColor(
    ST77XX_GREEN
  );


  tft.print(
    formatMoney(
      after
    )
  );


  screenState =
    SCREEN_MESSAGE;


  messageActive =
    true;


  messageStartTime =
    millis();


  messageDuration =
    1200;


  messageReturnScreen =
    SCREEN_GAME;
}


// =====================================================
// CASHIER CARD SCREEN
// =====================================================

void showCashierCard()
{
  screenState =
    SCREEN_CASHIER_CARD;


  drawHeader(
    "CARD INFO"
  );


  tft.setTextSize(1);


  tft.setTextColor(
    ST77XX_CYAN
  );


  tft.setCursor(
    20,
    52
  );


  tft.print(
    cashierCard.name
  );


  tft.setCursor(
    20,
    75
  );


  tft.print(
    "Status: "
  );


  if (
    cashierCard.active
  )
  {
    tft.setTextColor(
      ST77XX_GREEN
    );

    tft.print(
      "ACTIVE"
    );
  }

  else
  {
    tft.setTextColor(
      ST77XX_RED
    );

    tft.print(
      "BLOCKED"
    );
  }


  tft.setTextColor(
    ST77XX_WHITE
  );


  tft.setCursor(
    20,
    98
  );


  tft.print(
    "Balance: "
  );


  tft.setTextColor(
    ST77XX_GREEN
  );


  tft.print(
    formatMoney(
      cashierCard.balance
    )
  );


  tft.setTextColor(
    ST77XX_WHITE
  );


  tft.setCursor(
    20,
    122
  );


  tft.print(
    "Top-up: "
  );


  tft.setTextColor(
    ST77XX_YELLOW
  );


  tft.print(
    formatMoney(
      topupAmount
    )
  );


  tft.setTextColor(
    ST77XX_WHITE
  );


  tft.setCursor(
    8,
    150
  );


  tft.print(
    "- LEFT   OK TOP-UP   RIGHT +"
  );
}


// =====================================================
// CASHIER PROCESS
// =====================================================

void processCashier(
  const String &uid
)
{
  FirebaseCard card =
    getCardFromFirebase(
      uid
    );


  if (
    card.readError
  )
  {
    showTimedMessage(
      "NETWORK ERROR",
      "TRY AGAIN",
      "",
      ST77XX_RED,
      1000,
      SCREEN_CASHIER
    );

    return;
  }


  // New card
  if (
    !card.exists
  )
  {
    pendingNewUID =
      uid;


    screenState =
      SCREEN_NEW_CARD;


    drawHeader(
      "NEW CARD"
    );


    tft.setTextColor(
      ST77XX_YELLOW
    );


    tft.setTextSize(2);


    tft.setCursor(
      20,
      52
    );


    tft.print(
      "CARD NOT FOUND"
    );


    tft.setTextSize(1);

    tft.setTextColor(
      ST77XX_WHITE
    );


    tft.setCursor(
      20,
      88
    );


    tft.print(
      "UID: "
    );


    tft.print(
      uid
    );


    tft.setCursor(
      20,
      115
    );


    tft.print(
      "LEFT Cancel  OK Create"
    );


    return;
  }


  cashierUID =
    uid;


  cashierCard =
    card;


  topupAmount =
    DEFAULT_TOPUP;


  showCashierCard();
}


// =====================================================
// CREATE CARD
// =====================================================

void createNewCard()
{
  if (
    pendingNewUID ==
    ""
  )
  {
    return;
  }


  String uid =
    pendingNewUID;


  if (
    !createFirebaseCard(
      uid
    )
  )
  {
    showTimedMessage(
      "CREATE ERROR",
      "FAILED",
      "",
      ST77XX_RED,
      1200,
      SCREEN_CASHIER
    );

    return;
  }


  // Use local data
  // DO NOT read Firebase again
  cashierUID =
    uid;


  cashierCard.exists =
    true;


  cashierCard.readError =
    false;


  cashierCard.name =
    "Card " + uid;


  cashierCard.balance =
    0;


  cashierCard.active =
    true;


  pendingNewUID =
    "";


  topupAmount =
    DEFAULT_TOPUP;


  showCashierCard();
}


// =====================================================
// TOPUP
// =====================================================

void topupFirebaseCard()
{
  if (
    cashierUID ==
    ""
  )
  {
    return;
  }


  int amount =
    topupAmount;


  int before =
    cashierCard.balance;


  int after =
    before +
    amount;


  if (
    !updateCardAfterTopup(
      cashierUID,
      amount,
      after
    )
  )
  {
    showTimedMessage(
      "TOP-UP ERROR",
      "FAILED",
      "",
      ST77XX_RED,
      1200,
      SCREEN_CASHIER
    );

    return;
  }


  // Update local cache
  cashierCard.balance =
    after;


  logTransaction(
    "TOPUP",
    cashierUID,
    cashierCard.name,
    amount,
    before,
    after
  );


  drawHeader(
    "TOP-UP"
  );


  tft.setTextColor(
    ST77XX_GREEN
  );


  tft.setTextSize(2);


  tft.setCursor(
    20,
    52
  );


  tft.print(
    "SUCCESS"
  );


  tft.setTextSize(1);

  tft.setTextColor(
    ST77XX_WHITE
  );


  tft.setCursor(
    20,
    90
  );


  tft.print(
    "Added: "
  );


  tft.print(
    formatMoney(
      amount
    )
  );


  tft.setCursor(
    20,
    118
  );


  tft.print(
    "Balance: "
  );


  tft.setTextColor(
    ST77XX_GREEN
  );


  tft.print(
    formatMoney(
      after
    )
  );


  screenState =
    SCREEN_MESSAGE;


  messageActive =
    true;


  messageStartTime =
    millis();


  messageDuration =
    1200;


  messageReturnScreen =
    SCREEN_CASHIER;
}


// =====================================================
// RFID
// =====================================================

void handleRFID()
{
  // Do not scan while showing messages
  if (
    messageActive
  )
  {
    return;
  }


  if (
    !mfrc522
      .PICC_IsNewCardPresent()
  )
  {
    return;
  }


  if (
    !mfrc522
      .PICC_ReadCardSerial()
  )
  {
    return;
  }


  String uid =
    uidToHex(
      mfrc522.uid
    );


  unsigned long now =
    millis();


  if (
    uid ==
      lastUID &&
    now -
      lastScanTime <
      SAME_CARD_COOLDOWN
  )
  {
    mfrc522.PICC_HaltA();

    mfrc522.PCD_StopCrypto1();

    return;
  }


  lastUID =
    uid;


  lastScanTime =
    now;


  if (
    screenState ==
    SCREEN_GAME
  )
  {
    processGame(
      uid
    );
  }


  else if (
    screenState ==
      SCREEN_CASHIER ||
    screenState ==
      SCREEN_CASHIER_CARD
  )
  {
    processCashier(
      uid
    );
  }


  mfrc522.PICC_HaltA();

  mfrc522.PCD_StopCrypto1();
}


// =====================================================
// LEFT
// =====================================================

void leftAction()
{
  if (
    messageActive
  )
  {
    return;
  }


  if (
    screenState ==
    SCREEN_MODE_SELECT
  )
  {
    if (
      currentMode ==
      MODE_GAME
    )
    {
      currentMode =
        MODE_CASHIER;
    }

    else
    {
      currentMode =
        (Mode)(
          currentMode - 1
        );
    }


    showModeSelect();
  }


  else if (
    screenState ==
    SCREEN_CASHIER_CARD
  )
  {
    topupAmount -=
      TOPUP_STEP;


    if (
      topupAmount <
      MIN_TOPUP
    )
    {
      topupAmount =
        MIN_TOPUP;
    }


    showCashierCard();
  }


  else if (
    screenState ==
    SCREEN_NEW_CARD
  )
  {
    pendingNewUID =
      "";


    showCashierScreen();
  }
}


// =====================================================
// RIGHT
// =====================================================

void rightAction()
{
  if (
    messageActive
  )
  {
    return;
  }


  if (
    screenState ==
    SCREEN_MODE_SELECT
  )
  {
    if (
      currentMode ==
      MODE_CASHIER
    )
    {
      currentMode =
        MODE_GAME;
    }

    else
    {
      currentMode =
        (Mode)(
          currentMode + 1
        );
    }


    showModeSelect();
  }


  else if (
    screenState ==
    SCREEN_CASHIER_CARD
  )
  {
    topupAmount +=
      TOPUP_STEP;


    if (
      topupAmount >
      MAX_TOPUP
    )
    {
      topupAmount =
        MAX_TOPUP;
    }


    showCashierCard();
  }
}


// =====================================================
// OK
// =====================================================

void okAction()
{
  if (
    messageActive
  )
  {
    return;
  }


  if (
    screenState ==
    SCREEN_MODE_SELECT
  )
  {
    if (
      currentMode ==
      MODE_GAME
    )
    {
      showGameScreen();
    }


    else if (
      currentMode ==
      MODE_MAINTENANCE
    )
    {
      showMaintenanceScreen();
    }


    else
    {
      showCashierScreen();
    }
  }


  else if (
    screenState ==
      SCREEN_GAME ||
    screenState ==
      SCREEN_MAINTENANCE ||
    screenState ==
      SCREEN_CASHIER
  )
  {
    showModeSelect();
  }


  else if (
    screenState ==
    SCREEN_CASHIER_CARD
  )
  {
    topupFirebaseCard();
  }


  else if (
    screenState ==
    SCREEN_NEW_CARD
  )
  {
    createNewCard();
  }
}


// =====================================================
// BUTTONS
// =====================================================

void handleButtons()
{
  unsigned long now =
    millis();


  // LEFT
  bool l =
    digitalRead(
      BTN_LEFT
    );


  if (
    l !=
    leftLastReading
  )
  {
    leftDebounceTime =
      now;

    leftLastReading =
      l;
  }


  if (
    now -
      leftDebounceTime >
      DEBOUNCE_TIME
  )
  {
    if (
      l !=
      leftStableState
    )
    {
      leftStableState =
        l;


      if (
        l == LOW
      )
      {
        leftAction();
      }
    }
  }


  // OK
  bool o =
    digitalRead(
      BTN_OK
    );


  if (
    o !=
    okLastReading
  )
  {
    okDebounceTime =
      now;

    okLastReading =
      o;
  }


  if (
    now -
      okDebounceTime >
      DEBOUNCE_TIME
  )
  {
    if (
      o !=
      okStableState
    )
    {
      okStableState =
        o;


      if (
        o == LOW
      )
      {
        okAction();
      }
    }
  }


  // RIGHT
  bool r =
    digitalRead(
      BTN_RIGHT
    );


  if (
    r !=
    rightLastReading
  )
  {
    rightDebounceTime =
      now;

    rightLastReading =
      r;
  }


  if (
    now -
      rightDebounceTime >
      DEBOUNCE_TIME
  )
  {
    if (
      r !=
      rightStableState
    )
    {
      rightStableState =
        r;


      if (
        r == LOW
      )
      {
        rightAction();
      }
    }
  }
}


// =====================================================
// SETUP
// =====================================================

void setup()
{
  Serial.begin(
    115200
  );


  delay(
    200
  );


  pinMode(
    BTN_LEFT,
    INPUT_PULLUP
  );


  pinMode(
    BTN_OK,
    INPUT_PULLUP
  );


  pinMode(
    BTN_RIGHT,
    INPUT_PULLUP
  );


  SPI.begin(
    PIN_SCK,
    PIN_MISO,
    PIN_MOSI
  );


  pinMode(
    TFT_BLK,
    OUTPUT
  );


  digitalWrite(
    TFT_BLK,
    HIGH
  );


  tft.init(
    172,
    320
  );


  tft.setRotation(
    1
  );


  tft.setTextWrap(
    false
  );


  drawHeader(
    "STARTING"
  );


  connectWiFi();


  if (
    WiFi.status() ==
    WL_CONNECTED
  )
  {
    initializeTime();
  }


  initializeFirebase();


  delay(
    300
  );


  mfrc522.PCD_Init();


  delay(
    50
  );


  registerDeviceFirebase();


  currentMode =
    MODE_GAME;


  showModeSelect();


  Serial.println(
    "SYSTEM READY"
  );
}


// =====================================================
// LOOP
// =====================================================

void loop()
{
  app.loop();


  // reconnect without long blocking
  static unsigned long lastReconnect =
    0;


  if (
    WiFi.status() !=
      WL_CONNECTED &&
    millis() -
      lastReconnect >
      5000
  )
  {
    lastReconnect =
      millis();

    WiFi.reconnect();
  }


  handleMessageTimer();


  updateHeartbeat();


  handleButtons();


  handleRFID();


  delay(
    1
  );
}