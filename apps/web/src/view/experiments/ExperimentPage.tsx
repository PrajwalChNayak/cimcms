import {
  useCreateExperimentMutation,
  useExperimentActionMutation,
  useGetExperimentDevicesQuery,
  useGetExperimentLogQuery,
  useGetExperimentQuery,
  useUpdateExperimentMutation,
  type ExperimentAction,
} from "@api/experimentApi";
import { baseApi } from "@api/baseApi";
import { getDriverChannelCount, type ExperimentDto, type ExperimentWarningDto } from "@cimcms/contracts";
import { useDevices } from "@features/devices/hooks/useDevices";
import { AssignmentsEditor } from "@features/experiments/components/AssignmentsEditor";
import {
  ACTION_CONFIRM,
  ACTION_DONE,
  CONFIG_STATE_TEXT,
  EXPERIMENT_STATUS_TEXT,
  REASON_TEXT,
  TIMES_ARE_IST,
  warningText,
} from "@features/experiments/experimentText";
import {
  newRow,
  validateExperiment,
  type ExperimentDraft,
} from "@features/experiments/experimentValidation";
import { ConfirmDialog } from "@features/ledControl/components/ConfirmDialog";
import { newWindow } from "@features/schedules/scheduleValidation";
import { usePermission } from "@shared/hooks/usePermission";
import { onRealtime, subscribeDevice } from "@shared/realtime/socketClient";
import { extractErrorMessage } from "@shared/utils/errorUtils";
import { formatIst, istLocalToUtcIso, utcIsoToIstLocal } from "@shared/utils/time";
import { useAppDispatch } from "@store/hooks";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

const emptyDraft = (): ExperimentDraft => ({
  code: "",
  title: "",
  description: "",
  startsAt: "",
  endsAt: "",
  rows: [newRow()],
});

const fromExperiment = (e: ExperimentDto): ExperimentDraft => ({
  code: e.code,
  title: e.title,
  description: e.description ?? "",
  startsAt: utcIsoToIstLocal(e.startsAt),
  endsAt: utcIsoToIstLocal(e.endsAt),
  rows: e.assignments.map((a) =>
    newRow({
      groupLabel: a.groupLabel,
      deviceId: a.deviceId,
      relay: a.relay,
      windows: a.windows.map((w) => newWindow(w)),
    }),
  ),
});

/** Buttons by status; RUN = EXPERIMENT_RUN, WRITE = EXPERIMENT_WRITE. */
const ACTIONS: Record<ExperimentDto["status"], { action: ExperimentAction; need: "WRITE" | "RUN" }[]> = {
  DRAFT: [{ action: "ready", need: "WRITE" }],
  READY: [
    { action: "start", need: "RUN" },
    { action: "resend", need: "WRITE" },
    { action: "revert", need: "WRITE" },
    { action: "stop", need: "RUN" },
  ],
  RUNNING: [
    { action: "pause", need: "RUN" },
    { action: "stop", need: "RUN" },
  ],
  PAUSED: [
    { action: "resume", need: "RUN" },
    { action: "stop", need: "RUN" },
  ],
  COMPLETED: [],
  STOPPED: [],
};

const BUTTON_LABEL: Record<ExperimentAction, string> = {
  ready: "Make ready",
  revert: "Return to draft",
  resend: "Send programme again",
  start: "Start",
  pause: "Pause",
  resume: "Resume",
  stop: "Stop",
};

/** Per-device reasons of a refused start (409 details.devices), as readable lines. */
const detailLines = (err: unknown): string[] => {
  const data = (err as { data?: { details?: { devices?: unknown } } } | null)?.data;
  const devices = data?.details?.devices;
  if (!Array.isArray(devices)) return [];
  return devices.flatMap((d: { deviceId?: string; reasons?: string[]; message?: string }) => {
    if (!d.deviceId) return [];
    if (d.reasons) return [`${d.deviceId} ${d.reasons.map((r) => REASON_TEXT[r] ?? r).join(", ")}`];
    return d.message ? [`${d.deviceId}: ${d.message}`] : [];
  });
};

