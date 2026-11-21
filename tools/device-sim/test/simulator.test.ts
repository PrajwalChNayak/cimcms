import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:net';
import type { AddressInfo } from 'node:net';
import { Aedes } from 'aedes';
import mqtt, { type MqttClient } from 'mqtt';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  ackWireSchema,
  eventWireSchema,
  statusWireSchema,
  telemetryWireSchema,
  topicFor,
  type CommandWire,
} from '@cimcms/contracts';
import { startSimulator, type Simulator } from '../src/index.js';

const DEV = 'LED-01';
const T = (k: Parameters<typeof topicFor>[2]): string => topicFor('LED_CONTROLLER', DEV, k);

let broker: Aedes;
let server: Server;
let url: string;
let sims: Simulator[] = [];
let observers: MqttClient[] = [];

beforeAll(async () => {
  broker = await Aedes.createBroker();
  server = createServer(broker.handle);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `mqtt://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  for (const s of sims) await s.crash().catch(() => undefined);
  for (const o of observers) await o.endAsync(true).catch(() => undefined);
  sims = [];
  observers = [];
  // Retained configs must not leak into the next test.
  const cleaner = mqtt.connect(url, { clientId: `clean-${randomUUID()}` });
  await new Promise<void>((r) => cleaner.once('connect', () => r()));
  await cleaner.publishAsync(topicFor('LED_CONTROLLER', DEV, 'config'), '', { qos: 1, retain: true });
  await cleaner.endAsync();
});
afterAll(async () => {
  await new Promise<void>((r) => broker.close(() => r()));
  await new Promise<void>((r) => server.close(() => r()));
});

interface Msg {
  topic: string;
  json: Record<string, unknown> | null;
  text: string;
  retain: boolean;
}

async function observer(filter: string): Promise<{ client: MqttClient; msgs: Msg[] }> {
  const client = mqtt.connect(url, { clientId: `obs-${randomUUID()}` });
  const msgs: Msg[] = [];
  client.on('message', (topic, payload, packet) => {
    const text = payload.toString('utf8');
    let json: Record<string, unknown> | null = null;
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      json = null;
    }
    msgs.push({ topic, json, text, retain: packet.retain });
  });
  await new Promise<void>((r) => client.once('connect', () => r()));
  await client.subscribeAsync(filter, { qos: 1 });
  observers.push(client);
  return { client, msgs };
}

async function waitFor<R>(fn: () => R | undefined | false, ms = 3000): Promise<R> {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('waitFor timeout');
    await new Promise((r) => setTimeout(r, 10));
  }
}

async function boot(opts: Partial<Parameters<typeof startSimulator>[0]> = {}): Promise<Simulator> {
  const s = await startSimulator({ url, deviceId: DEV, latencyMs: 0, heartbeatS: 3600, ...opts });
  sims.push(s);
  return s;
}

function command(over: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Date.now();
  return {
    schema_version: 1,
    command_id: randomUUID(),
    device_id: DEV,
    issued_at_utc: new Date(now).toISOString(),
    expires_at_utc: new Date(now + 15_000).toISOString(),
    source: 'web',
    action: 'SET_RELAY',
    relay: 3,
    state: 'ON',
    ...over,
  } as CommandWire & Record<string, unknown>;
}

const send = (client: MqttClient, c: Record<string, unknown> | string): Promise<unknown> =>
  client.publishAsync(T('command'), typeof c === 'string' ? c : JSON.stringify(c), { qos: 1 });

const acksFor = (msgs: Msg[], id: string): Msg[] =>
  msgs.filter((m) => m.topic === T('ack') && m.json?.command_id === id);

describe('device simulator', () => {
  it('publishes retained online status, BOOT event and telemetry on connect', async () => {
    const obs = await observer(`cimcms/led/${DEV}/#`);
    const sim = await boot();
    await waitFor(() => obs.msgs.some((m) => m.topic === T('telemetry')));
    const status = obs.msgs.find((m) => m.topic === T('status'))!;
    const st = statusWireSchema.parse(status.json);
    expect(st).toMatchObject({ state: 'online', firmware_version: 'sim-0.1.0', mode: 'MANUAL' });
    expect(st.boot_id).toBe(sim.state.bootId);
    const boot_ = obs.msgs.find((m) => m.topic === T('event'))!;
    expect(eventWireSchema.parse(boot_.json).type).toBe('BOOT');
    const tele = telemetryWireSchema.parse(obs.msgs.find((m) => m.topic === T('telemetry'))!.json);
    expect(tele.simulation_mode).toBe(true);
    expect(tele.relay_states).toHaveLength(16);
    expect(tele.seq).toBeGreaterThanOrEqual(0);
  });

  it('SET_RELAY -> EXECUTED ack, RELAY_CHANGED event, telemetry', async () => {
    const obs = await observer(`cimcms/led/${DEV}/#`);
    await boot();
    const c = command();
    obs.msgs.length = 0;
    await send(obs.client, c);
    const ack = await waitFor(() => acksFor(obs.msgs, c.command_id as string)[0]);
    expect(ackWireSchema.parse(ack.json)).toMatchObject({
      result: 'EXECUTED', action: 'SET_RELAY', relay: 3, requested_state: 'ON', reported_state: 'ON',
      simulation_mode: true,
    });
    const tele = await waitFor(() =>
      obs.msgs.find(
        (m) => m.topic === T('telemetry') && (m.json?.relay_states as boolean[])[2] === true,
      ),
    );
    expect(telemetryWireSchema.parse(tele.json).relay_on_count).toBe(1);
    const ev = obs.msgs.find((m) => m.topic === T('event') && m.json?.type === 'RELAY_CHANGED')!;
    expect(ev.json).toMatchObject({
      type: 'RELAY_CHANGED',
      data: { relay: 3, state: 'ON', source: 'COMMAND', command_id: c.command_id },
    });
  });

  it('SET_ALL_RELAYS emits one event per changed relay', async () => {
    const obs = await observer(`cimcms/led/${DEV}/#`);
    const sim = await boot();
    await sim.toggle(2);
    const c = command({ action: 'SET_ALL_RELAYS', relay: undefined, state: 'ON' });
    obs.msgs.length = 0;
    await send(obs.client, c);
    await waitFor(() => acksFor(obs.msgs, c.command_id as string)[0]);
    const changed = (): Msg[] =>
      obs.msgs.filter(
        (m) =>
          m.topic === T('event') &&
          m.json?.type === 'RELAY_CHANGED' &&
          (m.json.data as { source?: string }).source === 'COMMAND',
      );
    await waitFor(() => changed().length >= 15 || undefined);
    await new Promise((r) => setTimeout(r, 50));
    expect(changed()).toHaveLength(15);
    expect(sim.state.relays.every(Boolean)).toBe(true);
  });

  it('expired command -> EXPIRED and no state change', async () => {
    const obs = await observer(`cimcms/led/${DEV}/ack`);
    const sim = await boot();
    const c = command({ expires_at_utc: new Date(Date.now() - 1000).toISOString() });
    await send(obs.client, c);
    const ack = await waitFor(() => acksFor(obs.msgs, c.command_id as string)[0]);
    expect(ack.json).toMatchObject({ result: 'EXPIRED' });
    expect(sim.state.relays[2]).toBe(false);
  });

  it('duplicate command id -> DUPLICATE', async () => {
    const obs = await observer(`cimcms/led/${DEV}/ack`);
    await boot();
    const c = command();
    await send(obs.client, c);
    await send(obs.client, c);
    const id = c.command_id as string;
    await waitFor(() => acksFor(obs.msgs, id).length >= 2 || undefined);
    expect(acksFor(obs.msgs, id).map((m) => m.json?.result)).toEqual(['EXECUTED', 'DUPLICATE']);
  });

  it('mode AUTO -> REJECTED MODE_POLICY', async () => {
    const obs = await observer(`cimcms/led/${DEV}/ack`);
    const sim = await boot({ mode: 'AUTO' });
    const c = command();
    await send(obs.client, c);
    const ack = await waitFor(() => acksFor(obs.msgs, c.command_id as string)[0]);
    expect(ack.json).toMatchObject({ result: 'REJECTED', reason: 'MODE_POLICY' });
    expect(sim.state.relays[2]).toBe(false);
  });

  it('invalid payload with readable command_id -> REJECTED INVALID_PAYLOAD; unreadable is dropped', async () => {
    const obs = await observer(`cimcms/led/${DEV}/ack`);
    await boot();
    const c = command({ relay: 17 });
    await send(obs.client, c);
    await send(obs.client, 'not json');
    const ack = await waitFor(() => acksFor(obs.msgs, c.command_id as string)[0]);
    expect(ack.json).toMatchObject({ result: 'REJECTED', reason: 'INVALID_PAYLOAD' });
    await new Promise((r) => setTimeout(r, 100));
    expect(obs.msgs).toHaveLength(1);
  });

  it('wrong device -> REJECTED WRONG_DEVICE', async () => {
    const obs = await observer(`cimcms/led/${DEV}/ack`);
    await boot();
    const c = command({ device_id: 'LED-02' });
    await send(obs.client, c);
    const ack = await waitFor(() => acksFor(obs.msgs, c.command_id as string)[0]);
    expect(ack.json).toMatchObject({ result: 'REJECTED', reason: 'WRONG_DEVICE' });
  });

  it('--reject-all and --fail-rate', async () => {
    const obs = await observer(`cimcms/led/${DEV}/ack`);
    await boot({ rejectAll: 'MAINTENANCE_LOCK' });
    const c = command();
    await send(obs.client, c);
    const ack = await waitFor(() => acksFor(obs.msgs, c.command_id as string)[0]);
    expect(ack.json).toMatchObject({ result: 'REJECTED', reason: 'MAINTENANCE_LOCK' });
    await sims.pop()!.crash();
    await boot({ failRate: 1, random: () => 0 });
    const c2 = command();
    await send(obs.client, c2);
    const ack2 = await waitFor(() => acksFor(obs.msgs, c2.command_id as string)[0]);
    expect(ack2.json).toMatchObject({ result: 'FAILED' });
  });

  it('--ignore-commands sends nothing', async () => {
    const obs = await observer(`cimcms/led/${DEV}/ack`);
    await boot({ ignoreCommands: true });
    await send(obs.client, command());
    await new Promise((r) => setTimeout(r, 150));
    expect(obs.msgs).toHaveLength(0);
  });

  it('REQUEST_STATUS, SET_MODE and RTC_SYNC_NOW', async () => {
    const obs = await observer(`cimcms/led/${DEV}/#`);
    const sim = await boot();
    const rs = command({ action: 'REQUEST_STATUS', relay: undefined, state: undefined });
    const sm = command({ action: 'SET_MODE', mode: 'MAINTENANCE', relay: undefined, state: undefined });
    const rtc = command({ action: 'RTC_SYNC_NOW', relay: undefined, state: undefined });
    for (const c of [rs, sm, rtc]) await send(obs.client, c);
    await waitFor(() => acksFor(obs.msgs, rtc.command_id as string).length >= 2 || undefined);
    expect(acksFor(obs.msgs, rs.command_id as string)[0]!.json).toMatchObject({ result: 'EXECUTED' });
    expect(acksFor(obs.msgs, sm.command_id as string)[0]!.json).toMatchObject({ result: 'EXECUTED' });
    expect(sim.state.mode).toBe('MAINTENANCE');
    expect(acksFor(obs.msgs, rtc.command_id as string).map((m) => m.json?.result)).toEqual([
      'ACCEPTED', 'EXECUTED',
    ]);
    expect(obs.msgs.some((m) => m.topic === T('event') && m.json?.type === 'RTC_SYNC')).toBe(true);
    expect(obs.msgs.some((m) => m.topic === T('event') && m.json?.type === 'MODE_CHANGED')).toBe(true);
  });

  it('RTC_SYNC_NOW updates the RTC block of the next telemetry; rtcSyncFails answers FAILED', async () => {
    const obs = await observer(`cimcms/led/${DEV}/#`);
    const sim = await boot();
    const ok = command({ action: 'RTC_SYNC_NOW', relay: undefined, state: undefined });
    await send(obs.client, ok);
    await waitFor(() => acksFor(obs.msgs, ok.command_id as string).length >= 2 || undefined);
    const tele = obs.msgs.filter((m) => m.topic === T('telemetry')).map((m) => telemetryWireSchema.parse(m.json));
    expect(tele[tele.length - 1]!.rtc).toMatchObject({
      valid: true,
      sync_source: 'NTP-SIM',
      last_sync_result: 'OK',
      drift_ms: 0,
    });
    expect(tele[tele.length - 1]!.rtc?.last_sync_utc).toBeDefined();
    await sim.crash();

    const obs2 = await observer(`cimcms/led/${DEV}/#`);
    await boot({ rtcSyncFails: true });
    const bad = command({ action: 'RTC_SYNC_NOW', relay: undefined, state: undefined });
    await send(obs2.client, bad);
    await waitFor(() => acksFor(obs2.msgs, bad.command_id as string).length >= 2 || undefined);
    expect(acksFor(obs2.msgs, bad.command_id as string).map((m) => m.json?.result)).toEqual(['ACCEPTED', 'FAILED']);
    expect(acksFor(obs2.msgs, bad.command_id as string)[1]!.json).toMatchObject({ reason: 'RTC_SYNC_FAILED' });
  });

  it('SET_MODE AUTO / EXPERIMENT is REJECTED without a config unless requireConfig is false', async () => {
    const obs = await observer(`cimcms/led/${DEV}/#`);
    const sim = await boot();
    const auto = command({ action: 'SET_MODE', mode: 'AUTO', relay: undefined, state: undefined });
    const exp = command({ action: 'SET_MODE', mode: 'EXPERIMENT', relay: undefined, state: undefined });
    await send(obs.client, auto);
    await send(obs.client, exp);
    await waitFor(() => acksFor(obs.msgs, exp.command_id as string).length >= 1 || undefined);
    expect(acksFor(obs.msgs, auto.command_id as string)[0]!.json).toMatchObject({
      result: 'REJECTED',
      reason: 'AUTO_NOT_CONFIGURED',
    });
    expect(acksFor(obs.msgs, exp.command_id as string)[0]!.json).toMatchObject({
      result: 'REJECTED',
      reason: 'EXPERIMENT_NOT_CONFIGURED',
    });
    expect(sim.state.mode).toBe('MANUAL');
    await sim.crash();

    const obs2 = await observer(`cimcms/led/${DEV}/#`);
    const free = await boot({ requireConfig: false });
    const again = command({ action: 'SET_MODE', mode: 'AUTO', relay: undefined, state: undefined });
    await send(obs2.client, again);
    await waitFor(() => acksFor(obs2.msgs, again.command_id as string).length >= 1 || undefined);
    expect(acksFor(obs2.msgs, again.command_id as string)[0]!.json).toMatchObject({ result: 'EXECUTED' });
    expect(free.state.mode).toBe('AUTO');
  });

  it('keypad toggle emits KEYPAD RELAY_CHANGED', async () => {
    const obs = await observer(`cimcms/led/${DEV}/event`);
    const sim = await boot();
    await sim.toggle(7);
    const ev = await waitFor(() => obs.msgs.find((m) => m.json?.type === 'RELAY_CHANGED'));
    expect(ev.json).toMatchObject({ type: 'RELAY_CHANGED', data: { relay: 7, state: 'ON', source: 'KEYPAD' } });
  });

  it('crash() leaves retained offline status (LWT) visible to a late subscriber', async () => {
    const sim = await boot();
    await sim.crash();
    const late = await observer(T('status'));
    const m = await waitFor(() => late.msgs.find((x) => x.json?.state === 'offline'));
    expect(m.retain).toBe(true);
    expect(statusWireSchema.parse(m.json).state).toBe('offline');
  });

  it('graceful stop publishes offline; reboot uses a new boot_id', async () => {
    const sim = await boot();
    const first = sim.state.bootId;
    await sim.reboot();
    expect(sim.state.bootId).not.toBe(first);
    expect(sim.state.seq).toBeGreaterThan(0);
    await sim.stop();
    const late = await observer(T('status'));
    const m = await waitFor(() => late.msgs[0]);
    expect(m.json).toMatchObject({ state: 'offline' });
  });
});

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

