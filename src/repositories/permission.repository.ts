import BaseRepository, { type FieldMappings } from '@repositories/base.repository';

class PermissionRepository extends BaseRepository {
  static override _modelName = 'permission';

  static override _fieldMappings: FieldMappings = {
    exact: ['status', 'isSystem'],
    text: ['name'],
    date: ['createdAt', 'updatedAt'],
  };

  static async assertNotSystem(id: string): Promise<void> {
    const permission = (await this.db.findUnique({
      where: { id },
      select: { isSystem: true },
    })) as { isSystem: boolean } | null;
    if (permission?.isSystem) {
      throw new Error('System permissions cannot be deleted');
    }
  }
}

export default PermissionRepository;
