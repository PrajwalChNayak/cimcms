#include "devices/device_registry.h"
#include <Preferences.h>
#include <string.h>

namespace {
Preferences prefs;
DeviceRegistry::DeviceConfig devices[CIMCMS_MAX_DEVICES] = {};
uint8_t used = 0;
bool ready = false;

int8_t indexOf(const char *id) {
    if (!id) return -1;
    for (uint8_t i = 0; i < used; ++i)
        if (strncmp(devices[i].deviceId, id, sizeof(devices[i].deviceId)) == 0) return (int8_t)i;
    return -1;
}
}

namespace DeviceRegistry {
bool begin() {
    ready = prefs.begin("cimcms-dev", false);
    if (!ready) Serial.println("[DEVICE] NVS namespace unavailable");
    return ready;
}

bool load() {
    if (!ready) return false;

    used = 0;
    memset(devices, 0, sizeof(devices));

    // First boot: persist an empty registry as a valid initial record.
    if (!prefs.isKey("registry")) {
        if (!save()) {
            Serial.println("[DEVICE] ERROR: could not initialize empty registry in NVS");
            return false;
        }
        Serial.println("[DEVICE] First boot: empty device registry saved to NVS");
        return true;
    }

    const size_t bytes = prefs.getBytesLength("registry");
    const size_t expected = sizeof(used) + sizeof(devices);
    if (bytes != expected) {
        Serial.printf("[DEVICE] ERROR: invalid registry NVS size (%u; expected %u)\n",
                      (unsigned)bytes, (unsigned)expected);
        return false;
    }

    uint8_t storedCount = 0;
    uint8_t buffer[sizeof(storedCount) + sizeof(devices)];
    if (prefs.getBytes("registry", buffer, sizeof(buffer)) != sizeof(buffer)) {
        Serial.println("[DEVICE] ERROR: failed to read registry from NVS");
        return false;
    }

    memcpy(&storedCount, buffer, sizeof(storedCount));
    if (storedCount > CIMCMS_MAX_DEVICES) {
        Serial.println("[DEVICE] ERROR: stored device count exceeds registry capacity");
        return false;
    }

    memcpy(devices, buffer + sizeof(storedCount), sizeof(devices));
    used = storedCount;

    for (uint8_t i = 0; i < used; ++i) {
        if (!validate(devices[i], (int8_t)i)) {
            used = 0;
            memset(devices, 0, sizeof(devices));
            Serial.printf("[DEVICE] ERROR: invalid stored device at index %u\n", i);
            return false;
        }
    }

    Serial.printf("[DEVICE] Loaded %u registered device(s) from NVS\n", used);
    return true;
}

bool save() {
    if (!ready) return false;
    uint8_t buffer[sizeof(used) + sizeof(devices)];
    memcpy(buffer, &used, sizeof(used));
    memcpy(buffer + sizeof(used), devices, sizeof(devices));
    return prefs.putBytes("registry", buffer, sizeof(buffer)) == sizeof(buffer);
}

uint8_t count() { return used; }

bool get(uint8_t index, DeviceConfig &out) {
    if (index >= used) return false;
    out = devices[index];
    return true;
}

bool findById(const char *id, DeviceConfig &out) {
    int8_t i = indexOf(id);
    if (i < 0) return false;
    out = devices[(uint8_t)i];
    return true;
}

bool findByRelay(uint8_t relay, DeviceConfig &out) {
    if (relay < 1 || relay > CIMCMS_LED_RELAY_COUNT) return false;
    for (uint8_t i = 0; i < used; ++i)
        for (uint8_t j = 0; j < devices[i].outputCount; ++j)
            if (devices[i].controller == ControllerType::LEDController &&
                devices[i].outputType == OutputType::Relay &&
                devices[i].outputChannels[j] == relay) { out = devices[i]; return true; }
    return false;
}

bool validate(const DeviceConfig &d, int8_t ignoreIndex) {
    if (!d.deviceId[0] || !d.deviceName[0] || !d.roomId[0] ||
        strnlen(d.deviceId, sizeof(d.deviceId)) >= sizeof(d.deviceId) ||
        strnlen(d.deviceName, sizeof(d.deviceName)) >= sizeof(d.deviceName) ||
        strnlen(d.roomId, sizeof(d.roomId)) >= sizeof(d.roomId) ||
        d.outputCount > CIMCMS_MAX_DEVICE_OUTPUTS) return false;

    const bool validDeviceType =
        d.deviceType == DeviceType::Lighting ||
        d.deviceType == DeviceType::LockActuator ||
        d.deviceType == DeviceType::Damper ||
        d.deviceType == DeviceType::Humidifier ||
        d.deviceType == DeviceType::Fan ||
        d.deviceType == DeviceType::Sensor ||
        d.deviceType == DeviceType::Other;
    const bool validController =
        d.controller == ControllerType::LEDController ||
        d.controller == ControllerType::DamperController ||
        d.controller == ControllerType::HumidifierController ||
        d.controller == ControllerType::EnvironmentalController;
    const bool validOutput =
        d.outputType == OutputType::None ||
        d.outputType == OutputType::Relay ||
        d.outputType == OutputType::GPIO ||
        d.outputType == OutputType::PWM ||
        d.outputType == OutputType::DigitalBus;
    if (!validDeviceType || !validController || !validOutput) return false;

    if (d.outputCount && d.outputType == OutputType::None) return false;

    // This firmware owns only the LED Controller's 16 relay outputs.
    // Other controller types may be registered for the wider CIMCMS system,
    // but their physical assignments must be configured by their own firmware.
    if (d.controller == ControllerType::LEDController) {
        if (d.outputType != OutputType::Relay) return false;
        if (d.deviceType != DeviceType::Lighting &&
            d.deviceType != DeviceType::LockActuator) return false;

        for (uint8_t j = 0; j < d.outputCount; ++j) {
            const uint8_t ch = d.outputChannels[j];
            if (ch < 1 || ch > CIMCMS_LED_RELAY_COUNT) return false;

            for (uint8_t k = j + 1; k < d.outputCount; ++k)
                if (d.outputChannels[k] == ch) return false;

            // A physical relay may have only one registered owner, even if
            // that device is currently disabled. This avoids hidden conflicts.
            for (uint8_t i = 0; i < used; ++i) {
                if ((int8_t)i == ignoreIndex) continue;
                if (devices[i].controller != ControllerType::LEDController ||
                    devices[i].outputType != OutputType::Relay) continue;
                for (uint8_t k = 0; k < devices[i].outputCount; ++k)
                    if (devices[i].outputChannels[k] == ch) return false;
            }
        }
    } else if (d.outputCount > 0) {
        // The LED Controller must not store another controller's channel map.
        return false;
    }

    return true;
}

bool add(const DeviceConfig &d) {
    if (!ready || used >= CIMCMS_MAX_DEVICES || indexOf(d.deviceId) >= 0 || !validate(d)) return false;
    devices[used] = d;
    ++used;
    if (!save()) { --used; memset(&devices[used], 0, sizeof(DeviceConfig)); return false; }
    return true;
}

bool update(const DeviceConfig &d) {
    if (!ready) return false;
    int8_t i = indexOf(d.deviceId);
    if (i < 0 || !validate(d, i)) return false;
    DeviceConfig old = devices[(uint8_t)i];
    devices[(uint8_t)i] = d;
    if (!save()) { devices[(uint8_t)i] = old; return false; }
    return true;
}

bool remove(const char *id) {
    if (!ready) return false;
    int8_t found = indexOf(id);
    if (found < 0) return false;
    uint8_t i = (uint8_t)found;
    DeviceConfig old[CIMCMS_MAX_DEVICES];
    memcpy(old, devices, sizeof(devices));
    for (uint8_t j = i; j + 1 < used; ++j) devices[j] = devices[j + 1];
    --used;
    memset(&devices[used], 0, sizeof(DeviceConfig));
    if (!save()) { memcpy(devices, old, sizeof(devices)); ++used; return false; }
    return true;
}
}
