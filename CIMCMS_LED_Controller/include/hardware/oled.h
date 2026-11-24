
#pragma once

#include <Arduino.h>

namespace OLED {

bool begin();

void showBoot(const char *message);

void showStatus(
    char lastKey,
    const char *mode,
    int selectedRelay,
    const char *relayStatus,
    const char *clockText,
    bool keypadOK,
    bool oddRelayOK,
    bool evenRelayOK
);

void showMessage(
    const char *line1,
    const char *line2
);

void showDashboard(
    const char *mode,
    const char *clockText,
    const char *wifiText,
    const char *ipText,
    int32_t rssi,
    const char *mqttText,
    const char *relaySummary,
    const char *systemText
);

bool isReady();

}
