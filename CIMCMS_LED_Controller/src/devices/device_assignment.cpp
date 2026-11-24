#include "devices/device_assignment.h"
#include <string.h>
namespace DeviceAssignment {
bool assignLedRelay(const char *id, uint8_t channel) {
    if (!id || channel < 1 || channel > CIMCMS_LED_RELAY_COUNT) return false;
    DeviceRegistry::DeviceConfig d;
    if (!DeviceRegistry::findById(id, d) || d.controller != ControllerType::LEDController || d.outputType != OutputType::Relay) return false;
    for (uint8_t i = 0; i < d.outputCount; ++i) if (d.outputChannels[i] == channel) return true;
    if (d.outputCount >= CIMCMS_MAX_DEVICE_OUTPUTS) return false;
    DeviceRegistry::DeviceConfig existing;
    if (DeviceRegistry::findByRelay(channel, existing) && strcmp(existing.deviceId, id) != 0) return false;
    d.outputChannels[d.outputCount++] = channel;
    return DeviceRegistry::update(d);
}

bool unassignLedRelay(const char *id, uint8_t channel) {
    DeviceRegistry::DeviceConfig d;
    if (!DeviceRegistry::findById(id, d) ||
        d.controller != ControllerType::LEDController ||
        d.outputType != OutputType::Relay) return false;
    uint8_t pos = d.outputCount;
    for (uint8_t i = 0; i < d.outputCount; ++i) if (d.outputChannels[i] == channel) { pos = i; break; }
    if (pos == d.outputCount) return false;
    for (uint8_t i = pos; i + 1 < d.outputCount; ++i) d.outputChannels[i] = d.outputChannels[i + 1];
    d.outputChannels[--d.outputCount] = 0;
    return DeviceRegistry::update(d);
}
}
