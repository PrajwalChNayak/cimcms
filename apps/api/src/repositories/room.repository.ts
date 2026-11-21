import BaseRepository, { type FieldMappings } from "@repositories/base.repository";

class RoomRepository extends BaseRepository {
  static override _modelName = "room";

  static override _fieldMappings: FieldMappings = {
    exact: ["status", "farmId", "code"],
    text: ["name"],
  };

  // `status` here is RoomStatus (no DELETED value).
  static override _defaultWhere: Record<string, unknown> = {};
}

export default RoomRepository;
