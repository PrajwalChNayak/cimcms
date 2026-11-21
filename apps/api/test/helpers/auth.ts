import prisma from "@models/prisma.client";
import RoleRepository from "@repositories/role.repository";
import UserRepository from "@repositories/user.repository";
import UserRoleRepository from "@repositories/userrole.repository";
import UserService from "@services/user.service";
import { randomUUID } from "node:crypto";
import Argon from "@utils/argon.utils";

export interface TestUser {
  id: string;
  email: string;
  password: string;
  role: string;
  /** Access token as returned by the real login service. */
  token: string;
}

/**
 * Creates a user with the given role (the role is created if missing) and
 * returns an access token obtained through the real login code path.
 */
export async function createUserWithRole(
  role: string,
  overrides: { email?: string; password?: string } = {},
): Promise<TestUser> {
  const email = (overrides.email ?? `${role.toLowerCase()}-${randomUUID()}@test.local`).toLowerCase();
  const password = overrides.password ?? `Pw-${randomUUID()}`;

  let roleRecord = await RoleRepository.findOne<{ id: string }>({ name: role });
  roleRecord ??= await RoleRepository.create<{ id: string }>({ name: role });

  const user = await UserRepository.create<{ id: string }>({
    email,
    password: await Argon.hashPassword(password),
    name: `Test ${role}`,
  });
  await UserRoleRepository.assign(user.id, roleRecord.id);

  const { authToken } = await UserService.login(email, password);
  return { id: user.id, email, password, role, token: authToken };
}

/** Removes everything created by tests (collections stay). */
export async function resetDatabase(): Promise<void> {
  await prisma.userRole.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
}
