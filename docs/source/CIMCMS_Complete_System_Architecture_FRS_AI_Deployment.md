# CIMCMS -- Complete System Architecture & Deployment Specification

**Document type:** Master Functional Requirements & AI Implementation
Brief (FRS)\
**Project:** CIMCMS -- Mushroom Cultivation Management System\
**Purpose:** Give a software/AI development team one actionable
specification to design, build, test and deploy the CIMCMS web
application and cloud/backend services on the project server.\
**Status:** Initial implementation specification. Items marked **TO
CONFIRM** require project-owner approval before production use.\
**Date:** 20 November 2026

------------------------------------------------------------------------

## 1. Executive objective

Build a secure, modular, remotely accessible web platform to monitor and
manage the CIMCMS mushroom cultivation system.

The platform must connect independent IoT controllers through MQTT,
expose device information through a Node.js backend, provide live
updates to a React web application, store configuration/history in a
database and support deployment on the existing Linux cloud server.

The first deliverable must be a working **LED Controller MVP in
simulation mode**. The platform architecture must allow other CIMCMS
modules to be added without merging their firmware or device identities.

**Do not interpret this document as evidence that every described
feature already exists.** It is the target specification for
implementation.

## 2. Project scope

### 2.1 CIMCMS modules in scope

The overall CIMCMS platform is intended to manage independent modules:

1.  LED Controller -- ESP32, 16 lighting channels.
2.  Humidifier Controller -- separate device/firmware and MQTT
    namespace.
3.  Steam Generator Controller -- separate device/firmware; detailed
    hardware and control requirements **TO CONFIRM**.
4.  Environmental/Airflow Controller -- separate device/firmware; sensor
    list and control requirements **TO CONFIRM**.
5.  Central coordination/server -- Raspberry Pi is the intended local
    coordinator for schedules and system data; final deployment
    relationship with cloud server **TO CONFIRM**.

The LED Controller is the first implementation target. Do not invent
device capabilities for other modules. Create extensible device
abstractions and mark unimplemented module functions as planned.

### 2.2 Out of scope for the first MVP

-   Fully automated control of all mushroom cultivation processes.
-   Unverified sensor features or hardware feedback.
-   AI-based cultivation recommendations.
-   OTA firmware updates unless separately approved.
-   Production control of mains loads before electrical validation.
-   Replacing or disrupting the existing Humidifier firmware/service.

## 3. Current known LED Controller hardware

  Item                  Confirmed information
  --------------------- -----------------------------------------------
  MCU                   ESP32 DevKit V1
  Framework             Arduino / PlatformIO
  I²C SDA/SCL           GPIO 21 / GPIO 22
  WS2812 data           GPIO 18
  Keypad expander       PCF8574 `0x20`
  Odd relay expander    PCF8574 `0x21`
  Even relay expander   PCF8574 `0x22`
  OLED                  SSD1306 `0x3C`
  RTC                   DS3231 `0x68`
  Status LEDs           24 WS2812 pixels; indicators, not grow lights
  Outputs               16 logical relay channels

Relay mapping: - PCF `0x21`: P0--P7 → relays 1,3,5,7,9,11,13,15. - PCF
`0x22`: P0--P7 → relays 2,4,6,8,10,12,14,16.

All 16 channels must remain enabled. Relay 1 and Relay 3 must not be
disabled.

Simulation is currently the intended software-development mode. The
current baseline has used:

``` cpp
constexpr bool RELAY_ACTIVE_LOW = true;
constexpr bool RELAY_SIMULATION_MODE = true;
```

The polarity must be verified against the physical relay board before
hardware use. Do not switch simulation off until the relay boards are
connected and each output has been safely tested.

**Source-version gate:** The source ZIP previously inspected was
internally marked 0.3.0, while the owner reported successful RTC sync
and Wi-Fi scanning in a later V0.4.0 test. Before coding, inspect the
latest authoritative firmware archive/repository and record its
version/commit. Do not assume an earlier archive contains later
features.

