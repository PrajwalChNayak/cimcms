# CIMCMS LED Controller -- Website, Cloud & Integration Handover

**Document purpose:** Technical handover for the developer designing the
CIMCMS web application and configuring the cloud/backend
infrastructure.\
**Project:** CIMCMS -- Mushroom Cultivation Management System\
**Module:** LED Controller V1\
**Document status:** Architecture and requirements handover; MQTT/cloud
implementation details remain to be configured and validated.\
**Prepared:** 20 November 2026

------------------------------------------------------------------------

## 1. Project overview

CIMCMS is a modular mushroom cultivation automation system. The LED
Controller is one independent ESP32-based controller in the wider CIMCMS
system. It controls up to 16 lighting circuits distributed across
cultivation rooms.

The website must provide:

-   Live visibility of the LED controller and its 16 logical/physical
    relay states.
-   Remote ON/OFF control of individual channels and groups.
-   Operating-mode visibility and configuration.
-   RTC/time synchronization visibility.
-   Wi-Fi/network and MQTT connection diagnostics.
-   Command acknowledgements and event history.
-   Room-wise lighting schedules and experiment configuration (planned
    features).
-   A secure interface usable from desktop, tablet and mobile devices.

The LED Controller must remain a separate firmware module. The existing
CIMCMS Humidifier device is another device on the same CIMCMS MQTT
infrastructure; do not merge its firmware or device configuration into
the LED Controller.

## 2. Important implementation-status distinction

This document combines (a) decisions and requirements agreed during
project discussions, (b) features reported as tested by the user, and
(c) future website/cloud work. These categories must not be confused.

### 2.1 User-reported tests

The user reported successful RTC synchronization and nearby Wi-Fi
scanning in the V0.4.0 test session.

### 2.2 Source archive inspection warning

The latest source archive inspected for this handover was named
`CIMCMS_LED_Controller(3).zip`. Its `include/version.h` identifies
firmware as **0.3.0**, and its `PHASE2_SOFTWARE_BASELINE.md` describes
an earlier keypad mapping. In that archive:

-   Relay simulation is enabled by default.
-   All 16 relay channels are intended to be available in simulation.
-   MQTT manager functions are placeholders and `connected()` returns
    false.
-   RTC synchronization module is a stub.
-   Wi-Fi scanner source file is empty.
-   Menu manager is a stub.
-   The source archive's keypad documentation uses the earlier shortcuts
    `A/B` after timeout and `D → # → #` for the portal.

Therefore, the reported V0.4.0 RTC/Wi-Fi tests refer to a different or
later source package than the archive inspected here. Before
implementation, the firmware developer and website developer should
agree on the exact current source revision and commit/version. Do not
assume the inspected ZIP contains all V0.4.0 functions.

### 2.3 Status summary

  -----------------------------------------------------------------------
  Capability                          Status for planning
  ----------------------------------- -----------------------------------
  ESP32 16-channel logical relay      Existing baseline implementation
  model                               

  Relay simulation mode               Present and enabled by default in
                                      inspected source

  Keypad individual relay             Present in baseline
  selection/toggle                    

  OLED and WS2812 hardware drivers    Present in baseline

  DS3231 hardware driver              Present in baseline

  RTC manual/NTP sync                 User reported successful in V0.4.0;
                                      must verify against agreed source

  Nearby Wi-Fi scan/RSSI              User reported successful in V0.4.0;
                                      must verify against agreed source

  OLED full dashboard/configuration   Requirements agreed; complete
  menus                               implementation needs verification

  MQTT connection and telemetry       Not implemented in inspected source

  MQTT remote command handler         Not implemented in inspected source

  Node.js API / WebSocket backend     To be developed

  React web dashboard                 To be developed

  Database and event history          To be selected/configured

  Room-wise schedule execution        Future firmware/backend work

  Experiment configuration/execution  Future firmware/backend work

  Production security and deployment  To be configured
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 3. Hardware and embedded platform

### 3.1 Main controller

-   MCU: ESP32 DevKit V1.
-   Framework: Arduino framework on PlatformIO.
-   PlatformIO environment: `esp32dev`.
-   Serial monitor: 115200 baud.
-   Firmware architecture: modular C++ source files, not one large
    `main.cpp`.

