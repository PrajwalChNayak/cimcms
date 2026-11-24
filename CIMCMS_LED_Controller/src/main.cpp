
#include <Arduino.h>
#include <Wire.h>

#include "pin_config.h"
#include "device_config.h"
#include "version.h"
#include "config.h"

#include "hardware/pcf8574.h"
#include "hardware/keypad.h"
#include "hardware/oled.h"
#include "hardware/rtc.h"
#include "hardware/relay_driver.h"
#include "hardware/ws2812.h"

#include "controller/led_manager.h"
#include "controller/operating_mode.h"
#include "controller/state_manager.h"

#include "configuration/config_manager.h"
#include "room/room_manager.h"
#include "devices/device_registry.h"
#include "devices/device_assignment.h"
#include "devices/device_types.h"
#include "configuration/menu_manager.h"
#include "configuration/wifi_manager.h"
#include "configuration/wifi_scanner.h"

#include "communication/mqtt_manager.h"

#include "scheduling/rtc_sync.h"
#include "scheduling/schedule_manager.h"

#include "rtos/watchdog.h"

namespace {

char firstDigit = 0;
int selectedRelay = 0;
char lastKey = 0;

String relayMessage = "READY";

uint32_t lastDisplay = 0;
uint32_t messageUntil = 0;

bool keypadOK = false;
bool oledOK = false;
bool rtcOK = false;

bool oddRelayOK = false;
bool evenRelayOK = false;

// Keypad sequence state machine
enum class ComboState : uint8_t {
    Idle,
    ModeKeyPending,
    AwaitAllOnConfirm,
    AwaitAllOffConfirm,
    AwaitPortalConfirm
};

ComboState comboState = ComboState::Idle;
char pendingModeKey = 0;
uint32_t comboStartedAt = 0;
constexpr uint32_t COMBO_TIMEOUT_MS = 1500;
constexpr uint32_t MODE_CONFIRM_TIMEOUT_MS = 5000;

// --------------------------------------------------
// APPLICATION STATUS
// --------------------------------------------------

void updateApplicationStatus(const String &message) {

    relayMessage = message;
    messageUntil = millis() + 1800;
    OLED::showMessage("CIMCMS LED CTRL", message.c_str());

    StateManager::setSelectedRelay(selectedRelay);

    StateManager::setStatus(relayMessage);
}

void restoreSelectedIndicator() {

    if (selectedRelay >= 1 && selectedRelay <= 16) {

        StatusPixels::setRelayIndicator(
            selectedRelay,
            LEDManager::channelState(selectedRelay)
        );
    }
}

// --------------------------------------------------
// OPERATING MODE
// --------------------------------------------------

void applyModeKey(char key) {

    if (key == 'A') {

        setMode(OperatingMode::Manual);

        updateApplicationStatus("MANUAL MODE");
    }

    else if (key == 'B') {

        setMode(OperatingMode::Maintenance);

        updateApplicationStatus("MAINTENANCE MODE");
    }
}

// --------------------------------------------------
// NORMAL KEYPAD PROCESSING
// --------------------------------------------------

void processRegularKey(char key) {

    if (MenuManager::isMenuOpen()) {

        MenuManager::processKey(key);

        return;
    }

    // ----------------------------------------------
    // NUMERIC RELAY SELECTION
    // ----------------------------------------------

    if (key >= '0' && key <= '9') {

        if (firstDigit == 0) {

            restoreSelectedIndicator();

            selectedRelay = 0;

            firstDigit = key;

            updateApplicationStatus(
                "ENTER SECOND DIGIT"
            );

        } else {

            const int requestedRelay =
                (firstDigit - '0') * 10 +
                (key - '0');

            firstDigit = 0;

            if (requestedRelay < 1 ||
                requestedRelay > 16) {

                selectedRelay = 0;

                updateApplicationStatus(
                    "INVALID CHANNEL"
                );

            }

            else if (
                !RelayDriver::isAvailable(requestedRelay)
            ) {

                selectedRelay = 0;

                updateApplicationStatus(
                    "CHANNEL DISABLED"
                );

                Serial.printf(
                    "RELAY %02d IS DISABLED\n",
                    requestedRelay
                );

            }

            else {

                selectedRelay = requestedRelay;

                StatusPixels::setRelaySelected(
                    selectedRelay,
                    true
                );

                updateApplicationStatus(
                    "PRESS # TO CONFIRM"
                );

                Serial.printf(
                    "RELAY %02d SELECTED - ORANGE\n",
                    selectedRelay
                );
            }
        }
    }

    // ----------------------------------------------
    // CANCEL
    // ----------------------------------------------

    else if (key == '*') {

        if (firstDigit == 0 && selectedRelay == 0) {
            MenuManager::open();
            return;
        }

        firstDigit = 0;
        restoreSelectedIndicator();
        selectedRelay = 0;
        updateApplicationStatus("SELECTION CANCELLED");
        StatusPixels::setPixel(23, StatusPixels::Colour::Yellow);
    }

    // ----------------------------------------------
    // CONFIRM / TOGGLE
    // ----------------------------------------------

    else if (key == '#') {

        if (selectedRelay >= 1 &&
            selectedRelay <= 16) {

            const uint8_t relay =
                static_cast<uint8_t>(selectedRelay);

            if (LEDManager::operatorToggleChannel(relay)) {

                const bool isOn =
                    LEDManager::channelState(relay);

                updateApplicationStatus(
                    String("RELAY ") +
                    relay +
                    (isOn ? " ON" : " OFF")
                );

                StatusPixels::setRelayIndicator(
                    relay,
                    isOn
                );

                StatusPixels::setPixel(
                    22,
                    StatusPixels::Colour::Green
                );

                Serial.printf(
                    "RELAY %02u %s\n",
                    relay,
                    isOn ? "ON" : "OFF"
                );

            } else {

                updateApplicationStatus(
                    "RELAY OPERATION FAILED"
                );

                StatusPixels::setPixel(
                    22,
                    StatusPixels::Colour::Red
                );
            }

        } else {

            updateApplicationStatus(
                "ENTER 01-16 FIRST"
            );
        }

        firstDigit = 0;

        selectedRelay = 0;
    }

    // ----------------------------------------------
    // OTHER OPERATING MODES
    // ----------------------------------------------

    StateManager::setSelectedRelay(selectedRelay);

    StatusPixels::setPixel(
        16,
        StatusPixels::Colour::Blue
    );

    StatusPixels::show();
}

// --------------------------------------------------
// ALL ENABLED RELAYS ON
// --------------------------------------------------

void executeAllOn() {

    firstDigit = 0;

    restoreSelectedIndicator();

    selectedRelay = 0;

    if (LEDManager::allOn()) {

        updateApplicationStatus(
            "ALL 16 RELAYS ON"
        );

        Serial.println(
            "A * # : ALL 16 RELAYS ON"
        );

        StatusPixels::setPixel(
            22,
            StatusPixels::Colour::Green
        );

    } else {

        updateApplicationStatus(
            "ALL ON PARTIAL / ERROR"
        );

        Serial.println(
            "ALL ON FAILED - CHECK RELAY PCF BANKS"
        );

        StatusPixels::setPixel(
            22,
            StatusPixels::Colour::Red
        );
    }

    StatusPixels::show();
}

// --------------------------------------------------
// ALL RELAYS OFF
// --------------------------------------------------

void executeAllOff() {

    firstDigit = 0;

    restoreSelectedIndicator();

    selectedRelay = 0;

    LEDManager::allOff();

    updateApplicationStatus(
        "ALL RELAYS OFF"
    );

    Serial.println(
        "B * # : ALL RELAYS OFF"
    );

    StatusPixels::setPixel(
        22,
        StatusPixels::Colour::Green
    );

    StatusPixels::show();
}

// --------------------------------------------------
// COMBINATION KEYPAD PROCESSING
// --------------------------------------------------

void processKey(char key) {
    lastKey = key;
    StateManager::setLastKey(key);
    Serial.printf("KEY DETECTED: %c\n", key);

    if (MenuManager::isMenuOpen()) {
        MenuManager::processKey(key);
        return;
    }

    switch (comboState) {
        case ComboState::Idle:
            if (key == 'A' || key == 'B' || key == 'C' || key == 'D') {
                pendingModeKey = key;
                comboState = ComboState::ModeKeyPending;
                comboStartedAt = millis();
                updateApplicationStatus(String(key) + " PRESSED: PRESS # TO CONFIRM");
                OLED::showMessage("MODE SELECTION", "Press # to confirm");
                return;
            }
            processRegularKey(key);
            return;

        case ComboState::ModeKeyPending:
            if (key == '#') {
                const char selected = pendingModeKey;
                pendingModeKey = 0;
                comboState = ComboState::Idle;
                if (selected == 'A') {
                    ScheduleManager::stopAutoTest();
                    setMode(OperatingMode::Manual);
                    updateApplicationStatus("MANUAL MODE");
                } else if (selected == 'B') {
                    ScheduleManager::stopAutoTest();
                    setMode(OperatingMode::Maintenance);
                    updateApplicationStatus("MAINTENANCE MODE");
                } else if (selected == 'C') {
                    setMode(OperatingMode::Auto);
                    updateApplicationStatus("AUTO MODE");
                } else if (selected == 'D') {
                    ScheduleManager::stopAutoTest();
                    setMode(OperatingMode::Experiment);
                    updateApplicationStatus("EXPERIMENT MODE");
                }
                return;
            }

            if (key == '*' && (pendingModeKey == 'A' || pendingModeKey == 'B')) {
                comboState = (pendingModeKey == 'A')
                    ? ComboState::AwaitAllOnConfirm
                    : ComboState::AwaitAllOffConfirm;
                comboStartedAt = millis();
                updateApplicationStatus(pendingModeKey == 'A'
                    ? "ALL ON: PRESS # TO CONFIRM"
                    : "ALL OFF: PRESS # TO CONFIRM");
                return;
            }

            if (key == '*' && pendingModeKey == 'D') {
                comboState = ComboState::AwaitPortalConfirm;
                comboStartedAt = millis();
                updateApplicationStatus("WIFI SETUP: PRESS # TO CONFIRM");
                return;
            }

            pendingModeKey = 0;
            comboState = ComboState::Idle;
            updateApplicationStatus("MODE SELECTION CANCELLED");
            if (key != '*') processRegularKey(key);
            return;

        case ComboState::AwaitAllOnConfirm:
            comboState = ComboState::Idle;
            pendingModeKey = 0;
            if (key == '#') executeAllOn();
            else updateApplicationStatus("ALL ON CANCELLED");
            return;

        case ComboState::AwaitAllOffConfirm:
            comboState = ComboState::Idle;
            pendingModeKey = 0;
            if (key == '#') executeAllOff();
            else updateApplicationStatus("ALL OFF CANCELLED");
            return;

        case ComboState::AwaitPortalConfirm:
            comboState = ComboState::Idle;
            pendingModeKey = 0;
            if (key == '#') {
                if (WiFiManagerCIMCMS::startSetupPortal()) {
                    updateApplicationStatus("WIFI PORTAL STARTED");
                    OLED::showMessage("WIFI SETUP", "192.168.4.1");
                } else {
                    updateApplicationStatus("WIFI HOTSPOT FAILED");
                }
            } else {
                updateApplicationStatus("WIFI SETUP CANCELLED");
            }
            return;
    }
}

void processComboTimeout() {
    if (comboState == ComboState::Idle) return;
    const uint32_t timeout = (comboState == ComboState::ModeKeyPending)
        ? MODE_CONFIRM_TIMEOUT_MS : COMBO_TIMEOUT_MS;
    if (millis() - comboStartedAt < timeout) return;

    comboState = ComboState::Idle;
    pendingModeKey = 0;
    updateApplicationStatus("KEY SEQUENCE TIMED OUT");
}

// --------------------------------------------------
// OLED REFRESH
// --------------------------------------------------

void updateDisplay() {
    if (MenuManager::isMenuOpen() || ScheduleManager::isAutoTestRunning() ||
        millis() < messageUntil) return;
    if (millis() - lastDisplay < DISPLAY_REFRESH_MS) return;
    lastDisplay = millis();

    const String clockText = rtcOK ? RTCDevice::timeString() : "RTC NOT FOUND";
    String relaySummary;
    uint8_t onCount = 0;
    for (uint8_t i = 1; i <= 16; ++i) {
        if (LEDManager::channelState(i)) ++onCount;
    }
    relaySummary = String(onCount) + "/16 ON";

    const String wifiText = WiFiManagerCIMCMS::statusText();
    const String ipText = WiFiManagerCIMCMS::ipAddress();
    const String mqttText = MQTTManager::connected() ? "CONNECTED" : "DISCONNECTED";
    OLED::showDashboard(
        modeName(currentMode()),
        clockText.c_str(),
        wifiText.c_str(),
        ipText.c_str(),
        WiFiManagerCIMCMS::rssi(),
        mqttText.c_str(),
        relaySummary.c_str(),
        RELAY_SIMULATION_MODE ? "SIMULATION" : "HARDWARE"
    );
}

// --------------------------------------------------
// SERIAL SOFTWARE-TEST CONSOLE
// Commands: help, status, relay <1-16> <on|off|toggle>, all on, all off
// This allows relay-state logic to be tested without relay hardware.
// --------------------------------------------------

void printRelayStates() {
    Serial.println("RELAY STATE TABLE (01-16)");
    for (uint8_t channel = 1; channel <= 16; ++channel) {
        Serial.printf("R%02u=%s%s", channel,
            LEDManager::channelState(channel) ? "ON " : "OFF",
            (channel % 4 == 0) ? "\n" : " | ");
    }
}

bool readCommandToken(const String &input, size_t &position, String &token) {
    token = "";
    while (position < input.length() && input[position] == ' ') ++position;
    if (position >= input.length()) return false;

    if (input[position] == '"') {
        ++position;
        while (position < input.length() && input[position] != '"')
            token += input[position++];
        if (position >= input.length()) return false;
        ++position;
        return true;
    }

    while (position < input.length() && input[position] != ' ')
        token += input[position++];
    return token.length() > 0;
}

bool parseDeviceType(const String &value, DeviceType &out) {
    if (value == "lighting") out = DeviceType::Lighting;
    else if (value == "lock" || value == "lockactuator") out = DeviceType::LockActuator;
    else if (value == "damper") out = DeviceType::Damper;
    else if (value == "humidifier") out = DeviceType::Humidifier;
    else if (value == "fan") out = DeviceType::Fan;
    else if (value == "sensor") out = DeviceType::Sensor;
    else if (value == "other") out = DeviceType::Other;
    else return false;
    return true;
}

bool parseControllerType(const String &value, ControllerType &out) {
    if (value == "led" || value == "ledcontroller") out = ControllerType::LEDController;
    else if (value == "damper" || value == "dampercontroller") out = ControllerType::DamperController;
    else if (value == "humidifier" || value == "humidifiercontroller") out = ControllerType::HumidifierController;
    else if (value == "environmental" || value == "environmentalcontroller") out = ControllerType::EnvironmentalController;
    else return false;
    return true;
}

bool parseOutputType(const String &value, OutputType &out) {
    if (value == "none") out = OutputType::None;
    else if (value == "relay") out = OutputType::Relay;
    else if (value == "gpio") out = OutputType::GPIO;
    else if (value == "pwm") out = OutputType::PWM;
    else if (value == "bus" || value == "digitalbus") out = OutputType::DigitalBus;
    else return false;
    return true;
}

const char *deviceTypeName(DeviceType value) {
    switch (value) {
        case DeviceType::Lighting: return "lighting";
        case DeviceType::LockActuator: return "lock";
        case DeviceType::Damper: return "damper";
        case DeviceType::Humidifier: return "humidifier";
        case DeviceType::Fan: return "fan";
        case DeviceType::Sensor: return "sensor";
        default: return "other";
    }
}

const char *controllerTypeName(ControllerType value) {
    switch (value) {
        case ControllerType::LEDController: return "LED";
        case ControllerType::DamperController: return "DAMPER";
        case ControllerType::HumidifierController: return "HUMIDIFIER";
        default: return "ENVIRONMENTAL";
    }
}

const char *outputTypeName(OutputType value) {
    switch (value) {
        case OutputType::Relay: return "RELAY";
        case OutputType::GPIO: return "GPIO";
        case OutputType::PWM: return "PWM";
        case OutputType::DigitalBus: return "BUS";
        default: return "NONE";
    }
}

void printDeviceRecord(const DeviceRegistry::DeviceConfig &device) {
    Serial.printf("ID: %s | NAME: %s | ROOM: %s\n",
        device.deviceId, device.deviceName, device.roomId);
    Serial.printf("TYPE: %s | CONTROLLER: %s | OUTPUT: %s | %s\n",
        deviceTypeName(device.deviceType),
        controllerTypeName(device.controller),
        outputTypeName(device.outputType),
        device.enabled ? "ENABLED" : "DISABLED");
    Serial.print("OUTPUT CHANNELS: ");
    if (device.outputCount == 0) Serial.println("NOT ASSIGNED");
    else {
        for (uint8_t i = 0; i < device.outputCount; ++i)
            Serial.printf("%sR%02u", i ? ", " : "", device.outputChannels[i]);
        Serial.println();
    }
}

bool handleManagementCommand(const String &rawLine) {
    size_t pos = 0;
    String first, second;
    if (!readCommandToken(rawLine, pos, first)) return false;
    first.toLowerCase();
    if (first != "room" && first != "device" && first != "relay") return false;
    if (!readCommandToken(rawLine, pos, second)) {
        Serial.println("Incomplete management command. Type help.");
        return true;
    }
    second.toLowerCase();

    if (first == "relay" && second != "assign" && second != "unassign")
        return false;

    if (first == "room" && second == "show") {
        RoomManager::RoomConfig room;
        if (!RoomManager::get(room)) Serial.println("ROOM READ FAILED");
        else Serial.printf("ROOM: %s | %s | %s\n", room.roomId, room.roomName,
                           room.enabled ? "ENABLED" : "DISABLED");
        return true;
    }

    if (first == "room" && second == "configure") {
        String id, name, state;
        if (!readCommandToken(rawLine, pos, id) ||
            !readCommandToken(rawLine, pos, name) ||
            !readCommandToken(rawLine, pos, state)) {
            Serial.println("Usage: room configure <ROOM-ID> \"Room Name\" <enabled|disabled>");
            return true;
        }
        state.toLowerCase();
        if (state != "enabled" && state != "disabled") {
            Serial.println("Room state must be enabled or disabled");
            return true;
        }
        RoomManager::RoomConfig current;
        RoomManager::get(current);
        if (id != String(current.roomId) && DeviceRegistry::count() > 0) {
            Serial.println("REJECTED: cannot change room ID while devices are registered");
            return true;
        }
        const bool ok = RoomManager::configure(id.c_str(), name.c_str(), state == "enabled");
        Serial.println(ok ? "ROOM CONFIGURATION SAVED" : "ROOM CONFIGURATION FAILED");
        return true;
    }

    if (first == "device" && second == "list") {
        Serial.printf("REGISTERED DEVICES: %u/%u\n",
            DeviceRegistry::count(), CIMCMS_MAX_DEVICES);
        for (uint8_t i = 0; i < DeviceRegistry::count(); ++i) {
            DeviceRegistry::DeviceConfig d;
            if (DeviceRegistry::get(i, d))
                Serial.printf("%s | %s | %s | %s\n", d.deviceId, d.deviceName,
                    deviceTypeName(d.deviceType), d.enabled ? "ENABLED" : "DISABLED");
        }
        return true;
    }

    if (first == "device" && second == "show") {
        String id;
        DeviceRegistry::DeviceConfig d;
        if (!readCommandToken(rawLine, pos, id) ||
            !DeviceRegistry::findById(id.c_str(), d)) {
            Serial.println("Device not found. Usage: device show <DEVICE-ID>");
        } else printDeviceRecord(d);
        return true;
    }

    if (first == "device" && second == "add") {
        String id, name, typeText, controllerText, outputText;
        if (!readCommandToken(rawLine, pos, id) ||
            !readCommandToken(rawLine, pos, name) ||
            !readCommandToken(rawLine, pos, typeText) ||
            !readCommandToken(rawLine, pos, controllerText) ||
            !readCommandToken(rawLine, pos, outputText)) {
            Serial.println("Usage: device add <ID> \"Name\" <type> <controller> <output>");
            Serial.println("Types: lighting|lock|damper|humidifier|fan|sensor|other");
            Serial.println("Controllers: led|damper|humidifier|environmental");
            Serial.println("Outputs: relay|gpio|pwm|bus|none");
            return true;
        }

        DeviceRegistry::DeviceConfig d = {};
        RoomManager::RoomConfig room;
        RoomManager::get(room);
        strlcpy(d.deviceId, id.c_str(), sizeof(d.deviceId));
        strlcpy(d.deviceName, name.c_str(), sizeof(d.deviceName));
        strlcpy(d.roomId, room.roomId, sizeof(d.roomId));
        d.enabled = true;

        typeText.toLowerCase();
        controllerText.toLowerCase();
        outputText.toLowerCase();
        if (!parseDeviceType(typeText, d.deviceType) ||
            !parseControllerType(controllerText, d.controller) ||
            !parseOutputType(outputText, d.outputType)) {
            Serial.println("DEVICE ADD FAILED: unknown type/controller/output");
            return true;
        }
        if (DeviceRegistry::add(d)) {
            Serial.println("DEVICE REGISTERED");
            printDeviceRecord(d);
        } else {
            Serial.println("DEVICE ADD FAILED: invalid data, duplicate ID, capacity, or controller/output mismatch");
        }
        return true;
    }

    if (first == "device" && (second == "rename" || second == "enable" || second == "remove")) {
        String id;
        if (!readCommandToken(rawLine, pos, id)) {
            Serial.printf("Usage: device %s <DEVICE-ID>%s\n", second.c_str(),
                second == "rename" ? " \"New Name\"" : (second == "enable" ? " <on|off>" : ""));
            return true;
        }
        if (second == "remove") {
            Serial.println(DeviceRegistry::remove(id.c_str()) ? "DEVICE REMOVED" : "DEVICE REMOVE FAILED");
            return true;
        }
        DeviceRegistry::DeviceConfig d;
        if (!DeviceRegistry::findById(id.c_str(), d)) {
            Serial.println("DEVICE NOT FOUND");
            return true;
        }
        if (second == "rename") {
            String name;
            if (!readCommandToken(rawLine, pos, name) || name.length() == 0 ||
                name.length() >= sizeof(d.deviceName)) {
                Serial.println("Usage: device rename <DEVICE-ID> \"New Name\" (max 31 chars)");
                return true;
            }
            strlcpy(d.deviceName, name.c_str(), sizeof(d.deviceName));
        } else {
            String state;
            if (!readCommandToken(rawLine, pos, state)) {
                Serial.println("Usage: device enable <DEVICE-ID> <on|off>");
                return true;
            }
            state.toLowerCase();
            if (state != "on" && state != "off") {
                Serial.println("State must be on or off");
                return true;
            }
            d.enabled = (state == "on");
        }
        Serial.println(DeviceRegistry::update(d) ? "DEVICE UPDATED" : "DEVICE UPDATE FAILED");
        return true;
    }

    if (first == "relay" && (second == "assign" || second == "unassign")) {
        String id, channelText;
        if (!readCommandToken(rawLine, pos, id) ||
            !readCommandToken(rawLine, pos, channelText)) {
            Serial.printf("Usage: relay %s <DEVICE-ID> <1-16>\n", second.c_str());
            return true;
        }
        const int channel = channelText.toInt();
        if (channel < 1 || channel > 16) {
            Serial.println("RELAY CHANNEL MUST BE 1-16");
            return true;
        }
        const bool ok = second == "assign"
            ? DeviceAssignment::assignLedRelay(id.c_str(), static_cast<uint8_t>(channel))
            : DeviceAssignment::unassignLedRelay(id.c_str(), static_cast<uint8_t>(channel));
        Serial.println(ok ? (second == "assign" ? "RELAY ASSIGNED" : "RELAY UNASSIGNED")
                          : "ASSIGNMENT FAILED: check device controller, output type, ownership and capacity");
        return true;
    }

    Serial.println("Unknown management command. Type help.");
    return true;
}

void processSerialConsole() {
    static String line;

    while (Serial.available() > 0) {
        const char c = static_cast<char>(Serial.read());
        if (c != '\n' && c != '\r') {
            if (line.length() < 120) line += c;
            continue;
        }

        line.trim();
        if (line.length() == 0) {
            line = "";
            continue;
        }

        const String rawLine = line;
        line.toLowerCase();

        if (handleManagementCommand(rawLine)) {
            // Management command handled above.
        } else if (line == "help") {
            Serial.println("Commands:");
            Serial.println("  status");
            Serial.println("  relay <1-16> on");
            Serial.println("  relay <1-16> off");
            Serial.println("  relay <1-16> toggle");
            Serial.println("  all on");
            Serial.println("  all off");
            Serial.println("  rtc sync");
            Serial.println("  wifi scan");
            Serial.println("  auto test start");
            Serial.println("  auto test stop");
            Serial.println("  auto test status");
            Serial.println("  auto test config <on_ms> <off_ms> <cycles>");
            Serial.println("  override status");
            Serial.println("  override clear <1-16|all>");
            Serial.println("Room/device management:");
            Serial.println("  room show");
            Serial.println("  room configure <ROOM-ID> \"Room Name\" <enabled|disabled>");
            Serial.println("  device add <ID> \"Name\" <type> <controller> <output>");
            Serial.println("  device list");
            Serial.println("  device show <ID>");
            Serial.println("  device rename <ID> \"New Name\"");
            Serial.println("  device enable <ID> <on|off>");
            Serial.println("  device remove <ID>");
            Serial.println("  relay assign <ID> <1-16>");
            Serial.println("  relay unassign <ID> <1-16>");
            Serial.println("  help");
        } else if (line == "status") {
            Serial.printf("Mode: %s | Backend: %s\n",
                modeName(currentMode()),
                RELAY_SIMULATION_MODE ? "SIMULATION" : "PCF8574");
            Serial.printf("AUTO TEST: %s | cycles %u/%u | ON %lu ms | OFF %lu ms\n",
                ScheduleManager::statusText().c_str(),
                ScheduleManager::completedCycles(),
                ScheduleManager::configuredCycles(),
                (unsigned long)ScheduleManager::onDurationMs(),
                (unsigned long)ScheduleManager::offDurationMs());
            printRelayStates();
        } else if (line == "auto test start") {
            Serial.println(ScheduleManager::startAutoTest() ? "AUTO TEST STARTED" : "AUTO TEST ALREADY RUNNING");
        } else if (line == "auto test stop") {
            ScheduleManager::stopAutoTest();
        } else if (line == "auto test status") {
            Serial.printf("AUTO TEST: %s | cycles %u/%u | ON %lu ms | OFF %lu ms\n",
                ScheduleManager::statusText().c_str(),
                ScheduleManager::completedCycles(),
                ScheduleManager::configuredCycles(),
                (unsigned long)ScheduleManager::onDurationMs(),
                (unsigned long)ScheduleManager::offDurationMs());
        } else if (line.startsWith("auto test config ")) {
            unsigned long onValue = 0, offValue = 0;
            unsigned int cycleValue = 0;
            const int parsed = sscanf(line.c_str(),
                "auto test config %lu %lu %u", &onValue, &offValue, &cycleValue);
            const bool ok = parsed == 3 && cycleValue >= 1 && cycleValue <= 100 &&
                ScheduleManager::configureAutoTest(onValue, offValue,
                    static_cast<uint8_t>(cycleValue));
            Serial.println(ok ? "AUTO TEST CONFIG SAVED TO NVS" :
                "CONFIG REJECTED: use ms >= 1000 and cycles 1-100; stop test first");
        } else if (line == "override status") {
            for (uint8_t ch = 1; ch <= 16; ++ch) {
                Serial.printf("R%02u: %s\n", ch,
                    LEDManager::channelOverrideActive(ch) ? "OVERRIDE ACTIVE" : "SCHEDULE CONTROL");
            }
        } else if (line.startsWith("override clear ")) {
            String target = line.substring(15);
            bool ok = false;
            if (target == "all") ok = LEDManager::clearAllOverrides();
            else {
                const int ch = target.toInt();
                if (ch >= 1 && ch <= 16)
                    ok = LEDManager::clearChannelOverride(static_cast<uint8_t>(ch));
            }
            Serial.println(ok ? "OVERRIDE CLEARED" : "OVERRIDE CLEAR FAILED");
        } else if (line == "all on") {
            const bool ok = LEDManager::operatorAllOn();
            Serial.printf("ALL ON: %s\n", ok ? "OK" : "FAILED");
            printRelayStates();
        } else if (line == "all off") {
            LEDManager::operatorAllOff();
            Serial.println("ALL OFF: OK");
            printRelayStates();
        } else if (line == "rtc sync") {
            Serial.println(RTCSync::syncNow() ? "RTC SYNC SUCCESS" : "RTC SYNC FAILED - CHECK WIFI/RTC");
        } else if (line == "wifi scan") {
            WiFiScanner::Network networks[20];
            const int count = WiFiScanner::scan(networks, 20);
            Serial.printf("Wi-Fi networks found: %d\n", count);
            for (int i = 0; i < count; ++i) {
                Serial.printf("%2d. %s | %ld dBm | %s | CH %ld\n",
                    i + 1, networks[i].ssid.c_str(), (long)networks[i].rssi,
                    WiFiScanner::quality(networks[i].rssi).c_str(), (long)networks[i].channel);
            }
        } else if (line.startsWith("relay ")) {
            const int split = line.indexOf(' ', 6);
            if (split < 0) {
                Serial.println("Usage: relay <1-16> <on|off|toggle>");
            } else {
                const int channel = line.substring(6, split).toInt();
                const String action = line.substring(split + 1);
                bool ok = false;
                if (channel >= 1 && channel <= 16) {
                    if (action == "on") ok = LEDManager::operatorSetChannel(static_cast<uint8_t>(channel), true);
                    else if (action == "off") ok = LEDManager::operatorSetChannel(static_cast<uint8_t>(channel), false);
                    else if (action == "toggle") ok = LEDManager::operatorToggleChannel(static_cast<uint8_t>(channel));
                }
                Serial.printf("RELAY %02d %s: %s\n", channel,
                    action.c_str(), ok ? "OK" : "INVALID / FAILED");
                if (ok) printRelayStates();
            }
        } else {
            Serial.println("Unknown command. Type help.");
        }

        line = "";
    }
}

}

