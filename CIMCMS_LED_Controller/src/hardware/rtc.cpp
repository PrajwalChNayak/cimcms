
#include <Wire.h>

#include "hardware/rtc.h"
#include "device_config.h"

namespace {

RTC_DS3231 rtc;

bool ready = false;
bool powerLost = false;

}

namespace RTCDevice {

bool begin() {

    Wire.beginTransmission(Devices::RTC);

    if (Wire.endTransmission() != 0) {

        ready = false;

        return false;

    }

    ready = rtc.begin();

    if (ready) {

        powerLost = rtc.lostPower();

    }

    return ready;
}

bool isReady() {
    return ready;
}

bool lostPower() {
    return powerLost;
}

bool getDateTime(DateTime &value) {

    if (!ready) {
        return false;
    }

    value = rtc.now();

    return true;
}

bool setDateTime(const DateTime &value) {

    if (!ready) {
        return false;
    }

    rtc.adjust(value);

    powerLost = false;

    return true;
}

String timeString() {

    if (!ready) {
        return "RTC NOT FOUND";
    }

    DateTime now = rtc.now();

    char buffer[24];

    snprintf(
        buffer,
        sizeof(buffer),
        "%02u:%02u:%02u",
        now.hour(),
        now.minute(),
        now.second()
    );

    return String(buffer);
}

}