### 3.2 Confirmed hardware and wiring

  -----------------------------------------------------------------------
  Component               Address / connection    Purpose
  ----------------------- ----------------------- -----------------------
  ESP32 I²C SDA           GPIO 21                 I²C bus

  ESP32 I²C SCL           GPIO 22                 I²C bus

  WS2812 data             GPIO 18                 24 status pixels

  PCF8574 keypad expander `0x20`                  4×4 keypad

  PCF8574 odd relay bank  `0x21`                  Relay
                                                  1,3,5,7,9,11,13,15

  PCF8574 even relay bank `0x22`                  Relay
                                                  2,4,6,8,10,12,14,16

  SSD1306 OLED            `0x3C`                  Local display, 128×64

  DS3231 RTC              `0x68`                  Local timekeeping

  WS2812 indicators       24 pixels               Status/selection
                                                  indicators; not grow
                                                  lights

  Relay outputs           16 channels             Lighting circuit
                                                  control
  -----------------------------------------------------------------------

I²C bus settings in the inspected source: 50 kHz clock and 100 ms
timeout.

**Electrical safety:** ESP32 GPIO/I²C is 3.3 V logic and is not 5 V
tolerant. Ensure appropriate pull-up voltage and common ground. Relay
board polarity is assumed active-LOW in firmware but must be confirmed
against the actual board before physical operation. Do not connect mains
lighting loads during software simulation tests.

### 3.3 Relay channel mapping

Odd PCF8574 address `0x21`:

-   P0 → Relay 1
-   P1 → Relay 3
-   P2 → Relay 5
-   P3 → Relay 7
-   P4 → Relay 9
-   P5 → Relay 11
-   P6 → Relay 13
-   P7 → Relay 15

Even PCF8574 address `0x22`:

-   P0 → Relay 2
-   P1 → Relay 4
-   P2 → Relay 6
-   P3 → Relay 8
-   P4 → Relay 10
-   P5 → Relay 12
-   P6 → Relay 14
-   P7 → Relay 16

All 16 channels must remain enabled in software. Relay 1 and Relay 3
must not be locked out.

### 3.4 Simulation and physical mode

The inspected source has:

``` cpp
constexpr bool RELAY_ACTIVE_LOW = true;
constexpr bool RELAY_SIMULATION_MODE = true;
```

-   `true`: update logical states in firmware without energizing
    physical relay hardware.
-   `false`: use the physical PCF8574 relay output path. Only change
    this after connecting and validating the relay banks.
-   All 16 logical channels remain available in both designs.
-   Simulation mode is a compile-time setting in the current baseline,
    not a web or keypad toggle.

For the first web integration, retain simulation mode. The UI must
clearly label the controller **SIMULATION** and must not claim that a
physical lamp is illuminated. Display "commanded/logical relay state"
until physical feedback sensors or auxiliary contacts exist.

------------------------------------------------------------------------

## 4. Operating modes and keypad specification

The intended operating modes have different responsibilities. A mode
selection must eventually activate its associated control policy;
changing only the OLED label is not sufficient.

  -----------------------------------------------------------------------
  Mode                    Intended function       Implementation status
  ----------------------- ----------------------- -----------------------
  MANUAL                  Operator controls       Basic local logical
                          individual relays       relay control exists;
                          locally or through      remote control is
                          authorized remote       future
                          commands                

  MAINTENANCE             Suspend normal          Policy and restrictions
                          automatic schedule;     still to implement
                          permit authorized       
                          diagnostic/service      
                          operations              

  AUTO                    Execute configured      Schedule engine/runtime
                          room-wise lighting      integration still to
                          schedules               implement

  EXPERIMENT              Execute a separately    Experiment
                          configured experimental configuration and
                          lighting programme      execution still to
                                                  implement
  -----------------------------------------------------------------------

### 4.1 Agreed keypad sequences

The latest agreed keypad design in the conversation is:

  Sequence              Action
  --------------------- ------------------------------------------
  `A → #`               Confirm MANUAL
  `B → #`               Confirm MAINTENANCE
  `C → #`               Confirm AUTO
  `D → #`               Confirm EXPERIMENT
  `D → * → #`           Start Wi-Fi configuration portal
  `A → * → #`           All 16 logical relays ON
  `B → * → #`           All 16 logical relays OFF
  `01`--`16` then `#`   Select/toggle an individual relay
  `*`                   Cancel/back, subject to sequence context
  `#`                   Confirm/enter

Mode selection should have a confirmation timeout (planned: 5 seconds).
Special multi-key sequences should have a bounded inter-key timeout
(planned: 1.5 seconds). The firmware must prioritize special sequences
so they are not mistaken for ordinary mode or menu selections.

