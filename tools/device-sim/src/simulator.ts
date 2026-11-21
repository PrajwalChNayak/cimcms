import { randomUUID } from 'node:crypto';
import mqtt, { type MqttClient } from 'mqtt';
import {
  HEARTBEAT_INTERVAL_S,
  LED_CHANNEL_COUNT,
  MQTT_KEEPALIVE_S,
  ackWireSchema,
  commandWireSchema,
  eventWireSchema,
  statusWireSchema,
  telemetryWireSchema,
  topicFor,
  type AckWire,
  type CommandWire,
  type Mode,
  type TopicKind,
} from '@cimcms/contracts';
import type { z } from 'zod';

export const SIM_FIRMWARE_VERSION = 'sim-0.1.0';
const DUPLICATE_RING_SIZE = 32;

export interface SimulatorOptions {
  /** Broker URL, e.g. mqtt://localhost:1883 */
  url: string;
  deviceId: string;
  username?: string;
  password?: string;
  /** Execution latency in ms before a command is applied (default 200). */
  latencyMs?: number;
  /** Probability 0..1 that an executable command answers FAILED (default 0). */
  failRate?: number;
  mode?: Mode;
  /** Telemetry period in seconds (default 30). */
  heartbeatS?: number;
  ignoreCommands?: boolean;
  rejectAll?: string;
  /** simulation_mode=false when set. */
  hardware?: boolean;
  /** Test hook for deterministic fail-rate. */
  random?: () => number;
  /** Optional log sink. */
  log?: (line: string) => void;
}

export interface SimulatorState {
  deviceId: string;
  mode: Mode;
  relays: boolean[];
  bootId: string;
  seq: number;
  connected: boolean;
  /** Last command ids seen (ring of 32). */
  seenCommandIds: string[];
}

export interface Simulator {
  state: SimulatorState;
  /** Graceful stop: publishes retained offline status, then sends DISCONNECT. */
  stop(): Promise<void>;
  /** Drop the socket without DISCONNECT so the broker publishes the LWT. No reconnect. */
  crash(): Promise<void>;
  /** crash() then reconnect with a new boot_id. */
  reboot(): Promise<void>;
  /** Keypad toggle of relay n (1-based). */
  toggle(relay: number): Promise<void>;
  setAll(on: boolean): Promise<void>;
  setMode(mode: Mode): Promise<void>;
}

const nowIso = (): string => new Date().toISOString();
const newBootId = (): string => randomUUID().replace(/-/g, '').slice(0, 8);

type Resolved = Required<Pick<SimulatorOptions, 'latencyMs' | 'failRate' | 'heartbeatS'>> &
  SimulatorOptions;

class SimulatorImpl implements Simulator {
  state: SimulatorState;
  private client: MqttClient | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private queue: Promise<void> = Promise.resolve();
  private bootAnnounced = false;
  private stopped = false;
  private readonly o: Resolved;

  constructor(options: SimulatorOptions) {
    this.o = {
      ...options,
      latencyMs: options.latencyMs ?? 200,
      failRate: options.failRate ?? 0,
      heartbeatS: options.heartbeatS ?? HEARTBEAT_INTERVAL_S,
    };
    this.state = {
      deviceId: options.deviceId,
      mode: options.mode ?? 'MANUAL',
      relays: Array.from({ length: LED_CHANNEL_COUNT }, () => false),
      bootId: newBootId(),
      seq: 0,
      connected: false,
      seenCommandIds: [],
    };
  }

  private log(line: string): void {
    this.o.log?.(`[${this.state.deviceId}] ${line}`);
  }

  private topic(kind: TopicKind): string {
    return topicFor('LED_CONTROLLER', this.state.deviceId, kind);
  }

  private get simulationMode(): boolean {
    return !this.o.hardware;
  }

  // ---------- connection ----------

