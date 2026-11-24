#pragma once

#include <Arduino.h>

namespace WiFiManagerCIMCMS {

struct Settings {
    char wifiSSID[33];
    char wifiPassword[65];
    char mqttHost[64];
    uint16_t mqttPort;
    char mqttUser[33];
    char mqttPassword[65];
    char deviceId[33];
    uint16_t defaultDurationMinutes;
    uint8_t relayRoom[16];
};

void begin();
void loop();
bool connected();
bool portalActive();
bool startSetupPortal();
void stopSetupPortal();
bool resetWiFiCredentials();
String statusText();
String ipAddress();
int32_t rssi();
String ssid();
bool getSettings(Settings &settings);

}