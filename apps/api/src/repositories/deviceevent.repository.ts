import BaseRepository, { type FieldMappings } from "@repositories/base.repository";

class DeviceEventRepository extends BaseRepository {
  static override _modelName = "deviceEvent";

  static override _fieldMappings: FieldMappings = {
    exact: ['deviceId', 'type', 'origin'],
  };

  // No `status: CommonStatus` on this model.
  static override _defaultWhere: Record<string, unknown> = {};
}

export default DeviceEventRepository;
