
#pragma once

#include <Arduino.h>
#include <RTClib.h>

namespace RTCDevice {

bool begin();

bool isReady();

bool lostPower();

bool getDateTime(
    DateTime &value
);

bool setDateTime(
    const DateTime &value
);

String timeString();

}
