
#include <Arduino.h>

#include "rtos/watchdog.h"

namespace WatchdogManager {

void begin() {

    // Watchdog configuration will be introduced
    // after the application loop is validated.

}

void feed() {

    yield();

}

}
