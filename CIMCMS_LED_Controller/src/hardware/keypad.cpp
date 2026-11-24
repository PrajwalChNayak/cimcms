
#include <Wire.h>

#include "hardware/keypad.h"
#include "hardware/pcf8574.h"
#include "device_config.h"
#include "config.h"

namespace {

const char keyMap[4][4] = {

    {'1', '2', '3', 'A'},
    {'4', '5', '6', 'B'},
    {'7', '8', '9', 'C'},
    {'*', '0', '#', 'D'}

};

bool ready = false;

char lastRaw = 0;
char stableKey = 0;

uint32_t changedAt = 0;

bool reported = false;

char scanRaw() {

    for (uint8_t row = 0; row < 4; row++) {

        uint8_t pattern =
            (uint8_t)(0xFFU & ~(1U << row));

        if (!PCF8574::write(
                Devices::KEYPAD_PCF,
                pattern
            )) {

            return 0;
        }

        delayMicroseconds(800);

        uint8_t value;

        if (!PCF8574::read(
                Devices::KEYPAD_PCF,
                value
            )) {

            return 0;
        }

        for (uint8_t col = 0; col < 4; col++) {

            uint8_t pin = 4 + col;

            if (!(value & (1U << pin))) {

                return keyMap[row][col];

            }
        }
    }

    PCF8574::write(
        Devices::KEYPAD_PCF,
        0xFF
    );

    return 0;
}

}

namespace Keypad {

bool begin() {

    ready = PCF8574::begin(
        Devices::KEYPAD_PCF,
        0xFF
    );

    lastRaw = 0;
    stableKey = 0;
    reported = false;

    changedAt = millis();

    return ready;
}

bool isReady() {
    return ready;
}

char readKey() {

    if (!ready) {
        return 0;
    }

    char raw = scanRaw();

    if (raw != lastRaw) {

        lastRaw = raw;
        changedAt = millis();

    }

    if (millis() - changedAt >= KEYPAD_DEBOUNCE_MS &&
        raw != stableKey) {

        stableKey = raw;

        if (stableKey && !reported) {

            reported = true;

            return stableKey;

        }

        if (!stableKey) {

            reported = false;

        }
    }

    return 0;
}

}