function configWire(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: 1,
    device_id: DEV,
    config_version: 1,
    issued_at_utc: new Date().toISOString(),
    timezone: 'Asia/Kolkata',
    tz_offset_minutes: 330,
    auto: {
      effective_from: '2026-11-01',
      effective_to: null,
      channels: [
        { relay: 1, windows: [{ days: WEEKDAYS, on: '06:00', off: '18:00' }] },
        { relay: 2, windows: [{ days: WEEKDAYS, on: '22:00', off: '06:00' }] },
      ],
    },
    experiment: null,
    ...over,
  };
}

const sendConfig = (client: MqttClient, c: Record<string, unknown> | string): Promise<unknown> =>
  client.publishAsync(topicFor('LED_CONTROLLER', DEV, 'config'), typeof c === 'string' ? c : JSON.stringify(c), {
    qos: 1,
    retain: true,
  });

const configEvents = (msgs: Msg[]): Msg[] =>
  msgs.filter((m) => m.topic === T('event') && m.json?.type === 'CONFIG_APPLIED');

const relayEvents = (msgs: Msg[]): Msg[] =>
  msgs.filter((m) => m.topic === T('event') && m.json?.type === 'RELAY_CHANGED');

// 2026-11-23 is a Monday. IST = UTC + 5:30.
const at = (iso: string) => (): Date => new Date(iso);

