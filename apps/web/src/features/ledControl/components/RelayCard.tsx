import { CommandStatusPill } from "@features/commands/components/CommandStatusPill";
import { isTerminalStatus } from "@features/commands/store/commandsSlice";
import type { RelayView } from "@features/ledControl/hooks/useLedController";
import {
  PENDING_TEXT,
  RELAY_UNKNOWN_TEXT,
  relayLabel,
} from "@features/ledControl/ledText";
import { formatIst } from "@shared/utils/time";

/** Switch/toggle icon (never a lit bulb: plan section 9). */
const SwitchIcon = ({ on }: { on: boolean | null }) => (
  <svg
    className="w-6 h-6 text-text-secondary"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    aria-hidden="true"
  >
    <rect x="2.5" y="7" width="19" height="10" rx="5" />
    <circle cx={on ? 16.5 : 7.5} cy="12" r="2.5" fill="currentColor" opacity={on === null ? 0.3 : 1} />
  </svg>
);

const Spinner = () => (
  <span
    className="inline-block w-3.5 h-3.5 rounded-full border-2 border-sky-300 border-t-sky-700 animate-spin"
    aria-hidden="true"
  />
);

interface RelayCardProps {
  view: RelayView;
  simulation: boolean;
  /** user may send commands at all (DEVICE_COMMAND): without it no buttons are rendered */
  showControls: boolean;
  /** commands currently allowed (online, mode, live connection) */
  canCommand: boolean;
  /** a SET_ALL_RELAYS command is in flight */
  bulkPending: boolean;
  onSet: (relay: number, on: boolean) => void;
}

/** One relay: reported state, ON/OFF buttons, pending text and last result. */
export const RelayCard = ({
  view,
  simulation,
  showControls,
  canCommand,
  bulkPending,
  onSet,
}: RelayCardProps) => {
  const { relay, reportedOn, pending, lastCommand, lastChangeAt } = view;
  const busy = pending !== null || bulkPending;
  const disabled = !canCommand || busy;
  const lastResult =
    lastCommand && isTerminalStatus(lastCommand.status) ? lastCommand : null;

  return (
    <div
      className="rounded-card bg-surface border border-border shadow-sm p-3 flex flex-col gap-2"
      data-testid={`relay-card-${relay}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-text-primary">Relay {relay}</span>
        <SwitchIcon on={reportedOn} />
      </div>
      <p className="text-xs text-text-secondary" data-testid={`relay-room-${relay}`}>
        {view.room
          ? `Room: ${view.room.roomName}${view.room.label ? ` · ${view.room.label}` : ""}`
          : "Room: not assigned"}
      </p>

      <p className="text-sm font-medium text-text-primary" data-testid={`relay-state-${relay}`}>
        {reportedOn === null ? RELAY_UNKNOWN_TEXT : relayLabel(reportedOn, simulation)}
      </p>

      {pending && (
        <p
          className="flex items-center gap-1.5 text-xs text-sky-700"
          data-testid={`relay-pending-${relay}`}
        >
          <Spinner />
          <span>{PENDING_TEXT}</span>
          {pending.requestedOn !== null && (
            <span className="font-semibold">→ {pending.requestedOn ? "ON" : "OFF"}</span>
          )}
        </p>
      )}

      {!pending && lastResult && (
        <div data-testid={`relay-result-${relay}`}>
          <CommandStatusPill command={lastResult} />
        </div>
      )}

      {lastChangeAt && (
        <p className="text-[11px] text-text-secondary">Last change: {formatIst(lastChangeAt)}</p>
      )}

      {showControls && (
        <div className="mt-auto grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSet(relay, true)}
            aria-label={`Set relay ${relay} ON`}
            className="rounded-btn border border-border px-2 py-1.5 text-xs font-semibold text-text-primary hover:bg-background disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            ON
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSet(relay, false)}
            aria-label={`Set relay ${relay} OFF`}
            className="rounded-btn border border-border px-2 py-1.5 text-xs font-semibold text-text-primary hover:bg-background disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            OFF
          </button>
        </div>
      )}
    </div>
  );
};
