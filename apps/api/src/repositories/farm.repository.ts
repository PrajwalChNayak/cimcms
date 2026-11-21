import BaseRepository, { type FieldMappings } from '@repositories/base.repository';

class FarmRepository extends BaseRepository {
  static override _modelName = 'farm';

  static override _fieldMappings: FieldMappings = {
    exact: ['consumerId'],
    text: ['name', 'address'],
    date: ['createdAt', 'updatedAt'],
  };

  static override _defaultWhere: Record<string, unknown> = {};
}

export default FarmRepository;
