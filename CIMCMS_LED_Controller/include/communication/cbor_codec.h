
#pragma once

#include <Arduino.h>

namespace CborCodec {

bool encodeStatus(
    String &output
);

bool decodeCommand(
    const uint8_t *data,
    size_t length,
    String &output
);

}
