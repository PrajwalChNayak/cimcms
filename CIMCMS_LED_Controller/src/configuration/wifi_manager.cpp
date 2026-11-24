#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>

#include "configuration/wifi_manager.h"
#include "configuration/wifi_scanner.h"

namespace {

constexpr char AP_SSID[] = "CIMCMS_LED_Controller";
constexpr char AP_PASSWORD[] = "CIMCMS123"; // Change before deployment.
constexpr uint16_t DNS_PORT = 53;
constexpr uint32_t RECONNECT_INTERVAL_MS = 10000;
constexpr uint32_t PORTAL_IDLE_TIMEOUT_MS = 600000; // 10 minutes

WebServer server(80);
DNSServer dnsServer;
Preferences preferences;
WiFiManagerCIMCMS::Settings settings{};

bool serverStarted = false;
bool dnsStarted = false;
bool portalRunning = false;
bool wifiConnecting = false;
uint32_t lastReconnectAttempt = 0;
uint32_t portalStartedAt = 0;

String htmlEscape(const String &input) {
    String out = input;
    out.replace("&", "&amp;");
    out.replace("<", "&lt;");
    out.replace(">", "&gt;");
    out.replace("\"", "&quot;");
    out.replace("'", "&#39;");
    return out;
}

String pageStart(const String &title) {
    String page;
    page.reserve(4500);
    page += F("<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>");
    page += F("<title>CIMCMS LED Controller</title><style>");
    page += F("body{font-family:Arial,sans-serif;background:#f3f5f7;color:#20242a;margin:0;padding:16px}");
    page += F("main{max-width:760px;margin:auto;background:white;padding:20px;border-radius:14px;box-shadow:0 2px 12px #0001}");
    page += F("h1{font-size:22px}h2{font-size:18px;margin-top:24px;color:#24415f}");
    page += F("label{display:block;font-weight:600;margin:12px 0 5px}input,select{box-sizing:border-box;width:100%;padding:11px;border:1px solid #cbd2da;border-radius:7px;font-size:16px}");
    page += F("button,.btn{display:inline-block;background:#145da0;color:white;border:0;padding:12px 18px;border-radius:8px;margin-top:16px;text-decoration:none;font-size:15px}");
    page += F(".muted{color:#64748b;font-size:13px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.danger{background:#a32626}.relay{border:1px solid #e1e6eb;border-radius:8px;padding:10px;margin:8px 0}");
    page += F("</style></head><body><main><h1>CIMCMS LED Controller</h1>");
    page += "<p class='muted'>" + title + "</p>";
    return page;
}

void handleRoot() {
    String page = pageStart("Device configuration portal");
    page += F("<p><b>Wi-Fi status:</b> ");
    page += WiFi.status() == WL_CONNECTED ? F("Connected") : F("Not connected");
    page += F("<br><b>Device IP:</b> ");
    page += WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : String("192.168.4.1");
    page += F("<br><b>Setup hotspot:</b> CIMCMS_LED_Controller</p>");
    page += F("<form method='POST' action='/save'>");
    page += R"HTML(<h2>Nearby Wi-Fi networks</h2>
<button type="button" onclick="scanWifi()">Scan nearby networks</button>
<div id="scanResults" class="muted">Scan to list SSID, signal strength and security.</div>
<script>
async function scanWifi() {
  const box = document.getElementById('scanResults');
  box.textContent = 'Scanning...';
  try {
    const response = await fetch('/scan');
    const networks = await response.json();
    box.replaceChildren();
    networks.forEach(n => {
      const row = document.createElement('p');
      const label = document.createElement('span');
      label.textContent = n.ssid + ' | ' + n.rssi + ' dBm | ' + n.quality + ' | ' + n.security;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Select';
      button.onclick = () => { document.querySelector('[name=ssid]').value = n.ssid; };
      row.append(label, button);
      box.append(row);
    });
    if (!networks.length) box.textContent = 'No networks found';
  } catch (error) {
    box.textContent = 'Wi-Fi scan failed';
  }
}
</script>)HTML";
    page += F("<h2>Wi-Fi network</h2><label>Wi-Fi SSID</label><input name='ssid' maxlength='32' value='");
    page += htmlEscape(String(settings.wifiSSID));
    page += F("' required><label>Wi-Fi password</label><input type='password' name='wpass' maxlength='64' placeholder='Leave blank to keep current password'>");
    page += F("<h2>MQTT server</h2><label>Broker host / IP</label><input name='host' maxlength='63' value='");
    page += htmlEscape(String(settings.mqttHost));
    page += F("'><div class='grid'><div><label>Port</label><input type='number' name='port' min='1' max='65535' value='");
    page += String(settings.mqttPort);
    page += F("'></div><div><label>Device ID</label><input name='device' maxlength='32' value='");
    page += htmlEscape(String(settings.deviceId));
    page += F("'></div></div><label>MQTT username</label><input name='muser' maxlength='32' value='");
    page += htmlEscape(String(settings.mqttUser));
    page += F("'><label>MQTT password</label><input type='password' name='mpass' maxlength='64' placeholder='Leave blank to keep current password'>");
    page += F("<h2>Lighting default</h2><label>Default ON duration (minutes; 0 = no automatic timeout)</label><input type='number' name='duration' min='0' max='65535' value='");
    page += String(settings.defaultDurationMinutes);
    page += F("'><h2>Relay room assignment</h2><p class='muted'>Assign each of the 16 relay channels to Room 1–5.</p>");
    for (uint8_t i = 0; i < 16; ++i) {
        page += F("<div class='relay'><label>Relay ");
        page += String(i + 1);
        page += F(" – Room</label><select name='r");
        page += String(i + 1);
        page += F("'>");
        for (uint8_t room = 1; room <= 5; ++room) {
            page += F("<option value='");
            page += String(room);
            page += F("'");
            if (settings.relayRoom[i] == room) page += F(" selected");
            page += F(">Room ");
            page += String(room);
            page += F("</option>");
        }
        page += F("</select></div>");
    }
    page += F("<button type='submit'>Save configuration</button></form>");
    page += F("<h2>Wi-Fi recovery</h2><p class='muted'>Reset clears the saved Wi-Fi network only. MQTT, relay and room settings are retained.</p>");
    page += F("<form method='POST' action='/resetwifi'><button class='danger' type='submit'>Reset saved Wi-Fi</button></form>");
    page += F("<p><a class='btn' href='/status'>View device status</a></p>");
    page += F("</main></body></html>");
    server.send(200, "text/html", page);
}

