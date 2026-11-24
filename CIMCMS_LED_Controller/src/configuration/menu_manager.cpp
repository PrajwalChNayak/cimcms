
#include "configuration/menu_manager.h"
#include "hardware/oled.h"
#include "hardware/rtc.h"
#include "configuration/wifi_manager.h"
#include "configuration/wifi_scanner.h"
#include "scheduling/rtc_sync.h"
#include "scheduling/schedule_manager.h"
#include "communication/mqtt_manager.h"
#include "controller/operating_mode.h"
#include "config.h"

namespace {
bool menuOpen = false;
uint8_t selected = 1;

void showMenu() {
    OLED::showMessage(
        "1 RTC 2 WIFI 3 INFO",
        "4 START 5 STOP 6-8 TIME"
    );
}
}

namespace MenuManager {

void begin() {
    menuOpen = false;
    selected = 1;
}

void open() {
    menuOpen = true;
    selected = 1;
    showMenu();
}

void processKey(char key) {

    if (!menuOpen) return;

    if (key == '*') {
        menuOpen = false;
        OLED::showMessage(
            "MENU CLOSED",
            "Returning to status"
        );
        return;
    }

    if (key >= '1' && key <= '8') {
        selected = static_cast<uint8_t>(key - '0');

        switch (selected) {
            case 1:
                OLED::showMessage(
                    "1 RTC SYNC NOW",
                    "Press # to execute"
                );
                break;

            case 2:
                OLED::showMessage(
                    "2 WIFI SCAN",
                    "Press # to scan"
                );
                break;

            case 3:
                OLED::showMessage(
                    "3 SYSTEM INFO",
                    "Press # to view"
                );
                break;

            case 4:
                OLED::showMessage(
                    "4 START AUTO TEST",
                    "R1-R4 x 5 cycles"
                );
                break;

            case 5:
                OLED::showMessage(
                    "5 STOP AUTO TEST",
                    "Press # to confirm"
                );
                break;

            case 6:
                OLED::showMessage(
                    "6 TEST 10s ON/OFF",
                    "5 cycles - press #"
                );
                break;

            case 7:
                OLED::showMessage(
                    "7 TEST 30s ON/OFF",
                    "5 cycles - press #"
                );
                break;

            case 8:
                OLED::showMessage(
                    "8 TEST 60s ON/OFF",
                    "5 cycles - press #"
                );
                break;
        }

        return;
    }

    if (key != '#') return;

    menuOpen = false;

    if (selected == 1) {

        OLED::showMessage(
            "RTC SYNC",
            "Connecting to NTP..."
        );

        const bool ok = RTCSync::syncNow();

        OLED::showMessage(
            ok ? "RTC SYNC SUCCESS" : "RTC SYNC FAILED",
            ok ? "DS3231 checked" : "Check WiFi/RTC"
        );

    } else if (selected == 2) {

        OLED::showMessage(
            "WIFI SCANNING",
            "Please wait..."
        );

        WiFiScanner::Network networks[10];

        const int count =
            WiFiScanner::scan(networks, 10);

        if (count > 0) {

            Serial.printf(
                "Wi-Fi scan: %d networks\n",
                count
            );

            for (int i = 0; i < count; ++i) {

                Serial.printf(
                    "%s | %ld dBm | %s | CH %ld\n",
                    networks[i].ssid.c_str(),
                    (long)networks[i].rssi,
                    WiFiScanner::quality(
                        networks[i].rssi
                    ).c_str(),
                    (long)networks[i].channel
                );
            }

            OLED::showMessage(
                networks[0].ssid.c_str(),
                (
                    String(networks[0].rssi) +
                    " dBm " +
                    WiFiScanner::quality(
                        networks[0].rssi
                    )
                ).c_str()
            );

        } else {

            OLED::showMessage(
                "NO WIFI NETWORKS",
                "Check antenna/range"
            );
        }

    } else if (selected == 3) {

        OLED::showMessage(
            WiFiManagerCIMCMS::statusText().c_str(),
            (
                WiFiManagerCIMCMS::ipAddress() +
                " MQTT " +
                (
                    MQTTManager::connected()
                    ? "OK"
                    : "OFF"
                )
            ).c_str()
        );

    } else if (selected == 4) {

        if (ScheduleManager::startAutoTest()) {

            OLED::showMessage(
                "AUTO TEST STARTED",
                "R1-R4 / 5 cycles"
            );

        } else {

            OLED::showMessage(
                "AUTO TEST ACTIVE",
                "Already running"
            );
        }

    } else if (selected == 5) {

        ScheduleManager::stopAutoTest();

    } else if (selected >= 6 && selected <= 8) {

        const uint32_t duration =
            selected == 6 ? 10000UL :
            selected == 7 ? 30000UL :
                            60000UL;

        const bool ok =
            ScheduleManager::configureAutoTest(
                duration,
                duration,
                5
            );

        OLED::showMessage(
            ok ? "TEST TIME SAVED" : "SAVE FAILED",
            selected == 6 ? "10s ON / 10s OFF" :
            selected == 7 ? "30s ON / 30s OFF" :
                            "60s ON / 60s OFF"
        );
    }
}

bool isMenuOpen() {
    return menuOpen;
}

}
