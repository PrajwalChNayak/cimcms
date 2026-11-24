import dotenv from "dotenv";
import {
  deleteMqttAccount,
  listMqttAccounts,
  parseMqttAccountArgs,
  upsertMqttAccount,
} from "@models/seed/mqttAccount";
import brokerPrisma from "@models/broker-prisma.client";
dotenv.config();

// Usage: npm run mqtt:account -w apps/api -- --username cimcms-backend --kind service
// Broker logins live in the MqttAccount table; the broker reads it on every connect.
// The password comes from MQTT_ACCOUNT_PASSWORD, or is generated and printed once.

// Broker logins live in the broker database (BROKER_DATABASE_URL).
const prisma = brokerPrisma;

async function main(): Promise<void> {
  const cmd = parseMqttAccountArgs(process.argv.slice(2));

  if (cmd.action === "list") {
    const rows = await listMqttAccounts(prisma);
    if (rows.length === 0) {
      console.log("No broker accounts.");
      return;
    }
    console.table(
      rows.map((r) => ({
        username: r.username,
        kind: r.kind,
        deviceId: r.deviceId ?? "",
        deviceType: r.deviceType ?? "",
        enabled: r.enabled,
        passwordSetAt: r.passwordSetAt.toISOString(),
        note: r.note ?? "",
      })),
    );
    return;
  }

  if (cmd.action === "delete") {
    const deleted = await deleteMqttAccount(prisma, cmd.username);
    console.log(deleted ? `Deleted broker account ${cmd.username}` : `No broker account ${cmd.username}`);
    if (deleted) console.log("Existing sessions end when the client reconnects (or restart the broker to drop them now).");
    return;
  }

  const res = await upsertMqttAccount(prisma, cmd, process.env.MQTT_ACCOUNT_PASSWORD || undefined);
  console.log(`${res.created ? "Created" : "Updated"} ${cmd.kind} broker account ${cmd.username}`);
  if (res.generated) {
    console.log("Password (shown once, store it now):");
    console.log(res.password);
  } else {
    console.log("Password set from MQTT_ACCOUNT_PASSWORD.");
  }
  if (cmd.kind === "SERVICE") {
    console.log("\n.env lines for the service using this account:");
    console.log(`MQTT_USERNAME=${cmd.username}`);
    console.log(`MQTT_PASSWORD=${res.generated ? res.password : "<the MQTT_ACCOUNT_PASSWORD value>"}`);
  }
}

main()
  .catch((e: unknown) => {
    console.error("mqtt:account failed:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
