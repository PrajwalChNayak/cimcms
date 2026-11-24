
#include "scheduling/schedule_manager.h"

#include "config.h"
#include "controller/led_manager.h"
#include "controller/operating_mode.h"
#include "hardware/oled.h"
#include "configuration/config_manager.h"

namespace {

enum class TestPhase : uint8_t {
    Idle,
    On,
    Off,
    Complete
};

TestPhase phase = TestPhase::Idle;

uint32_t phaseStartedAt = 0;
uint32_t lastDisplayAt = 0;

uint32_t onMs = AUTO_TEST_DEFAULT_ON_MS;
uint32_t offMs = AUTO_TEST_DEFAULT_OFF_MS;

uint8_t targetCycles = AUTO_TEST_DEFAULT_CYCLES;
uint8_t cyclesDone = 0;

void setTestRelays(bool on) {

    for (
        uint8_t i = 0;
        i < AUTO_TEST_RELAY_COUNT;
        ++i
    ) {
        const uint8_t channel =
            AUTO_TEST_FIRST_RELAY + i;

        const bool overridden =
            LEDManager::channelOverrideActive(channel);

        const bool ok =
            LEDManager::setScheduledChannel(channel, on);

        Serial.printf(
            "[AUTO TEST] R%02u -> %s | %s\n",
            channel,
            on ? "ON" : "OFF",
            overridden
                ? "SKIPPED: MANUAL OVERRIDE"
                : (ok ? "APPLIED" : "ERROR")
        );
    }
}

void showProgress() {

    const uint32_t duration =
        (phase == TestPhase::On) ? onMs : offMs;

    const uint32_t elapsed =
        millis() - phaseStartedAt;

    const uint32_t remaining =
        elapsed >= duration ? 0 : duration - elapsed;

    const uint32_t seconds =
        (remaining + 999UL) / 1000UL;

    char line1[22];
    char line2[22];

    snprintf(
        line1,
        sizeof(line1),
        "AUTO TEST %s",
        phase == TestPhase::On ? "LIGHT ON" : "LIGHT OFF"
    );

    snprintf(
        line2,
        sizeof(line2),
        "Cycle %u/%u %lus",
        (unsigned)(cyclesDone + 1),
        (unsigned)targetCycles,
        (unsigned long)seconds
    );

    OLED::showMessage(line1, line2);
}

}

