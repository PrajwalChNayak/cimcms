#include <WiFi.h>
#include "configuration/wifi_scanner.h"

namespace WiFiScanner {
int scan(Network *results, int capacity) {
    if (!results || capacity <= 0) return 0;
    const int count = WiFi.scanNetworks(false, true);
    if (count <= 0) {
        WiFi.scanDelete();
        return count;
    }
    const int copied = count < capacity ? count : capacity;
    for (int i = 0; i < copied; ++i) {
        results[i].ssid = WiFi.SSID(i);
        results[i].rssi = WiFi.RSSI(i);
        results[i].encryption = static_cast<uint8_t>(WiFi.encryptionType(i));
        results[i].channel = WiFi.channel(i);
    }
    WiFi.scanDelete();
    return copied;
}
String quality(int32_t rssi) {
    if (rssi >= -50) return "Excellent";
    if (rssi >= -60) return "Very good";
    if (rssi >= -70) return "Good";
    if (rssi >= -80) return "Weak";
    return "Very weak";
}
}
