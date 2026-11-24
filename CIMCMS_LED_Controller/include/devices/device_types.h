#pragma once
#include <Arduino.h>

// Device identity is independent from its physical output assignment.
enum class DeviceType : uint8_t {
    Lighting = 1,
    LockActuator = 2,
    Damper = 3,
    Humidifier = 4,
    Fan = 5,
    Sensor = 6,
    Other = 255
};

enum class ControllerType : uint8_t {
    LEDController = 1,
    DamperController = 2,
    HumidifierController = 3,
    EnvironmentalController = 4
};

enum class OutputType : uint8_t {
    None = 0,
    Relay = 1,
    GPIO = 2,
    PWM = 3,
    DigitalBus = 4
};

static constexpr uint8_t CIMCMS_MAX_DEVICES = 16;
static constexpr uint8_t CIMCMS_MAX_DEVICE_OUTPUTS = 4;
static constexpr uint8_t CIMCMS_LED_RELAY_COUNT = 16;