## 4. Operating modes and local controls

### 4.1 Modes

  -----------------------------------------------------------------------
  Mode                                Target behaviour
  ----------------------------------- -----------------------------------
  MANUAL                              Operator controls individual
                                      channels locally or through
                                      authorized web commands

  MAINTENANCE                         Suspend automatic schedule
                                      execution; allow authorized
                                      service/diagnostic actions

  AUTO                                Execute validated room-wise
                                      lighting schedules

  EXPERIMENT                          Execute a separately configured
                                      experimental lighting programme
  -----------------------------------------------------------------------

Mode labels alone are insufficient. Implement each mode's policy. If
AUTO has no valid schedule, show `AUTO_NOT_CONFIGURED` and do not
silently run. If EXPERIMENT lacks a valid experiment, do not start it.

### 4.2 Agreed keypad sequences

  Sequence              Function
  --------------------- ----------------------------------
  `A → #`               Confirm MANUAL
  `B → #`               Confirm MAINTENANCE
  `C → #`               Confirm AUTO
  `D → #`               Confirm EXPERIMENT
  `D → * → #`           Open Wi-Fi configuration portal
  `A → * → #`           All 16 logical relays ON
  `B → * → #`           All 16 logical relays OFF
  `01`--`16` then `#`   Select/toggle individual relay
  `*`                   Cancel/back where context allows
  `#`                   Confirm/enter

Planned mode confirmation timeout: 5 seconds. Planned special-sequence
inter-key timeout: 1.5 seconds. Implement sequence priority so special
actions cannot be mistaken for mode selections.

### 4.3 Control safety rules

-   Only one operating mode is active at a time.
-   Default outputs OFF on boot; validate configuration before enabling
    AUTO.
-   Do not restore stale ON states blindly after reboot.
-   All ON/OFF operations must be recorded with source, user/device,
    timestamp and result.
-   Show whether a state is simulated/logical or physically driven.
-   **TO CONFIRM:** temporary manual override policy while in
    AUTO/EXPERIMENT. Recommended initial behaviour: time-limited
    override, then return to schedule.
-   **TO CONFIRM:** whether remote commands are allowed in MAINTENANCE
    and EXPERIMENT.

## 5. RTC and time requirements

-   RTC hardware: DS3231.
-   Display time zone: `Asia/Kolkata` (UTC+05:30).
-   Store server timestamps in UTC; render local time in the UI.
-   Preferred future time source: Raspberry Pi local NTP.
-   Fallback: internet NTP.
-   Manual `Sync Now` action.
-   Planned automatic sync checks: 06:00 and 18:00 local time.
-   Planned correction threshold: update DS3231 if difference exceeds 2
    seconds.
-   Display RTC validity, lost-power state, last sync, source and sync
    result.
-   Provide manual date/time configuration if network time is
    unavailable.
-   Never reset DS3231 to compile-time timestamp on every boot.

## 6. Wi-Fi and device diagnostics

LED firmware should support: - Scan nearby Wi-Fi networks. - Show SSID,
RSSI dBm, channel and security type. - Classify signal quality. - Select
network, enter password, connect and save credentials. - Reconnect after
restart. - Display connection status, SSID, IP and RSSI on OLED. - Start
configuration portal using `D → * → #`.

Do not expose Wi-Fi passwords in telemetry, logs or the website.

## 7. Target system architecture

``` text
Mobile / Tablet / Desktop Browser
              |
           HTTPS/WSS
              |
       React + TypeScript UI
              |
        Node.js API Backend
       /       |          \
 Auth/RBAC   WebSocket    Database
              |
       Backend MQTT Client
              |
       MQTT over TLS
              |
        Mosquitto Broker
              |
        Internet / LAN
              |
      Independent ESP32 Devices
       |       |       |       |
      LED  Humidifier Steam  Environment
       Controller (separate firmware/modules)
              |
      Raspberry Pi local coordination
      (local NTP / schedule cache / local services;
       exact cloud-to-Pi topology TO CONFIRM)
```

