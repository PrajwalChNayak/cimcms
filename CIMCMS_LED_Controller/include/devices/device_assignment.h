#pragma once
#include <Arduino.h>
#include "devices/device_registry.h"
namespace DeviceAssignment {
bool assignLedRelay(const char *deviceId, uint8_t relayChannel);
bool unassignLedRelay(const char *deviceId, uint8_t relayChannel);
}
