import type { PrismaClient } from "@prisma/client";

export interface PermissionDef {
  name: string;
  isSystem: boolean;
}

const sys = (names: string[]): PermissionDef[] => names.map((name) => ({ name, isSystem: true }));
const nonSys = (names: string[]): PermissionDef[] => names.map((name) => ({ name, isSystem: false }));

// Existing permissions (kept as-is). DEVICE_READ is shared with the CIMCMS matrix.
const LEGACY_PERMISSIONS: PermissionDef[] = [
  ...sys(["USER_CREATE", "USER_READ", "USER_UPDATE", "USER_DELETE"]),
  ...sys(["ROLE_CREATE", "ROLE_READ", "ROLE_UPDATE", "ROLE_DELETE", "ROLE_ASSIGN"]),
  ...sys(["PERMISSION_CREATE", "PERMISSION_READ", "PERMISSION_UPDATE", "PERMISSION_DELETE", "PERMISSION_ASSIGN"]),
  ...nonSys([
    "FARM_CREATE", "FARM_READ", "FARM_UPDATE", "FARM_DELETE",
    "DEVICE_CREATE", "DEVICE_READ", "DEVICE_UPDATE", "DEVICE_DELETE",
    "CONSUMER_CREATE", "CONSUMER_READ", "CONSUMER_UPDATE", "CONSUMER_DELETE",
    "MASTER_CREATE", "MASTER_READ", "MASTER_UPDATE",
  ]),
];

/** CIMCMS permissions (plan section 7). DEVICE_READ already exists and is reused. */
export const CIMCMS_PERMISSION_NAMES = [
  "DEVICE_READ", "DEVICE_COMMAND", "DEVICE_COMMAND_BULK", "DEVICE_MODE_SET", "DEVICE_DIAGNOSTICS", "DEVICE_MANAGE",
  "ROOM_READ", "ROOM_WRITE",
  "SCHEDULE_READ", "SCHEDULE_WRITE", "SCHEDULE_PUBLISH",
  "EXPERIMENT_READ", "EXPERIMENT_WRITE", "EXPERIMENT_RUN",
  "AUDIT_READ", "REPORT_EXPORT",
];

export const PERMISSIONS: PermissionDef[] = [
  ...LEGACY_PERMISSIONS,
  ...nonSys(CIMCMS_PERMISSION_NAMES.filter((n) => n !== "DEVICE_READ")),
];

const READ_ONLY = ["DEVICE_READ", "ROOM_READ", "SCHEDULE_READ", "EXPERIMENT_READ", "AUDIT_READ", "REPORT_EXPORT"];

/** Permission matrix from plan section 7 (CIMCMS permissions only). */
export const CIMCMS_MATRIX: Record<"ADMIN" | "OPERATOR" | "TECHNICIAN" | "VIEWER", string[]> = {
  ADMIN: [...CIMCMS_PERMISSION_NAMES],
  OPERATOR: [
    ...READ_ONLY, "DEVICE_COMMAND", "DEVICE_COMMAND_BULK", "DEVICE_MODE_SET",
    "SCHEDULE_WRITE", "SCHEDULE_PUBLISH", "EXPERIMENT_WRITE", "EXPERIMENT_RUN",
  ],
  TECHNICIAN: [...READ_ONLY, "DEVICE_COMMAND", "DEVICE_MODE_SET", "DEVICE_DIAGNOSTICS"],
  VIEWER: [...READ_ONLY],
};

export interface RoleDef {
  name: string;
  isSystem: boolean;
  permissions: string[];
}

const uniq = (xs: string[]): string[] => [...new Set(xs)];

export const ROLES: RoleDef[] = [
  { name: "SUPER_ADMIN", isSystem: true, permissions: PERMISSIONS.map((p) => p.name) },
  {
    name: "ADMIN",
    isSystem: true,
    permissions: uniq([
      "USER_CREATE", "USER_READ", "USER_UPDATE", "USER_DELETE",
      "ROLE_READ", "ROLE_ASSIGN", "PERMISSION_READ", "PERMISSION_ASSIGN",
      "FARM_CREATE", "FARM_READ", "FARM_UPDATE", "FARM_DELETE",
      "DEVICE_CREATE", "DEVICE_UPDATE", "DEVICE_DELETE",
      "CONSUMER_CREATE", "CONSUMER_READ", "CONSUMER_UPDATE", "CONSUMER_DELETE",
      "MASTER_CREATE", "MASTER_READ", "MASTER_UPDATE",
      ...CIMCMS_MATRIX.ADMIN,
    ]),
  },
  {
    name: "MANAGER",
    isSystem: false,
    permissions: [
      "USER_READ", "FARM_CREATE", "FARM_READ", "FARM_UPDATE",
      "DEVICE_CREATE", "DEVICE_READ", "DEVICE_UPDATE",
      "CONSUMER_READ", "CONSUMER_UPDATE", "MASTER_READ",
    ],
  },
  {
    name: "OPERATOR",
    isSystem: false,
    permissions: uniq(["FARM_READ", "DEVICE_UPDATE", "CONSUMER_READ", "MASTER_READ", ...CIMCMS_MATRIX.OPERATOR]),
  },
  { name: "TECHNICIAN", isSystem: false, permissions: [...CIMCMS_MATRIX.TECHNICIAN] },
  // Exactly the matrix: the legacy FARM_READ / CONSUMER_READ / MASTER_READ are dropped.
  { name: "VIEWER", isSystem: false, permissions: [...CIMCMS_MATRIX.VIEWER] },
];

export async function seedRbac(prisma: PrismaClient): Promise<{ permissions: number; roles: number }> {
  const permissionIds = new Map<string, string>();
  for (const perm of PERMISSIONS) {
    const rec = await prisma.permission.upsert({
      where: { name: perm.name },
      update: { isSystem: perm.isSystem },
      create: { name: perm.name, isSystem: perm.isSystem },
    });
    permissionIds.set(rec.name, rec.id);
  }

  for (const def of ROLES) {
    const role = await prisma.role.upsert({
      where: { name: def.name },
      update: { isSystem: def.isSystem },
      create: { name: def.name, isSystem: def.isSystem },
    });
    const links = await prisma.rolePermission.findMany({ where: { roleId: role.id } });
    const desired = new Set(def.permissions.map((n) => permissionIds.get(n)).filter((x): x is string => !!x));

    // Remove stale links and duplicates; keep one link per desired permission.
    const seen = new Set<string>();
    const remove: string[] = [];
    for (const l of links) {
      if (!desired.has(l.permissionId) || seen.has(l.permissionId)) remove.push(l.id);
      else seen.add(l.permissionId);
    }
    if (remove.length) await prisma.rolePermission.deleteMany({ where: { id: { in: remove } } });
    for (const permissionId of desired) {
      if (!seen.has(permissionId)) await prisma.rolePermission.create({ data: { roleId: role.id, permissionId } });
    }
  }
  return { permissions: PERMISSIONS.length, roles: ROLES.length };
}