**Revision reconciliation required:** The inspected ZIP documents an
older mapping (`A/B/D` selected after timeout and `D → # → #` opened
Wi-Fi portal). The newer agreed mapping above supersedes that older
documentation and must be implemented in the authoritative firmware
revision.

### 4.2 Mode configuration requirements

The web application should expose configuration and status for:

-   MANUAL: local/remote permissions, individual relay and room
    grouping, temporary override duration if enabled.
-   MAINTENANCE: maintenance state, authorized operator, permitted test
    actions, maintenance log.
-   AUTO: room-to-relay assignment, schedule, days of week, time zone,
    schedule enable state, source/version.
-   EXPERIMENT: experiment ID, room/channel allocation, start/end dates,
    daily schedule, duration, experiment metadata and logs.

A mode must not silently run if its required configuration is missing.
Example: AUTO without a valid schedule should report
`AUTO_NOT_CONFIGURED` and remain in a safe state.

### 4.3 Recommended control policy (proposal requiring owner approval)

-   Raspberry Pi/backend is the central authority for schedules and room
    assignments.
-   ESP32 executes a validated local schedule cache if the network
    becomes unavailable.
-   MANUAL override during AUTO/EXPERIMENT should initially be a
    temporary override with a configurable duration, then return to the
    active schedule. Confirm this policy with the project owner before
    implementation.
-   MAINTENANCE should suspend schedule execution and require explicit
    exit before AUTO resumes.
-   On boot, initialize outputs to OFF, load and validate configuration,
    establish time validity, then allow the selected operating policy to
    run. Do not blindly restore stale ON states.

------------------------------------------------------------------------

## 5. RTC and time management

### 5.1 Hardware and time zone

-   RTC: DS3231 at I²C address `0x68`.
-   Display time zone: `Asia/Kolkata` (UTC+05:30).
-   Store timestamps in UTC in the backend/database; render local time
    in the UI.
-   Raspberry Pi local NTP is the preferred future source.
-   Internet NTP is the fallback (the inspected baseline documentation
    references `pool.ntp.org` and `time.nist.gov`).
-   Planned daily sync checks: 06:00 and 18:00 local time.
-   Planned correction threshold: update DS3231 only when RTC/NTP
    difference exceeds 2 seconds.
-   Provide a Manual Sync Now action.
-   If network time is unavailable, provide manual date/time setting
    from the local interface (implementation required).

### 5.2 RTC telemetry fields

Suggested fields:

``` json
{
  "rtc": {
    "available": true,
    "valid": true,
    "time_utc": "2026-11-20T12:00:00Z",
    "timezone": "Asia/Kolkata",
    "sync_source": "raspberry_pi_ntp",
    "last_sync_utc": "2026-11-20T12:00:00Z",
    "last_sync_result": "success",
    "drift_ms": 850,
    "lost_power": false
  }
}
```

This is a proposed schema, not a currently published payload.

------------------------------------------------------------------------

## 6. Wi-Fi configuration and diagnostics

Required embedded functions:

-   Scan nearby Wi-Fi networks.
-   Show SSID, RSSI (dBm), channel and security type.
-   Classify signal strength.
-   Select SSID and enter password.
-   Connect, verify, save credentials and reconnect after reboot.
-   Display connection status, local IP address, SSID and RSSI on OLED.
-   Provide configuration portal using the agreed keypad shortcut
    `D → * → #`.

Suggested RSSI labels:

  RSSI             Label
  ---------------- -----------
  -30 to -50 dBm   Excellent
  -51 to -60 dBm   Very good
  -61 to -70 dBm   Good
  -71 to -80 dBm   Weak
  Below -80 dBm    Very weak

The inspected baseline documents a development portal SSID
`CIMCMS_LED_Controller`, development password `CIMCMS123`, and portal
address `http://192.168.4.1`. Treat this password as development-only;
change it before deployment. Do not expose Wi-Fi passwords in telemetry,
logs or the web UI.

------------------------------------------------------------------------

## 7. Proposed system architecture

### 7.1 Logical architecture

``` text
                    REMOTE USER
              Desktop / Tablet / Mobile
                         |
                       HTTPS
                         |
              React Web Application
                         |
                 REST API + WebSocket
                         |
                Node.js Backend Service
                 /          |          \
                /           |           \
        MQTT Client     Database     Auth/RBAC
             |
         MQTT over TLS
             |
       Mosquitto Broker
       Public endpoint:
       148.135.137.198
             |
       Internet / Wi-Fi
             |
       ESP32 LED Controller
       - 16 relay channels
       - Keypad and OLED
       - DS3231 RTC
       - Wi-Fi diagnostics
       - WS2812 status pixels
```

