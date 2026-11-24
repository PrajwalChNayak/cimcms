#pragma once

#include <Arduino.h>

namespace RelayDriver {

bool begin();
bool set(uint8_t channel, bool on);
bool toggle(uint8_t channel);
bool getState(uint8_t channel);
bool isAvailable(uint8_t channel);

bool allOn();
void allOff();

uint8_t oddBankValue();
uint8_t evenBankValue();

}