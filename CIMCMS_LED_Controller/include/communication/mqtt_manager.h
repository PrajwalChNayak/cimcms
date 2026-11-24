
#pragma once

#include <Arduino.h>

namespace MQTTManager {

void begin();

void loop();

bool connected();

void publishStatus();

}
