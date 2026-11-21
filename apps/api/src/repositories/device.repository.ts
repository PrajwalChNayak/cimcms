import BaseRepository, {
  type FieldMappings,
} from "@repositories/base.repository";

class DeviceRepository extends BaseRepository {
  static override _modelName = "device";

  static override _fieldMappings: FieldMappings = {
    exact: ["consumerId", "farmId"],
    text: ["name", "type", "location", "deviceId"],
    date: ["createdAt", "updatedAt"],
  };

  static override _defaultWhere: Record<string, unknown> = {};
}

export default DeviceRepository;
