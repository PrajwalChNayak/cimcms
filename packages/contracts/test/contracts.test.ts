import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ackWireSchema,
  ackWireToAckDto,
  backendSubscriptions,
  commandToWire,
  commandWireSchema,
  configWireSchema,
  deviceStateDtoSchema,
  eventWireSchema,
  parseStatusPayload,
  parseTopic,
  statusWireSchema,
  submitCommandBodySchema,
  telemetryWireSchema,
  telemetryWireToState,
  topicFor,
  type DeviceType,
  type TopicKind,
} from '../src/index.js';

const root = join(import.meta.dirname, '..', 'fixtures');
const schemas = {
  status: statusWireSchema,
  telemetry: telemetryWireSchema,
  command: commandWireSchema,
  ack: ackWireSchema,
  event: eventWireSchema,
  config: configWireSchema,
} as const;
const load = (p: string) =>
  JSON.parse(readFileSync(join(root, p), 'utf8')) as Record<string, unknown>;

describe('fixtures', () => {
  const valid = readdirSync(join(root, 'valid'));
  it('has one valid fixture per wire schema', () => {
    expect([...valid].sort()).toEqual(
      Object.keys(schemas)
        .map((n) => `${n}.json`)
        .sort(),
    );
  });
  it.each(valid)('valid %s parses', (f) => {
    const name = f.replace('.json', '') as keyof typeof schemas;
    expect(schemas[name].safeParse(load(`valid/${f}`)).success).toBe(true);
  });
  const invalid = readdirSync(join(root, 'invalid'));
  it('has at least 10 invalid fixtures', () => {
    expect(invalid.length).toBeGreaterThanOrEqual(10);
  });
  it.each(invalid)('invalid %s fails', (f) => {
    const { _schema, payload } = load(`invalid/${f}`) as {
      _schema: keyof typeof schemas;
      payload: unknown;
    };
    expect(schemas[_schema].safeParse(payload).success).toBe(false);
  });
});

describe('topics', () => {
  const types: DeviceType[] = ['LED_CONTROLLER', 'HUMIDIFIER', 'STEAM_GENERATOR', 'ENV_CONTROLLER'];
  const kinds: TopicKind[] = ['status', 'telemetry', 'ack', 'event', 'command', 'config'];
  it('parseTopic round-trips topicFor', () => {
    for (const t of types)
      for (const k of kinds) {
        expect(parseTopic(topicFor(t, 'LED-01', k))).toEqual({
          type: t,
          deviceId: 'LED-01',
          kind: k,
        });
      }
  });
  it('rejects non matching topics', () => {
    expect(parseTopic('cimcms/led/LED-01/telemetry/extra')).toBeNull();
    expect(parseTopic('cimcms/backend/status')).toBeNull();
    expect(parseTopic('other/led/LED-01/status')).toBeNull();
    expect(parseTopic('cimcms/led/LED-01/bogus')).toBeNull();
    expect(parseTopic('cimcms/led/x/status')).toBeNull();
  });
  it('backendSubscriptions', () => {
    expect(backendSubscriptions({ monitorHumidifier: false })).toEqual([
      'cimcms/led/+/status',
      'cimcms/led/+/telemetry',
      'cimcms/led/+/ack',
      'cimcms/led/+/event',
    ]);
    expect(backendSubscriptions({ monitorHumidifier: true })).toContain(
      'cimcms/humidifier/+/status',
    );
  });
});

describe('parseStatusPayload', () => {
  it('accepts plain text', () => {
    expect(parseStatusPayload('offline', 'X')).toEqual({ state: 'offline' });
    expect(parseStatusPayload('online\n', 'X')).toEqual({ state: 'online' });
  });
  it('accepts JSON', () => {
    const raw = JSON.stringify(load('valid/status.json'));
    expect(parseStatusPayload(raw, 'LED-01')).toEqual({
      state: 'online',
      firmwareVersion: 'sim-0.1.0',
      mode: 'MANUAL',
      bootId: 'b7e1c2d3',
    });
  });
  it('rejects garbage and device mismatch', () => {
    expect(parseStatusPayload('hello', 'LED-01')).toBeNull();
    expect(parseStatusPayload('{"a":1}', 'LED-01')).toBeNull();
    expect(parseStatusPayload(JSON.stringify(load('valid/status.json')), 'LED-02')).toBeNull();
  });
});