describe('device simulator: config and executor (T5.3)', () => {
  it('applies a retained config, reports CONFIG_APPLIED and config_version in telemetry', async () => {
    const obs = await observer(`cimcms/led/${DEV}/#`);
    const pub = await observer('cimcms/none');
    await sendConfig(pub.client, configWire());
    const sim = await boot({ clock: at('2026-11-23T05:00:00Z'), executorIntervalMs: 0 });
    const ev = await waitFor(() => configEvents(obs.msgs)[0]);
    expect(eventWireSchema.parse(ev.json).data).toEqual({ config_version: 1, result: 'APPLIED' });
    expect(sim.state.config?.config_version).toBe(1);
    const tele = await waitFor(() => {
      const t = obs.msgs
        .filter((m) => m.topic === T('telemetry'))
        .map((m) => telemetryWireSchema.parse(m.json))
        .filter((x) => x.config_version === 1);
      return t[t.length - 1];
    });
    expect(tele.auto_ready).toBe(true);
    // clean the retained config for the other tests
    await sendConfig(pub.client, '');
  });

  it('rejects invalid, foreign and (on request) every config; ignores an older version', async () => {
    const obs = await observer(`cimcms/led/${DEV}/#`);
    const pub = await observer('cimcms/none');
    const sim = await boot({ executorIntervalMs: 0 });
    await sendConfig(pub.client, '{"config_version":4}');
    await sendConfig(pub.client, configWire({ device_id: 'LED-99', config_version: 5 }));
    await waitFor(() => configEvents(obs.msgs).length >= 2 || undefined);
    expect(configEvents(obs.msgs).map((m) => (m.json?.data as Record<string, unknown>).reason)).toEqual([
      'INVALID_CONFIG',
      'WRONG_DEVICE',
    ]);
    expect(configEvents(obs.msgs)[0]!.json?.data).toMatchObject({ config_version: 4, result: 'REJECTED' });

    await sendConfig(pub.client, configWire({ config_version: 7 }));
    await waitFor(() => configEvents(obs.msgs).length >= 3 || undefined);
    await sendConfig(pub.client, configWire({ config_version: 6 })); // older than the applied 7
    await new Promise((r) => setTimeout(r, 150));
    expect(configEvents(obs.msgs)).toHaveLength(3);
    expect(sim.state.config?.config_version).toBe(7);
    await sim.crash();

    await sendConfig(pub.client, '');
    const obs2 = await observer(`cimcms/led/${DEV}/#`);
    await boot({ rejectConfig: 'NVS_FULL', executorIntervalMs: 0 });
    await sendConfig(pub.client, configWire({ config_version: 8 }));
    await waitFor(() => configEvents(obs2.msgs).length >= 1 || undefined);
    expect(configEvents(obs2.msgs)[0]!.json?.data).toEqual({
      config_version: 8,
      result: 'REJECTED',
      reason: 'NVS_FULL',
    });
    await sendConfig(pub.client, '');
  });

  it('keeps the config across a reboot and does not re-announce it', async () => {
    const obs = await observer(`cimcms/led/${DEV}/#`);
    const pub = await observer('cimcms/none');
    const sim = await boot({ executorIntervalMs: 0 });
    await sendConfig(pub.client, configWire());
    await waitFor(() => configEvents(obs.msgs).length >= 1 || undefined);
    await sim.reboot();
    await new Promise((r) => setTimeout(r, 200));
    expect(configEvents(obs.msgs)).toHaveLength(1);
    expect(sim.state.config?.config_version).toBe(1);
    await sendConfig(pub.client, '');
  });

  it('AUTO executor: relays follow the windows (SCHEDULE source), including windows across midnight', async () => {
    const obs = await observer(`cimcms/led/${DEV}/#`);
    const pub = await observer('cimcms/none');
    let now = '2026-11-23T05:00:00Z'; // Monday 10:30 IST
    const sim = await boot({ clock: () => new Date(now), executorIntervalMs: 0 });
    await sendConfig(pub.client, configWire());
    await waitFor(() => configEvents(obs.msgs).length >= 1 || undefined);

    const mode = command({ action: 'SET_MODE', mode: 'AUTO', relay: undefined, state: undefined });
    obs.msgs.length = 0;
    await send(obs.client, mode);
    await waitFor(() => acksFor(obs.msgs, mode.command_id as string).length >= 1 || undefined);
    expect(acksFor(obs.msgs, mode.command_id as string)[0]!.json).toMatchObject({ result: 'EXECUTED' });
    // 10:30: relay 1 inside 06:00-18:00 -> ON; relay 2 (22:00-06:00) -> OFF
    expect(sim.state.relays[0]).toBe(true);
    expect(sim.state.relays[1]).toBe(false);
    const first = relayEvents(obs.msgs);
    expect(first).toHaveLength(1);
    expect(first[0]!.json?.data).toMatchObject({ relay: 1, state: 'ON', source: 'SCHEDULE', command_id: null });

    // Manual commands are refused while AUTO runs
    const manual = command();
    await send(obs.client, manual);
    await waitFor(() => acksFor(obs.msgs, manual.command_id as string).length >= 1 || undefined);
    expect(acksFor(obs.msgs, manual.command_id as string)[0]!.json).toMatchObject({
      result: 'REJECTED',
      reason: 'MODE_POLICY',
    });

    obs.msgs.length = 0;
    now = '2026-11-23T17:30:00Z'; // 23:00 IST: relay 1 off, relay 2 on (window starts 22:00)
    await sim.tick();
    await waitFor(() => relayEvents(obs.msgs).length >= 2 || undefined);
    expect(sim.state.relays[0]).toBe(false);
    expect(sim.state.relays[1]).toBe(true);

    obs.msgs.length = 0;
    now = '2026-11-23T22:00:00Z'; // Tuesday 03:30 IST: the Monday window 22:00-06:00 still runs
    await sim.tick();
    await new Promise((r) => setTimeout(r, 100));
    expect(relayEvents(obs.msgs)).toHaveLength(0);
    expect(sim.state.relays[1]).toBe(true);

    now = '2026-11-24T01:00:00Z'; // Tuesday 06:30 IST: relay 2 off, relay 1 on again at 06:00
    await sim.tick();
    await waitFor(() => relayEvents(obs.msgs).length >= 2 || undefined);
    expect(sim.state.relays[0]).toBe(true);
    expect(sim.state.relays[1]).toBe(false);
    await sendConfig(pub.client, '');
  });

  it('AUTO does nothing outside the effective dates', async () => {
    const obs = await observer(`cimcms/led/${DEV}/#`);
    const pub = await observer('cimcms/none');
    const sim = await boot({ clock: at('2026-11-23T05:00:00Z'), executorIntervalMs: 0 });
    await sendConfig(
      pub.client,
      configWire({
        auto: {
          effective_from: '2026-12-01',
          effective_to: null,
          channels: [{ relay: 1, windows: [{ days: WEEKDAYS, on: '06:00', off: '18:00' }] }],
        },
      }),
    );
    await waitFor(() => configEvents(obs.msgs).length >= 1 || undefined);
    const mode = command({ action: 'SET_MODE', mode: 'AUTO', relay: undefined, state: undefined });
    await send(obs.client, mode);
    await waitFor(() => acksFor(obs.msgs, mode.command_id as string).length >= 1 || undefined);
    expect(acksFor(obs.msgs, mode.command_id as string)[0]!.json).toMatchObject({
      result: 'REJECTED',
      reason: 'AUTO_NOT_CONFIGURED',
    });
    expect(sim.state.mode).toBe('MANUAL');
    await sendConfig(pub.client, '');
  });

  it('EXPERIMENT: relays outside the experiment go OFF, experiment relays follow their windows', async () => {
    const obs = await observer(`cimcms/led/${DEV}/#`);
    const pub = await observer('cimcms/none');
    const sim = await boot({ clock: at('2026-11-23T05:00:00Z'), executorIntervalMs: 0 });
    await sim.setAll(true); // everything ON by keypad
    await sendConfig(
      pub.client,
      configWire({
        auto: null,
        experiment: {
          experiment_id: 'exp-1',
          starts_at_utc: '2026-11-23T00:00:00Z',
          ends_at_utc: '2026-11-30T00:00:00Z',
          channels: [{ relay: 3, windows: [{ days: WEEKDAYS, on: '06:00', off: '18:00' }] }],
        },
      }),
    );
    await waitFor(() => configEvents(obs.msgs).length >= 1 || undefined);
    obs.msgs.length = 0;
    const mode = command({ action: 'SET_MODE', mode: 'EXPERIMENT', relay: undefined, state: undefined });
    await send(obs.client, mode);
    await waitFor(() => acksFor(obs.msgs, mode.command_id as string).length >= 1 || undefined);
    expect(sim.state.relays.map((v, i) => (v ? i + 1 : 0)).filter(Boolean)).toEqual([3]);
    const events = relayEvents(obs.msgs);
    expect(events).toHaveLength(15);
    expect(events.every((m) => (m.json?.data as Record<string, unknown>).source === 'EXPERIMENT')).toBe(true);
    await sendConfig(pub.client, '');
  });
});
