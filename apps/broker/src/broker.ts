import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import tls from "node:tls";
import type { AddressInfo } from "node:net";
import type { PrismaClient } from "./generated/prisma/index.js";
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
  /** Largest accepted PUBLISH payload in bytes (default 64 KiB). Bigger: client disconnected. */
  maxPayloadBytes?: number;
  /** Sustained publishes per second per client (default 20) and burst size (default 100). */
  maxMessagesPerSecond?: number;
  messageBurst?: number;
  /** Open connections allowed from one IP address (default 200; NAT sites share one IP). */
  maxConnectionsPerIp?: number;
  /** Open connections in total (default 10 000). */
  maxConnections?: number;
  /**
   * How long a successful login is remembered (default 10 min). Used to skip the slow
   * password hash on quick reconnects, and to keep known devices online while the database
   * is briefly unreachable. Cleared at once on account-changed.
   */
  credentialCacheMs?: number;
  /** Retained messages are written to the database at most this often per topic (default 1 s). */
  retainedFlushMs?: number;
  /** Stats line in the log every N ms (default 60 s, 0 = off). */
  statsIntervalMs?: number;
}

export interface BrokerStats {
  clients: number;
  messagesIn: number;
  bytesIn: number;
  /** Average incoming messages per second over the last stats window. */
  messagesPerSecond: number;
  droppedTooLarge: number;
  droppedRateLimited: number;
  refusedConnections: number;
  degradedLogins: number;
}

export interface RunningBroker {
  aedes: Aedes;
  port: number;
  tlsPort: number | null;
  healthPort: number | null;
  stats(): BrokerStats;
  close(): Promise<void>;
}

type CimcmsClient = Client & { cimcms?: AclAccount; cimcmsIp?: string };

const authError = (code: 2 | 3 | 4 | 5, message: string): AuthenticateError =>
  Object.assign(new Error(message), { returnCode: code }) as AuthenticateError;

/** A hash of a random string: spends real argon2 time on unknown users (no timing hint). */
let dummyHash: Promise<string> | undefined;
const getDummyHash = (): Promise<string> =>
  (dummyHash ??= argon2.hash(`cimcms-dummy-${Math.random()}`, { type: argon2.argon2id }));

/** Per-process secret so the in-memory login cache never holds a reusable password digest. */
const CACHE_PEPPER = randomBytes(32);
const digest = (password: Buffer): string =>
  createHash("sha256").update(CACHE_PEPPER).update(password).digest("hex");

interface CachedLogin {
  digest: string;
  passwordSetAt: number;
  account: AclAccount;
  until: number;
}

/**
 * The CIMCMS MQTT broker: aedes with logins and topic permissions from the broker database
 * (table MqttAccount) and retained messages stored in it (table MqttRetained).
 */
