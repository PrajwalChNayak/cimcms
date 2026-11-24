
#include "communication/command_handler.h"

// Remote command handling is intentionally inactive.
// We will implement validated, versioned MQTT commands
// after establishing the Raspberry Pi protocol.

namespace CommandHandler {

bool handle(const String &payload) {

    (void)payload;

    return false;

}

}
