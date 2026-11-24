
#pragma once

#include <Arduino.h>

namespace RoomAllocation {

constexpr uint8_t ROOM_COUNT = 5;

uint8_t roomForRelay(
    uint8_t relayChannel
);

const char *roomName(
    uint8_t room
);

}
