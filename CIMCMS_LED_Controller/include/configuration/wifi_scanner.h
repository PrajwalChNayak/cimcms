#pragma once
#include <Arduino.h>

namespace WiFiScanner {
struct Network {
    String ssid;
    int32_t rssi;
    uint8_t encryption;
    int32_t channel;
};
int scan(Network *results, int capacity);
String quality(int32_t rssi);
}