void handleScan() {
    WiFiScanner::Network networks[20];
    const int count = WiFiScanner::scan(networks, 20);
    String json = "[";
    for (int i = 0; i < count; ++i) {
        if (i) json += ",";
        String security = networks[i].encryption == WIFI_AUTH_OPEN ? "Open" : "Secured";
        json += "{\"ssid\":\"";
        String safe = networks[i].ssid;
        safe.replace("\\", "\\\\"); safe.replace("\"", "\\\"");
        json += safe + "\",\"rssi\":" + String(networks[i].rssi);
        json += ",\"quality\":\"" + WiFiScanner::quality(networks[i].rssi) + "\"";
        json += ",\"security\":\"" + security + "\"}";
    }
    json += "]";
    server.send(200, "application/json", json);
}

void handleSave() {
    if (server.hasArg("ssid")) strlcpy(settings.wifiSSID, server.arg("ssid").c_str(), sizeof(settings.wifiSSID));
    if (server.hasArg("wpass") && server.arg("wpass").length()) strlcpy(settings.wifiPassword, server.arg("wpass").c_str(), sizeof(settings.wifiPassword));
    if (server.hasArg("host")) strlcpy(settings.mqttHost, server.arg("host").c_str(), sizeof(settings.mqttHost));
    if (server.hasArg("port")) settings.mqttPort = static_cast<uint16_t>(constrain(server.arg("port").toInt(), 1, 65535));
    if (server.hasArg("device")) strlcpy(settings.deviceId, server.arg("device").c_str(), sizeof(settings.deviceId));
    if (server.hasArg("muser")) strlcpy(settings.mqttUser, server.arg("muser").c_str(), sizeof(settings.mqttUser));
    if (server.hasArg("mpass") && server.arg("mpass").length()) strlcpy(settings.mqttPassword, server.arg("mpass").c_str(), sizeof(settings.mqttPassword));
    if (server.hasArg("duration")) settings.defaultDurationMinutes = static_cast<uint16_t>(constrain(server.arg("duration").toInt(), 0, 65535));

    for (uint8_t i = 0; i < 16; ++i) {
        String argName = "r" + String(i + 1);
        if (server.hasArg(argName)) settings.relayRoom[i] = static_cast<uint8_t>(constrain(server.arg(argName).toInt(), 1, 5));
    }

    preferences.begin("ledcfg", false);
    preferences.putString("ssid", settings.wifiSSID);
    preferences.putString("wpass", settings.wifiPassword);
    preferences.putString("mqttHost", settings.mqttHost);
    preferences.putUShort("mqttPort", settings.mqttPort);
    preferences.putString("mqttUser", settings.mqttUser);
    preferences.putString("mqttPass", settings.mqttPassword);
    preferences.putString("deviceId", settings.deviceId);
    preferences.putUShort("duration", settings.defaultDurationMinutes);
    preferences.putBytes("rooms", settings.relayRoom, sizeof(settings.relayRoom));
    preferences.end();

    String response = pageStart("Configuration saved");
    response += F("<h2>Settings saved</h2><p>Your configuration is stored in ESP32 NVS.</p><p>The controller is now attempting to connect to the selected Wi-Fi network. The setup hotspot will remain available temporarily.</p><a class='btn' href='/'>Return to configuration</a></main></body></html>");
    server.send(200, "text/html", response);

    if (settings.wifiSSID[0] != '\0') {
        WiFi.begin(settings.wifiSSID, settings.wifiPassword);
        wifiConnecting = true;
    }
}