### 7.1 Recommended technology

  -----------------------------------------------------------------------
  Layer                               Technology
  ----------------------------------- -----------------------------------
  Frontend                            React.js + TypeScript

  UI                                  Responsive component system;
                                      Tailwind CSS optional

  Backend                             Node.js + TypeScript; Express or
                                      Fastify

  Real-time browser channel           Socket.IO or native WebSocket over
                                      WSS

  Device messaging                    Mosquitto MQTT

  Main database                       PostgreSQL

  Time-series database                Optional InfluxDB, only if
                                      justified

  Reverse proxy                       Nginx

  TLS                                 Let's Encrypt or managed
                                      certificate

  Deployment                          Docker Compose initially

  Monitoring                          Health endpoints, structured logs;
                                      Prometheus/Grafana optional
  -----------------------------------------------------------------------

Do not introduce Kubernetes for the first deployment unless there is a
concrete operational need. Keep deployment understandable and
maintainable.

### 7.2 Browser-to-device communication

Browser must **not** connect directly to MQTT using privileged broker
credentials.

Correct path: 1. Browser calls authenticated HTTPS API. 2. Backend
authenticates user and checks permissions. 3. Backend validates and
records command. 4. Backend publishes MQTT command. 5. Device processes
command and publishes acknowledgement/state. 6. Backend updates
database. 7. Backend pushes updates to browser over WSS.

## 8. MQTT contract

### 8.1 Known broker information

A public broker endpoint was tested: - Host/IP: `148.135.137.198` - Port
tested: `1883` - Test username used: `mqttuser` - TCP reachability and
basic MQTT pub/sub were verified from Windows. - Existing Humidifier
status topic observed: `cimcms/humidifier/CIMCMS-4765B7A0/status` - An
`offline` status message was observed.

This does not establish that production TLS, ACLs, backend accounts or
LED device accounts are configured.

**Never put actual passwords in this file, source code, Git, frontend
bundles or prompts.** Obtain or create credentials through secure secret
exchange. Rotate any development/shared password before production.

### 8.2 Proposed LED topics

Use a confirmed unique device ID; `LED-01` is a provisional example.

  -------------------------------------------------------------------------------
  Topic                           Direction               Purpose
  ------------------------------- ----------------------- -----------------------
  `cimcms/led/LED-01/status`      Device → backend        Online/offline,
                                                          firmware, mode

  `cimcms/led/LED-01/telemetry`   Device → backend        16 states, RTC and
                                                          connectivity

  `cimcms/led/LED-01/command`     Backend → device        Relay/mode/sync
                                                          commands

  `cimcms/led/LED-01/ack`         Device → backend        Command result

  `cimcms/led/LED-01/event`       Device → backend        Keypad, mode, errors

  `cimcms/led/LED-01/config`      Backend → device        Validated configuration
  -------------------------------------------------------------------------------

Use QoS 1 for commands and acknowledgements. Commands need unique IDs,
issue/expiry timestamps, validation and duplicate suppression. Configure
MQTT LWT for offline status. Retained state may be used for last-known
status, but must not be mistaken for proof of live connectivity.

