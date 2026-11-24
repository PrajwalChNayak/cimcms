
#include "controller/operating_mode.h"

namespace {
OperatingMode mode = OperatingMode::Manual;
}

const char *modeName(OperatingMode value) {

    switch (value) {

        case OperatingMode::Auto:
            return "AUTO";

        case OperatingMode::Maintenance:
            return "MAINT";

        case OperatingMode::Experiment:
            return "EXPERIMENT";

        default:
            return "MANUAL";
    }
}

OperatingMode currentMode() {
    return mode;
}

void setMode(OperatingMode value) {
    mode = value;
}
