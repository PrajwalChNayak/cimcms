
#pragma once

#include <Arduino.h>

namespace Keypad {

bool begin();

// Returns one detected key per press.
// Returns '\0' when no new key is detected.

char readKey();

bool isReady();

}
