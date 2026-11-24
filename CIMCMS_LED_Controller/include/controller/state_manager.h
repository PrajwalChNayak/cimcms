
#pragma once

#include <Arduino.h>

namespace StateManager {

void begin();

void setLastKey(char key);

char lastKey();

void setSelectedRelay(int channel);

int selectedRelay();

void setStatus(
    const String &status
);

String status();

}