namespace ScheduleManager {

void begin() {

    phase = TestPhase::Idle;
    cyclesDone = 0;

    (void)ConfigManager::getAutoTestConfig(
        onMs,
        offMs,
        targetCycles
    );

    Serial.printf(
        "[AUTO TEST] Ready: R%u-R%u, ON %lus, OFF %lus, cycles %u\n",
        AUTO_TEST_FIRST_RELAY,
        AUTO_TEST_FIRST_RELAY + AUTO_TEST_RELAY_COUNT - 1,
        (unsigned long)(onMs / 1000UL),
        (unsigned long)(offMs / 1000UL),
        targetCycles
    );
}

bool configureAutoTest(
    uint32_t newOnMs,
    uint32_t newOffMs,
    uint8_t cycles
) {

    if (
        phase == TestPhase::On ||
        phase == TestPhase::Off
    ) {
        return false;
    }

    if (
        newOnMs < 1000UL ||
        newOffMs < 1000UL ||
        cycles == 0 ||
        cycles > 100
    ) {
        return false;
    }

    if (
        !ConfigManager::setAutoTestConfig(
            newOnMs,
            newOffMs,
            cycles
        )
    ) {
        return false;
    }

    onMs = newOnMs;
    offMs = newOffMs;
    targetCycles = cycles;

    cyclesDone = 0;
    phase = TestPhase::Idle;

    Serial.printf(
        "[AUTO TEST] Configured: ON %lus, OFF %lus, cycles %u\n",
        (unsigned long)(onMs / 1000UL),
        (unsigned long)(offMs / 1000UL),
        targetCycles
    );

    return true;
}

bool startAutoTest() {

    if (
        phase == TestPhase::On ||
        phase == TestPhase::Off
    ) {
        return false;
    }

    setMode(OperatingMode::Auto);

    cyclesDone = 0;
    phase = TestPhase::On;

    phaseStartedAt = millis();
    lastDisplayAt = 0;

    Serial.println(
        "[AUTO TEST] STARTED. Four relays run together."
    );

    Serial.println(
        "[AUTO TEST] Duration timer uses millis(); RTC is not required for this short test."
    );

    // Restore persisted manual choices before the schedule begins.
    for (
        uint8_t i = 0;
        i < AUTO_TEST_RELAY_COUNT;
        ++i
    ) {
        const uint8_t channel =
            AUTO_TEST_FIRST_RELAY + i;

        if (LEDManager::channelOverrideActive(channel)) {

            const bool savedState =
                ConfigManager::overrideState(channel);

            (void)LEDManager::setChannel(
                channel,
                savedState
            );

            Serial.printf(
                "[AUTO TEST] R%02u restored from permanent override: %s\n",
                channel,
                savedState ? "ON" : "OFF"
            );
        }
    }

    setTestRelays(true);
    showProgress();

    return true;
}

void stopAutoTest() {

    const bool wasRunning =
        phase == TestPhase::On ||
        phase == TestPhase::Off;

    if (wasRunning) {
        setTestRelays(false);

        Serial.println(
            "[AUTO TEST] STOPPED by operator."
        );
    }

    phase = TestPhase::Idle;
    cyclesDone = 0;

    OLED::showMessage(
        "AUTO TEST STOPPED",
        "Relays 1-4 OFF*"
    );
}

void loop() {

    if (
        phase != TestPhase::On &&
        phase != TestPhase::Off
    ) {
        return;
    }

    const uint32_t now = millis();

    const uint32_t duration =
        (phase == TestPhase::On) ? onMs : offMs;

    if (now - phaseStartedAt >= duration) {

        phaseStartedAt = now;

        if (phase == TestPhase::On) {

            setTestRelays(false);
            phase = TestPhase::Off;

            Serial.printf(
                "[AUTO TEST] ON phase complete. Starting OFF phase for %lus.\n",
                (unsigned long)(offMs / 1000UL)
            );

        } else {

            ++cyclesDone;

            Serial.printf(
                "[AUTO TEST] Completed cycle %u/%u\n",
                cyclesDone,
                targetCycles
            );

            if (cyclesDone >= targetCycles) {

                phase = TestPhase::Complete;

                setTestRelays(false);

                Serial.printf(
                    "[AUTO TEST] COMPLETE. %u-cycle test finished.\n",
                    targetCycles
                );

                char doneLine[22];

                snprintf(
                    doneLine,
                    sizeof(doneLine),
                    "%u cycles finished",
                    (unsigned)targetCycles
                );

                OLED::showMessage(
                    "AUTO TEST COMPLETE",
                    doneLine
                );

                return;
            }

            phase = TestPhase::On;

            setTestRelays(true);

            Serial.printf(
                "[AUTO TEST] Starting cycle %u/%u ON phase.\n",
                cyclesDone + 1,
                targetCycles
            );
        }
    }

    if (now - lastDisplayAt >= 1000UL) {

        lastDisplayAt = now;
        showProgress();
    }
}

bool isAutoTestRunning() {
    return
        phase == TestPhase::On ||
        phase == TestPhase::Off;
}

bool isAutoTestComplete() {
    return phase == TestPhase::Complete;
}

uint8_t completedCycles() {
    return cyclesDone;
}

uint8_t configuredCycles() {
    return targetCycles;
}

uint32_t onDurationMs() {
    return onMs;
}

uint32_t offDurationMs() {
    return offMs;
}

String statusText() {

    if (phase == TestPhase::On) return "RUNNING: ON";
    if (phase == TestPhase::Off) return "RUNNING: OFF";
    if (phase == TestPhase::Complete) return "COMPLETE";

    return "IDLE";
}

}
