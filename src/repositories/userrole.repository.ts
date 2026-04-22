import type { UserRole } from '@prisma/client';
import BaseRepository, { type FieldMappings } from '@repositories/base.repository';

export type UserRoleWithRole = UserRole & {
  role: { id: string; name: string; status: string };
};

class UserRoleRepository extends BaseRepository {
  static override _modelName = 'userRole';

  static override _fieldMappings: FieldMappings = {
    exact: ['userId', 'roleId'],
    date: ['createdAt'],
  };

  static override _defaultWhere: Record<string, unknown> = {};

  static async assign(userId: string, roleId: string): Promise<UserRole> {
    return this.db.create({ data: { userId, roleId } }) as Promise<UserRole>;
  }

  static async revoke(userId: string, roleId: string): Promise<void> {
    await this.db.deleteMany({ where: { userId, roleId } });
  }

  static async findByUserId(userId: string): Promise<UserRoleWithRole[]> {
    return this.db.findMany({
      where: { userId },
      include: { role: true },
    }) as Promise<UserRoleWithRole[]>;
  }
}

export default UserRoleRepository;
