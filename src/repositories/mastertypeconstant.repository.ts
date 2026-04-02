import BaseRepository, {
  type FieldMappings,
} from "@repositories/base.repository";

class MasterTypeConstantRepository extends BaseRepository {
  static override _modelName = "MasterTypeConstant";

  static override _fieldMappings: FieldMappings = {
    exact: ["type"],
    text: ["name"],
    date: ["createdAt", "updatedAt"],
  };

  static override _defaultWhere: Record<string, unknown> = {};
}

export default MasterTypeConstantRepository;
