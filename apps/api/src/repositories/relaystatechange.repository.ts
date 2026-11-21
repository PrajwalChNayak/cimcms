import BaseRepository, { type FieldMappings } from "@repositories/base.repository";

class RelayStateChangeRepository extends BaseRepository {
  static override _modelName = "relayStateChange";

  static override _fieldMappings: FieldMappings = {
    exact: ['deviceId', 'source', 'commandId'],
  };

  // No `status: CommonStatus` on this model.
  static override _defaultWhere: Record<string, unknown> = {};
}

export default RelayStateChangeRepository;
