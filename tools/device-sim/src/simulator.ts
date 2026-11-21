import { randomUUID } from 'node:crypto';
import mqtt, { type MqttClient } from 'mqtt';
import {
  HEARTBEAT_INTERVAL_S,
  LED_CHANNEL_COUNT,
  MQTT_KEEPALIVE_S,
  ackWireSchema,
  commandWireSchema,
  configWireSchema,
  istParts,
  windowActiveAt,
  eventWireSchema,
  statusWireSchema,
  telemetryWireSchema,
  topicFor,
  type AckWire,
  type CommandWire,
  type ConfigWire,
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
  /**
   * Like the firmware: SET_MODE AUTO / EXPERIMENT is REJECTED (AUTO_NOT_CONFIGURED /
   * EXPERIMENT_NOT_CONFIGURED) while no matching config was received. Default true.
   */
  requireConfig?: boolean;
  /** RTC_SYNC_NOW answers FAILED (reason RTC_SYNC_FAILED) instead of syncing. */
  rtcSyncFails?: boolean;
  /** Every config message is answered CONFIG_APPLIED REJECTED with this reason. */
  rejectConfig?: string;
  /** Schedule executor period in ms (default 60000, 0 = off). Tests call `tick()` instead. */
  executorIntervalMs?: number;
  /** Clock used by the executor (default: real time). */
  clock?: () => Date;
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
  rtc: { syncSource: string; lastSyncUtc?: string; lastSyncResult?: string; driftMs: number };
  /** Last accepted config (kept across reboot, like the firmware keeps it in NVS). */
  config: ConfigWire | null;
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
  /** Run the schedule / experiment executor once (it also runs every minute in AUTO / EXPERIMENT). */
  tick(): Promise<void>;
}

const nowIso = (): string => new Date().toISOString();
const newBootId = (): string => randomUUID().replace(/-/g, '').slice(0, 8);

type Resolved = Required<Pick<SimulatorOptions, 'latencyMs' | 'failRate' | 'heartbeatS'>> &
  SimulatorOptions;

