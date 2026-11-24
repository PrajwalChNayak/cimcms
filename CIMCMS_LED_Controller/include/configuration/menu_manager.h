
#pragma once

#include <Arduino.h>

namespace MenuManager {

void begin();
void open();
void processKey(char key);
bool isMenuOpen();

}