The existing CIMCMS Humidifier can publish to the same broker under its
own device namespace. Keep its firmware and device identity independent.

### 7.2 Recommended technology stack

  -----------------------------------------------------------------------
  Layer                   Recommended technology  Responsibility
  ----------------------- ----------------------- -----------------------
  Web frontend            React.js + TypeScript   Responsive dashboard
                                                  and configuration

  UI styling              Tailwind CSS or an      Consistent responsive
                          agreed component        UI
                          library                 

  Backend                 Node.js + TypeScript    REST API, auth, MQTT
                          (Express or Fastify)    integration

  Real-time browser       Socket.IO over secure   Push state/events to
  updates                 WebSocket (WSS)         browsers

  Device messaging        MQTT / Mosquitto        ESP32 command and
                                                  telemetry transport

  Database                PostgreSQL              Users, roles, devices,
                                                  rooms, schedules,
                                                  commands, audit trail

  Time-series storage     InfluxDB (optional)     High-volume telemetry
                                                  and historical
                                                  measurements

  Reverse proxy           Nginx                   HTTPS termination and
                                                  routing

  TLS certificates        Let's Encrypt or        HTTPS/WSS/MQTTS
                          managed certificate     

  Deployment              Docker Compose          Repeatable services and
                          initially               configuration

  Monitoring              Service logs + health   Operations and
                          checks; add             diagnostics
                          Prometheus/Grafana if   
                          needed                  
  -----------------------------------------------------------------------

**Database decision:** PostgreSQL is the recommended system-of-record
for application entities and command/audit records. InfluxDB is optional
and should be added only if time-series volume/analysis warrants it. Do
not make the initial deployment unnecessarily complex.

### 7.3 Why the browser should not connect directly to MQTT

The React application must not contain the broker's username/password or
privileged MQTT credentials. The browser should authenticate to the
Node.js backend using HTTPS. The backend validates authorization,
publishes MQTT commands and forwards approved updates to the browser
over WSS.

------------------------------------------------------------------------

## 8. MQTT broker and topic design

### 8.1 Existing broker details known from testing

-   Broker host/IP: `148.135.137.198`
-   Port tested: `1883`
-   Username used during manual tests: `mqttuser`
-   Basic TCP connectivity and MQTT authentication/subscription were
    tested successfully from Windows.
-   The user successfully received a test message from a subscriber.
-   An existing Humidifier status topic was observed:
    `cimcms/humidifier/CIMCMS-4765B7A0/status`
-   The observed payload was the text `offline`.

**Credentials:** Do not put real passwords in this document, source
control, frontend code or cloud prompts. The website/cloud developer
must request or provision credentials through a secure secret-sharing
method and rotate any development credentials before production.

**Production recommendation:** Port 1883 is unencrypted unless
separately protected. Configure MQTT over TLS (normally 8883),
per-device/service accounts, topic ACLs and strong unique secrets before
internet-facing production use.

### 8.2 Proposed LED Controller topic namespace

Use a stable device ID. Proposed example: `LED-01`. Confirm final ID
format before provisioning.

  ------------------------------------------------------------------------------------
  Topic                           Direction               Purpose
  ------------------------------- ----------------------- ----------------------------
  `cimcms/led/LED-01/status`      Device → broker →       Online/offline, firmware,
                                  backend                 mode

  `cimcms/led/LED-01/telemetry`   Device → backend        Relay states,
                                                          RTC/network/device data

  `cimcms/led/LED-01/command`     Backend → device        Relay, mode, sync and
                                                          configuration commands

  `cimcms/led/LED-01/ack`         Device → backend        Command
                                                          accepted/rejected/executed

  `cimcms/led/LED-01/event`       Device → backend        Keypad changes, errors,
                                                          state transitions

  `cimcms/led/LED-01/config`      Backend → device        Validated
                                                          configuration/schedule
                                                          delivery
  ------------------------------------------------------------------------------------

Use MQTT QoS 1 for commands and acknowledgements. Commands must have
unique IDs, expiry, duplicate suppression and validation. Use retained
messages selectively for last-known status/configuration; a retained
`online` state alone is not proof the device is currently connected.
Configure Last Will and Testament (LWT) to publish `offline` when the
device connection is lost.

### 8.3 Proposed telemetry payload

Publish the full current logical state after every successful state
change and periodically as a heartbeat.

