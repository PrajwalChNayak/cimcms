import type { DeviceListItemDto, Mode } from "@cimcms/contracts";
import { CommandStatusPill } from "@features/commands/components/CommandStatusPill";
import { isTerminalStatus } from "@features/commands/store/commandsSlice";
import { LivenessBadge } from "@features/devices/components/LivenessBadge";
import { useDevices } from "@features/devices/hooks/useDevices";
import { ConfirmDialog } from "@features/ledControl/components/ConfirmDialog";
import { PENDING_TEXT } from "@features/ledControl/ledText";
import { useModeControl } from "@features/modes/hooks/useModeControl";
import {
  MODE_CANCEL,
  MODE_CONFIRM_BUTTON,
  MODE_DESCRIPTION,
  MODE_LABEL,
  READINESS_TEXT,
  modeConfirmBody,
  modeConfirmTitle,
} from "@features/modes/modeText";
import { formatIst } from "@shared/utils/time";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

const Readiness = ({
  title,
  ready,
  reasons,
  testId,
}: {
  title: string;
  ready: boolean;
  reasons: string[];
  testId: string;
}) => (
  <div className="rounded-card border border-border bg-surface p-3 text-sm" data-testid={testId}>
    <p className="font-semibold text-text-primary">
      {title}:{" "}
      <span className={ready ? "text-emerald-700" : "text-amber-700"}>
        {ready ? "Ready" : "Not ready"}
      </span>
    </p>
    {reasons.length > 0 && (
      <ul className="mt-1 list-disc pl-5 text-text-secondary">
        {reasons.map((r) => (
          <li key={r}>{READINESS_TEXT[r as keyof typeof READINESS_TEXT] ?? r}</li>
        ))}
      </ul>
    )}
  </div>
);

const ModeControl = ({ device }: { device: DeviceListItemDto }) => {
  const c = useModeControl(device.id, device.deviceId);
  const [confirm, setConfirm] = useState<Mode | null>(null);

  if (c.isLoading) return <p className="text-sm text-text-secondary" role="status">Loading device…</p>;

  return (
    <>
      <div className="rounded-card bg-surface border border-border shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-text-primary">Operating mode</h1>
          <p className="text-sm text-text-secondary">
            {device.name} · {device.deviceId}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-text-primary" data-testid="current-mode">
            Current mode: <strong>{c.mode ? MODE_LABEL[c.mode] : "—"}</strong>
          </p>
          <LivenessBadge liveness={c.state?.liveness} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {c.readinessAuto && (
          <Readiness
            title="AUTO mode"
            ready={c.readinessAuto.ready}
            reasons={c.readinessAuto.reasons}
            testId="readiness-auto"
          />
        )}
        {c.readinessExperiment && (
          <Readiness
            title="EXPERIMENT mode"
            ready={c.readinessExperiment.ready}
            reasons={c.readinessExperiment.reasons}
            testId="readiness-experiment"
          />
        )}
      </div>

      {c.submitError && (
        <div className="rounded-btn px-4 py-3 text-sm bg-rose-50 text-rose-700" role="alert">
          {c.submitError}
        </div>
      )}

      {c.lastCommand && (
        <div className="text-sm" data-testid="mode-last-result">
          Last mode change request:{" "}
          {isTerminalStatus(c.lastCommand.status) ? (
            <CommandStatusPill command={c.lastCommand} />
          ) : (
            <span className="text-sky-700">{PENDING_TEXT}</span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {c.options.map((o) => (
          <div
            key={o.mode}
            className="rounded-card border border-border bg-surface p-4 flex flex-col gap-2"
            data-testid={`mode-card-${o.mode}`}
          >
            <p className="font-semibold text-text-primary">
              {MODE_LABEL[o.mode]} {o.current && <span className="text-xs text-emerald-700">(current)</span>}
            </p>
            <p className="text-sm text-text-secondary">{MODE_DESCRIPTION[o.mode]}</p>
            {c.canSet && (
              <button
                type="button"
                disabled={o.current || o.blockedReason !== null}
                onClick={() => setConfirm(o.mode)}
                aria-label={`Switch to ${MODE_LABEL[o.mode]}`}
                className="mt-auto self-start rounded-btn border border-border px-3 py-1.5 text-sm font-semibold text-text-primary hover:bg-background disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Switch to {MODE_LABEL[o.mode]}
              </button>
            )}
            {!o.current && o.blockedReason && (
              <p className="text-xs text-amber-700" data-testid={`mode-blocked-${o.mode}`}>
                {o.blockedReason}
              </p>
            )}
          </div>
        ))}
      </div>

      <ConfirmDialog
        isOpen={confirm !== null}
        title={confirm ? modeConfirmTitle(device.deviceId, confirm) : ""}
        cancelLabel={MODE_CANCEL}
        confirmLabel={confirm ? MODE_CONFIRM_BUTTON(confirm) : ""}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const target = confirm;
          setConfirm(null);
          if (target) void c.setMode(target);
        }}
      >
        <p className="text-sm text-text-secondary">{confirm ? modeConfirmBody(confirm) : ""}</p>
      </ConfirmDialog>

      <div className="rounded-card border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-text-primary mb-2">Mode history</h2>
        {!c.history || c.history.data.length === 0 ? (
          <p className="text-sm text-text-secondary">No mode changes recorded.</p>
        ) : (
          <ul className="divide-y divide-border text-sm" data-testid="mode-history">
            {c.history.data.map((e) => (
              <li key={e.id} className="py-2 flex justify-between gap-3">
                <span>
                  {typeof e.data["previous"] === "string" ? `${e.data["previous"]} → ` : ""}
                  <strong>{String(e.data["mode"] ?? "?")}</strong>
                </span>
                <span className="text-text-secondary">{formatIst(e.deviceTs ?? e.receivedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
};

export const ModePage = () => {
  const { deviceId } = useParams<{ deviceId: string }>();
  const { devices, isLoading } = useDevices();
  const device = devices.find((d) => d.deviceId === deviceId);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2 text-xs text-text-secondary">
        <Link to="/devices" className="hover:text-text-primary transition-colors">Devices</Link>
        <span>/</span>
        <Link to={`/devices/${deviceId ?? ""}`} className="hover:text-text-primary transition-colors">
          {device?.name ?? deviceId}
        </Link>
        <span>/</span>
        <span className="text-text-primary">Mode</span>
      </div>
      {isLoading && <p className="text-sm text-text-secondary" role="status">Loading device…</p>}
      {!isLoading && !device && <p className="text-sm text-text-secondary">Device not found</p>}
      {device && device.type !== "LED_CONTROLLER" && (
        <p className="text-sm text-text-secondary">This device has no operating modes.</p>
      )}
      {device && device.type === "LED_CONTROLLER" && <ModeControl device={device} />}
    </div>
  );
};
