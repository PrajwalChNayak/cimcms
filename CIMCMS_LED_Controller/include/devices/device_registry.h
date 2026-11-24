#pragma once
#include <Arduino.h>
#include "devices/device_types.h"

namespace DeviceRegistry {
struct DeviceConfig {
    char deviceId[20];
    char deviceName[32];
    char roomId[16];
    DeviceType deviceType;
    ControllerType controller;
    OutputType outputType;
    uint8_t outputChannels[CIMCMS_MAX_DEVICE_OUTPUTS];
    uint8_t outputCount;
    bool enabled;
};

bool begin();
bool load();
bool save();
uint8_t count();
bool get(uint8_t index, DeviceConfig &out);
bool findById(const char *deviceId, DeviceConfig &out);
bool findByRelay(uint8_t relayChannel, DeviceConfig &out);
bool add(const DeviceConfig &device);
bool update(const DeviceConfig &device);
bool remove(const char *deviceId);
bool validate(const DeviceConfig &device, int8_t ignoreIndex = -1);
}
