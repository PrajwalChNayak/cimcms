
#include <Wire.h>

#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#include "hardware/oled.h"
#include "device_config.h"

namespace {

Adafruit_SSD1306 screen(
    Devices::OLED_WIDTH,
    Devices::OLED_HEIGHT,
    &Wire,
    -1
);

bool ready = false;

void printLine(uint8_t y, const String &value) {

    screen.setCursor(0, y);

    screen.print(value);

}


}

namespace OLED {

bool begin() {

    ready = screen.begin(
        SSD1306_SWITCHCAPVCC,
        Devices::OLED
    );

    if (ready) {

        screen.clearDisplay();

        screen.setTextColor(SSD1306_WHITE);

        screen.setTextSize(1);

        screen.display();

    }

    return ready;
}

bool isReady() {
    return ready;
}

void showBoot(const char *message) {

    if (!ready) return;

    screen.clearDisplay();

    screen.setTextSize(1);

    printLine(0, "CIMCMS LED CONTROLLER");

    printLine(20, message);

    screen.display();

}

void showMessage(
    const char *line1,
    const char *line2
) {

    if (!ready) return;

    screen.clearDisplay();

    screen.setTextSize(1);

    printLine(0, "CIMCMS LED CONTROLLER");

    printLine(22, line1);

    printLine(38, line2);

    screen.display();

}

void showStatus(
    char lastKey,
    const char *mode,
    int selectedRelay,
    const char *relayStatus,
    const char *clockText,
    bool keypadOK,
    bool oddRelayOK,
    bool evenRelayOK
) {

    if (!ready) return;

    screen.clearDisplay();

    screen.setTextSize(1);

    printLine(0, "CIMCMS LED CTRL V0.1");

    printLine(12, String("MODE: ") + mode);

    printLine(
        22,
        String("KEY: ") + (lastKey ? lastKey : '-')
    );

    printLine(
        32,
        String("SELECT: ") +
        (selectedRelay ? String(selectedRelay) : "--") +
        " " + relayStatus
    );

    printLine(
        42,
        String("KP:") + (keypadOK ? "OK" : "ERR") +
        " ODD:" + (oddRelayOK ? "OK" : "ERR") +
        " EVEN:" + (evenRelayOK ? "OK" : "ERR")
    );

    printLine(54, clockText);

    screen.display();

}

void showDashboard(
    const char *mode,
    const char *clockText,
    const char *wifiText,
    const char *ipText,
    int32_t rssi,
    const char *mqttText,
    const char *relaySummary,
    const char *systemText
) {
    if (!ready) return;
    static uint8_t page = 0;
    static uint32_t lastPage = 0;
    if (millis() - lastPage >= 4000) {
        page = (page + 1) % 3;
        lastPage = millis();
    }

    screen.clearDisplay();
    screen.setTextSize(1);
    printLine(0, "CIMCMS LED V0.4");

    if (page == 0) {
        printLine(12, String("MODE: ") + mode);
        printLine(23, String("TIME: ") + clockText);
        printLine(34, String("WIFI: ") + wifiText);
        printLine(45, String("IP: ") + ipText);
        printLine(56, String("RSSI: ") + String(rssi) + " dBm");
    } else if (page == 1) {
        printLine(12, String("MQTT: ") + mqttText);
        printLine(25, String("RELAYS: ") + relaySummary);
        printLine(40, String("SYSTEM: ") + systemText);
        printLine(54, "SIMULATION / LOGIC");
    } else {
        printLine(12, String("RTC: ") + clockText);
        printLine(25, String("WIFI: ") + wifiText);
        printLine(38, String("MQTT: ") + mqttText);
        printLine(52, "A# MAN B# MAINT");
    }
    screen.display();
}

}
