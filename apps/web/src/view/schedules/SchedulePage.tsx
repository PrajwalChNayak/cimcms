import { useGetRoomQuery } from "@api/roomApi";
import {
  useArchiveScheduleMutation,
  useCreateScheduleMutation,
  useGetScheduleDevicesQuery,
  useGetScheduleQuery,
  useGetScheduleVersionsQuery,
  usePublishScheduleMutation,
  useUpdateScheduleMutation,
} from "@api/scheduleApi";
import type { ScheduleDto } from "@cimcms/contracts";
import { ConfirmDialog } from "@features/ledControl/components/ConfirmDialog";
import { WindowEditor } from "@features/schedules/components/WindowEditor";
import { useScheduleLive } from "@features/schedules/hooks/useScheduleLive";
import {
  CONFIG_STATUS_TEXT,
  NOTHING_TO_PUBLISH_TEXT,
  NO_CONFIG_TEXT,
  NO_RELAYS_TEXT,
  SCHEDULE_STATUS_TEXT,
  TIMES_ARE_IST,
  UNSAVED_TEXT,
  publishConfirmBody,
  publishConfirmTitle,
} from "@features/schedules/scheduleText";
import {
  draftRules,
  newWindow,
  validateDraft,
  type ScheduleDraft,
} from "@features/schedules/scheduleValidation";
import { usePermission } from "@shared/hooks/usePermission";
import { extractErrorMessage } from "@shared/utils/errorUtils";
import { formatIst } from "@shared/utils/time";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

const IST_OFFSET_MS = 330 * 60_000;
const istToday = (): string => new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);

const fromSchedule = (s: ScheduleDto): ScheduleDraft => ({
  name: s.name,
  windows: s.latest.rules.map((r) => newWindow(r)),
  effectiveFrom: s.latest.effectiveFrom,
  effectiveTo: s.latest.effectiveTo ?? "",
});

const emptyDraft = (): ScheduleDraft => ({
  name: "",
  windows: [newWindow()],
  effectiveFrom: istToday(),
  effectiveTo: "",
});

interface EditorProps {
  roomId: string;
  schedule: ScheduleDto | null;
}

