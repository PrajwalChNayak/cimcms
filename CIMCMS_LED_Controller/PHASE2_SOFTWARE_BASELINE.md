# CIMCMS LED Controller V0.4.0 – Development Baseline

## Preserved hardware configuration
- ESP32 DevKit V1.
- I2C: SDA GPIO21, SCL GPIO22, 50 kHz.
- Keypad PCF8574: 0x20.
- Relay PCF8574 banks: odd channels 0x21, even channels 0x22.
- OLED SSD1306: 0x3C.
- DS3231 RTC: 0x68.
- WS2812 data GPIO18, 24 pixels.
- All 16 relay channels are enabled in software.
- `RELAY_SIMULATION_MODE=true`; logical states do not energize physical relay outputs.

## Keypad sequences
- `A` then `#`: MANUAL.
- `B` then `#`: MAINTENANCE.
- `C` then `#`: AUTO.
- `D` then `#`: EXPERIMENT.
- `A` then `*` then `#`: all 16 logical relays ON.
- `B` then `*` then `#`: all 16 logical relays OFF.
- `D` then `*` then `#`: start Wi-Fi setup hotspot.
- `01`–`16` then `#`: toggle the selected logical relay.
- `*` when no relay selection is pending: open the OLED menu.
- `*` during relay entry: cancel selection.
- Mode confirmation timeout: 5 seconds. Special-sequence inter-key timeout: 1.5 seconds.

## OLED and menu
- Rotating status pages show operating mode, DS3231 time, Wi-Fi status, IP address, Wi-Fi RSSI, MQTT connection state, logical relay count and simulation/hardware backend.
- Press `*` with no pending relay selection to open a compact OLED menu:
  - `1`, then `#`: Manual RTC synchronization using internet NTP.
  - `2`, then `#`: Scan nearby Wi-Fi networks; first result appears on OLED and full results are printed to Serial.
  - `3`, then `#`: Show Wi-Fi/IP/MQTT information.
  - `*`: close menu.
- The display dashboard is illustrative of controller state. MQTT remains a stub in this revision and reports disconnected.

## Wi-Fi
- Wi-Fi scanner returns SSID, RSSI, security type and channel.
- The setup portal provides a scan button and allows selecting an SSID before saving credentials.
- Portal default: SSID `CIMCMS_LED_Controller`, password `CIMCMS123`, address `http://192.168.4.1`.
- Change the default AP password before deployment.
- Scanning is synchronous and may briefly pause other firmware processing.

## RTC
- DS3231 manual synchronization is available from OLED menu option `1`, or Serial command `rtc sync`.
- NTP uses `pool.ntp.org` and `time.nist.gov`, timezone UTC+05:30.
- DS3231 is adjusted only when the difference exceeds 2 seconds or the RTC reports lost power.
- Automatic daily checks are scheduled around 06:00 and 18:00 and their completion dates are stored in NVS.
- This revision does not yet implement a configurable Raspberry Pi local NTP server or manual date/time keypad editor.
- If Wi-Fi/NTP is unavailable, manual NTP sync fails; the existing RTC time remains available.

## Serial software test console
At 115200 baud, enter commands followed by newline:
- `help`
- `status`
- `relay <1-16> on`
- `relay <1-16> off`
- `relay <1-16> toggle`
- `all on`
- `all off`
- `rtc sync`
- `wifi scan`

## Not implemented yet
- MQTT connection, telemetry publishing, remote command subscription and acknowledgements.
- Complete multi-page OLED configuration menus and manual RTC date/time entry.
- Raspberry Pi local NTP preference and configurable NTP server.
- Full room schedule runtime integration.
- Production security hardening and OTA updates.

## Validation
The uploaded source archive contained a previous `.pio` build directory, but this V0.4.0 source revision has not been compiled in this editing environment. Run `pio run` in PlatformIO before uploading. Do not connect relay hardware until the build succeeds and physical integration is deliberately enabled.
