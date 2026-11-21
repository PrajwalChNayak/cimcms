import type { RolePermission } from '@prisma/client';
import BaseRepository, { type FieldMappings } from '@repositories/base.repository';

export type RolePermissionWithPermission = RolePermission & {
  permission: { id: string; name: string; status: string };
};

class RolePermissionRepository extends BaseRepository {
  static override _modelName = 'rolePermission';

  static override _fieldMappings: FieldMappings = {
    exact: ['roleId', 'permissionId'],
    date: ['createdAt'],
  };

  static override _defaultWhere: Record<string, unknown> = {};

  static async assign(roleId: string, permissionId: string): Promise<RolePermission> {
    return this.db.create({ data: { roleId, permissionId } }) as Promise<RolePermission>;
  }

  static async revoke(roleId: string, permissionId: string): Promise<void> {
    await this.db.deleteMany({ where: { roleId, permissionId } });
  }

  static async findByRoleId(roleId: string): Promise<RolePermissionWithPermission[]> {
    return this.db.findMany({
      where: { roleId },
      include: { permission: true },
    }) as Promise<RolePermissionWithPermission[]>;
  }
}

export default RolePermissionRepository;