  async connect(): Promise<void> {
    this.stopped = false;
    this.bootAnnounced = false;
    const id = this.state.deviceId;
    const will = {
      schema_version: 1,
      device_id: id,
      state: 'offline',
    } as const;
    statusWireSchema.parse(will);
    const client = mqtt.connect(this.o.url, {
      clientId: id,
      clean: true,
      keepalive: MQTT_KEEPALIVE_S,
      reconnectPeriod: 1000,
      ...(this.o.username !== undefined && { username: this.o.username }),
      ...(this.o.password !== undefined && { password: this.o.password }),
      will: { topic: this.topic('status'), payload: JSON.stringify(will), qos: 1, retain: true },
    });
    this.client = client;
    client.on('message', (topic, payload) => {
      this.queue = this.queue
        .then(() => this.onMessage(topic, payload.toString('utf8')))
        .catch((err: unknown) => this.log(`handler error: ${String(err)}`));
    });
    client.on('close', () => {
      this.state.connected = false;
    });
    client.on('error', (err) => this.log(`mqtt error: ${err.message}`));

    await new Promise<void>((resolve, reject) => {
      let first = true;
      client.on('connect', () => {
        this.onConnect().then(
          () => {
            if (first) {
              first = false;
              resolve();
            }
          },
          (err: unknown) => {
            if (first) {
              first = false;
              reject(err instanceof Error ? err : new Error(String(err)));
            }
          },
        );
      });
      client.once('error', (err) => {
        if (first && !client.connected) {
          first = false;
          reject(err);
        }
      });
    });
  }

  private async onConnect(): Promise<void> {
    this.state.connected = true;
    this.log('connected');
    const client = this.client;
    if (!client) return;
    // Clean session: subscriptions must be renewed on every (re)connect.
    await client.subscribeAsync(
      { [this.topic('command')]: { qos: 1 }, [this.topic('config')]: { qos: 1 } },
    );
    await this.publishStatus('online');
    if (!this.bootAnnounced) {
      this.bootAnnounced = true;
      await this.publishEvent('BOOT', { reason: 'POWER_ON' });
    }
    await this.publishTelemetry();
    this.startHeartbeat();
  }