describe('mapping', () => {
  it('telemetryWireToState maps all fields', () => {
    const wire = telemetryWireSchema.parse(load('valid/telemetry.json'));
    const at = '2026-11-21T06:30:01Z';
    const s = telemetryWireToState(wire, at);
    expect(deviceStateDtoSchema.safeParse(s).success).toBe(true);
    expect(s).toEqual({
      deviceId: 'LED-01',
      type: 'LED_CONTROLLER',
      liveness: 'ONLINE',
      lastSeenAt: at,
      firmwareVersion: 'sim-0.1.0',
      bootId: 'b7e1c2d3',
      mode: 'MANUAL',
      modeStatus: null,
      simulationMode: true,
      relayStates: wire.relay_states,
      relayOnCount: 3,
      connectivity: {
        wifiConnected: true,
        ssid: 'farm-net',
        ip: '192.168.1.50',
        rssiDbm: -58,
        mqttConnected: true,
      },
      rtc: {
        valid: true,
        timeUtc: '2026-11-21T06:30:00Z',
        syncSource: 'NTP',
        lastSyncUtc: '2026-11-21T06:30:00Z',
        lastSyncResult: 'OK',
        driftMs: 12,
        lostPower: false,
      },
      configVersion: null,
      autoReady: null,
      updatedAt: at,
    });
  });
  it('recomputes relayOnCount', () => {
    const wire = telemetryWireSchema.parse({ ...load('valid/telemetry.json'), relay_on_count: 9 });
    expect(telemetryWireToState(wire, '2026-11-21T06:30:01Z').relayOnCount).toBe(3);
  });
  it('ackWireToAckDto', () => {
    const wire = ackWireSchema.parse(load('valid/ack.json'));
    expect(ackWireToAckDto(wire, '2026-11-21T06:30:01Z')).toEqual({
      result: 'EXECUTED',
      reportedState: 'ON',
      receivedAt: '2026-11-21T06:30:01Z',
      deviceTs: '2026-11-21T06:30:00Z',
    });
  });
  it('commandToWire produces a valid wire command', () => {
    const base = {
      commandId: '3f2b8c1e-5d4a-4e6b-9a7c-1d2e3f4a5b6c',
      deviceId: 'LED-01',
      source: 'web' as const,
      issuedAt: '2026-11-21T06:30:00Z',
      expiresAt: '2026-11-21T06:30:15Z',
    };
    const cases = [
      { action: 'SET_RELAY' as const, params: { relay: 5, state: 'ON' } },
      { action: 'SET_ALL_RELAYS' as const, params: { state: 'OFF' } },
      { action: 'REQUEST_STATUS' as const, params: {} },
      { action: 'SET_MODE' as const, params: { mode: 'MAINTENANCE' } },
      { action: 'RTC_SYNC_NOW' as const, params: {} },
    ];
    for (const c of cases) {
      expect(commandWireSchema.safeParse(commandToWire({ ...base, ...c })).success).toBe(true);
    }
    expect(commandToWire({ ...base, ...cases[0]! })).toEqual(load('valid/command.json'));
  });
});

describe('rest', () => {
  it('submitCommandBodySchema', () => {
    expect(
      submitCommandBodySchema.safeParse({ action: 'SET_RELAY', relay: 16, state: 'ON' }).success,
    ).toBe(true);
    expect(
      submitCommandBodySchema.safeParse({ action: 'SET_RELAY', relay: 17, state: 'ON' }).success,
    ).toBe(false);
    expect(submitCommandBodySchema.safeParse({ action: 'SET_MODE', mode: 'AUTO' }).success).toBe(
      false,
    );
  });
});
