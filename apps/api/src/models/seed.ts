import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

// ─── Permission definitions ───────────────────────────────────────────────────
const PERMISSIONS = [
  // User management
  { name: 'USER_CREATE', isSystem: true },
  { name: 'USER_READ', isSystem: true },
  { name: 'USER_UPDATE', isSystem: true },
  { name: 'USER_DELETE', isSystem: true },

  // Role management
  { name: 'ROLE_CREATE', isSystem: true },
  { name: 'ROLE_READ', isSystem: true },
  { name: 'ROLE_UPDATE', isSystem: true },
  { name: 'ROLE_DELETE', isSystem: true },
  { name: 'ROLE_ASSIGN', isSystem: true },

  // Permission management
  { name: 'PERMISSION_CREATE', isSystem: true },
  { name: 'PERMISSION_READ', isSystem: true },
  { name: 'PERMISSION_UPDATE', isSystem: true },
  { name: 'PERMISSION_DELETE', isSystem: true },
  { name: 'PERMISSION_ASSIGN', isSystem: true },

  // Farm management
  { name: 'FARM_CREATE', isSystem: false },
  { name: 'FARM_READ', isSystem: false },
  { name: 'FARM_UPDATE', isSystem: false },
  { name: 'FARM_DELETE', isSystem: false },

  // Device management
  { name: 'DEVICE_CREATE', isSystem: false },
  { name: 'DEVICE_READ', isSystem: false },
  { name: 'DEVICE_UPDATE', isSystem: false },
  { name: 'DEVICE_DELETE', isSystem: false },

  // Consumer management
  { name: 'CONSUMER_CREATE', isSystem: false },
  { name: 'CONSUMER_READ', isSystem: false },
  { name: 'CONSUMER_UPDATE', isSystem: false },
  { name: 'CONSUMER_DELETE', isSystem: false },

  // Master data
  { name: 'MASTER_CREATE', isSystem: false },
  { name: 'MASTER_READ', isSystem: false },
  { name: 'MASTER_UPDATE', isSystem: false },
] as const;

// ─── Role definitions ─────────────────────────────────────────────────────────
const ROLES: {
  name: string;
  isSystem: boolean;
  permissions: (typeof PERMISSIONS[number]['name'])[];
}[] = [
  {
    name: 'SUPER_ADMIN',
    isSystem: true,
    // gets every permission
    permissions: PERMISSIONS.map((p) => p.name),
  },
  {
    name: 'ADMIN',
    isSystem: true,
    permissions: [
      'USER_CREATE', 'USER_READ', 'USER_UPDATE', 'USER_DELETE',
      'ROLE_READ', 'ROLE_ASSIGN',
      'PERMISSION_READ', 'PERMISSION_ASSIGN',
      'FARM_CREATE', 'FARM_READ', 'FARM_UPDATE', 'FARM_DELETE',
      'DEVICE_CREATE', 'DEVICE_READ', 'DEVICE_UPDATE', 'DEVICE_DELETE',
      'CONSUMER_CREATE', 'CONSUMER_READ', 'CONSUMER_UPDATE', 'CONSUMER_DELETE',
      'MASTER_CREATE', 'MASTER_READ', 'MASTER_UPDATE',
    ],
  },
  {
    name: 'MANAGER',
    isSystem: false,
    permissions: [
      'USER_READ',
      'FARM_CREATE', 'FARM_READ', 'FARM_UPDATE',
      'DEVICE_CREATE', 'DEVICE_READ', 'DEVICE_UPDATE',
      'CONSUMER_READ', 'CONSUMER_UPDATE',
      'MASTER_READ',
    ],
  },
  {
    name: 'OPERATOR',
    isSystem: false,
    permissions: [
      'FARM_READ',
      'DEVICE_READ', 'DEVICE_UPDATE',
      'CONSUMER_READ',
      'MASTER_READ',
    ],
  },
  {
    name: 'VIEWER',
    isSystem: false,
    permissions: [
      'FARM_READ',
      'DEVICE_READ',
      'CONSUMER_READ',
      'MASTER_READ',
    ],
  },
];

// ─── Seed ─────────────────────────────────────────────────────────────────────
async function seed() {
  console.log('🌱 Seeding permissions...');

  // Upsert all permissions
  const permissionMap = new Map<string, string>(); // name → id

  for (const perm of PERMISSIONS) {
    const record = await prisma.permission.upsert({
      where: { name: perm.name },
      update: { isSystem: perm.isSystem },
      create: { name: perm.name, isSystem: perm.isSystem },
    });
    permissionMap.set(record.name, record.id);
    console.log(`  ✓ Permission: ${record.name}`);
  }

  console.log('\n🌱 Seeding roles...');

  for (const roleDef of ROLES) {
    // Upsert role
    const role = await prisma.role.upsert({
      where: { name: roleDef.name },
      update: { isSystem: roleDef.isSystem },
      create: { name: roleDef.name, isSystem: roleDef.isSystem },
    });
    console.log(`  ✓ Role: ${role.name}`);

    // Sync role permissions — remove any that no longer belong, add new ones
    const existingLinks = await prisma.rolePermission.findMany({
      where: { roleId: role.id },
      select: { id: true, permissionId: true },
    });

    const existingPermIds = new Set(existingLinks.map((l) => l.permissionId));
    const desiredPermIds = new Set(
      roleDef.permissions.map((name) => permissionMap.get(name)!),
    );

    // Delete stale links
    const toRemove = existingLinks
      .filter((l) => !desiredPermIds.has(l.permissionId))
      .map((l) => l.id);

    if (toRemove.length > 0) {
      await prisma.rolePermission.deleteMany({ where: { id: { in: toRemove } } });
    }

    // Create missing links
    const toAdd = [...desiredPermIds].filter((pid) => !existingPermIds.has(pid));
    for (const permissionId of toAdd) {
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId } });
    }

    console.log(
      `     → ${roleDef.permissions.length} permission(s) assigned`,
    );
  }

  console.log('\n✅ Seed complete.');
}

seed()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
