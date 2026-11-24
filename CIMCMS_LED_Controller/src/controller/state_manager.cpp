
#include "controller/state_manager.h"

namespace {

char key = 0;

int selected = 0;

String message = "READY";

}

namespace StateManager {

void begin() {

    key = 0;

    selected = 0;

    message = "READY";

}

void setLastKey(char value) {

    key = value;

}

char lastKey() {

    return key;

}

void setSelectedRelay(int channel) {

    selected = channel;

}

int selectedRelay() {

    return selected;

}

void setStatus(const String &value) {

    message = value;

}

String status() {

    return message;

}

}
