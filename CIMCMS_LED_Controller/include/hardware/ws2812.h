#pragma once

#include <Arduino.h>

namespace StatusPixels {

enum class Colour : uint8_t {

    Off,
    Blue,
    Green,
    Red,
    Orange,
    Yellow,
    White,
    Purple

};

bool begin();

void clear();

void setPixel(
    uint8_t index,
    Colour colour
);

void setRelayIndicator(
    uint8_t channel,
    bool on
);

void setRelaySelected(
    uint8_t channel,
    bool selected
);

void setDiagnostic(
    bool keypadOK,
    bool oledOK,
    bool relayOK
);

void show();

}