const Editor = ({ roomId, schedule }: EditorProps) => {
  const navigate = useNavigate();
  const canWrite = usePermission("SCHEDULE_WRITE");
  const canPublish = usePermission("SCHEDULE_PUBLISH");
  const room = useGetRoomQuery(roomId);
  const devices = useGetScheduleDevicesQuery(schedule?.id ?? "", { skip: !schedule });
  const versions = useGetScheduleVersionsQuery(schedule?.id ?? "", { skip: !schedule });
  useScheduleLive(schedule?.id, (devices.data ?? []).map((d) => d.deviceId));

  const [create, { isLoading: creating }] = useCreateScheduleMutation();
  const [update, { isLoading: updating }] = useUpdateScheduleMutation();
  const [publish, { isLoading: publishing }] = usePublishScheduleMutation();
  const [archive, { isLoading: archiving }] = useArchiveScheduleMutation();

  const [edited, setEdited] = useState<ScheduleDraft | null>(null);
  const draft = edited ?? (schedule ? fromSchedule(schedule) : emptyDraft());
  const issues = useMemo(() => validateDraft(draft), [draft]);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);

  const archived = schedule?.status === "ARCHIVED";
  const readOnly = !canWrite || archived;
  const dirty = edited !== null;
  const latestPublished = schedule?.latest.publishedAt != null;
  const deviceCount = devices.data?.length ?? 0;

  const change = (p: Partial<ScheduleDraft>) => setEdited({ ...draft, ...p });
  const fail = (e: unknown, fallback: string) =>
    setMessage({ kind: "error", text: extractErrorMessage(e, fallback) });

  const save = () => {
    setMessage(null);
    const rules = draftRules(draft);
    const effectiveTo = draft.effectiveTo || null;
    if (!schedule) {
      create({
        roomId,
        name: draft.name.trim(),
        rules,
        effectiveFrom: draft.effectiveFrom,
        ...(effectiveTo && { effectiveTo }),
      })
        .unwrap()
        .then((s) => navigate(`/schedules/${s.id}`, { replace: true }))
        .catch((e: unknown) => fail(e, "Could not save the schedule"));
      return;
    }
    update({
      id: schedule.id,
      body: { name: draft.name.trim(), rules, effectiveFrom: draft.effectiveFrom, effectiveTo },
    })
      .unwrap()
      .then(() => {
        setEdited(null);
        setMessage({ kind: "ok", text: "Draft saved" });
      })
      .catch((e: unknown) => fail(e, "Could not save the schedule"));
  };

  const doPublish = () => {
    if (!schedule) return;
    setConfirmPublish(false);
    setMessage(null);
    publish(schedule.id)
      .unwrap()
      .then(() => setMessage({ kind: "ok", text: "Published. Waiting for the devices to confirm." }))
      .catch((e: unknown) => fail(e, "Could not publish the schedule"));
  };

  const doArchive = () => {
    if (!schedule) return;
    setMessage(null);
    archive(schedule.id)
      .unwrap()
      .then(() => setMessage({ kind: "ok", text: "Schedule archived" }))
      .catch((e: unknown) => fail(e, "Could not archive the schedule"));
  };

  return (
    <>
      <div className="rounded-card bg-surface border border-border p-4 space-y-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-bold text-text-primary">
            {schedule ? schedule.name : "New schedule"}
          </h1>
          {schedule && (
            <span className="rounded-full bg-background px-2.5 py-1 text-xs font-medium" data-testid="schedule-status">
              {SCHEDULE_STATUS_TEXT[schedule.status]}
              {schedule.publishedVersion !== null && ` · running version ${schedule.publishedVersion}`}
            </span>
          )}
        </div>
        <p className="text-text-secondary">
          Room: <strong>{room.data?.name ?? "…"}</strong> · {TIMES_ARE_IST}
        </p>
        <label className="block">
          <span className="block font-medium mb-1">Schedule name</span>
          <input
            aria-label="Schedule name"
            value={draft.name}
            disabled={readOnly}
            maxLength={80}
            onChange={(e) => change({ name: e.target.value })}
            className="w-full rounded-btn border border-border px-3 py-2"
          />
        </label>
        <div className="flex flex-wrap gap-4">
          <label className="block">
            <span className="block font-medium mb-1">First day</span>
            <input
              type="date"
              aria-label="First day"
              value={draft.effectiveFrom}
              disabled={readOnly}
              onChange={(e) => change({ effectiveFrom: e.target.value })}
              className="rounded-btn border border-border px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="block font-medium mb-1">Last day (optional)</span>
            <input
              type="date"
              aria-label="Last day"
              value={draft.effectiveTo}
              disabled={readOnly}
              onChange={(e) => change({ effectiveTo: e.target.value })}
              className="rounded-btn border border-border px-3 py-2"
            />
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-base font-semibold text-text-primary">On / off windows</h2>
        <WindowEditor windows={draft.windows} disabled={readOnly} onChange={(windows) => change({ windows })} />
      </div>

      {!readOnly && issues.length > 0 && (
        <ul
          className="list-disc pl-5 rounded-btn bg-amber-50 px-4 py-3 text-sm text-amber-800"
          data-testid="validation-messages"
        >
          {issues.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}

      {message && (
        <p
          className={`rounded-btn px-3 py-2 text-sm ${message.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}
          role={message.kind === "ok" ? "status" : "alert"}
        >
          {message.text}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {!readOnly && (
          <button
            type="button"
            disabled={issues.length > 0 || creating || updating || (schedule !== null && !dirty)}
            onClick={save}
            className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-text-inverted disabled:opacity-40 cursor-pointer"
          >
            Save draft
          </button>
        )}
        {schedule && canPublish && !archived && (
          <button
            type="button"
            disabled={dirty || latestPublished || publishing}
            onClick={() => setConfirmPublish(true)}
            className="rounded-btn border border-border px-4 py-2 text-sm font-semibold text-text-primary hover:bg-background disabled:opacity-40 cursor-pointer"
          >
            Publish
          </button>
        )}
        {schedule && canWrite && !archived && (
          <button
            type="button"
            disabled={archiving}
            onClick={doArchive}
            className="rounded-btn border border-border px-4 py-2 text-sm font-medium text-rose-700 hover:bg-background disabled:opacity-40 cursor-pointer"
          >
            Archive
          </button>
        )}
        {schedule && dirty && <span className="text-xs text-amber-700">{UNSAVED_TEXT}</span>}
        {schedule && !dirty && latestPublished && !archived && (
          <span className="text-xs text-text-secondary">{NOTHING_TO_PUBLISH_TEXT}</span>
        )}
      </div>

      {schedule && (
        <div className="rounded-card border border-border bg-surface p-4 space-y-2" data-testid="device-status">
          <h2 className="text-base font-semibold text-text-primary">Devices</h2>
          {devices.data && devices.data.length === 0 && (
            <p className="text-sm text-text-secondary">{NO_RELAYS_TEXT}</p>
          )}
          <ul className="divide-y divide-border text-sm">
            {(devices.data ?? []).map((d) => (
              <li key={d.deviceId} className="py-2 flex flex-wrap justify-between gap-2" data-testid={`device-status-${d.deviceId}`}>
                <span>
                  <strong>{d.deviceId}</strong> · relays {d.relays.join(", ")}
                </span>
                <span>
                  {d.config
                    ? `Config ${d.config.configVersion}: ${CONFIG_STATUS_TEXT(d.config)}`
                    : NO_CONFIG_TEXT}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {schedule && (
        <div className="rounded-card border border-border bg-surface p-4" data-testid="version-history">
          <h2 className="text-base font-semibold text-text-primary mb-2">Version history</h2>
          <ul className="divide-y divide-border text-sm">
            {(versions.data ?? []).map((v) => (
              <li key={v.version} className="py-2 flex flex-wrap justify-between gap-2">
                <span>
                  Version {v.version} · {v.rules.length} window{v.rules.length === 1 ? "" : "s"} · from{" "}
                  {v.effectiveFrom}
                  {v.effectiveTo ? ` to ${v.effectiveTo}` : ""}
                </span>
                <span className="text-text-secondary">
                  {v.publishedAt ? `Published ${formatIst(v.publishedAt)}` : "Draft"}
                  {v.createdByEmail ? ` · ${v.createdByEmail}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmPublish}
        title={publishConfirmTitle(schedule?.name ?? "")}
        cancelLabel="Cancel"
        confirmLabel="Publish"
        onCancel={() => setConfirmPublish(false)}
        onConfirm={doPublish}
      >
        <p className="text-sm text-text-secondary">{publishConfirmBody(deviceCount)}</p>
      </ConfirmDialog>
    </>
  );
};

export const SchedulePage = () => {
  const { scheduleId, roomId } = useParams<{ scheduleId?: string; roomId?: string }>();
  const schedule = useGetScheduleQuery(scheduleId ?? "", { skip: !scheduleId });

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2 text-xs text-text-secondary">
        <Link to="/schedules" className="hover:text-text-primary transition-colors">Schedules</Link>
        <span>/</span>
        <span className="text-text-primary">{scheduleId ? "Schedule" : "New schedule"}</span>
      </div>
      {scheduleId && schedule.isLoading && (
        <p className="text-sm text-text-secondary" role="status">Loading schedule…</p>
      )}
      {scheduleId && schedule.isError && <p className="text-sm text-text-secondary">Schedule not found</p>}
      {scheduleId && schedule.data && (
        <Editor key={schedule.data.id} roomId={schedule.data.roomId} schedule={schedule.data} />
      )}
      {!scheduleId && roomId && <Editor roomId={roomId} schedule={null} />}
    </div>
  );
};