void handleResetWiFi() {
    preferences.begin("ledcfg", false);
    preferences.remove("ssid");
    preferences.remove("wpass");
    preferences.end();
    settings.wifiSSID[0] = '\0';
    settings.wifiPassword[0] = '\0';
    WiFi.disconnect(false, true);
    String response = pageStart("Wi-Fi credentials reset");
    response += F("<h2>Saved Wi-Fi credentials cleared</h2><p>Other settings were retained. The setup hotspot remains active.</p><a class='btn' href='/'>Return</a></main></body></html>");
    server.send(200, "text/html", response);
}

void handleStatus() {
    String json = "{\"connected\":";
    json += WiFi.status() == WL_CONNECTED ? "true" : "false";
    json += ",\"ssid\":\"" + htmlEscape(WiFi.status() == WL_CONNECTED ? WiFi.SSID() : String(settings.wifiSSID)) + "\"";
    json += ",\"ip\":\"" + (WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : WiFi.softAPIP().toString()) + "\"";
    json += ",\"rssi\":" + String(WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0);
    json += ",\"portal\":" + String(portalRunning ? "true" : "false");
    json += "}";
    server.send(200, "application/json", json);
}

void loadSettings() {
    memset(&settings, 0, sizeof(settings));
    settings.mqttPort = 1883;
    strlcpy(settings.deviceId, "CIMCMS_LED_01", sizeof(settings.deviceId));
    settings.defaultDurationMinutes = 0;
    for (uint8_t i = 0; i < 16; ++i) settings.relayRoom[i] = (i < 4) ? 1 : (i < 7) ? 2 : (i < 10) ? 3 : (i < 13) ? 4 : 5;

    preferences.begin("ledcfg", true);
    String value = preferences.getString("ssid", ""); strlcpy(settings.wifiSSID, value.c_str(), sizeof(settings.wifiSSID));
    value = preferences.getString("wpass", ""); strlcpy(settings.wifiPassword, value.c_str(), sizeof(settings.wifiPassword));
    value = preferences.getString("mqttHost", ""); strlcpy(settings.mqttHost, value.c_str(), sizeof(settings.mqttHost));
    settings.mqttPort = preferences.getUShort("mqttPort", 1883);
    value = preferences.getString("mqttUser", ""); strlcpy(settings.mqttUser, value.c_str(), sizeof(settings.mqttUser));
    value = preferences.getString("mqttPass", ""); strlcpy(settings.mqttPassword, value.c_str(), sizeof(settings.mqttPassword));
    value = preferences.getString("deviceId", "CIMCMS_LED_01"); strlcpy(settings.deviceId, value.c_str(), sizeof(settings.deviceId));
    settings.defaultDurationMinutes = preferences.getUShort("duration", 0);
    preferences.getBytes("rooms", settings.relayRoom, sizeof(settings.relayRoom));
    preferences.end();
}

