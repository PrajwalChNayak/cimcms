#include "room/room_manager.h"
#include <Preferences.h>
#include <string.h>

namespace {
Preferences prefs;
RoomManager::RoomConfig room = {"ROOM-001", "Mushroom Cultivation Room", true};
bool ready = false;
}

namespace RoomManager {
bool begin() {
    ready = prefs.begin("cimcms-room", false);
    if (!ready) Serial.println("[ROOM] NVS namespace unavailable");
    return ready;
}

bool load() {
    if (!ready) return false;

    // First boot: create the default room record without querying a missing blob.
    if (!prefs.isKey("room")) {
        if (!save()) {
            Serial.println("[ROOM] ERROR: could not save default ROOM-001 record");
            return false;
        }
        Serial.println("[ROOM] First boot: default ROOM-001 saved to NVS");
        return true;
    }

    const size_t storedLength = prefs.getBytesLength("room");
    if (storedLength != sizeof(RoomConfig)) {
        Serial.printf("[ROOM] ERROR: invalid NVS record size (%u bytes)\n",
                      (unsigned)storedLength);
        return false;
    }

    RoomConfig stored = {};
    if (prefs.getBytes("room", &stored, sizeof(stored)) != sizeof(stored) ||
        stored.roomId[0] == '\0' || stored.roomName[0] == '\0' ||
        strnlen(stored.roomId, sizeof(stored.roomId)) >= sizeof(stored.roomId) ||
        strnlen(stored.roomName, sizeof(stored.roomName)) >= sizeof(stored.roomName)) {
        Serial.println("[ROOM] ERROR: invalid room data in NVS");
        return false;
    }

    room = stored;
    Serial.println("[ROOM] Room configuration loaded from NVS");
    return true;
}

bool save() {
    return ready && prefs.putBytes("room", &room, sizeof(room)) == sizeof(room);
}

bool get(RoomConfig &out) {
    out = room;
    return true;
}

bool configure(const char *roomId, const char *roomName, bool enabled) {
    if (!ready || !roomId || !roomName || !roomId[0] || !roomName[0] ||
        strlen(roomId) >= sizeof(room.roomId) ||
        strlen(roomName) >= sizeof(room.roomName)) return false;
    RoomConfig candidate = {};
    strlcpy(candidate.roomId, roomId, sizeof(candidate.roomId));
    strlcpy(candidate.roomName, roomName, sizeof(candidate.roomName));
    candidate.enabled = enabled;
    RoomConfig previous = room;
    room = candidate;
    if (!save()) { room = previous; return false; }
    return true;
}
}
