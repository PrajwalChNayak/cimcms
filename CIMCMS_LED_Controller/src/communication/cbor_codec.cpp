
#include "communication/cbor_codec.h"

// CBOR protocol implementation will be added
// when the MQTT payload format is finalized.

namespace CborCodec {

bool encodeStatus(String &output) {

    output = "";

    return false;

}

bool decodeCommand(
    const uint8_t *data,
    size_t length,
    String &output
) {

    (void)data;
    (void)length;

    output = "";

    return false;

}

}
