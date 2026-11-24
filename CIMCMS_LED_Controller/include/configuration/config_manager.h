
#pragma once
#include <Arduino.h>

namespace ConfigManager {
void begin();
bool load();
bool save();

bool setOverride(uint8_t channel, bool state);
bool clearOverride(uint8_t channel);
bool clearAllOverrides();
bool isOverrideActive(uint8_t channel);

bool getAutoTestConfig(
    uint32_t &onMs,
    uint32_t &offMs,
    uint8_t &cycles
);

bool setAutoTestConfig(
    uint32_t onMs,
    uint32_t offMs,
    uint8_t cycles
);

bool overrideState(uint8_t channel);
}
