import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";

/** Permission sets of the plan section 7 matrix (CIMCMS permissions only). */
const READ_ONLY = [
  "DEVICE_READ", "ROOM_READ", "SCHEDULE_READ", "EXPERIMENT_READ", "AUDIT_READ", "REPORT_EXPORT",
] as const;

export const ROLE_PERMISSIONS = {
  VIEWER: [...READ_ONLY],
  TECHNICIAN: [...READ_ONLY, "DEVICE_COMMAND", "DEVICE_MODE_SET", "DEVICE_DIAGNOSTICS"],
  OPERATOR: [
    ...READ_ONLY, "DEVICE_COMMAND", "DEVICE_COMMAND_BULK", "DEVICE_MODE_SET",
    "SCHEDULE_WRITE", "SCHEDULE_PUBLISH", "EXPERIMENT_WRITE", "EXPERIMENT_RUN",
  ],
  ADMIN: [
    ...READ_ONLY, "DEVICE_COMMAND", "DEVICE_COMMAND_BULK", "DEVICE_MODE_SET", "DEVICE_DIAGNOSTICS", "DEVICE_MANAGE",
    "ROOM_WRITE", "SCHEDULE_WRITE", "SCHEDULE_PUBLISH", "EXPERIMENT_WRITE", "EXPERIMENT_RUN",
  ],
} as const;

export type TestRole = keyof typeof ROLE_PERMISSIONS;

export interface MintedToken {
  /** 24-hex ObjectId string, the `userId` claim. */
  userId: string;
  email: string;
  token: string;
}

/**
 * Mints an access token with the claims the API middleware reads, signed with
 * the test secret. Independent of the login flow, so these tests do not break
 * when the login/refresh code changes.
 */
export function mintToken(
  role: TestRole,
  opts: { permissions?: string[]; expiresIn?: number | string } = {},
): MintedToken {
  const userId = randomBytes(12).toString("hex");
  const email = `${role.toLowerCase()}-${userId}@test.local`;
  const token = jwt.sign(
    {
      userId,
      email,
      roles: [role],
      permissions: opts.permissions ?? [...ROLE_PERMISSIONS[role]],
      typ: "access",
    },
    process.env.JWT_SECRET_KEY as string,
    { expiresIn: (opts.expiresIn ?? "15m") as jwt.SignOptions["expiresIn"] },
  );
  return { userId, email, token };
}
