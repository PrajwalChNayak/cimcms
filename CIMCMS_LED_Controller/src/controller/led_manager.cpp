
#include "controller/led_manager.h"
#include "hardware/relay_driver.h"
#include "hardware/ws2812.h"
#include "configuration/config_manager.h"
#include "controller/operating_mode.h"

namespace {

bool isAutoOrExperiment() {
    const OperatingMode mode = currentMode();

    return mode == OperatingMode::Auto ||
           mode == OperatingMode::Experiment;
}

}

namespace LEDManager {

void begin() {
    RelayDriver::begin();
    refreshIndicators();
}

bool setChannel(uint8_t channel, bool on) {
    if (!RelayDriver::set(channel, on)) return false;

    refreshIndicators();
    return true;
}

bool toggleChannel(uint8_t channel) {
    if (!RelayDriver::toggle(channel)) return false;

    refreshIndicators();
    return true;
}

bool allOn() {
    return operatorAllOn();
}

void allOff() {
    (void)operatorAllOff();
}

bool channelState(uint8_t channel) {
    return channel >= 1 &&
           channel <= 16 &&
           RelayDriver::getState(channel);
}

bool operatorSetChannel(uint8_t channel, bool on) {
    if (channel < 1 || channel > 16) return false;

    if (
        isAutoOrExperiment() &&
        !ConfigManager::setOverride(channel, on)
    ) {
        Serial.printf(
            "[OVERRIDE] R%02u NOT changed: NVS save failed\n",
            channel
        );

        return false;
    }

    return setChannel(channel, on);
}

bool operatorToggleChannel(uint8_t channel) {
    if (channel < 1 || channel > 16) return false;

    return operatorSetChannel(
        channel,
        !channelState(channel)
    );
}

bool operatorAllOn() {
    bool ok = true;

    for (uint8_t channel = 1; channel <= 16; ++channel) {
        ok = operatorSetChannel(channel, true) && ok;
    }

    return ok;
}

bool operatorAllOff() {
    bool ok = true;

    for (uint8_t channel = 1; channel <= 16; ++channel) {
        ok = operatorSetChannel(channel, false) && ok;
    }

    return ok;
}

bool setScheduledChannel(uint8_t channel, bool on) {
    if (channel < 1 || channel > 16) return false;

    // Permanent manual overrides take priority.
    if (ConfigManager::isOverrideActive(channel)) return true;

    return setChannel(channel, on);
}

bool channelOverrideActive(uint8_t channel) {
    return ConfigManager::isOverrideActive(channel);
}

bool clearChannelOverride(uint8_t channel) {
    return ConfigManager::clearOverride(channel);
}

bool clearAllOverrides() {
    return ConfigManager::clearAllOverrides();
}

void refreshIndicators() {
    for (uint8_t channel = 1; channel <= 16; ++channel) {
        StatusPixels::setRelayIndicator(
            channel,
            RelayDriver::getState(channel)
        );
    }

    StatusPixels::show();
}

}
