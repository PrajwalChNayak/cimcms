import BaseRepository, { type FieldMappings } from "@repositories/base.repository";

class AuditLogRepository extends BaseRepository {
  static override _modelName = "auditLog";

  static override _fieldMappings: FieldMappings = {
    exact: ['actorId', 'actorType', 'action', 'entity', 'entityId'],
  };

  // No `status: CommonStatus` on this model.
  static override _defaultWhere: Record<string, unknown> = {};
}

export default AuditLogRepository;
