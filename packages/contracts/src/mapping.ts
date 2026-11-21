import { SCHEMA_VERSION } from './constants.js';
import type { CommandAction, CommandSource, Mode } from './constants.js';
import type { CommandAckDto, DeviceStateDto, TelemetryPointDto } from './dto/index.js';
import type { AckWire } from './mqtt/ack.js';
import type { CommandWire } from './mqtt/command.js';
import type { TelemetryWire } from './mqtt/telemetry.js';

/** Map a validated telemetry message to the app-side state snapshot (liveness ONLINE: it just spoke). */
export function telemetryWireToState(wire: TelemetryWire, receivedAt: string): DeviceStateDto {
  const c = wire.connectivity;
  const r = wire.rtc;
  return {
    deviceId: wire.device_id,
    type: 'LED_CONTROLLER',
    liveness: 'ONLINE',
    lastSeenAt: receivedAt,
    firmwareVersion: wire.firmware_version,
    bootId: wire.boot_id ?? null,
    mode: wire.mode,
    modeStatus: wire.mode_status ?? null,
    simulationMode: wire.simulation_mode,
    relayStates: [...wire.relay_states],
    // Recomputed: the device-reported relay_on_count is not trusted.
    relayOnCount: wire.relay_states.filter(Boolean).length,
    connectivity: {
      wifiConnected: c.wifi_connected,
      ...(c.ssid !== undefined && { ssid: c.ssid }),
      ...(c.ip !== undefined && { ip: c.ip }),
      ...(c.rssi_dbm !== undefined && { rssiDbm: c.rssi_dbm }),
      mqttConnected: c.mqtt_connected,
    },
    rtc: r
      ? {
          valid: r.valid,
          ...(r.time_utc !== undefined && { timeUtc: r.time_utc }),
          ...(r.sync_source !== undefined && { syncSource: r.sync_source }),
          ...(r.last_sync_utc !== undefined && { lastSyncUtc: r.last_sync_utc }),
          ...(r.last_sync_result !== undefined && { lastSyncResult: r.last_sync_result }),
          ...(r.drift_ms !== undefined && { driftMs: r.drift_ms }),
          ...(r.lost_power !== undefined && { lostPower: r.lost_power }),
        }
      : null,
    configVersion: wire.config_version ?? null,
    autoReady: wire.auto_ready ?? null,
    updatedAt: receivedAt,
  };
}

/** Map a validated telemetry message to a time-series point. */
export function telemetryWireToPoint(wire: TelemetryWire): TelemetryPointDto {
  return {
    ts: wire.timestamp_utc,
    mode: wire.mode,
    simulationMode: wire.simulation_mode,
    relayStates: [...wire.relay_states],
    relayOnCount: wire.relay_states.filter(Boolean).length,
    ...(wire.connectivity.rssi_dbm !== undefined && { rssiDbm: wire.connectivity.rssi_dbm }),
    wifiConnected: wire.connectivity.wifi_connected,
    mqttConnected: wire.connectivity.mqtt_connected,
    ...(wire.rtc !== undefined && { rtcValid: wire.rtc.valid }),
  };
}

/** Map a validated ACK message to the ack entry stored on a CommandDto. */
export function ackWireToAckDto(wire: AckWire, receivedAt: string): CommandAckDto {
  return {
    result: wire.result,
    ...(wire.reason !== undefined && { reason: wire.reason }),
    ...(wire.reported_state !== undefined && { reportedState: wire.reported_state }),
    receivedAt,
    deviceTs: wire.timestamp_utc,
  };
}

/** Minimal command shape needed to build the MQTT payload (CommandDto-compatible). */
export interface CommandForWire {
  commandId: string;
  deviceId: string;
  action: CommandAction;
  params: Record<string, unknown>;
  source: CommandSource;
  issuedAt: string;
  expiresAt: string;
}

/** Build the snake_case command wire payload. Result is not schema-validated here; callers validate before publish. */
export function commandToWire(command: CommandForWire): CommandWire {
  const base = {
    schema_version: SCHEMA_VERSION,
    command_id: command.commandId,
    device_id: command.deviceId,
    issued_at_utc: command.issuedAt,
    expires_at_utc: command.expiresAt,
    source: command.source,
  };
  const p = command.params;
  switch (command.action) {
    case 'SET_RELAY':
      return { ...base, action: 'SET_RELAY', relay: p.relay as number, state: p.state as 'ON' | 'OFF' };
    case 'SET_ALL_RELAYS':
      return { ...base, action: 'SET_ALL_RELAYS', state: p.state as 'ON' | 'OFF' };
    case 'SET_MODE':
      return { ...base, action: 'SET_MODE', mode: p.mode as Mode };
    case 'REQUEST_STATUS':
      return { ...base, action: 'REQUEST_STATUS' };
    case 'RTC_SYNC_NOW':
      return { ...base, action: 'RTC_SYNC_NOW' };
  }
}