``` json
{
  "schema_version": 1,
  "device_id": "LED-01",
  "firmware_version": "x.y.z",
  "timestamp_utc": "2026-11-20T12:30:00Z",
  "mode": "MANUAL",
  "simulation_mode": true,
  "connectivity": {
    "wifi_connected": true,
    "ip": "192.168.1.105",
    "rssi_dbm": -52,
    "mqtt_connected": true
  },
  "relay_states": [
    false, true, false, false,
    false, false, false, false,
    false, false, false, false,
    false, false, false, false
  ],
  "relay_on_count": 1,
  "rtc": {
    "valid": true,
    "sync_source": "internet_ntp",
    "last_sync_utc": "2026-11-20T12:00:00Z"
  }
}
```

The IP/RSSI values above are examples. The `relay_states` array must
always have exactly 16 entries in channel order 1--16. Since simulation
mode is true, the dashboard must label these as logical states.

### 8.4 Proposed command payload

``` json
{
  "schema_version": 1,
  "command_id": "UUID",
  "device_id": "LED-01",
  "issued_at_utc": "2026-11-20T12:35:00Z",
  "expires_at_utc": "2026-11-20T12:36:00Z",
  "source": "web",
  "action": "SET_RELAY",
  "relay": 1,
  "state": "ON"
}
```

Other planned actions may include:

-   `SET_ALL_RELAYS`
-   `SET_MODE`
-   `RTC_SYNC_NOW`
-   `REQUEST_STATUS`
-   `APPLY_CONFIG`

Implement only after defining authorization and validation rules. Reject
unknown actions, invalid relay numbers, expired commands, wrong device
IDs and duplicate command IDs.

### 8.5 Proposed acknowledgement payload

``` json
{
  "schema_version": 1,
  "command_id": "same-command-UUID",
  "device_id": "LED-01",
  "result": "EXECUTED",
  "action": "SET_RELAY",
  "relay": 1,
  "requested_state": "ON",
  "reported_state": "ON",
  "timestamp_utc": "2026-11-20T12:35:02Z",
  "simulation_mode": true
}
```

Use clear result values such as `ACCEPTED`, `EXECUTED`, `REJECTED`,
`EXPIRED`, `DUPLICATE` and `FAILED`. Do not tell the web user a command
succeeded merely because the backend published it; show pending until a
matching device acknowledgement/telemetry update arrives.

------------------------------------------------------------------------

## 9. Web application screens and functionality

### 9.1 Dashboard

-   Overall CIMCMS system overview.
-   LED Controller online/offline status.
-   Simulation/hardware indicator.
-   Current mode.
-   Wi-Fi SSID, IP and RSSI.
-   MQTT connection state and last-seen time.
-   RTC validity, current time and last synchronization.
-   Count of relays ON out of 16.
-   Recent commands, events and errors.

### 9.2 LED control page

-   16 individual relay cards, numbered 1--16.
-   ON/OFF control for each channel.
-   All ON and All OFF controls, with confirmation dialog.
-   Logical state vs physical state clearly distinguished.
-   Command pending/success/failure indicator.
-   Last state-change time and command source.
-   Room/group view once room allocation is configured.

### 9.3 Operating mode page

-   MANUAL, MAINTENANCE, AUTO and EXPERIMENT selection.
-   Display current mode and mode-change history.
-   Confirmation dialog before changing mode.
-   Show configuration readiness for AUTO and EXPERIMENT.
-   Do not activate AUTO/EXPERIMENT if required schedules/configurations
    are missing.
-   Show maintenance status and permissions.

### 9.4 Room and relay allocation

Planned configurable entities:

-   Room ID and room name.
-   Controller/device assignment.
-   Relay channel allocation.
-   Room lighting schedule.
-   Enabled/disabled state.
-   Conflict validation: a relay should not be assigned to two rooms
    unless explicitly supported.

The example mapping of five rooms across 16 channels is illustrative
only. Actual room assignment must be supplied by the project owner.

### 9.5 Schedule configuration (AUTO)

-   Room-wise daily schedule.
-   Start and stop times.
-   Days of week.
-   Effective date and optional end date.
-   Time zone `Asia/Kolkata`.
-   Schedule version and last-published time.
-   Validation for overlapping/conflicting rules.
-   Publish schedule to device and receive application acknowledgement.
-   Local cached schedule support for temporary network outage
    (planned).

### 9.6 Experiment configuration

