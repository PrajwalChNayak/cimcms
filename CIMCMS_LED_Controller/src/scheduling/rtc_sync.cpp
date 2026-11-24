#include <Arduino.h>
#include <WiFi.h>
#include <time.h>
#include <Preferences.h>
#include "scheduling/rtc_sync.h"
#include "hardware/rtc.h"

namespace {
constexpr long GMT_OFFSET_SECONDS = 19800; // Asia/Kolkata, UTC+05:30
constexpr uint32_t SYNC_CHECK_INTERVAL_MS = 30000;
constexpr uint32_t CORRECTION_THRESHOLD_SECONDS = 2;

uint32_t lastCheckMs = 0;
bool lastSuccess = false;
String source = "NOT SYNCED";
String lastText = "NEVER";
Preferences prefs;

bool obtainNtpTime(struct tm &info, uint32_t waitMs) {
    if (WiFi.status() != WL_CONNECTED) return false;
    return getLocalTime(&info, waitMs);
}

bool dateMatchesStored(const char *key, const struct tm &info) {
    char date[12];
    snprintf(date, sizeof(date), "%04d-%02d-%02d",
             info.tm_year + 1900, info.tm_mon + 1, info.tm_mday);
    prefs.begin("rtcsync", true);
    String saved = prefs.getString(key, "");
    prefs.end();
    return saved == date;
}

void storeDate(const char *key, const struct tm &info) {
    char date[12];
    snprintf(date, sizeof(date), "%04d-%02d-%02d",
             info.tm_year + 1900, info.tm_mon + 1, info.tm_mday);
    prefs.begin("rtcsync", false);
    prefs.putString(key, date);
    prefs.end();
}
}

namespace RTCSync {
void begin() {
    configTime(GMT_OFFSET_SECONDS, 0, "pool.ntp.org", "time.nist.gov");
    lastSuccess = false;
    prefs.begin("rtcsync", true);
    lastText = prefs.getString("last", "NEVER");
    prefs.end();
}

bool syncNow() {
    struct tm info;
    if (!RTCDevice::isReady() || !obtainNtpTime(info, 8000)) {
        lastSuccess = false;
        return false;
    }

    DateTime ntp(info.tm_year + 1900, info.tm_mon + 1, info.tm_mday,
                 info.tm_hour, info.tm_min, info.tm_sec);
    DateTime rtc;
    if (!RTCDevice::getDateTime(rtc)) {
        lastSuccess = false;
        return false;
    }

    int64_t difference = static_cast<int64_t>(ntp.unixtime()) -
                         static_cast<int64_t>(rtc.unixtime());
    if (difference > CORRECTION_THRESHOLD_SECONDS ||
        difference < -static_cast<int64_t>(CORRECTION_THRESHOLD_SECONDS) ||
        RTCDevice::lostPower()) {
        if (!RTCDevice::setDateTime(ntp)) {
            lastSuccess = false;
            return false;
        }
    }

    lastSuccess = true;
    source = "INTERNET NTP";
    char stamp[24];
    snprintf(stamp, sizeof(stamp), "%02d-%02d-%04d %02d:%02d",
             info.tm_mday, info.tm_mon + 1, info.tm_year + 1900,
             info.tm_hour, info.tm_min);
    lastText = stamp;
    prefs.begin("rtcsync", false);
    prefs.putString("last", lastText);
    prefs.end();
    return true;
}

bool lastSyncSucceeded() { return lastSuccess; }
String lastSyncSource() { return source; }
String lastSyncText() { return lastText; }

void loop() {
    if (millis() - lastCheckMs < SYNC_CHECK_INTERVAL_MS) return;
    lastCheckMs = millis();
    if (WiFi.status() != WL_CONNECTED) return;

    struct tm info;
    if (!obtainNtpTime(info, 10)) return;

    const int minutes = info.tm_hour * 60 + info.tm_min;
    if (minutes >= 1080 && !dateMatchesStored("evening", info)) {
        if (syncNow()) {
            storeDate("evening", info);
            storeDate("morning", info);
        }
    } else if (minutes >= 360 && minutes < 1080 &&
               !dateMatchesStored("morning", info)) {
        if (syncNow()) storeDate("morning", info);
    }
}
}
