#pragma once
#include <Arduino.h>

namespace RTCSync {
void begin();
void loop();
bool syncNow();
bool lastSyncSucceeded();
String lastSyncSource();
String lastSyncText();
}