-   Experiment ID/name and description.
-   Selected rooms/channels.
-   Start/end dates.
-   Daily lighting periods and duration.
-   Experimental group/condition labels.
-   Versioned configuration.
-   Start, pause, stop and completion status.
-   Audit/event history.

### 9.7 Network and device configuration

-   Device identity and firmware version.
-   Wi-Fi status, IP, RSSI and last reconnect.
-   MQTT connection and last message.
-   Broker configuration shown only to authorized administrators.
-   RTC status, time source, last sync and manual sync request.
-   Wi-Fi scanning is a device-local function; show scan results only
    when reported by device.
-   Do not expose Wi-Fi passwords or MQTT secrets.

### 9.8 Events and audit history

Record:

-   Relay state changes.
-   Commands issued and acknowledgements.
-   Mode changes.
-   Schedule changes and versions.
-   RTC synchronization events.
-   Wi-Fi/MQTT disconnects and reconnects.
-   Firmware restart and error events.
-   User ID/source for web-issued actions.

------------------------------------------------------------------------

## 10. REST API and WebSocket proposal

The following endpoints are a suggested contract for the backend
developer; they do not currently exist.

### 10.1 REST API

  Method         Endpoint                            Purpose
  -------------- ----------------------------------- -----------------------------
  `POST`         `/api/auth/login`                   Authenticate user
  `GET`          `/api/devices`                      List devices
  `GET`          `/api/devices/:id`                  Device detail/current state
  `GET`          `/api/devices/:id/telemetry`        Recent telemetry
  `POST`         `/api/devices/:id/commands`         Submit a command
  `GET`          `/api/commands/:commandId`          Check command lifecycle
  `GET`          `/api/devices/:id/events`           Event history
  `POST`         `/api/devices/:id/rtc-sync`         Request RTC sync
  `GET`          `/api/rooms`                        List rooms
  `POST`/`PUT`   `/api/rooms` and `/api/rooms/:id`   Manage rooms
  `GET`/`POST`   `/api/schedules`                    Read/create schedules
  `PUT`          `/api/schedules/:id`                Update schedule
  `POST`         `/api/schedules/:id/publish`        Publish validated schedule
  `GET`/`POST`   `/api/experiments`                  Read/create experiments

Use consistent response envelopes, validation errors and correlation
IDs.

### 10.2 WebSocket / Socket.IO events

Suggested namespace: `/realtime` or an equivalent authenticated
Socket.IO namespace.

Server → browser:

-   `device:status`
-   `device:telemetry`
-   `device:relay_state`
-   `command:updated`
-   `device:event`
-   `device:connectivity`
-   `schedule:updated`
-   `experiment:updated`

Browser → server:

-   `subscribe:device`
-   `unsubscribe:device`

Do not allow a browser socket to publish arbitrary MQTT topics. It
should call authorized backend actions. Enforce per-user/device
authorization on every subscription and command.

### 10.3 Command lifecycle

``` text
User clicks ON in React
        |
        v
REST request to Node.js API
        |
        v
Authenticate + authorize + validate
        |
        v
Create command record (PENDING)
        |
        v
Publish MQTT command (QoS 1)
        |
        v
ESP32 receives and validates command
        |
        v
ESP32 updates logical/physical output
        |
        +----> Publish ACK
        |
        +----> Publish updated telemetry
        |
        v
Node.js updates database
        |
        v
Socket.IO pushes state to browser
        |
        v
UI displays EXECUTED / FAILED / TIMEOUT
```

------------------------------------------------------------------------

## 11. Database entities (initial proposal)

PostgreSQL is recommended for the application database.

Core tables:

-   `users`
-   `roles`
-   `user_roles`
-   `devices`
-   `device_credentials` (store secret references/hashes securely; never
    plaintext in ordinary application tables)
-   `device_status`
-   `relay_states` or normalized telemetry records
-   `rooms`
-   `room_relay_assignments`
-   `commands`
-   `command_acknowledgements`
-   `device_events`
-   `schedules`
-   `schedule_versions`
-   `experiments`
-   `experiment_assignments`
-   `audit_logs`

Store timestamps in UTC. Add indexes for device ID, timestamp, command
ID and room ID. Define data retention and backup policy.

InfluxDB can be added for high-volume time-series telemetry if needed.
It is not mandatory for the first working release.

------------------------------------------------------------------------

## 12. Cloud/server deployment requirements

The existing broker public IP is `148.135.137.198`, with port `1883`
tested from a Windows client. The cloud hosting provider, operating
system, domain and current server resource allocation have not been
confirmed in this handover.