### 8.3 Example telemetry

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
  "relay_states": [false, true, false, false, false, false, false, false,
                   false, false, false, false, false, false, false, false],
  "relay_on_count": 1
}
```

`relay_states` must contain exactly 16 values, ordered relay 1 to relay
16. Example IP and states are illustrative. In simulation, call them
logical/commanded states, not measured physical lamp states.

### 8.4 Example command

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

Possible future actions: `SET_ALL_RELAYS`, `SET_MODE`, `RTC_SYNC_NOW`,
`REQUEST_STATUS`, `APPLY_CONFIG`. Implement only after validating
permissions and payload schema.

### 8.5 Example acknowledgement

``` json
{
  "schema_version": 1,
  "command_id": "same-command-UUID",
  "device_id": "LED-01",
  "result": "EXECUTED",
  "relay": 1,
  "requested_state": "ON",
  "reported_state": "ON",
  "timestamp_utc": "2026-11-20T12:35:02Z",
  "simulation_mode": true
}
```

Use clear results: `ACCEPTED`, `EXECUTED`, `REJECTED`, `EXPIRED`,
`DUPLICATE`, `FAILED`. UI must show pending until device acknowledgement
arrives.

## 9. Application modules and screens

### 9.1 Main dashboard

-   System overview and alerts.
-   Device online/offline and last-seen time.
-   LED mode and simulation/hardware status.
-   Relay ON count.
-   Wi-Fi IP/RSSI and MQTT state.
-   RTC validity and last synchronization.
-   Recent events and failed commands.

### 9.2 Device management

-   Device list, type, unique ID, firmware version and connectivity.
-   Device detail page with telemetry and event history.
-   Device registration and credential status.
-   Keep each controller independent.

### 9.3 LED control

-   16 relay cards.
-   Individual ON/OFF.
-   All ON/All OFF with confirmation.
-   Pending/acknowledged/failed command state.
-   Logical vs physical state label.
-   Room grouping after assignments are confirmed.

### 9.4 Room management

-   Create/edit cultivation rooms.
-   Assign devices and relay channels.
-   Prevent accidental duplicate relay assignment.
-   Room status and room-specific schedules.
-   Actual room names and mappings are **TO CONFIRM**.

### 9.5 Operating modes

-   MANUAL, MAINTENANCE, AUTO, EXPERIMENT.
-   Mode confirmation and audit history.
-   Configuration readiness indicator.
-   Do not activate AUTO or EXPERIMENT without valid configuration.

### 9.6 AUTO scheduling

-   Room-wise schedule.
-   Start/stop times, days, effective dates.
-   Time zone Asia/Kolkata.
-   Versioning, validation and publish acknowledgement.
-   Local schedule cache for temporary network outages (planned).

### 9.7 Experiment management

-   Experiment ID, title, description.
-   Rooms/channels and experimental groups.
-   Start/end date and daily light timing/duration.
-   Status, pause/stop and event log.
-   Experimental data association (exact parameters TO CONFIRM).

### 9.8 System configuration

-   MQTT and device connectivity status.
-   RTC status and manual sync action.
-   Wi-Fi diagnostics (show device-reported scan results only).
-   User roles, notifications and integration settings.
-   Never display secrets to ordinary users.

### 9.9 Reports and audit

-   Relay state history and duration.
-   Command history with user/source/result.
-   Device availability and connectivity.
-   Mode changes, RTC syncs and errors.
-   Schedule and experiment reports.
-   Export CSV where appropriate.

## 10. Users, permissions and security

Initial roles:

  -----------------------------------------------------------------------
  Role                                Permissions
  ----------------------------------- -----------------------------------
  Admin                               Manage users, devices, rooms,
                                      configuration and all commands

  Operator                            Monitor and operate permitted
                                      devices; manage approved schedules

  Technician                          Diagnostics and maintenance
                                      functions

  Viewer                              Read-only dashboards and reports
  -----------------------------------------------------------------------

Use HTTPS/WSS, MQTTS, unique service/device accounts, MQTT topic ACLs,
password hashing, rate limiting, input validation, audit logging and
least privilege. Keep database ports private. Never expose MQTT
credentials to browsers. Store secrets in environment variables or a
secrets manager, not in Git.

## 11. Suggested REST API

These are proposed contracts, not existing deployed endpoints.

  Method     Endpoint                       Purpose
  ---------- ------------------------------ -------------------------
  POST       `/api/auth/login`              Login
  GET        `/api/devices`                 List devices
  GET        `/api/devices/:id`             Device details/state
  GET        `/api/devices/:id/telemetry`   Recent telemetry
  POST       `/api/devices/:id/commands`    Submit command
  GET        `/api/commands/:commandId`     Command status
  GET        `/api/devices/:id/events`      Event history
  POST       `/api/devices/:id/rtc-sync`    Request RTC sync
  GET/POST   `/api/rooms`                   List/create rooms
  PUT        `/api/rooms/:id`               Update room
  GET/POST   `/api/schedules`               List/create schedules
  PUT        `/api/schedules/:id`           Update schedule
  POST       `/api/schedules/:id/publish`   Publish schedule
  GET/POST   `/api/experiments`             List/create experiments

Use validation, consistent error responses, request IDs and
authorization on every endpoint.

## 12. WebSocket events

Use authenticated Socket.IO/WSS.

Server → browser: - `device:status` - `device:telemetry` -
`device:relay_state` - `command:updated` - `device:event` -
`device:connectivity` - `schedule:updated` - `experiment:updated`

Browser → server: - `subscribe:device` - `unsubscribe:device`

A browser socket must not publish arbitrary MQTT messages. Authorize
each device subscription and command.

## 13. Database proposal

Use PostgreSQL as the primary application database. Initial entities:

-   users, roles, user_roles
-   devices, device_status
-   rooms, room_relay_assignments
-   commands, command_acknowledgements
-   device_events, audit_logs
-   schedules, schedule_versions
-   experiments, experiment_assignments

Store timestamps in UTC. Add appropriate indexes, backups and retention
rules. Add InfluxDB only if telemetry volume/analytics justifies it; it
is optional for the first release.

## 14. Server deployment plan

Existing public broker IP: `148.135.137.198`; port 1883 was tested.
Hosting provider, OS, domain, server sizing and existing service
configuration are **TO CONFIRM**.

Recommended first deployment with Docker Compose: - Existing Mosquitto
service: inspect and secure; do not overwrite or disrupt Humidifier. -
Node.js API/backend. - React frontend built and served through Nginx. -
PostgreSQL. - Optional InfluxDB. - HTTPS certificate and reverse
proxy. - Persistent volumes, backups, log rotation and health checks.

Suggested public ports: - 80: redirect to HTTPS. - 443: web/API/WSS. -
8883: MQTT over TLS if required. - 1883: restrict or disable for
production internet access. - PostgreSQL/InfluxDB: private network only.

### Environment template (placeholders only)

``` env
NODE_ENV=production
APP_BASE_URL=https://<domain>

