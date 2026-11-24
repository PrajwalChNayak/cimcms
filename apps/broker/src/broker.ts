import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import tls from "node:tls";
import type { AddressInfo } from "node:net";
import type { PrismaClient } from "@prisma/client";
import { Aedes, type AuthenticateError, type Client } from "aedes";
import argon2 from "argon2";
import { ACCOUNT_CHANGED_TOPIC, canPublish, canSubscribe, type AclAccount, type AccountKind } from "./acl.js";
import { log } from "./log.js";

export interface BrokerOptions {
  prisma: PrismaClient;
  /** Plain MQTT port (0 = random, for tests). */
  port: number;
  host?: string;
  /** TLS listener (MQTTS); started only when cert and key are given. */
  tlsPort?: number;
  tlsCertFile?: string;
  tlsKeyFile?: string;
  /** HTTP health endpoint (GET /health). Not started when undefined. */
  healthPort?: number;
  /** Failed logins per IP within `failWindowMs` before that IP is refused for the window. */
  maxFailures?: number;
  failWindowMs?: number;
  /** Max MQTT packet size in bytes. */
  maxPacketBytes?: number;
}

export interface RunningBroker {
  aedes: Aedes;
  port: number;
  tlsPort: number | null;
  healthPort: number | null;
  close(): Promise<void>;
}

type CimcmsClient = Client & { cimcms?: AclAccount };

const authError = (code: 4 | 5, message: string): AuthenticateError =>
  Object.assign(new Error(message), { returnCode: code }) as AuthenticateError;

/** A hash of a random string: spends real argon2 time on unknown users (no timing hint). */
let dummyHash: Promise<string> | undefined;
const getDummyHash = (): Promise<string> =>
  (dummyHash ??= argon2.hash(`cimcms-dummy-${Math.random()}`, { type: argon2.argon2id }));

/**
 * The CIMCMS MQTT broker: aedes with logins and topic permissions from the database
 * (table MqttAccount) and retained messages stored in the database (table MqttRetained).
 */
