import BaseRepository, {
  type FieldMappings,
} from "@repositories/base.repository";

class ConsumerRepository extends BaseRepository {
  static override _modelName = "consumer";

  static override _fieldMappings: FieldMappings = {
    text: ["name", "email", "mobileNumber"],
    date: ["lastLogin", "createdAt", "updatedAt"],
  };
}

export default ConsumerRepository;