void startServer() {
    if (serverStarted) return;
    server.on("/", HTTP_GET, handleRoot);
    server.on("/save", HTTP_POST, handleSave);
    server.on("/resetwifi", HTTP_POST, handleResetWiFi);
    server.on("/status", HTTP_GET, handleStatus);
    server.on("/scan", HTTP_GET, handleScan);
    server.onNotFound([]() {
        if (portalRunning) {
            server.sendHeader("Location", String("http://") + WiFi.softAPIP().toString() + "/", true);
            server.send(302, "text/plain", "");
        } else {
            server.send(404, "text/plain", "Not found");
        }
    });
    server.begin();
    serverStarted = true;
}

}

namespace WiFiManagerCIMCMS {

void begin() {
    loadSettings();
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    if (settings.wifiSSID[0] != '\0') {
        WiFi.begin(settings.wifiSSID, settings.wifiPassword);
        wifiConnecting = true;
        Serial.printf("Wi-Fi: connecting to saved network '%s'\n", settings.wifiSSID);
    } else {
        Serial.println("Wi-Fi: no saved credentials; local control remains available.");
    }
}

void loop() {
    if (portalRunning) {
        if (dnsStarted) dnsServer.processNextRequest();
        if (serverStarted) server.handleClient();
        if (millis() - portalStartedAt > PORTAL_IDLE_TIMEOUT_MS) {
            stopSetupPortal();
        }
    }

    if (WiFi.status() != WL_CONNECTED && settings.wifiSSID[0] != '\0' && !portalRunning) {
        if (millis() - lastReconnectAttempt >= RECONNECT_INTERVAL_MS) {
            lastReconnectAttempt = millis();
            WiFi.reconnect();
        }
    }
}

bool connected() { return WiFi.status() == WL_CONNECTED; }
bool portalActive() { return portalRunning; }

bool startSetupPortal() {
    if (portalRunning) return true;
    WiFi.mode(WIFI_AP_STA);
    WiFi.setAutoReconnect(true);
    if (!WiFi.softAP(AP_SSID, AP_PASSWORD)) {
        Serial.println("ERROR: unable to start LED setup hotspot.");
        return false;
    }
    dnsServer.start(DNS_PORT, "*", WiFi.softAPIP());
    dnsStarted = true;
    portalRunning = true;
    portalStartedAt = millis();
    startServer();
    Serial.println("LED setup hotspot started.");
    Serial.printf("SSID: %s\nPassword: %s\nPortal: http://%s\n", AP_SSID, AP_PASSWORD, WiFi.softAPIP().toString().c_str());
    return true;
}

void stopSetupPortal() {
    if (!portalRunning) return;
    dnsServer.stop();
    dnsStarted = false;
    WiFi.softAPdisconnect(true);
    portalRunning = false;
    if (WiFi.status() == WL_CONNECTED) WiFi.mode(WIFI_STA);
    Serial.println("LED setup hotspot stopped.");
}

bool resetWiFiCredentials() {
    preferences.begin("ledcfg", false);
    preferences.remove("ssid");
    preferences.remove("wpass");
    preferences.end();
    settings.wifiSSID[0] = '\0';
    settings.wifiPassword[0] = '\0';
    WiFi.disconnect(false, true);
    return true;
}

String statusText() {
    if (portalRunning) return "SETUP HOTSPOT";
    if (connected()) return "WIFI CONNECTED";
    return settings.wifiSSID[0] ? "WIFI DISCONNECTED" : "WIFI NOT CONFIGURED";
}

int32_t rssi() { return connected() ? WiFi.RSSI() : 0; }
String ssid() { return connected() ? WiFi.SSID() : String(""); }

String ipAddress() {
    if (portalRunning) return WiFi.softAPIP().toString();
    if (connected()) return WiFi.localIP().toString();
    return "NO IP";
}

bool getSettings(Settings &value) {
    value = settings;
    return true;
}

}