// --------------------------------------------------
// SETUP
// --------------------------------------------------

void setup() {

    Serial.begin(115200);

    delay(300);

    Serial.println();

    Serial.println("================================");

    Serial.printf(
        "%s\n",
        CIMCMS_FIRMWARE_NAME
    );

    Serial.printf(
        "VERSION: %s\n",
        CIMCMS_FIRMWARE_VERSION
    );

    Serial.println("================================");

    Wire.begin(
        Pins::I2C_SDA,
        Pins::I2C_SCL
    );

    Wire.setClock(
        Devices::I2C_CLOCK_HZ
    );

    Wire.setTimeOut(
        Devices::I2C_TIMEOUT_MS
    );

    StatusPixels::begin();

    StatusPixels::setPixel(
        0,
        StatusPixels::Colour::Blue
    );

    StatusPixels::show();

    oledOK = OLED::begin();

    keypadOK = Keypad::begin();

    rtcOK = RTCDevice::begin();

    if (RELAY_SIMULATION_MODE) {
        // No relay PCF8574 boards are required during software validation.
        oddRelayOK = true;
        evenRelayOK = true;
    } else {
        oddRelayOK = PCF8574::begin(
            Devices::ODD_RELAY_PCF,
            0xFF
        );
        evenRelayOK = PCF8574::begin(
            Devices::EVEN_RELAY_PCF,
            0xFF
        );
    }

    const bool relayInit = RelayDriver::begin();

    // Safe startup: all relay outputs OFF.
    LEDManager::allOff();

    StateManager::begin();

    ConfigManager::begin();
    ConfigManager::load();

    const bool roomStorageOK = RoomManager::begin() && RoomManager::load();
    const bool deviceStorageOK = DeviceRegistry::begin() && DeviceRegistry::load();

    MenuManager::begin();

    WiFiManagerCIMCMS::begin();

    MQTTManager::begin();

    RTCSync::begin();

    ScheduleManager::begin();

    WatchdogManager::begin();

    StatusPixels::setDiagnostic(
        keypadOK,
        oledOK,
        relayInit
    );

    StatusPixels::show();

    Serial.println();

    Serial.println("HARDWARE STATUS");

    Serial.printf(
        "KEYPAD PCF 0x20: %s\n",
        keypadOK ? "OK" : "ERROR"
    );

    Serial.printf(
        "OLED 0x3C: %s\n",
        oledOK ? "OK" : "ERROR"
    );

    Serial.printf(
        "RTC 0x68: %s\n",
        rtcOK ? "OK" : "ERROR"
    );

    if (RELAY_SIMULATION_MODE) {
        Serial.println("RELAY OUTPUTS: SOFTWARE SIMULATION (16 channels)");
    } else {
        Serial.printf("ODD RELAY PCF 0x21: %s\n", oddRelayOK ? "OK" : "ERROR");
        Serial.printf("EVEN RELAY PCF 0x22: %s\n", evenRelayOK ? "OK" : "ERROR");
    }

    if (rtcOK && RTCDevice::lostPower()) {

        Serial.println(
            "WARNING: RTC LOST POWER. Set time before schedules."
        );
    }

    OLED::showBoot(
        "SYSTEM READY - MANUAL"
    );

    Serial.println();

    Serial.println("KEYPAD OPERATION:");
    Serial.println("01-16 then # = toggle selected relay");
    Serial.println("* = open OLED menu (when no relay entry is active)");
    Serial.println("A # = MANUAL | B # = MAINTENANCE");
    Serial.println("C # = AUTO | D # = EXPERIMENT");
    Serial.println("A * # = ALL 16 RELAYS ON");
    Serial.println("B * # = ALL 16 RELAYS OFF");
    Serial.println("D * # = START WIFI SETUP HOTSPOT");
    Serial.println("* then 4 # = START AUTO TEST (R1-R4, 5 cycles)");
    Serial.println("* then 5 # = STOP AUTO TEST");
    Serial.println("* then 6/7/8 # = SET 10s/30s/60s ON/OFF PRESET");

    RoomManager::RoomConfig roomConfig;
    RoomManager::get(roomConfig);
    Serial.printf("ROOM CONFIG: %s | %s | %s\n",
        roomConfig.roomId,
        roomConfig.roomName,
        roomConfig.enabled ? "ENABLED" : "DISABLED");
    Serial.printf("ROOM NVS: %s | DEVICE REGISTRY NVS: %s | REGISTERED DEVICES: %u\n",
        roomStorageOK ? "OK" : "ERROR",
        deviceStorageOK ? "OK" : "ERROR",
        DeviceRegistry::count());

    Serial.println("All 16 relay channels enabled in software.");
    Serial.printf("Relay backend: %s\n", RELAY_SIMULATION_MODE ? "SIMULATION" : "PCF8574 HARDWARE");
    Serial.printf("AUTO TEST: R%u-R%u, ON %lus / OFF %lus, %u cycles (saved configuration).\n",
        AUTO_TEST_FIRST_RELAY,
        AUTO_TEST_FIRST_RELAY + AUTO_TEST_RELAY_COUNT - 1,
        (unsigned long)(ScheduleManager::onDurationMs() / 1000UL),
        (unsigned long)(ScheduleManager::offDurationMs() / 1000UL),
        ScheduleManager::configuredCycles());
    Serial.println("Keypad: * then 4 # starts; * then 5 # stops.");
    Serial.println("Serial test console ready. Type 'help' for commands.");
}

// --------------------------------------------------
// MAIN LOOP
// --------------------------------------------------

void loop() {

    processSerialConsole();

    const char key = Keypad::readKey();

    if (key != 0) {
        processKey(key);
    }

    processComboTimeout();

    WiFiManagerCIMCMS::loop();

    MQTTManager::loop();

    RTCSync::loop();

    ScheduleManager::loop();

    updateDisplay();

    WatchdogManager::feed();
}
