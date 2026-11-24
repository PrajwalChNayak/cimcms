
#include "configuration/room_allocation.h"

namespace RoomAllocation {

uint8_t roomForRelay(uint8_t channel) {

    if (channel < 1 || channel > 16) {
        return 0;
    }

    if (channel <= 4) return 1;

    if (channel <= 7) return 2;

    if (channel <= 10) return 3;

    if (channel <= 13) return 4;

    return 5;

}

const char *roomName(uint8_t room) {

    static const char *names[] = {

        "UNKNOWN",
        "ROOM 1",
        "ROOM 2",
        "ROOM 3",
        "ROOM 4",
        "ROOM 5"

    };

    if (room > 5) {
        return "UNKNOWN";
    }

    return names[room];

}

}
