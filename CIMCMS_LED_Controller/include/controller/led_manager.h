
#pragma once
#include <Arduino.h>

namespace LEDManager {

void begin();

bool setChannel(uint8_t channel, bool on);
bool toggleChannel(uint8_t channel);

bool allOn();
void allOff();

bool channelState(uint8_t channel);
void refreshIndicators();

// Operator-originated commands create permanent overrides in AUTO/EXPERIMENT.
bool operatorSetChannel(uint8_t channel, bool on);
bool operatorToggleChannel(uint8_t channel);
bool operatorAllOn();
bool operatorAllOff();

// Scheduler-originated commands are ignored for overridden relays.
bool setScheduledChannel(uint8_t channel, bool on);

bool channelOverrideActive(uint8_t channel);
bool clearChannelOverride(uint8_t channel);
bool clearAllOverrides();

}
