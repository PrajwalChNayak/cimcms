import prisma from "@models/prisma.client";
import logger from "@utils/logger.utils";

const DAY_MS = 24 * 60 * 60 * 1000;
/** TODO(owner-decision O-7): default retention is 365 days. */
export const RETENTION_DAYS = 365;
const EXPIRED_TOKEN_GRACE_MS = DAY_MS;
/** 02:00 Asia/Kolkata (UTC+05:30, no DST) = 20:30 UTC of the previous day. */
const RUN_UTC_HOUR = 20;
const RUN_UTC_MINUTE = 30;

export interface RetentionResult {
  deviceEvents: number;
  relayStateChanges: number;
  refreshTokens: number;
}

/**
 * Daily cleanup (plan T2.10). Deletes old DeviceEvent and RelayStateChange rows and
 * long-expired RefreshToken rows. Never touches Command or AuditLog.
 * Telemetry is expired by the time-series collection itself.
 */
export class RetentionJob {
  private static timer: NodeJS.Timeout | undefined;
  private static stopped = true;

  /** First 02:00 IST strictly after `from`. */
  static nextRunAfter(from: Date): Date {
    const t = new Date(from.getTime());
    t.setUTCHours(RUN_UTC_HOUR, RUN_UTC_MINUTE, 0, 0);
    if (t.getTime() <= from.getTime()) t.setTime(t.getTime() + DAY_MS);
    return t;
  }

  static start(): void {
    if (!RetentionJob.stopped) return;
    RetentionJob.stopped = false;
    RetentionJob.schedule(RetentionJob.nextRunAfter(new Date()));
  }

  static stop(): void {
    RetentionJob.stopped = true;
    if (RetentionJob.timer) clearTimeout(RetentionJob.timer);
    RetentionJob.timer = undefined;
  }

  /** Sleeps until `target`, runs, then schedules `target + 1 day` (a plain setTimeout, no cron library). */
  private static schedule(target: Date): void {
    const delay = Math.max(0, target.getTime() - Date.now());
    RetentionJob.timer = setTimeout(() => {
      void RetentionJob.runOnce().finally(() => {
        if (!RetentionJob.stopped) RetentionJob.schedule(RetentionJob.nextRunAfter(target));
      });
    }, delay);
    RetentionJob.timer.unref();
  }

  static async runOnce(now: Date = new Date()): Promise<RetentionResult> {
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * DAY_MS);
    const tokenCutoff = new Date(now.getTime() - EXPIRED_TOKEN_GRACE_MS);
    try {
      const [events, changes, tokens] = await Promise.all([
        prisma.deviceEvent.deleteMany({ where: { receivedAt: { lt: cutoff } } }),
        prisma.relayStateChange.deleteMany({ where: { at: { lt: cutoff } } }),
        prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: tokenCutoff } } }),
      ]);
      const result = {
        deviceEvents: events.count,
        relayStateChanges: changes.count,
        refreshTokens: tokens.count,
      };
      logger.info("retention cleanup done", result);
      return result;
    } catch (err) {
      logger.error("retention cleanup failed", { error: String(err) });
      return { deviceEvents: 0, relayStateChanges: 0, refreshTokens: 0 };
    }
  }
}

export default RetentionJob;
