
#pragma once

#include <Arduino.h>

namespace Devices {

constexpr uint8_t KEYPAD_PCF = 0x20;

constexpr uint8_t ODD_RELAY_PCF = 0x21;
constexpr uint8_t EVEN_RELAY_PCF = 0x22;

constexpr uint8_t OLED = 0x3C;
constexpr uint8_t RTC = 0x68;

constexpr uint8_t OLED_WIDTH = 128;
constexpr uint8_t OLED_HEIGHT = 64;

constexpr uint8_t WS2812_COUNT = 24;
constexpr uint8_t WS2812_BRIGHTNESS = 35;

constexpr uint16_t I2C_CLOCK_HZ = 50000;
constexpr uint16_t I2C_TIMEOUT_MS = 100;

}
