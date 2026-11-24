
#pragma once

#include <Arduino.h>

namespace PCF8574 {

bool begin(
    uint8_t address,
    uint8_t initialValue = 0xFF
);

bool write(
    uint8_t address,
    uint8_t value
);

bool read(
    uint8_t address,
    uint8_t &value
);

bool present(
    uint8_t address
);

}