The developer must inspect the existing server before making changes. Do
not overwrite or restart the existing Mosquitto service without backup
and an agreed maintenance window. The Humidifier currently uses the
CIMCMS namespace and must continue to work.

### 12.1 Proposed deployment services

-   Mosquitto broker (existing service; inspect and secure).
-   Node.js backend/API.
-   React static frontend served by Nginx.
-   PostgreSQL.
-   Optional InfluxDB.
-   Optional Redis only if justified by scaling/queue needs.
-   TLS certificate and reverse proxy.
-   Automated backups and log rotation.
-   Health checks and service restart policies.

### 12.2 Ports (proposed)

  -----------------------------------------------------------------------
  Port                    Service                 Exposure
  ----------------------- ----------------------- -----------------------
  80                      HTTP redirect to HTTPS  Public

  443                     Web app/API/WSS         Public

  1883                    Existing plain MQTT     Restrict; do not use
                          test port               for production
                                                  credentials over public
                                                  internet

  8883                    MQTT over TLS           Public only if
                                                  required, with ACL and
                                                  TLS

  5432                    PostgreSQL              Private network only

  8086                    InfluxDB (if installed) Private network only

  Internal app port       Node.js                 Bind privately behind
                                                  Nginx
  -----------------------------------------------------------------------

Do not expose database ports to the public internet.

### 12.3 Secrets and configuration

Use environment variables or a secrets manager. Create placeholders such
as:

``` env
NODE_ENV=production
APP_BASE_URL=https://<domain>
API_BASE_URL=https://<domain>/api

MQTT_HOST=<broker-host>
MQTT_PORT=8883
MQTT_USERNAME=<backend-service-account>
MQTT_PASSWORD=<secret-from-secret-manager>
MQTT_CLIENT_ID=cimcms-web-backend
MQTT_TLS=true

DATABASE_URL=<private-postgresql-connection-string>
JWT_SECRET=<strong-random-secret>
```

Never commit `.env`, passwords, private keys, broker credentials or
Wi-Fi credentials to Git. The actual MQTT password must be exchanged
securely, not embedded in this Markdown document or a cloud prompt.

### 12.4 Security requirements

-   HTTPS and WSS for all browser communication.
-   MQTTS for internet-facing device/backend MQTT.
-   Separate accounts for ESP32 devices, backend service and
    administrators.
-   Topic ACLs: each device may publish only its own
    status/telemetry/ack/event topics and subscribe only to its own
    command/config topics.
-   Strong unique per-device secrets; rotate credentials.
-   Password hashing for website users (Argon2id or bcrypt with
    appropriate settings).
-   Role-based access control: Admin, Operator, Technician, Viewer.
-   Audit every remote command and configuration change.
-   Rate-limit login and command APIs.
-   Validate payload schema and command expiry.
-   Prevent replay/duplicate commands using command IDs and expiry.
-   Protect against CSRF where cookie-based sessions are used.
-   Do not expose MQTT credentials in frontend bundles or browser
    storage.
-   Back up database and broker configuration; test restore.
-   Keep logs free of passwords and tokens.

------------------------------------------------------------------------

## 13. Recommended implementation phases

### Phase 0 -- Discovery and contract freeze

1.  Confirm authoritative ESP32 source version (the inspected ZIP
    reports 0.3.0, despite later V0.4.0 test discussion).
2.  Confirm actual broker OS/configuration, authentication, ACLs and TLS
    capability.
3.  Agree final device ID and MQTT topic/payload schemas.
4.  Agree actual room and relay allocation.
5.  Confirm mode override and offline schedule policies.

### Phase 1 -- Cloud foundation

1.  Secure existing Mosquitto without disrupting Humidifier.
2.  Create separate backend and LED device accounts/ACLs.
3.  Configure TLS/MQTTS.
4.  Deploy Node.js backend and PostgreSQL.
5.  Configure Nginx, HTTPS and environment secrets.
6.  Verify backend can subscribe/publish with least privilege.

### Phase 2 -- ESP32 MQTT integration

1.  Connect ESP32 to broker over TLS.
2.  Publish online status and LWT.
3.  Publish full 16-channel logical relay telemetry.
4.  Publish keypad and mode events.
5.  Subscribe to command/config topics.
6.  Implement command validation, expiry, deduplication and
    acknowledgements.
7.  Test in simulation mode.

### Phase 3 -- Website MVP

