
#include "configuration/config_manager.h"
#include <Preferences.h>

namespace {
Preferences prefs;
bool ready = false;

bool overrideActive[16] = {false};
bool overrideValue[16] = {false};

uint32_t testOnMs = 60000UL;
uint32_t testOffMs = 60000UL;
uint8_t testCycles = 5;

bool valid(uint8_t channel) {
    return channel >= 1 && channel <= 16;
}

void makeKey(
    char *buffer,
    size_t length,
    uint8_t channel,
    char suffix
) {
    snprintf(buffer, length, "r%02u%c", channel, suffix);
}
}

namespace ConfigManager {

void begin() {
    ready = prefs.begin("cimcms-led", false);

    if (!ready) {
        Serial.println(
            "[NVS] ERROR: Preferences unavailable"
        );
    }
}

bool load() {
    if (!ready) return false;

    for (uint8_t channel = 1; channel <= 16; ++channel) {
        char activeKey[8];
        char stateKey[8];

        makeKey(activeKey, sizeof(activeKey), channel, 'a');
        makeKey(stateKey, sizeof(stateKey), channel, 's');

        overrideActive[channel - 1] =
            prefs.getBool(activeKey, false);

        overrideValue[channel - 1] =
            prefs.getBool(stateKey, false);
    }

    testOnMs = prefs.getUInt("test_on", 60000UL);
    testOffMs = prefs.getUInt("test_off", 60000UL);
    testCycles = prefs.getUChar("test_n", 5);

    if (
        testOnMs < 1000UL ||
        testOffMs < 1000UL ||
        testCycles == 0 ||
        testCycles > 100
    ) {
        testOnMs = 60000UL;
        testOffMs = 60000UL;
        testCycles = 5;
    }

    return true;
}

bool save() {
    if (!ready) return false;

    bool ok = true;

    for (uint8_t channel = 1; channel <= 16; ++channel) {
        char activeKey[8];
        char stateKey[8];

        makeKey(activeKey, sizeof(activeKey), channel, 'a');
        makeKey(stateKey, sizeof(stateKey), channel, 's');

        ok &= prefs.putBool(
            activeKey,
            overrideActive[channel - 1]
        ) > 0;

        ok &= prefs.putBool(
            stateKey,
            overrideValue[channel - 1]
        ) > 0;
    }

    return ok;
}

bool setOverride(uint8_t channel, bool state) {
    if (!valid(channel) || !ready) return false;

    char activeKey[8];
    char stateKey[8];

    makeKey(activeKey, sizeof(activeKey), channel, 'a');
    makeKey(stateKey, sizeof(stateKey), channel, 's');

    // Persist desired state first, then activate the override flag.
    if (prefs.putBool(stateKey, state) == 0) return false;

    if (prefs.putBool(activeKey, true) == 0) return false;

    overrideValue[channel - 1] = state;
    overrideActive[channel - 1] = true;

    return true;
}

bool clearOverride(uint8_t channel) {
    if (!valid(channel) || !ready) return false;

    char activeKey[8];

    makeKey(activeKey, sizeof(activeKey), channel, 'a');

    if (prefs.putBool(activeKey, false) == 0) return false;

    overrideActive[channel - 1] = false;

    return true;
}

bool clearAllOverrides() {
    bool ok = true;

    for (uint8_t channel = 1; channel <= 16; ++channel) {
        ok &= clearOverride(channel);
    }

    return ok;
}

bool getAutoTestConfig(
    uint32_t &onMs,
    uint32_t &offMs,
    uint8_t &cycles
) {
    if (!ready) return false;

    onMs = testOnMs;
    offMs = testOffMs;
    cycles = testCycles;

    return true;
}

bool setAutoTestConfig(
    uint32_t onMs,
    uint32_t offMs,
    uint8_t cycles
) {
    if (
        !ready ||
        onMs < 1000UL ||
        offMs < 1000UL ||
        cycles == 0 ||
        cycles > 100
    ) {
        return false;
    }

    if (prefs.putUInt("test_on", onMs) == 0) return false;
    if (prefs.putUInt("test_off", offMs) == 0) return false;
    if (prefs.putUChar("test_n", cycles) == 0) return false;

    testOnMs = onMs;
    testOffMs = offMs;
    testCycles = cycles;

    return true;
}

bool isOverrideActive(uint8_t channel) {
    return valid(channel) && overrideActive[channel - 1];
}

bool overrideState(uint8_t channel) {
    return valid(channel) && overrideValue[channel - 1];
}

}
