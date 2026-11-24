# CIMCMS LED Controller V0.5.0 Maintenance Update

Baseline: user-uploaded `CIMCMS_LED_Controller(7).zip`. Firmware version remains `0.5.0-dev1`.

## Changes
1. Room Manager checks `Preferences::isKey("room")` before reading the blob. On first boot, it writes the default ROOM-001 record to NVS.
2. Device Registry checks `Preferences::isKey("registry")` before reading the blob. On first boot, it writes an empty registry record to NVS.
3. Existing room and device records are size-checked and validated before loading.
4. Startup AUTO TEST banner now reads ON/OFF durations and cycle count from ScheduleManager, rather than printing a hard-coded 60s/60s/5 value.

## Preserved
- Relay simulation remains enabled in `include/config.h`.
- Existing permanent manual-override logic is unchanged.
- Automatic test state machine and timing logic are unchanged.
- Keypad, OLED, RTC, WS2812, Wi-Fi, and MQTT implementations are otherwise unchanged.

## Build status
This is a source-level maintenance patch. PlatformIO is not available in the current execution environment, so the project has **not been compiled here**. Compile in PlatformIO and test on the ESP32 before relying on the update.
