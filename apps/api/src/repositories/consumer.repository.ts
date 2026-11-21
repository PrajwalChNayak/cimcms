import BaseRepository, {
  type FieldMappings,
} from "@repositories/base.repository";

class ConsumerRepository extends BaseRepository {
  static override _modelName = "Consumer";

  static override _fieldMappings: FieldMappings = {
    exact: ["status"],
    text: [
      "name",
      "email",
      "emp_code",
      "contact_number",
      "emergency_contact",
      "address",
    ],
    date: ["dob", "doj", "given_date", "created_at", "updated_at"],
    number: [
      "role_id",
      "department_id",
      "reporting_manager_id",
      "created_by",
      "updated_by",
    ],
  };
}

export default ConsumerRepository;
