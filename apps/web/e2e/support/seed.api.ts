/**
 * Runs with apps/api as cwd through tsx (so the API's tsconfig path aliases resolve):
 *   tsx e2e/support/seed.api.ts   (see global-setup.ts)
 * Seeds RBAC, device LED-01, the e2e users and the broker logins (MqttAccount: cimcms-backend
 * SERVICE, LED-01 DEVICE) into DATABASE_URL (a scratch database).
 * Passwords come from E2E_*_PASSWORD env vars and are never printed.
 */
import { PrismaClient } from "@prisma/client";
import { seedRbac } from "@models/seed/rbac";
import { seedDevices } from "@models/seed/devices";
import Argon from "@utils/argon.utils";

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

const USERS = [
  { email: "e2e-admin@cimcms.test", role: "ADMIN", pw: "E2E_ADMIN_PASSWORD" },
  { email: "e2e-viewer@cimcms.test", role: "VIEWER", pw: "E2E_VIEWER_PASSWORD" },
  { email: "e2e-tech@cimcms.test", role: "TECHNICIAN", pw: "E2E_TECH_PASSWORD" },
] as const;

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  if (!/\/cimcms_e2e[^/?]*(\?|$)/.test(url)) {
    throw new Error("Refusing to seed: DATABASE_URL is not a cimcms_e2e* scratch database");
  }

  await seedRbac(prisma);
  await seedDevices(prisma, [{ deviceId: "LED-01", type: "LED_CONTROLLER", name: "LED Controller 1" }]);

  for (const u of USERS) {
    const password = process.env[u.pw];
    if (!password || password.length < 12) throw new Error(`${u.pw} must be set (min 12 chars)`);
    const role = await prisma.role.findUnique({ where: { name: u.role } });
    if (!role) throw new Error(`Role ${u.role} not found`);
    const hash = await Argon.hashPassword(password);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { password: hash, status: "ACTIVE" },
      create: { email: u.email, password: hash, name: u.email.split("@")[0] ?? u.email },
    });
    const link = await prisma.userRole.findFirst({ where: { userId: user.id, roleId: role.id } });
    if (!link) await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }
  // Broker logins for the own broker (apps/broker reads table MqttAccount).
  const now = new Date();
  const accounts = [
    { username: "cimcms-backend", kind: "SERVICE", deviceId: null, deviceType: null, pw: "E2E_MQTT_BACKEND_PASSWORD" },
    { username: "LED-01", kind: "DEVICE", deviceId: "LED-01", deviceType: "LED_CONTROLLER", pw: "E2E_MQTT_LED01_PASSWORD" },
  ] as const;
  for (const a of accounts) {
    const password = process.env[a.pw];
    if (!password || password.length < 12) throw new Error(`${a.pw} must be set (min 12 chars)`);
    const passwordHash = await Argon.hashPassword(password);
    const data = { kind: a.kind, deviceId: a.deviceId, deviceType: a.deviceType, enabled: true, passwordHash, passwordSetAt: now, note: "e2e" };
    await prisma.mqttAccount.upsert({ where: { username: a.username }, update: data, create: { username: a.username, ...data } });
  }
  console.log("e2e seed done");
}

main()
  .catch((e: unknown) => {
    console.error("e2e seed failed:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
