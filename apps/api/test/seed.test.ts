import { afterAll, describe, expect, it } from "vitest";
import prisma from "@models/prisma.client";
import { seedRbac, CIMCMS_MATRIX, PERMISSIONS, ROLES } from "@models/seed/rbac";
import { parseSeedDevices, seedDevices } from "@models/seed/devices";
import { seedAdmin } from "@models/seed/admin";
import Argon from "@utils/argon.utils";
import { resetDatabase } from "./helpers/auth";

afterAll(async () => {
  await prisma.rolePermission.deleteMany();
  await resetDatabase();
  await prisma.permission.deleteMany();
  await prisma.device.deleteMany();
  await prisma.$disconnect();
});

async function counts(): Promise<Record<string, number>> {
  return {
    permissions: await prisma.permission.count(),
    roles: await prisma.role.count(),
    rolePermissions: await prisma.rolePermission.count(),
    devices: await prisma.device.count(),
  };
}

async function permissionNames(role: string): Promise<string[]> {
  const links = await prisma.rolePermission.findMany({
    where: { role: { name: role } },
    include: { permission: true },
  });
  return links.map((l) => l.permission.name).sort();
}

describe("seed", () => {
  const devices = parseSeedDevices("LED-01:LED_CONTROLLER:LED Controller 1,HUM-01:HUMIDIFIER:Humidifier 1");

  it("running twice gives the same counts", async () => {
    await seedRbac(prisma);
    await seedDevices(prisma, devices);
    const first = await counts();
    await seedRbac(prisma);
    await seedDevices(prisma, devices);
    const second = await counts();

    expect(second).toEqual(first);
    expect(first.permissions).toBe(PERMISSIONS.length);
    expect(first.roles).toBe(ROLES.length);
    expect(first.devices).toBe(2);
  });

  it("VIEWER has exactly the matrix permissions", async () => {
    await seedRbac(prisma);
    expect(await permissionNames("VIEWER")).toEqual([...CIMCMS_MATRIX.VIEWER].sort());
  });

  it("OPERATOR cannot diagnose; TECHNICIAN cannot send bulk", async () => {
    const op = await permissionNames("OPERATOR");
    const tech = await permissionNames("TECHNICIAN");
    expect(op).not.toContain("DEVICE_DIAGNOSTICS");
    expect(tech).not.toContain("DEVICE_COMMAND_BULK");
    expect(tech).toContain("DEVICE_DIAGNOSTICS");
  });

  it("rejects an unknown device TYPE and a malformed entry", () => {
    expect(() => parseSeedDevices("X-1:TOASTER:Toaster")).toThrow(/unknown TYPE/);
    expect(() => parseSeedDevices("X-1:LED_CONTROLLER")).toThrow(/deviceId:TYPE:Name/);
  });

  it("seedAdmin refuses short or missing passwords and is idempotent", async () => {
    await seedRbac(prisma);
    await expect(seedAdmin(prisma, "a@test.local", undefined)).rejects.toThrow(/at least 12/);
    await expect(seedAdmin(prisma, "a@test.local", "short")).rejects.toThrow(/at least 12/);

    const pw1 = "first-password-123";
    const a = await seedAdmin(prisma, "A@Test.local", pw1);
    expect(a.created).toBe(true);
    const b = await seedAdmin(prisma, "a@test.local", "second-password-456");
    expect(b.created).toBe(false);
    expect(b.id).toBe(a.id);

    expect(await prisma.user.count({ where: { email: "a@test.local" } })).toBe(1);
    expect(await prisma.userRole.count({ where: { userId: a.id } })).toBe(1);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: a.id } });
    expect(await Argon.verifyPassword("second-password-456", user.password)).toBe(true);
  });
});
