import BaseRepository, { type FieldMappings } from "@repositories/base.repository";

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedByHash: string | null;
}

const ACTIVE = { revokedAt: null };

class RefreshTokenRepository extends BaseRepository {
  static override _modelName = "refreshToken";

  static override _fieldMappings: FieldMappings = {
    exact: ['userId', 'familyId'],
  };

  // No `status: CommonStatus` on this model.
  static override _defaultWhere: Record<string, unknown> = {};

  static async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return this.db.findUnique({ where: { tokenHash } }) as Promise<RefreshTokenRecord | null>;
  }

  /**
   * Atomically revokes a token that is still active. Returns false when it was
   * already revoked (lost a race or reuse), so only one caller can rotate it.
   */
  static async revokeIfActive(tokenHash: string, replacedByHash: string | null): Promise<boolean> {
    const res = (await this.db.updateMany({
      where: { tokenHash, ...ACTIVE },
      data: { revokedAt: new Date(), replacedByHash },
    })) as { count: number };
    return res.count === 1;
  }

  /** True while the family has at least one token that is not revoked. */
  static async familyHasActive(familyId: string): Promise<boolean> {
    return (await this.db.count({ where: { familyId, ...ACTIVE } })) > 0;
  }

  /** Revokes every still-active token of a family. */
  static async revokeFamily(familyId: string): Promise<void> {
    await this.db.updateMany({
      where: { familyId, ...ACTIVE },
      data: { revokedAt: new Date() },
    });
  }
}

export default RefreshTokenRepository;
