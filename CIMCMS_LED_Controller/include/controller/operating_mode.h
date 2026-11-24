
#pragma once

#include <Arduino.h>

enum class OperatingMode : uint8_t {
    Manual,
    Auto,
    Maintenance,
    Experiment
};

const char *modeName(OperatingMode mode);
OperatingMode currentMode();
void setMode(OperatingMode mode);
