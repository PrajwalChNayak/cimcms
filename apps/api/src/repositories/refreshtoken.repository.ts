import BaseRepository, { type FieldMappings } from "@repositories/base.repository";

class RefreshTokenRepository extends BaseRepository {
  static override _modelName = "refreshToken";

  static override _fieldMappings: FieldMappings = {
    exact: ['userId', 'familyId'],
  };

  // No `status: CommonStatus` on this model.
  static override _defaultWhere: Record<string, unknown> = {};
}

export default RefreshTokenRepository;
