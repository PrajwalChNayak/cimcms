import BaseRepository, {
  type FieldMappings,
} from "@repositories/base.repository";

class UserRepository extends BaseRepository {
  static override _modelName = "User";

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
      "crated_by",
      "updated_by",
    ],
  };
}

export default UserRepository;
