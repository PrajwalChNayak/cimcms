import BaseRepository, { type FieldMappings } from "@repositories/base.repository";

class DeviceStatusRepository extends BaseRepository {
  static override _modelName = "deviceStatus";

  static override _fieldMappings: FieldMappings = {
    exact: ['deviceId', 'type', 'liveness'],
  };

  // No `status: CommonStatus` on this model.
  static override _defaultWhere: Record<string, unknown> = {};
}

export default DeviceStatusRepository;
