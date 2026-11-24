import fs from "node:fs";
import { BACKEND_STATUS_TOPIC, MQTT_KEEPALIVE_S } from "@cimcms/contracts";
import { allSubscriptions } from "@/drivers/driver.registry";
import logger from "@utils/logger.utils";
import mqtt, { type IPublishPacket, type MqttClient as Client } from "mqtt";

export type MessageHandler = (
  topic: string,
  payload: Buffer,
  packet: IPublishPacket,
) => void | Promise<void>;

export interface PublishOptions {
  qos?: 0 | 1 | 2;
  retain?: boolean;
  /** Reject when the broker has not confirmed the publish in time (default 3 s). */
  timeoutMs?: number;
}

const PUBLISH_TIMEOUT_MS = 3_000;

export interface ConnectOptions {
  url?: string;
  clientId?: string;
  username?: string;
  password?: string;
  monitorHumidifier?: boolean;
}

const ONLINE = '{"state":"online"}';
const OFFLINE = '{"state":"offline"}';

export class MqttClient {
  private static client: Client | undefined;
  private static handlers: MessageHandler[] = [];
  private static connected = false;
  private static monitorHumidifier = true;
  static firstConnectedAt: Date | null = null;

  /** Connects to the broker; resolves on the first successful connect. */
  static connect(opts: ConnectOptions = {}): Promise<void> {
    if (MqttClient.client) return Promise.resolve();

    const url = opts.url ?? process.env.MQTT_URL;
    if (!url) return Promise.reject(new Error("MQTT_URL is not set"));
    const caFile = process.env.MQTT_CA_FILE;
    MqttClient.monitorHumidifier =
      opts.monitorHumidifier ?? process.env.MONITOR_HUMIDIFIER !== "false";

    const client = mqtt.connect(url, {
      clientId: opts.clientId ?? process.env.MQTT_CLIENT_ID,
      username: opts.username ?? (process.env.MQTT_USERNAME || undefined),
      password: opts.password ?? (process.env.MQTT_PASSWORD || undefined),
      clean: false,
      keepalive: MQTT_KEEPALIVE_S,
      reconnectPeriod: 2000,
      protocolVersion: 4,
      ca: caFile ? fs.readFileSync(caFile) : undefined,
      rejectUnauthorized: true,
      will: {
        topic: BACKEND_STATUS_TOPIC,
        payload: Buffer.from(OFFLINE),
        qos: 1,
        retain: true,
      },
    });
    MqttClient.client = client;

    const first = new Promise<void>((resolve) => {
      client.once("connect", () => resolve());
    });

    client.on("connect", () => {
      MqttClient.connected = true;
      MqttClient.firstConnectedAt ??= new Date();
      logger.info("MQTT connected");
      const subs = allSubscriptions({ monitorHumidifier: MqttClient.monitorHumidifier });
      client.subscribe(subs, { qos: 1 }, (err) => {
        if (err) logger.error("MQTT subscribe failed", { error: err.message });
      });
      client.publish(BACKEND_STATUS_TOPIC, ONLINE, { qos: 1, retain: true }, (err) => {
        if (err) logger.warn("MQTT backend online publish failed", { error: err.message });
      });
    });
    client.on("close", () => {
      if (MqttClient.connected) logger.warn("MQTT disconnected");
      MqttClient.connected = false;
    });
    client.on("error", (err) => {
      logger.error("MQTT error", { error: err.message });
    });
    client.on("message", (topic, payload, packet) => {
      for (const h of MqttClient.handlers) {
        try {
          Promise.resolve(h(topic, payload, packet)).catch((err: unknown) => {
            logger.error("MQTT handler failed", { topic, error: String(err) });
          });
        } catch (err) {
          logger.error("MQTT handler failed", { topic, error: String(err) });
        }
      }
    });

    return first;
  }

  static isConnected(): boolean {
    return MqttClient.connected;
  }

  static onMessage(handler: MessageHandler): void {
    MqttClient.handlers.push(handler);
  }

  static publish(topic: string, payload: string, opts: PublishOptions = {}): Promise<void> {
    const client = MqttClient.client;
    if (!client || !MqttClient.connected) {
      return Promise.reject(new Error("MQTT not connected"));
    }
    // A QoS 1 publish whose socket drops may never call back; give up after a bound so
    // the caller can mark the command PUBLISH_FAILED instead of hanging.
    const timeoutMs = opts.timeoutMs ?? PUBLISH_TIMEOUT_MS;
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`MQTT publish timed out after ${timeoutMs} ms`)), timeoutMs);
      client.publish(
        topic,
        payload,
        { qos: opts.qos ?? 1, retain: opts.retain ?? false },
        (err) => {
          clearTimeout(timer);
          if (err) reject(err);
          else resolve();
        },
      );
    });
  }

  /** Publishes backend offline (retained) and closes. Call before Prisma disconnect. */
  static async shutdown(): Promise<void> {
    const client = MqttClient.client;
    if (!client) return;
    try {
      if (MqttClient.connected) {
        await MqttClient.publish(BACKEND_STATUS_TOPIC, OFFLINE, { qos: 1, retain: true });
      }
    } catch (err) {
      logger.warn("MQTT offline publish failed", { error: String(err) });
    }
    await client.endAsync();
    MqttClient.client = undefined;
    MqttClient.connected = false;
    MqttClient.firstConnectedAt = null;
    MqttClient.handlers = [];
  }

  /** Registers SIGINT/SIGTERM hooks; `after` runs once MQTT has closed (e.g. Prisma disconnect). */
  static installShutdownHooks(after?: () => Promise<void>): void {
    const stop = (): void => {
      void MqttClient.shutdown()
        .then(() => after?.())
        .finally(() => process.exit(0));
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  }
}

export default MqttClient;
