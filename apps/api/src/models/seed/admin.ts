import type { PrismaClient } from "@prisma/client";
import Argon from "@utils/argon.utils";

export const MIN_ADMIN_PASSWORD_LENGTH = 12;

/** Creates or updates a User with role ADMIN. The password is never logged. */
export async function seedAdmin(
  prisma: PrismaClient,
  emailRaw: string,
  password: string | undefined,
): Promise<{ id: string; email: string; created: boolean }> {
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("A valid --email is required");
  if (!password || password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw new Error(`BOOTSTRAP_ADMIN_PASSWORD must be set and at least ${MIN_ADMIN_PASSWORD_LENGTH} characters`);
  }
  const role = await prisma.role.findUnique({ where: { name: "ADMIN" } });
  if (!role) throw new Error("Role ADMIN not found. Run the seed script first (npm run seed).");

  const hash = await Argon.hashPassword(password);
  const existing = await prisma.user.findUnique({ where: { email } });
  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: { password: hash, status: "ACTIVE" } })
    : await prisma.user.create({ data: { email, password: hash, name: "Administrator" } });

  const link = await prisma.userRole.findFirst({ where: { userId: user.id, roleId: role.id } });
  if (!link) await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return { id: user.id, email, created: !existing };
}