class SimulatorImpl implements Simulator {
  state: SimulatorState;
  private client: MqttClient | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private executor: NodeJS.Timeout | null = null;
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
      rtc: { syncSource: 'SIM', driftMs: 0 },
      config: null,
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
    this.startExecutor();
  }

  private startExecutor(): void {
    if (this.executor) clearInterval(this.executor);
    this.executor = null;
    const every = this.o.executorIntervalMs ?? 60_000;
    if (every <= 0) return;
    this.executor = setInterval(() => {
      this.tick().catch((err: unknown) => this.log(`executor: ${String(err)}`));
    }, every);
    this.executor.unref();
  }

  private stopExecutor(): void {
    if (this.executor) clearInterval(this.executor);
    this.executor = null;
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
    this.stopExecutor();
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
    this.stopExecutor();
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
    this.state.rtc = { syncSource: 'SIM', driftMs: 0 };
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

  private modeStatus(): 'ACTIVE' | 'NOT_CONFIGURED' {
    if (this.o.requireConfig === false) return 'ACTIVE';
    const m = this.state.mode;
    if (m === 'AUTO' && !this.autoReady()) return 'NOT_CONFIGURED';
    if (m === 'EXPERIMENT' && !this.state.config?.experiment) return 'NOT_CONFIGURED';
    return 'ACTIVE';
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
        mode_status: this.modeStatus(),
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
        rtc: {
          available: true,
          valid: true,
          time_utc: ts,
          sync_source: this.state.rtc.syncSource,
          ...(this.state.rtc.lastSyncUtc !== undefined && { last_sync_utc: this.state.rtc.lastSyncUtc }),
          ...(this.state.rtc.lastSyncResult !== undefined && {
            last_sync_result: this.state.rtc.lastSyncResult,
          }),
          drift_ms: this.state.rtc.driftMs,
        },
        ...(this.state.config && { config_version: this.state.config.config_version }),
        ...(this.o.requireConfig !== false && { auto_ready: this.autoReady() }),
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
    source: 'COMMAND' | 'KEYPAD' | 'SCHEDULE' | 'EXPERIMENT',
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
    await this.runExecutor();
    await this.publishTelemetry();
  }

  // ---------- AUTO / EXPERIMENT executor ----------

  private now(): Date {
    return this.o.clock ? this.o.clock() : new Date();
  }

  /** Relay states the active programme wants right now, or null when nothing is programmed. */
  private desiredRelays(): { next: boolean[]; source: 'SCHEDULE' | 'EXPERIMENT' } | null {
    const config = this.state.config;
    if (!config) return null;
    const at = this.now();
    const { isoDay, minuteOfDay, date } = istParts(at);
    if (this.state.mode === 'AUTO') {
      const auto = config.auto;
      if (!auto) return null;
      if (date < auto.effective_from || (auto.effective_to !== null && date > auto.effective_to)) return null;
      const next = [...this.state.relays];
      for (const ch of auto.channels) {
        next[ch.relay - 1] = ch.windows.some((w) => windowActiveAt(w, isoDay, minuteOfDay));
      }
      return { next, source: 'SCHEDULE' };
    }
    if (this.state.mode === 'EXPERIMENT') {
      const exp = config.experiment;
      if (!exp) return null;
      // O-15 default: relays that are not part of the experiment are OFF while EXPERIMENT runs,
      // and so is everything outside the experiment period.
      const next = this.state.relays.map(() => false);
      const t = at.getTime();
      if (t >= Date.parse(exp.starts_at_utc) && t < Date.parse(exp.ends_at_utc)) {
        for (const ch of exp.channels) {
          next[ch.relay - 1] = ch.windows.some((w) => windowActiveAt(w, isoDay, minuteOfDay));
        }
      }
      return { next, source: 'EXPERIMENT' };
    }
    return null;
  }

  /** Applies the programme; returns true when a relay changed. */
  private async runExecutor(): Promise<boolean> {
    const want = this.desiredRelays();
    if (!want) return false;
    if (want.next.every((v, i) => v === this.state.relays[i])) return false;
    await this.changeRelays(want.next, want.source, null);
    return true;
  }

  async tick(): Promise<void> {
    if (await this.runExecutor()) await this.publishTelemetry();
  }

  private autoReady(): boolean {
    const auto = this.state.config?.auto;
    if (!auto) return false;
    const { date } = istParts(this.now());
    return date >= auto.effective_from && (auto.effective_to === null || date <= auto.effective_to);
  }

  /** CONFIG_APPLIED answer to a config message. */
  private async handleConfig(text: string): Promise<void> {
    if (text.trim() === '') return; // retained message cleared
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    const rawVersion = (json as { config_version?: unknown } | undefined)?.config_version;
    const version =
      typeof rawVersion === 'number' && Number.isInteger(rawVersion) && rawVersion >= 0 ? rawVersion : 0;
    const reject = (reason: string): Promise<void> =>
      this.publishEvent('CONFIG_APPLIED', { config_version: version, result: 'REJECTED', reason });

    const parsed = configWireSchema.safeParse(json);
    if (!parsed.success) return reject('INVALID_CONFIG');
    if (parsed.data.device_id !== this.state.deviceId) return reject('WRONG_DEVICE');
    if (this.o.rejectConfig !== undefined) return reject(this.o.rejectConfig.slice(0, 64));
    // The retained config is delivered again after every reconnect: same or older version = already known.
    if (this.state.config && parsed.data.config_version <= this.state.config.config_version) return;

    this.state.config = parsed.data;
    await this.publishEvent('CONFIG_APPLIED', { config_version: version, result: 'APPLIED' });
    await this.runExecutor();
    await this.publishTelemetry();
  }

  // ---------- command handling (firmware behaviour spec) ----------

  private async onMessage(topic: string, text: string): Promise<void> {
    if (topic === this.topic('config')) {
      await this.handleConfig(text);
      return;
    }
    if (topic !== this.topic('command')) return;
    await this.handleCommand(text);
  }

  /** Reason to refuse a mode, or null (the firmware refuses AUTO / EXPERIMENT without a usable config). */
  private modeGuard(mode: Mode): string | null {
    if (this.o.requireConfig === false) return null;
    if (mode === 'AUTO' && !this.autoReady()) return 'AUTO_NOT_CONFIGURED';
    if (mode === 'EXPERIMENT' && !this.state.config?.experiment) return 'EXPERIMENT_NOT_CONFIGURED';
    return null;
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
        const guard = this.modeGuard(cmd.mode);
        if (guard) {
          await this.publishAck(id, 'REJECTED', { action, reason: guard });
          return;
        }
        const previous = this.state.mode;
        this.state.mode = cmd.mode;
        await this.publishEvent('MODE_CHANGED', { mode: cmd.mode, previous });
        await this.publishAck(id, 'EXECUTED', { action });
        await this.runExecutor();
        await this.publishTelemetry();
        return;
      }
      case 'RTC_SYNC_NOW': {
        await this.publishAck(id, 'ACCEPTED', { action });
        if (this.o.rtcSyncFails) {
          this.state.rtc.lastSyncResult = 'FAILED';
          await this.publishEvent('RTC_SYNC', { result: 'FAILED', source: 'NTP-SIM' });
          await this.publishAck(id, 'FAILED', { action, reason: 'RTC_SYNC_FAILED' });
        } else {
          this.state.rtc = {
            syncSource: 'NTP-SIM',
            lastSyncUtc: nowIso(),
            lastSyncResult: 'OK',
            driftMs: 0,
          };
          await this.publishEvent('RTC_SYNC', { result: 'OK', source: 'NTP-SIM' });
          await this.publishAck(id, 'EXECUTED', { action });
        }
        await this.publishTelemetry();
        return;
      }
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
