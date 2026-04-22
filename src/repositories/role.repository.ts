import type { Role } from '@prisma/client';
import BaseRepository, { type FieldMappings } from '@repositories/base.repository';

export type RoleWithPermissions = Role & {
  permissions: { permission: { id: string; name: string; status: string } }[];
};

class RoleRepository extends BaseRepository {
  static override _modelName = 'role';

  static override _fieldMappings: FieldMappings = {
    exact: ['status', 'isSystem'],
    text: ['name'],
    date: ['createdAt', 'updatedAt'],
  };

  static async findWithPermissions(id: string): Promise<RoleWithPermissions | null> {
    return this.db.findUnique({
      where: { id },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    }) as Promise<RoleWithPermissions | null>;
  }

  static async assertNotSystem(id: string): Promise<void> {
    const role = (await this.db.findUnique({ where: { id }, select: { isSystem: true } })) as {
      isSystem: boolean;
    } | null;
    if (role?.isSystem) {
      throw new Error('System roles cannot be deleted');
    }
  }
}

export default RoleRepository;
