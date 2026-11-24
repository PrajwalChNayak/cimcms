# CIMCMS LED Controller – Mode Configuration Implementation

Firmware baseline: V0.4.1-dev1 (based on uploaded V0.4.0 source)

## Implemented in this revision

- `RELAY_SIMULATION_MODE` is enabled by default. All 16 logical relay channels can be exercised without the relay PCF8574 boards connected.
- ESP32 Preferences/NVS storage is used for 16 per-relay override flags and desired states.
- In AUTO and EXPERIMENT modes, operator-originated channel changes create a permanent override for that channel.
- `all on` / `all off` and the keypad all-channel actions apply individual permanent overrides in AUTO/EXPERIMENT.
- MANUAL and MAINTENANCE operator actions do not create schedule overrides.
- Override records survive restart. Startup still forces all outputs OFF for safety; the firmware does not automatically restore ON outputs from NVS.
- Serial commands are available:
  - `override status`
  - `override clear 1` through `override clear 16`
  - `override clear all`
- A local schedule revision counter is persisted as groundwork for revision-based shared schedule editing.

## Operating policy

| Mode | Operator action | Override behaviour |
|---|---|---|
| MANUAL | Set/toggle relay | No override record |
| MAINTENANCE | Set/toggle relay | No override record |
| AUTO | Set/toggle relay | Permanent per-relay override |
| EXPERIMENT | Set/toggle relay | Permanent per-relay override |

An override is not cleared by a mode change or reboot. It is cleared only by an explicit clear operation.

## Important limitations – not implemented yet

- The schedule engine is still a placeholder. No AUTO or EXPERIMENT schedule is executed by this revision.
- The shared local/server schedule editor, MQTT schedule sync, conflict resolution, server audit history and remote override controls are not implemented yet.
- The schedule revision value is storage groundwork only; it does not mean schedule synchronization is operational.
- The current serial console is the only implemented override-clear interface in this revision. Keypad menu and web controls are future work.
- The existing MQTT manager remains a placeholder. No remote relay command/acknowledgement flow is claimed.
- `setMode()` still changes the in-memory operating mode; mode persistence/automatic mode restoration is deliberately not enabled. The controller starts in MANUAL after reboot.

## Hardware safety

- Simulation is enabled by default. Set `RELAY_SIMULATION_MODE` to `false` only after reconnecting and verifying both relay PCF8574 banks at 0x21 and 0x22.
- All outputs are commanded OFF at startup.
- Validate relay polarity and physical output behaviour before connecting loads.

## Build verification

This source revision has not been compiled in this environment because PlatformIO CLI is not installed here. Run `pio run` in the project directory on the development PC before flashing. Do not treat this ZIP as a verified firmware binary.
