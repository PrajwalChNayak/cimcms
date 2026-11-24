# CIMCMS LED Controller V0.5.0-dev1 – Room & Device Management Foundation

## Architecture
- One logical cultivation room is supported initially (default ROOM-001).
- There is no zone manager and no hard-coded relay-to-room mapping.
- Device identities are independent of controller output assignments.
- LED Controller relay channels 1–16 can be assigned to registered devices.
- An active LED relay channel can belong to only one enabled device at a time.
- Device registry and room configuration are persisted using ESP32 Preferences/NVS.
- LED Controller output mapping is currently relay-only. Future damper/lock, humidifier and environmental controllers have separate controller identities and must own their own outputs and feedback/safety logic.

## New modules
- `room/room_manager`: room configuration and NVS persistence.
- `devices/device_types`: device, controller and output type enums.
- `devices/device_registry`: fixed-capacity device registry, validation, lookup and persistence.
- `devices/device_assignment`: assign/unassign LED relay channels.

## Capacity
- Maximum registered devices: 16 (initial firmware limit).
- Maximum output channels per device: 4.
- LED relay channels: 1–16.

## Important integration status
These are foundation modules and are not yet wired into the keypad/OLED menu or production scheduler. The existing relay test and manual control path are intentionally left unchanged. Variety profiles, production batches, device schedules, user-interface commands, MQTT synchronization and production schedule execution are not implemented in this milestone.

## Safety
`RELAY_SIMULATION_MODE` remains true. Do not enable physical relay outputs until the hardware is connected, the output polarity and wiring are verified, and the firmware has been built and tested. A lock/damper must not be driven as a generic lamp; it requires actuator-specific interlocks and position feedback.

## Build verification
This source package has not been compiled in this editing environment. Run `pio run` in PlatformIO before uploading. Resolve any compiler warnings/errors before device testing.