const Editor = ({ experiment }: { experiment: ExperimentDto | null }) => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const canWrite = usePermission("EXPERIMENT_WRITE");
  const canRun = usePermission("EXPERIMENT_RUN");
  const { devices } = useDevices();
  const relayDevices = devices.filter((d) => getDriverChannelCount(d.type) !== null).map((d) => d.deviceId);

  const deviceStatus = useGetExperimentDevicesQuery(experiment?.id ?? "", { skip: !experiment });
  const log = useGetExperimentLogQuery(experiment?.id ?? "", { skip: !experiment });
  const [create, { isLoading: creating }] = useCreateExperimentMutation();
  const [update, { isLoading: updating }] = useUpdateExperimentMutation();
  const [runAction, { isLoading: acting }] = useExperimentActionMutation();

  const [edited, setEdited] = useState<ExperimentDraft | null>(null);
  const draft = edited ?? (experiment ? fromExperiment(experiment) : emptyDraft());
  const issues = useMemo(() => validateExperiment(draft), [draft]);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [warnings, setWarnings] = useState<ExperimentWarningDto[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<ExperimentAction | null>(null);

  const status = experiment?.status ?? "DRAFT";
  const editable = canWrite && (experiment === null || status === "DRAFT");
  const dirty = edited !== null;

  // Live: a device answering a config or the experiment lifecycle changing re-reads the status.
  const deviceKey = (deviceStatus.data ?? []).map((d) => d.deviceId).join(",");
  useEffect(() => {
    if (!experiment || deviceKey === "") return;
    const ids = deviceKey.split(",");
    const unsubscribes = ids.map((id) => subscribeDevice(id));
    const refresh = (deviceId: string) => {
      if (!ids.includes(deviceId)) return;
      dispatch(
        baseApi.util.invalidateTags([
          { type: "Experiment", id: `${experiment.id}:devices` },
          { type: "Experiment", id: `${experiment.id}:log` },
          { type: "Experiment", id: experiment.id },
        ]),
      );
    };
    const off1 = onRealtime("schedule:updated", (e) => refresh(e.deviceId));
    const off2 = onRealtime("experiment:updated", (e) => refresh(e.deviceId));
    return () => {
      off1();
      off2();
      unsubscribes.forEach((u) => u());
    };
  }, [dispatch, experiment, deviceKey]);

  const change = (p: Partial<ExperimentDraft>) => setEdited({ ...draft, ...p });
  const body = () => ({
    title: draft.title.trim(),
    ...(draft.description.trim() && { description: draft.description.trim() }),
    startsAt: istLocalToUtcIso(draft.startsAt) as string,
    endsAt: istLocalToUtcIso(draft.endsAt) as string,
    assignments: draft.rows.map((r) => ({
      groupLabel: r.groupLabel.trim(),
      deviceId: r.deviceId,
      relay: r.relay,
      windows: r.windows.map((w) => ({ days: [...w.days].sort((a, b) => a - b), on: w.on, off: w.off })),
    })),
  });

  const fail = (e: unknown, fallback: string) => {
    setMessage({ kind: "error", text: extractErrorMessage(e, fallback) });
    setProblems(detailLines(e));
  };

  const save = () => {
    setMessage(null);
    if (!experiment) {
      create({ code: draft.code, ...body() })
        .unwrap()
        .then((e) => navigate(`/experiments/${e.id}`, { replace: true }))
        .catch((e: unknown) => fail(e, "Could not save the experiment"));
      return;
    }
    update({ id: experiment.id, body: { ...body(), description: draft.description.trim() || null } })
      .unwrap()
      .then(() => {
        setEdited(null);
        setMessage({ kind: "ok", text: "Draft saved" });
      })
      .catch((e: unknown) => fail(e, "Could not save the experiment"));
  };

  const doAction = (action: ExperimentAction) => {
    if (!experiment) return;
    setConfirm(null);
    setMessage(null);
    setWarnings([]);
    setProblems([]);
    runAction({ id: experiment.id, action })
      .unwrap()
      .then((res) => {
        setWarnings(res.warnings);
        setMessage({ kind: "ok", text: ACTION_DONE[action] });
      })
      .catch((e: unknown) => fail(e, "The action was not carried out"));
  };

  return (
    <>
      <div className="rounded-card bg-surface border border-border p-4 space-y-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-bold text-text-primary">
            {experiment ? experiment.title : "New experiment"}
          </h1>
          {experiment && (
            <span className="rounded-full bg-background px-2.5 py-1 text-xs font-medium" data-testid="experiment-status">
              {EXPERIMENT_STATUS_TEXT[experiment.status]}
            </span>
          )}
        </div>
        <p className="text-text-secondary">{TIMES_ARE_IST}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="block font-medium mb-1">Code</span>
            <input
              aria-label="Experiment code"
              value={draft.code}
              disabled={experiment !== null || !editable}
              maxLength={32}
              onChange={(e) => change({ code: e.target.value })}
              className="w-full rounded-btn border border-border px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="block font-medium mb-1">Title</span>
            <input
              aria-label="Experiment title"
              value={draft.title}
              disabled={!editable}
              maxLength={120}
              onChange={(e) => change({ title: e.target.value })}
              className="w-full rounded-btn border border-border px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="block font-medium mb-1">Starts</span>
            <input
              type="datetime-local"
              aria-label="Starts at"
              value={draft.startsAt}
              disabled={!editable}
              onChange={(e) => change({ startsAt: e.target.value })}
              className="rounded-btn border border-border px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="block font-medium mb-1">Ends</span>
            <input
              type="datetime-local"
              aria-label="Ends at"
              value={draft.endsAt}
              disabled={!editable}
              onChange={(e) => change({ endsAt: e.target.value })}
              className="rounded-btn border border-border px-3 py-2"
            />
          </label>
        </div>
        <label className="block">
          <span className="block font-medium mb-1">Description</span>
          <textarea
            aria-label="Description"
            value={draft.description}
            disabled={!editable}
            maxLength={1000}
            onChange={(e) => change({ description: e.target.value })}
            className="w-full rounded-btn border border-border px-3 py-2"
          />
        </label>
      </div>

      <div className="space-y-2">
        <h2 className="text-base font-semibold text-text-primary">Groups and relays</h2>
        <AssignmentsEditor
          rows={draft.rows}
          deviceIds={relayDevices}
          disabled={!editable}
          onChange={(rows) => change({ rows })}
        />
      </div>

      {editable && issues.length > 0 && (
        <ul className="list-disc pl-5 rounded-btn bg-amber-50 px-4 py-3 text-sm text-amber-800" data-testid="validation-messages">
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
      {problems.length > 0 && (
        <ul className="list-disc pl-5 rounded-btn bg-rose-50 px-4 py-3 text-sm text-rose-700" data-testid="action-problems">
          {problems.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      {warnings.length > 0 && (
        <ul className="list-disc pl-5 rounded-btn bg-amber-50 px-4 py-3 text-sm text-amber-800" data-testid="action-warnings">
          {warnings.map((w) => (
            <li key={w.deviceId + w.code}>{warningText(w)}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {editable && (
          <button
            type="button"
            disabled={issues.length > 0 || creating || updating || (experiment !== null && !dirty)}
            onClick={save}
            className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-text-inverted disabled:opacity-40 cursor-pointer"
          >
            Save draft
          </button>
        )}
        {experiment &&
          ACTIONS[status]
            .filter((a) => (a.need === "RUN" ? canRun : canWrite))
            .map((a) => (
              <button
                key={a.action}
                type="button"
                disabled={acting || (a.action === "ready" && dirty)}
                onClick={() => setConfirm(a.action)}
                className="rounded-btn border border-border px-4 py-2 text-sm font-semibold text-text-primary hover:bg-background disabled:opacity-40 cursor-pointer"
              >
                {BUTTON_LABEL[a.action]}
              </button>
            ))}
        {experiment && dirty && <span className="text-xs text-amber-700">Save the draft before making it ready.</span>}
      </div>

      {experiment && (
        <div className="rounded-card border border-border bg-surface p-4 space-y-2" data-testid="experiment-devices">
          <h2 className="text-base font-semibold text-text-primary">Devices</h2>
          <ul className="divide-y divide-border text-sm">
            {(deviceStatus.data ?? []).map((d) => (
              <li key={d.deviceId} className="py-2 flex flex-wrap justify-between gap-2" data-testid={`experiment-device-${d.deviceId}`}>
                <span>
                  <strong>{d.deviceId}</strong> · relays {d.relays.join(", ")} · {d.liveness.toLowerCase()} · mode {d.mode ?? "—"}
                </span>
                <span>
                  {d.config && d.carriesExperiment
                    ? `Config ${d.config.configVersion}: ${CONFIG_STATE_TEXT(d.config)}`
                    : "Programme not on the device"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {experiment && (
        <div className="rounded-card border border-border bg-surface p-4" data-testid="experiment-log">
          <h2 className="text-base font-semibold text-text-primary mb-2">Event log</h2>
          {(log.data ?? []).length === 0 ? (
            <p className="text-sm text-text-secondary">No events yet.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {(log.data ?? []).map((e, i) => (
                <li key={`${e.at}-${e.type}-${i}`} className="py-2 flex flex-wrap justify-between gap-2">
                  <span>
                    <strong>{e.type}</strong>
                    {e.deviceId ? ` · ${e.deviceId}` : ""}
                    {e.actorEmail ? ` · ${e.actorEmail}` : ""}
                  </span>
                  <span className="text-text-secondary">{formatIst(e.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirm !== null}
        title={confirm && experiment ? ACTION_CONFIRM[confirm].title(experiment.code) : ""}
        cancelLabel="Cancel"
        confirmLabel={confirm ? ACTION_CONFIRM[confirm].button : ""}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && doAction(confirm)}
      >
        <p className="text-sm text-text-secondary">{confirm ? ACTION_CONFIRM[confirm].body : ""}</p>
      </ConfirmDialog>
    </>
  );
};

export const ExperimentPage = () => {
  const { experimentId } = useParams<{ experimentId?: string }>();
  const query = useGetExperimentQuery(experimentId ?? "", { skip: !experimentId });

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2 text-xs text-text-secondary">
        <Link to="/experiments" className="hover:text-text-primary transition-colors">Experiments</Link>
        <span>/</span>
        <span className="text-text-primary">{experimentId ? "Experiment" : "New experiment"}</span>
      </div>
      {experimentId && query.isLoading && <p className="text-sm text-text-secondary" role="status">Loading experiment…</p>}
      {experimentId && query.isError && <p className="text-sm text-text-secondary">Experiment not found</p>}
      {experimentId && query.data && <Editor key={query.data.id} experiment={query.data} />}
      {!experimentId && <Editor experiment={null} />}
    </div>
  );
};
