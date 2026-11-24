
#pragma once
#include <Arduino.h>

namespace ScheduleManager {

void begin();
void loop();

bool startAutoTest();
void stopAutoTest();

bool configureAutoTest(
    uint32_t onMs,
    uint32_t offMs,
    uint8_t cycles
);

bool isAutoTestRunning();
bool isAutoTestComplete();

uint8_t completedCycles();
uint8_t configuredCycles();

uint32_t onDurationMs();
uint32_t offDurationMs();

String statusText();

}