export async function startBroker(opts: BrokerOptions): Promise<RunningBroker> {
  const { prisma } = opts;
  const maxFailures = opts.maxFailures ?? 20;
  const failWindowMs = opts.failWindowMs ?? 10 * 60_000;
  const maxPayloadBytes = opts.maxPayloadBytes ?? 64 * 1024;
  const ratePerSec = opts.maxMessagesPerSecond ?? 20;
  const burst = opts.messageBurst ?? 100;
  const maxPerIp = opts.maxConnectionsPerIp ?? 200;
  const maxConnections = opts.maxConnections ?? 10_000;
  const cacheMs = opts.credentialCacheMs ?? 10 * 60_000;
  const flushMs = opts.retainedFlushMs ?? 1_000;
  const statsMs = opts.statsIntervalMs ?? 60_000;

  const counters = {
    messagesIn: 0,
    bytesIn: 0,
    droppedTooLarge: 0,
    droppedRateLimited: 0,
    refusedConnections: 0,
    degradedLogins: 0,
  };
  let windowStart = Date.now();
  let windowMessages = 0;
  let lastRate = 0;

  // ---------------------------------------------------------------- failed-login limiter
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

  const loginCache = new Map<string, CachedLogin>();
  const perIp = new Map<string, number>();
  const buckets = new Map<string, { tokens: number; at: number }>();

  const aedes = await Aedes.createBroker({
    connectTimeout: 30_000,
    // Outgoing queue per client: a slow subscriber is dropped instead of eating memory.
    queueLimit: 1_000,
    concurrency: 500,
  });

  const ipOf = (client: Client): string => (client.conn as net.Socket | undefined)?.remoteAddress ?? "unknown";

  // ---------------------------------------------------------------- connection caps
  aedes.preConnect = (client, _packet, callback) => {
    const ip = ipOf(client);
    if (aedes.connectedClients >= maxConnections || (perIp.get(ip) ?? 0) >= maxPerIp) {
      counters.refusedConnections++;
      log.warn("connection refused: too many connections", { ip, perIp: perIp.get(ip) ?? 0, total: aedes.connectedClients });
      return callback(null, false);
    }
    callback(null, true);
  };

  // ---------------------------------------------------------------- login
  aedes.authenticate = (client, username, password, done) => {
    const c = client as CimcmsClient;
    const ip = ipOf(client);
    const accept = (account: AclAccount, how: string): void => {
      c.cimcms = account;
      c.cimcmsIp = ip;
      perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
      log.info("client logged in", { ip, username: account.username, kind: account.kind, clientId: client.id, how });
      done(null, true);
    };
    void (async () => {
      if (blocked(ip)) {
        log.warn("login refused: too many failures from this address", { ip });
        return done(authError(5, "too many failed logins"), false);
      }
      if (!username || !password) {
        noteFailure(ip);
        return done(authError(4, "username and password required"), false);
      }
      const d = digest(password);
      const cached = loginCache.get(username);

      let account;
      try {
        account = await prisma.mqttAccount.findUnique({ where: { username } });
      } catch (err) {
        // Database unreachable: keep known devices online with their last good login.
        if (cached && cached.until > Date.now() && cached.digest === d) {
          if (cached.account.kind === "DEVICE" && client.id !== cached.account.username) {
            return done(authError(5, "client ID must equal the device ID"), false);
          }
          counters.degradedLogins++;
          log.warn("database unreachable: login accepted from cache", { username, error: String(err) });
          return accept(cached.account, "cache (database down)");
        }
        log.error("login refused: database unreachable", { username, error: String(err) });
        return done(authError(3, "server unavailable"), false);
      }

      if (!account || !account.enabled) {
        loginCache.delete(username);
        await argon2.verify(await getDummyHash(), password.toString()).catch(() => false);
        noteFailure(ip);
        log.info("login refused: unknown or disabled user", { ip, username });
        return done(authError(5, "not authorised"), false);
      }
      if (account.kind === "DEVICE" && client.id !== account.username) {
        log.info("login refused: client ID must equal the device ID", { ip, username, clientId: client.id });
        return done(authError(5, "client ID must equal the device ID"), false);
      }

      const setAt = account.passwordSetAt.getTime();
      const acl: AclAccount = {
        username: account.username,
        kind: account.kind as AccountKind,
        deviceId: account.deviceId,
        deviceType: account.deviceType,
      };
      // Same password as the last good login and not changed since: skip the slow hash.
      if (cached && cached.digest === d && cached.passwordSetAt === setAt && cached.until > Date.now()) {
        cached.account = acl;
        return accept(acl, "cache");
      }
      const ok = await argon2.verify(account.passwordHash, password.toString()).catch(() => false);
      if (!ok) {
        loginCache.delete(username);
        noteFailure(ip);
        log.info("login refused: wrong password", { ip, username });
        return done(authError(5, "not authorised"), false);
      }
      loginCache.set(username, { digest: d, passwordSetAt: setAt, account: acl, until: Date.now() + cacheMs });
      accept(acl, "password");
    })().catch((err: unknown) => {
      log.error("login check failed", { error: String(err) });
      done(authError(3, "login check failed"), false);
    });
  };

  // ---------------------------------------------------------------- permissions and limits
  const takeToken = (clientId: string): boolean => {
    const now = Date.now();
    const b = buckets.get(clientId) ?? { tokens: burst, at: now };
    b.tokens = Math.min(burst, b.tokens + ((now - b.at) / 1000) * ratePerSec);
    b.at = now;
    buckets.set(clientId, b);
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  };

  aedes.authorizePublish = (client, packet, callback) => {
    if (!client) return callback(null); // stored will of a client that is gone (aedes internal)
    const account = (client as CimcmsClient).cimcms;
    const size = packet.payload ? packet.payload.length : 0;
    counters.messagesIn++;
    counters.bytesIn += size;
    windowMessages++;
    if (size > maxPayloadBytes) {
      counters.droppedTooLarge++;
      log.warn("publish refused: payload too large (client disconnected)", { username: account?.username, topic: packet.topic, bytes: size });
      return callback(new Error("payload too large"));
    }
    if (!takeToken(client.id)) {
      counters.droppedRateLimited++;
      log.warn("publish refused: too many messages (client disconnected)", { username: account?.username, limitPerSecond: ratePerSec });
      return callback(new Error("rate limit"));
    }
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
    for (const u of wanted) loginCache.delete(u);
    const clients = (aedes as unknown as { clients: Record<string, CimcmsClient> }).clients;
    for (const other of Object.values(clients)) {
      if (other.cimcms && wanted.has(other.cimcms.username)) {
        log.info("closing session after login change", { username: other.cimcms.username });
        other.close();
      }
    }
  });

  aedes.on("clientDisconnect", (client) => {
    const c = client as CimcmsClient;
    buckets.delete(client.id);
    if (c.cimcmsIp) {
      const n = (perIp.get(c.cimcmsIp) ?? 1) - 1;
      if (n <= 0) perIp.delete(c.cimcmsIp);
      else perIp.set(c.cimcmsIp, n);
      c.cimcmsIp = undefined; // count once
    }
    if (c.cimcms) log.info("client disconnected", { username: c.cimcms.username, clientId: client.id });
  });

  aedes.on("clientError", (client, err) => {
    log.warn("client error", { clientId: client?.id, error: err.message });
  });
  aedes.on("connectionError", (client, err) => {
    log.warn("connection error", { clientId: client?.id, error: err.message });
  });

  // ---------------------------------------------------------------- retained in the database
  // Write-behind: the newest value per topic is written at most every `flushMs`, so a device
  // that publishes a retained status every second does not cause a database write each time.
  const pendingRetained = new Map<string, { payload: Uint8Array<ArrayBuffer> | null; qos: number }>();
  let flushing: Promise<void> | null = null;
  const flushRetained = async (): Promise<void> => {
    if (flushing) return flushing;
    if (pendingRetained.size === 0) return;
    const batch = [...pendingRetained.entries()];
    pendingRetained.clear();
    flushing = (async () => {
      for (const [topic, v] of batch) {
        try {
          if (v.payload === null) await prisma.mqttRetained.deleteMany({ where: { topic } });
          else
            await prisma.mqttRetained.upsert({
              where: { topic },
              create: { topic, payload: v.payload, qos: v.qos },
              update: { payload: v.payload, qos: v.qos },
            });
        } catch (err) {
          // Keep it for the next flush unless a newer value arrived meanwhile.
          if (!pendingRetained.has(topic)) pendingRetained.set(topic, v);
          log.error("retained save failed (will retry)", { topic, error: String(err) });
        }
      }
    })().finally(() => {
      flushing = null;
    });
    return flushing;
  };
  const flushTimer = setInterval(() => void flushRetained(), flushMs);
  flushTimer.unref();

  aedes.published = (packet, _client, callback) => {
    if (packet.retain && !packet.topic.startsWith("$")) {
      const empty = !packet.payload || packet.payload.length === 0;
      pendingRetained.set(packet.topic, {
        payload: empty ? null : Uint8Array.from(Buffer.isBuffer(packet.payload) ? packet.payload : Buffer.from(String(packet.payload))),
        qos: packet.qos,
      });
    }
    callback(null);
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
  pendingRetained.clear(); // restoring is not a change
  if (stored.length > 0) log.info("retained messages restored", { count: stored.length });

  // ---------------------------------------------------------------- stats
  const stats = (): BrokerStats => ({
    clients: aedes.connectedClients,
    ...counters,
    messagesPerSecond: lastRate,
  });
  const rollWindow = (): void => {
    const secs = Math.max(1, (Date.now() - windowStart) / 1000);
    lastRate = Math.round((windowMessages / secs) * 10) / 10;
    windowMessages = 0;
    windowStart = Date.now();
  };
  const statsTimer =
    statsMs > 0
      ? setInterval(() => {
          rollWindow();
          log.info("stats", { ...stats(), heapMb: Math.round(process.memoryUsage().heapUsed / 1e6) });
        }, statsMs)
      : null;
  statsTimer?.unref();

  // ---------------------------------------------------------------- listeners
  const server = net.createServer(aedes.handle);
  server.maxConnections = maxConnections + 50;
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
      if (statsMs === 0 || Date.now() - windowStart > statsMs) rollWindow();
      prisma.$queryRaw`SELECT 1`
        .then(() => true)
        .catch(() => false)
        .then((db) => {
          // The broker keeps serving known devices when the database is down: report it, but
          // only "unavailable" (503) so orchestration can alert; it does not need a restart.
          const body = { status: db ? "ok" : "unavailable", database: db ? "up" : "down", ...stats() };
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
    stats,
    async close() {
      clearInterval(flushTimer);
      if (statsTimer) clearInterval(statsTimer);
      await new Promise<void>((resolve) => aedes.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (tlsServer) await new Promise<void>((resolve) => tlsServer!.close(() => resolve()));
      if (health) await new Promise<void>((resolve) => health!.close(() => resolve()));
      await flushRetained(); // nothing retained is lost on a clean stop
      await flushRetained();
    },
  };
}
