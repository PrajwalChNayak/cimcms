import type { User } from '@prisma/client';
import BaseRepository, { type FieldMappings } from '@repositories/base.repository';

export type UserRecord = User;

export type UserWithRoles = User & {
  roles: { role: { id: string; name: string; status: string } }[];
};

class UserRepository extends BaseRepository {
  static override _modelName = 'user';

  static override _fieldMappings: FieldMappings = {
    exact: ['status'],
    text: ['name', 'email'],
    date: ['createdAt', 'updatedAt'],
  };

  static async findByEmail(email: string): Promise<User | null> {
    return this.db.findUnique({ where: { email } }) as Promise<User | null>;
  }

  static async findWithRoles(id: string): Promise<UserWithRoles | null> {
    return this.db.findUnique({
      where: { id },
      include: {
        roles: {
          include: { role: true },
        },
      },
    }) as Promise<UserWithRoles | null>;
  }
}

export default UserRepository;