MQTT_HOST=<broker-host>
MQTT_PORT=8883
MQTT_USERNAME=<backend-service-account>
MQTT_PASSWORD=<secret-manager-value>
MQTT_CLIENT_ID=cimcms-backend
MQTT_TLS=true

DATABASE_URL=<private-postgresql-url>
JWT_SECRET=<strong-random-secret>
```

Never put real credentials in this document, source control or frontend
code.

## 15. Implementation phases

### Phase 0 -- Inspect and freeze contracts

-   Inspect authoritative firmware source and record version/commit.
-   Inspect existing Linux server and Mosquitto configuration.
-   Preserve existing Humidifier service.
-   Confirm device IDs, room names and relay allocation.
-   Approve MQTT schemas, ACLs and override/offline policies.

### Phase 1 -- Cloud foundation

-   Secure broker, provision service/device accounts and ACLs.
-   Configure TLS/MQTTS.
-   Deploy backend, PostgreSQL, Nginx and HTTPS.
-   Configure secrets, backups and health checks.

### Phase 2 -- LED MQTT firmware

-   Device connection, online/LWT.
-   Telemetry and all 16 logical states.
-   Command subscription, validation and expiry.
-   Acknowledgements and events.
-   Test with simulation mode enabled.

### Phase 3 -- Website MVP

-   Login and roles.
-   Dashboard and device status.
-   16-channel LED control.
-   REST command API and WSS updates.
-   Command/event history.
-   Simulation warning.

### Phase 4 -- Configuration and automation

-   Room/relay allocation.
-   AUTO schedule UI and runtime.
-   MAINTENANCE policy.
-   EXPERIMENT setup and runtime.
-   RTC sync and network diagnostics.
-   Offline schedule cache.

### Phase 5 -- Physical deployment

-   Verify relay polarity/wiring.
-   Disable simulation only after safe hardware checks.
-   Test each relay without mains loads first.
-   Test failure/recovery scenarios.
-   Conduct electrical safety validation before connecting cultivation
    lighting.

## 16. MVP acceptance criteria

The first release is accepted only when:

1.  User can log in securely over HTTPS.
2.  LED-01 appears with online/offline and simulation status.
3.  Dashboard shows all 16 reported logical states.
4.  User can issue an individual ON/OFF command.
5.  UI shows pending until device ACK arrives.
6.  ESP32 changes logical state in simulation and publishes
    ACK/telemetry.
7.  Browser receives updates over WSS without refresh.
8.  All ON/OFF actions have confirmation and audit records.
9.  Failed, expired, rejected and timed-out commands are
    distinguishable.
10. MQTT secrets never reach the browser.
11. Existing Humidifier continues to operate.
12. UI never claims a physical lamp is ON while simulation mode is
    active.

## 17. Required information from project owner

Collect securely or confirm before production: - Server provider,
OS/version, SSH access and maintenance window. - Domain and DNS
control. - Existing Mosquitto config, authentication and ACLs. -
Dedicated backend and LED device credentials. - TLS certificate/CA
arrangement. - Admin bootstrap user. - Final device ID. - Actual
cultivation room names and relay assignments. - Detailed requirements
for Steam Generator and Environmental/Airflow modules. - Manual override
behaviour in AUTO/EXPERIMENT. - Offline schedule behaviour and
safe-state policy. - Whether InfluxDB is needed in MVP.

Do not ask for passwords in chat or place them in this document. Use a
secure secret manager or encrypted exchange.

## 18. Instructions to the AI/cloud implementation agent

Act as a senior full-stack, IoT and DevOps engineering team. Use this
document as the target specification, but inspect the actual repository
and server before changing anything.

**Required workflow:** 1. Produce a gap analysis against the current
firmware, server and existing Humidifier service. 2. Identify unknowns
and ask for decisions only where necessary; do not invent credentials,
room assignments, device features or existing server settings. 3.
Present a deployment plan and architecture for approval before making
disruptive server changes. 4. Create a Git repository with clear
frontend, backend, infrastructure and documentation folders. 5.
Implement database migrations, API contracts, MQTT schemas and automated
tests. 6. Build the LED MVP first in simulation mode. 7. Configure TLS,
ACLs, secrets, backups and monitoring. 8. Deploy using repeatable Docker
Compose and documented environment variables. 9. Run end-to-end tests:
browser command → API → MQTT → ESP32 → ACK/telemetry → WebSocket →
browser. 10. Provide source code, Git commit/tag, deployment
instructions, credentials handover through a secure channel,
backup/restore instructions and a list of remaining work.

**Do not:** - Claim features work before tests pass. - Change or stop
the existing Humidifier service without approval. - Disable any of the
16 LED relay channels. - enable physical relay mode before wiring and
polarity validation. - expose secrets in code, logs, frontend or this
document. - implement unapproved control behaviour for other CIMCMS
modules. - replace the proposed architecture with unrelated services
without explaining the trade-off.

## 19. Final project principle

Build CIMCMS as a modular, secure and maintainable IoT management
platform. Start with a fully testable LED Controller MVP, preserve
independent device modules, establish a stable MQTT/API/WebSocket
contract, then add room management, schedules, experiments and other
controllers incrementally. The system must remain understandable,
deployable and maintainable by the project team after the AI development
session ends.
