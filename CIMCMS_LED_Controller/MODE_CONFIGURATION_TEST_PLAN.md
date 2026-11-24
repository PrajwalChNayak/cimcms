# Mode / Override Test Plan (V0.4.1-dev1)

Run with relay hardware disconnected and `RELAY_SIMULATION_MODE=true`.

1. Build the project with `pio run`; resolve any compiler errors before flashing.
2. Flash and open Serial Monitor at 115200 baud.
3. Confirm boot reports `RELAY OUTPUTS: SOFTWARE SIMULATION (16 channels)` and `NVS CONFIG: LOADED`.
4. Enter `C#` to select AUTO. Enter `relay 03 on`.
5. Run `override status`; expect `R03 OVERRIDE=ON`.
6. Enter `relay 03 off`; expect `R03 OVERRIDE=OFF`.
7. Run `override clear 3`; expect `OVERRIDE CLEAR: OK`; `override status` should no longer list R03.
8. Enter `D#` to select EXPERIMENT. Run `all on`; verify all 16 states ON and all 16 overrides are listed.
9. Run `override clear all`; verify no override entries remain.
10. Restart the ESP32. Confirm all outputs start OFF. Any override records not explicitly cleared should still appear in `override status`.
11. Enter MANUAL (`A#`), change a relay and verify it does not create a new override.
12. Repeat in MAINTENANCE (`B#`) and verify it does not create a new override.

Note: this revision stores override intent across restart but deliberately does not restore relay outputs to ON at boot. The future scheduler must consult `ConfigManager::isOverrideActive(channel)` before applying any scheduled transition.