1.  Login and user roles.
2.  Device list and live status.
3.  16-channel LED control screen.
4.  Command pending/acknowledged/failed states.
5.  WebSocket live updates.
6.  Event and command history.
7.  Clear simulation-mode warning.

### Phase 4 -- Configuration and automation

1.  Room and relay assignment.
2.  AUTO schedule configuration.
3.  Schedule validation/versioning/publishing.
4.  ESP32 local schedule cache and offline behaviour.
5.  MAINTENANCE policies.
6.  EXPERIMENT configuration and execution.
7.  RTC sync controls and network diagnostics.

### Phase 5 -- Physical integration and production

1.  Switch simulation mode off only after relay board wiring and
    polarity are verified.
2.  Test each channel without mains loads.
3.  Verify output behaviour and safe startup.
4.  Test network loss, broker restart, power failure and stale commands.
5.  Test controlled lighting loads with appropriate electrical safety
    procedures.
6.  Enable production monitoring, backups and OTA only after security
    review.

------------------------------------------------------------------------

## 14. Acceptance criteria for the first website release

The MVP is accepted when:

1.  Authorized user can log in over HTTPS.
2.  LED-01 appears with its online/offline and simulation status.
3.  Dashboard shows all 16 channels and current reported logical state.
4.  User can submit ON/OFF for an individual channel.
5.  UI shows pending until device acknowledgement arrives.
6.  ESP32 updates logical state in simulation mode and publishes
    telemetry/ack.
7.  Browser receives updates over WSS without refreshing.
8.  All ON/OFF actions require confirmation.
9.  Command history identifies user, device, channel, requested state,
    result and timestamp.
10. MQTT secrets are never sent to the browser.
11. Existing Humidifier topic and device operation remain unaffected.
12. Offline, expired, rejected and timed-out commands are visibly
    distinguished.

------------------------------------------------------------------------

## 15. Information the website/cloud developer must obtain

The following must be confirmed/provisioned securely; they are not all
known yet:

-   Cloud provider and server OS/version.
-   Server SSH access (share through a secure channel, never in this
    document).
-   Domain name and DNS access.
-   Existing Mosquitto configuration and service ownership.
-   MQTT username/password for a dedicated backend service account.
-   Per-device MQTT username/password for LED-01.
-   TLS certificate/CA requirements.
-   Existing broker ACL configuration.
-   PostgreSQL credentials and backup destination.
-   Admin user bootstrap process.
-   Final device ID and room/relay allocation.
-   Final approved MQTT schemas and topic names.
-   Whether InfluxDB is needed for the first release.
-   Final policy for manual override during AUTO/EXPERIMENT.
-   Offline schedule-cache and fail-safe behaviour.

Do not ask the project owner to paste passwords into chat or put
credentials in this Markdown file. Use a secure secrets manager or an
encrypted credential exchange.

------------------------------------------------------------------------

## 16. Key project decisions and boundaries

-   This document is specifically for the **CIMCMS LED Controller**
    web/cloud integration.
-   The GCS Water ATM project is unrelated and must not be mixed into
    this architecture.
-   The CIMCMS Humidifier is a separate device. It may share the MQTT
    broker but retains its own firmware and topic namespace.
-   All 16 LED relay channels remain enabled in firmware.
-   Relay simulation remains ON during software and web integration.
-   Relay 1 and Relay 3 are not disabled.
-   24 WS2812 pixels are indicators, not cultivation lighting outputs.
-   Lux sensing belongs to the separate Environmental/Airflow module,
    not this LED Controller.
-   Raspberry Pi is the intended central CIMCMS coordinator for room
    assignments, schedules and system data; exact local server
    deployment details remain to be finalized.
-   Do not claim that a lamp is physically ON based only on simulated
    relay state.
-   Do not treat proposed MQTT topics, REST endpoints, JSON payloads or
    database schemas in this document as already deployed. They are the
    integration contract proposal and should be version-controlled after
    agreement.

## 17. Short instruction for an AI/cloud development assistant

Use this document as the project handover and architecture reference.
First inspect the existing server and the authoritative ESP32 source
revision. Preserve the existing CIMCMS Humidifier service. Do not expose
or invent credentials. Produce a deployment plan, secure
environment-variable template, MQTT topic ACL plan, versioned payload
schemas, backend API contract, WebSocket event contract, database
migrations and React page structure. Clearly label any new
implementation as proposed until tested. Build the first release around
the LED Controller in simulation mode, with 16 logical channels and
end-to-end command acknowledgement. Do not enable physical relay
operation or claim actual lighting feedback until the hardware is
connected and verified.
