import BaseRepository, { type FieldMappings } from "@repositories/base.repository";

class RoomChannelRepository extends BaseRepository {
  static override _modelName = "roomChannelAssignment";

  static override _fieldMappings: FieldMappings = {
    exact: ["roomId", "deviceId"],
    number: ["relay"],
  };

  static override _defaultWhere: Record<string, unknown> = {};
}

export default RoomChannelRepository;
