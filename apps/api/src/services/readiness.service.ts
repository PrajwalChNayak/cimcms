import { TZ_OFFSET_MINUTES, type DeviceReadinessDto, type ReadinessReason } from "@cimcms/contracts";
import prisma from "@models/prisma.client";
import DeviceStateService from "@services/devicestate.service";

/** Current calendar day (YYYY-MM-DD) in IST. */
export function istToday(now: Date = new Date()): string {
  return new Date(now.getTime() + TZ_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

interface AutoBlock {
  effective_from: string;
  effective_to: string | null;
}
interface ExperimentBlock {
  experiment_id: string;
}
interface ConfigPayload {
  auto?: AutoBlock | null;
  experiment?: ExperimentBlock | null;
}

/**
 * Whether a device may enter AUTO or EXPERIMENT (plan T5.2, T5.3):
 * AUTO = latest DeviceConfig APPLIED, `auto` block present, today (IST) inside the effective
 * dates, and the device does not report `auto_ready: false`.
 * EXPERIMENT = a READY experiment with a block for this device whose config the device applied.
 */
export default class ReadinessService {
  static async forDevice(deviceId: string, now: Date = new Date()): Promise<DeviceReadinessDto> {
    const [latest, state] = await Promise.all([
      prisma.deviceConfig.findFirst({ where: { deviceId }, orderBy: { configVersion: "desc" } }),
      DeviceStateService.get(deviceId),
    ]);
    const payload = (latest?.payload ?? {}) as ConfigPayload;

    // ---- AUTO
    const autoReasons: ReadinessReason[] = [];
    if (!latest) {
      autoReasons.push("NO_CONFIG");
    } else {
      if (latest.status === "REJECTED") autoReasons.push("CONFIG_REJECTED");
      if (latest.status === "PUBLISHED") autoReasons.push("CONFIG_NOT_APPLIED");
      const auto = payload.auto ?? null;
      if (!auto) {
        autoReasons.push("NO_AUTO_SCHEDULE");
      } else {
        const today = istToday(now);
        if (today < auto.effective_from) autoReasons.push("NOT_YET_EFFECTIVE");
        if (auto.effective_to && today > auto.effective_to) autoReasons.push("EFFECTIVE_PERIOD_ENDED");
      }
    }
    if (state?.autoReady === false) autoReasons.push("DEVICE_NOT_READY");

    // ---- EXPERIMENT
    const experimentReasons: ReadinessReason[] = [];
    let experimentId: string | null = null;
    let experimentCode: string | null = null;
    const assignments = await prisma.experimentAssignment.findMany({
      where: { deviceId },
      select: { experimentId: true },
    });
    const ids = [...new Set(assignments.map((a) => a.experimentId))];
    const ready = ids.length
      ? await prisma.experiment.findFirst({
          where: { id: { in: ids }, status: "READY" },
          orderBy: { startsAt: "asc" },
        })
      : null;
    if (!ready) {
      experimentReasons.push("NO_READY_EXPERIMENT");
    } else {
      experimentId = ready.id;
      experimentCode = ready.code;
      const applied = latest?.status === "APPLIED" && payload.experiment?.experiment_id === ready.id;
      if (!applied) experimentReasons.push("EXPERIMENT_CONFIG_NOT_APPLIED");
    }

    return {
      deviceId,
      auto: {
        ready: autoReasons.length === 0,
        reasons: autoReasons,
        configVersion: latest?.configVersion ?? null,
        effectiveFrom: payload.auto?.effective_from ?? null,
        effectiveTo: payload.auto?.effective_to ?? null,
      },
      experiment: {
        ready: experimentReasons.length === 0,
        reasons: experimentReasons,
        experimentId,
        experimentCode,
      },
    };
  }
}
