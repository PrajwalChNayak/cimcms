#pragma once
#include <Arduino.h>

namespace RoomManager {
struct RoomConfig {
    char roomId[16];
    char roomName[32];
    bool enabled;
};

bool begin();
bool load();
bool save();
bool get(RoomConfig &out);
bool configure(const char *roomId, const char *roomName, bool enabled);
}
