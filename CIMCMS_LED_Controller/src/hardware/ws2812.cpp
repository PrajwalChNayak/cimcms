#include <Adafruit_NeoPixel.h>

#include "hardware/ws2812.h"
#include "device_config.h"
#include "pin_config.h"

namespace {

Adafruit_NeoPixel strip(
    Devices::WS2812_COUNT,
    Pins::WS2812_DATA,
    NEO_GRB + NEO_KHZ800
);

uint32_t colourValue(StatusPixels::Colour colour) {

    switch (colour) {

        case StatusPixels::Colour::Blue:
            return strip.Color(0, 0, 80);

        case StatusPixels::Colour::Green:
            return strip.Color(0, 80, 0);

        case StatusPixels::Colour::Red:
            return strip.Color(100, 0, 0);

        case StatusPixels::Colour::Orange:
            return strip.Color(100, 35, 0);

        case StatusPixels::Colour::Yellow:
            return strip.Color(80, 50, 0);

        case StatusPixels::Colour::White:
            return strip.Color(60, 60, 60);

        case StatusPixels::Colour::Purple:
            return strip.Color(50, 0, 60);

        case StatusPixels::Colour::Off:
        default:
            return 0;
    }
}

}

namespace StatusPixels {

bool begin() {

    strip.begin();

    strip.setBrightness(
        Devices::WS2812_BRIGHTNESS
    );

    strip.clear();

    strip.show();

    return true;
}

void clear() {
    strip.clear();
}

void setPixel(
    uint8_t index,
    Colour colour
) {

    if (index < Devices::WS2812_COUNT) {

        strip.setPixelColor(
            index,
            colourValue(colour)
        );
    }
}

void setRelayIndicator(
    uint8_t channel,
    bool on
) {

    if (channel >= 1 && channel <= 16) {

        setPixel(
            channel - 1,
            on ? Colour::Green : Colour::Off
        );
    }
}

void setRelaySelected(
    uint8_t channel,
    bool selected
) {

    if (channel < 1 || channel > 16) {
        return;
    }

    if (selected) {

        setPixel(
            channel - 1,
            Colour::Orange
        );
    }
}

void setDiagnostic(
    bool keypadOK,
    bool oledOK,
    bool relayOK
) {

    setPixel(
        18,
        keypadOK ? Colour::Green : Colour::Red
    );

    setPixel(
        17,
        oledOK ? Colour::Green : Colour::Red
    );

    setPixel(
        19,
        relayOK ? Colour::Green : Colour::Red
    );
}

void show() {
    strip.show();
}

}