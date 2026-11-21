import BaseRepository, { type FieldMappings } from "@repositories/base.repository";

class CommandRepository extends BaseRepository {
  static override _modelName = "command";

  static override _fieldMappings: FieldMappings = {
    exact: ['deviceId', 'status', 'action', 'commandId', 'source'],
  };

  // No `status: CommonStatus` on this model.
  static override _defaultWhere: Record<string, unknown> = {};
}

export default CommandRepository;