  private startHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => {
      this.publishTelemetry().catch((err: unknown) => this.log(`heartbeat: ${String(err)}`));
    }, this.o.heartbeatS * 1000);
    this.heartbeat.unref();
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  async stop(): Promise<void> {
    this.stopHeartbeat();
    const client = this.client;
    if (!client) return;
    if (client.connected) {
      await this.publishStatus('offline').catch(() => undefined);
    }
    this.stopped = true;
    await client.endAsync();
    this.client = null;
    this.state.connected = false;
  }

  async crash(): Promise<void> {
    this.stopHeartbeat();
    const client = this.client;
    if (!client) return;
    this.client = null;
    // No DISCONNECT packet: the broker sees an abnormal close and publishes the will.
    client.options.reconnectPeriod = 0;
    client.removeAllListeners('message');
    await client.endAsync(true);
    this.state.connected = false;
  }

  async reboot(): Promise<void> {
    await this.crash();
    this.state.bootId = newBootId();
    this.state.seq = 0;
    this.state.seenCommandIds = [];
    this.state.mode = this.o.mode ?? 'MANUAL';
    this.state.relays = this.state.relays.map(() => false);
    await this.connect();
  }

  // ---------- publishing (every payload validated before publish) ----------

  private async publishValidated<S extends z.ZodType>(
    schema: S,
    kind: TopicKind,
    payload: unknown,
    opts: { qos: 0 | 1; retain: boolean },
  ): Promise<z.output<S>> {
    const parsed = schema.parse(payload); // throws if the simulator produced an invalid message
    const client = this.client;
    if (!client || this.stopped) throw new Error('not connected');
    await client.publishAsync(this.topic(kind), JSON.stringify(payload), opts);
    return parsed;
  }

  private nextSeq(): number {
    return this.state.seq++;
  }

  private async publishStatus(state: 'online' | 'offline'): Promise<void> {
    await this.publishValidated(
      statusWireSchema,
      'status',
      {
        schema_version: 1,
        device_id: this.state.deviceId,
        state,
        firmware_version: SIM_FIRMWARE_VERSION,
        mode: this.state.mode,
        boot_id: this.state.bootId,
        timestamp_utc: nowIso(),
      },
      { qos: 1, retain: true },
    );
  }

  private async publishTelemetry(): Promise<void> {
    if (!this.client?.connected) return;
    const states = [...this.state.relays];
    const ts = nowIso();
    await this.publishValidated(
      telemetryWireSchema,
      'telemetry',
      {
        schema_version: 1,
        device_id: this.state.deviceId,
        firmware_version: SIM_FIRMWARE_VERSION,
        timestamp_utc: ts,
        boot_id: this.state.bootId,
        seq: this.nextSeq(),
        mode: this.state.mode,
        mode_status: 'ACTIVE',
        simulation_mode: this.simulationMode,
        connectivity: {
          wifi_connected: true,
          ssid: 'sim-net',
          ip: '127.0.0.1',
          rssi_dbm: -55,
          mqtt_connected: true,
        },
        relay_states: states,
        relay_on_count: states.filter(Boolean).length,
        rtc: { available: true, valid: true, time_utc: ts, sync_source: 'SIM' },
      },
      { qos: 0, retain: false },
    );
  }

  private async publishEvent(
    type: z.input<typeof eventWireSchema>['type'],
    data: Record<string, unknown>,
  ): Promise<void> {
    await this.publishValidated(
      eventWireSchema,
      'event',
      {
        schema_version: 1,
        device_id: this.state.deviceId,
        timestamp_utc: nowIso(),
        boot_id: this.state.bootId,
        seq: this.nextSeq(),
        type,
        data,
      },
      { qos: 1, retain: false },
    );
  }

  private async publishAck(
    commandId: string,
    result: AckWire['result'],
    extra: Partial<Omit<AckWire, 'schema_version' | 'command_id' | 'device_id' | 'result'>> = {},
  ): Promise<void> {
    await this.publishValidated(
      ackWireSchema,
      'ack',
      {
        schema_version: 1,
        command_id: commandId,
        device_id: this.state.deviceId,
        result,
        timestamp_utc: nowIso(),
        simulation_mode: this.simulationMode,
        ...extra,
      },
      { qos: 1, retain: false },
    );
  }

  // ---------- local state changes ----------

  private async changeRelays(
    next: boolean[],
    source: 'COMMAND' | 'KEYPAD',
    commandId: string | null,
  ): Promise<void> {
    const changed: number[] = [];
    next.forEach((v, i) => {
      if (this.state.relays[i] !== v) changed.push(i);
    });
    this.state.relays = next;
    for (const i of changed) {
      await this.publishEvent('RELAY_CHANGED', {
        relay: i + 1,
        state: next[i] ? 'ON' : 'OFF',
        source,
        command_id: commandId,
      });
    }
  }

  async toggle(relay: number): Promise<void> {
    if (!Number.isInteger(relay) || relay < 1 || relay > LED_CHANNEL_COUNT) {
      throw new Error(`relay must be 1..${LED_CHANNEL_COUNT}`);
    }
    const next = [...this.state.relays];
    next[relay - 1] = !next[relay - 1];
    await this.changeRelays(next, 'KEYPAD', null);
    await this.publishTelemetry();
  }

  async setAll(on: boolean): Promise<void> {
    await this.changeRelays(
      this.state.relays.map(() => on),
      'KEYPAD',
      null,
    );
    await this.publishTelemetry();
  }

  async setMode(mode: Mode): Promise<void> {
    const previous = this.state.mode;
    this.state.mode = mode;
    await this.publishEvent('MODE_CHANGED', { mode, previous });
    await this.publishTelemetry();
  }

  // ---------- command handling (firmware behaviour spec) ----------

  private async onMessage(topic: string, text: string): Promise<void> {
    if (topic === this.topic('config')) {
      this.log(`config received (${text.length} bytes), ignored in MVP`);
      return;
    }
    if (topic !== this.topic('command')) return;
    await this.handleCommand(text);
  }

  private async handleCommand(text: string): Promise<void> {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    const parsed = commandWireSchema.safeParse(json);
    if (!parsed.success) {
      const id = (json as { command_id?: unknown } | undefined)?.command_id;
      if (typeof id === "string" && isUuid(id)) {
        await this.publishAck(id, 'REJECTED', { reason: 'INVALID_PAYLOAD' });
      } else {
        this.log('dropped unreadable command');
      }
      return;
    }
    const cmd: CommandWire = parsed.data;
    const id = cmd.command_id;
    const action = cmd.action;

    if (cmd.device_id !== this.state.deviceId) {
      await this.publishAck(id, 'REJECTED', { action, reason: 'WRONG_DEVICE' });
      return;
    }
    if (this.state.seenCommandIds.includes(id)) {
      await this.publishAck(id, 'DUPLICATE', { action });
      return;
    }
    this.state.seenCommandIds.push(id);
    if (this.state.seenCommandIds.length > DUPLICATE_RING_SIZE) this.state.seenCommandIds.shift();

    if (Date.now() > Date.parse(cmd.expires_at_utc)) {
      await this.publishAck(id, 'EXPIRED', { action });
      return;
    }
    if (this.o.ignoreCommands) {
      this.log(`ignoring command ${id}`);
      return;
    }
    if (this.o.rejectAll !== undefined) {
      await this.publishAck(id, 'REJECTED', { action, reason: this.o.rejectAll.slice(0, 64) });
      return;
    }
    if (
      (action === 'SET_RELAY' || action === 'SET_ALL_RELAYS') &&
      (this.state.mode === 'AUTO' || this.state.mode === 'EXPERIMENT')
    ) {
      await this.publishAck(id, 'REJECTED', { action, reason: 'MODE_POLICY' });
      return;
    }
    if ((this.o.random ?? Math.random)() < this.o.failRate) {
      await this.publishAck(id, 'FAILED', { action, reason: 'SIMULATED_FAILURE' });
      return;
    }

    if (this.o.latencyMs > 0) await sleep(this.o.latencyMs);

    switch (cmd.action) {
      case 'SET_RELAY': {
        const next = [...this.state.relays];
        next[cmd.relay - 1] = cmd.state === 'ON';
        await this.changeRelays(next, 'COMMAND', id);
        await this.publishAck(id, 'EXECUTED', {
          action,
          relay: cmd.relay,
          requested_state: cmd.state,
          reported_state: next[cmd.relay - 1] ? 'ON' : 'OFF',
        });
        await this.publishTelemetry();
        return;
      }
      case 'SET_ALL_RELAYS': {
        const on = cmd.state === 'ON';
        await this.changeRelays(
          this.state.relays.map(() => on),
          'COMMAND',
          id,
        );
        await this.publishAck(id, 'EXECUTED', {
          action,
          requested_state: cmd.state,
          reported_state: on ? 'ON' : 'OFF',
        });
        await this.publishTelemetry();
        return;
      }
      case 'REQUEST_STATUS':
        await this.publishTelemetry();
        await this.publishAck(id, 'EXECUTED', { action });
        return;
      case 'SET_MODE': {
        const previous = this.state.mode;
        this.state.mode = cmd.mode;
        await this.publishEvent('MODE_CHANGED', { mode: cmd.mode, previous });
        await this.publishAck(id, 'EXECUTED', { action });
        await this.publishTelemetry();
        return;
      }
      case 'RTC_SYNC_NOW':
        await this.publishAck(id, 'ACCEPTED', { action });
        await this.publishEvent('RTC_SYNC', { result: 'OK', source: 'SIM' });
        await this.publishAck(id, 'EXECUTED', { action });
        return;
    }
  }
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Connect a simulated LED controller. Resolves after the initial status/BOOT/telemetry were published. */
export async function startSimulator(options: SimulatorOptions): Promise<Simulator> {
  const sim = new SimulatorImpl(options);
  await sim.connect();
  return sim;
}
