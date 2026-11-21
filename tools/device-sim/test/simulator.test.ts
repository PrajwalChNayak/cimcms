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
