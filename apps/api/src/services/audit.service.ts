import AuditLogRepository from "@repositories/auditlog.repository";
import logger from "@utils/logger.utils";

export type AuditActorType = "USER" | "SYSTEM";

export interface AuditRecordInput {
  action: string;
  entity: string;
  entityId?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  actorType?: AuditActorType;
  /** Never put passwords, tokens or secrets here. */
  data?: Record<string, unknown> | null;
  ip?: string | null;
  requestId?: string | null;
}

/** Writes audit records. A failed audit write is logged but never breaks the request. */
export default class AuditService {
  static async record(input: AuditRecordInput): Promise<void> {
    try {
      await AuditLogRepository.create({
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        actorId: input.actorId ?? null,
        actorEmail: input.actorEmail ?? null,
        actorType: input.actorType ?? (input.actorId ? "USER" : "SYSTEM"),
        data: input.data ?? undefined,
        ip: input.ip ?? null,
        requestId: input.requestId ?? null,
      });
    } catch (error) {
      logger.error("audit write failed", { action: input.action, error: (error as Error).message });
    }
  }
}
