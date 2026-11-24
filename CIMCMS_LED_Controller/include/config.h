
#pragma once
#include <Arduino.h>

// Relay output polarity for the physical relay board.
constexpr bool RELAY_ACTIVE_LOW = true;

// Keep software simulation enabled while relay PCF8574 boards are disconnected.
constexpr bool RELAY_SIMULATION_MODE = true;
//constexpr bool RELAY_SIMULATION_MODE = false;
constexpr uint32_t KEYPAD_DEBOUNCE_MS = 45;
constexpr uint32_t DISPLAY_REFRESH_MS = 250;
constexpr uint32_t RTC_REFRESH_MS = 1000;

// First automatic schedule test defaults:
// Relays 1-4, synchronized ON/OFF, five complete cycles.
constexpr uint8_t AUTO_TEST_FIRST_RELAY = 1;
constexpr uint8_t AUTO_TEST_RELAY_COUNT = 4;
constexpr uint8_t AUTO_TEST_DEFAULT_CYCLES = 5;
constexpr uint32_t AUTO_TEST_DEFAULT_ON_MS = 60000UL;
constexpr uint32_t AUTO_TEST_DEFAULT_OFF_MS = 60000UL;
