
#include <Wire.h>
#include "hardware/pcf8574.h"

namespace PCF8574 {

bool present(uint8_t address) {

    Wire.beginTransmission(address);

    return Wire.endTransmission() == 0;
}

bool write(uint8_t address, uint8_t value) {

    Wire.beginTransmission(address);

    Wire.write(value);

    return Wire.endTransmission() == 0;
}

bool read(uint8_t address, uint8_t &value) {

    if (Wire.requestFrom(address, (uint8_t)1) != 1) {
        return false;
    }

    value = Wire.read();

    return true;
}

bool begin(uint8_t address, uint8_t initialValue) {

    return present(address) &&
           write(address, initialValue);
}

}
