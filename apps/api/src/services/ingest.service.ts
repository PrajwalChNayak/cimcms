import type { TopicKind } from "@cimcms/contracts";

export interface IngestMeta {
  retained: boolean;
}

/**
 * Minimal stub. T2.6 replaces the body with the real ingest logic
 * (parse, validate, update DeviceStatus, emit realtime events).
 */
export default class IngestService {
  static async handle(
    _kind: TopicKind,
    _deviceId: string,
    _type: string,
    _raw: string,
    _meta: IngestMeta,
  ): Promise<void> {
    // TODO(T2.6): implement.
  }
}