export async function startBroker(opts: BrokerOptions): Promise<RunningBroker> {
  const { prisma } = opts;
  const maxFailures = opts.maxFailures ?? 20;
  const failWindowMs = opts.failWindowMs ?? 10 * 60_000;
  const failures = new Map<string, { count: number; since: number }>();

  const blocked = (ip: string): boolean => {
    const f = failures.get(ip);
    if (!f) return false;
    if (Date.now() - f.since > failWindowMs) {
      failures.delete(ip);
      return false;
    }
    return f.count >= maxFailures;
  };
  const noteFailure = (ip: string): void => {
    const f = failures.get(ip);
    if (!f || Date.now() - f.since > failWindowMs) failures.set(ip, { count: 1, since: Date.now() });
    else f.count++;
  };

  const aedes = await Aedes.createBroker({
    // Bigger than any CIMCMS message (config <= 4 KB); larger packets are dropped by aedes.
    connectTimeout: 30_000,
  });

  // ---------------------------------------------------------------- login
  aedes.authenticate = (client, username, password, done) => {
    const c = client as CimcmsClient;
    const ip = (client.conn as net.Socket | undefined)?.remoteAddress ?? "unknown";
    void (async () => {
      if (blocked(ip)) {
        log.warn("login refused: too many failures from this address", { ip });
        return done(authError(5, "too many failed logins"), false);
      }
      if (!username || !password) {
        noteFailure(ip);
        return done(authError(4, "username and password required"), false);
      }
      const account = await prisma.mqttAccount.findUnique({ where: { username } });
      if (!account || !account.enabled) {
        await argon2.verify(await getDummyHash(), password.toString()).catch(() => false);
        noteFailure(ip);
        log.info("login refused: unknown or disabled user", { ip, username });
        return done(authError(5, "not authorised"), false);
      }
      const ok = await argon2.verify(account.passwordHash, password.toString()).catch(() => false);
      if (!ok) {
        noteFailure(ip);
        log.info("login refused: wrong password", { ip, username });
        return done(authError(5, "not authorised"), false);
      }
      if (account.kind === "DEVICE" && client.id !== account.username) {
        log.info("login refused: client ID must equal the device ID", { ip, username, clientId: client.id });
        return done(authError(5, "client ID must equal the device ID"), false);
      }
      c.cimcms = {
        username: account.username,
        kind: account.kind as AccountKind,
        deviceId: account.deviceId,
        deviceType: account.deviceType,
      };
      log.info("client logged in", { ip, username, kind: account.kind, clientId: client.id });
      done(null, true);
    })().catch((err: unknown) => {
      log.error("login check failed", { error: String(err) });
      done(authError(5, "login check failed"), false);
    });
  };

  // ---------------------------------------------------------------- permissions
  aedes.authorizePublish = (client, packet, callback) => {
    if (!client) return callback(null); // stored will of a client that is gone (aedes internal)
    const account = (client as CimcmsClient).cimcms;
    if (!account || !canPublish(account, packet.topic)) {
      log.warn("publish refused (client disconnected)", { username: account?.username, topic: packet.topic });
      return callback(new Error(`not allowed to publish to ${packet.topic}`));
    }
    callback(null);
  };

  aedes.authorizeSubscribe = (client, subscription, callback) => {
    const account = (client as CimcmsClient).cimcms;
    if (!account || !canSubscribe(account, subscription.topic)) {
      log.warn("subscribe refused", { username: account?.username, topic: subscription.topic });
      return callback(null, null); // SUBACK failure (0x80), client stays connected
    }
    callback(null, subscription);
  };

  // The account-changed signal is for the broker only: never delivered to subscribers.
  aedes.authorizeForward = (_client, packet) => (packet.topic === ACCOUNT_CHANGED_TOPIC ? null : packet);

  // ---------------------------------------------------------------- events
  aedes.on("publish", (packet, client) => {
    if (packet.topic !== ACCOUNT_CHANGED_TOPIC || !client) return;
    if ((client as CimcmsClient).cimcms?.kind !== "SERVICE") return;
    let usernames: string[] = [];
    try {
      const body = JSON.parse(packet.payload.toString()) as { username?: string; usernames?: string[] };
      usernames = [...(body.usernames ?? []), ...(body.username ? [body.username] : [])];
    } catch {
      return;
    }
    const wanted = new Set(usernames);
    const clients = (aedes as unknown as { clients: Record<string, CimcmsClient> }).clients;
    for (const other of Object.values(clients)) {
      if (other.cimcms && wanted.has(other.cimcms.username)) {
        log.info("closing session after login change", { username: other.cimcms.username });
        other.close();
      }
    }
  });

  aedes.on("clientDisconnect", (client) => {
    const account = (client as CimcmsClient).cimcms;
    if (account) log.info("client disconnected", { username: account.username, clientId: client.id });
  });

  // ---------------------------------------------------------------- retained in the database
  aedes.published = (packet, _client, callback) => {
    if (!packet.retain || packet.topic.startsWith("$")) return callback(null);
    const done = (): void => callback(null);
    if (!packet.payload || packet.payload.length === 0) {
      prisma.mqttRetained
        .deleteMany({ where: { topic: packet.topic } })
        .catch((err: unknown) => log.error("retained delete failed", { topic: packet.topic, error: String(err) }))
        .finally(done);
      return;
    }
    const payload = new Uint8Array(Buffer.isBuffer(packet.payload) ? packet.payload : Buffer.from(String(packet.payload)));
    prisma.mqttRetained
      .upsert({
        where: { topic: packet.topic },
        create: { topic: packet.topic, payload, qos: packet.qos },
        update: { payload, qos: packet.qos },
      })
      .catch((err: unknown) => log.error("retained save failed", { topic: packet.topic, error: String(err) }))
      .finally(done);
  };

  const stored = await prisma.mqttRetained.findMany();
  for (const r of stored) {
    await new Promise<void>((resolve) =>
      aedes.publish(
        { cmd: "publish", topic: r.topic, payload: Buffer.from(r.payload), qos: r.qos as 0 | 1 | 2, retain: true, dup: false },
        () => resolve(),
      ),
    );
  }
  if (stored.length > 0) log.info("retained messages restored", { count: stored.length });

  // ---------------------------------------------------------------- listeners
  const server = net.createServer(aedes.handle);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, opts.host ?? "0.0.0.0", resolve);
  });
  const port = (server.address() as AddressInfo).port;
  log.info("MQTT listening", { port });

  let tlsServer: tls.Server | null = null;
  let tlsPort: number | null = null;
  if (opts.tlsCertFile && opts.tlsKeyFile) {
    tlsServer = tls.createServer(
      { cert: fs.readFileSync(opts.tlsCertFile), key: fs.readFileSync(opts.tlsKeyFile) },
      aedes.handle,
    );
    await new Promise<void>((resolve, reject) => {
      tlsServer!.once("error", reject);
      tlsServer!.listen(opts.tlsPort ?? 8883, opts.host ?? "0.0.0.0", resolve);
    });
    tlsPort = (tlsServer.address() as AddressInfo).port;
    log.info("MQTTS listening", { port: tlsPort });
  }

  let health: http.Server | null = null;
  let healthPort: number | null = null;
  if (opts.healthPort !== undefined) {
    health = http.createServer((req, res) => {
      if (req.url !== "/health") {
        res.writeHead(404).end();
        return;
      }
      prisma.$queryRaw`SELECT 1`
        .then(() => true)
        .catch(() => false)
        .then((db) => {
          const body = { status: db ? "ok" : "unavailable", database: db ? "up" : "down", clients: aedes.connectedClients };
          res.writeHead(db ? 200 : 503, { "Content-Type": "application/json" }).end(JSON.stringify(body));
        });
    });
    await new Promise<void>((resolve) => health!.listen(opts.healthPort, "0.0.0.0", resolve));
    healthPort = (health.address() as AddressInfo).port;
  }

  return {
    aedes,
    port,
    tlsPort,
    healthPort,
    async close() {
      await new Promise<void>((resolve) => aedes.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (tlsServer) await new Promise<void>((resolve) => tlsServer!.close(() => resolve()));
      if (health) await new Promise<void>((resolve) => health!.close(() => resolve()));
    },
  };
}
