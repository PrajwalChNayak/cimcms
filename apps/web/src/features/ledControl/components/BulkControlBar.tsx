import type { CommandDto } from "@cimcms/contracts";
import { CommandStatusPill } from "@features/commands/components/CommandStatusPill";
import { isTerminalStatus } from "@features/commands/store/commandsSlice";
import type { PendingInfo } from "@features/commands/store/commandsSlice";
import { ConfirmDialog } from "@features/ledControl/components/ConfirmDialog";
import {
  BULK_CANCEL,
  BULK_CONFIRM_BODY,
  PENDING_TEXT,
  bulkConfirmButton,
  bulkConfirmTitle,
} from "@features/ledControl/ledText";
import { useState } from "react";

interface BulkControlBarProps {
  deviceId: string;
  canCommand: boolean;
  pending: PendingInfo | null;
  last: CommandDto | null;
  onConfirm: (on: boolean) => void;
}

/** All ON / All OFF. Only rendered with DEVICE_COMMAND_BULK. Always asks first. */
export const BulkControlBar = ({
  deviceId,
  canCommand,
  pending,
  last,
  onConfirm,
}: BulkControlBarProps) => {
  const [asking, setAsking] = useState<boolean | null>(null);
  const disabled = !canCommand || pending !== null;
  const lastResult = last && isTerminalStatus(last.status) ? last : null;

  return (
    <div
      className="rounded-card bg-surface border border-border shadow-sm p-3 flex flex-wrap items-center gap-3"
      data-testid="bulk-control-bar"
    >
      <span className="text-sm font-semibold text-text-primary">All relays</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setAsking(true)}
        className="rounded-btn border border-border px-3 py-1.5 text-sm font-semibold text-text-primary hover:bg-background disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      >
        All ON
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setAsking(false)}
        className="rounded-btn border border-border px-3 py-1.5 text-sm font-semibold text-text-primary hover:bg-background disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      >
        All OFF
      </button>

      {pending && (
        <span className="text-xs text-sky-700" data-testid="bulk-pending">
          {PENDING_TEXT}
          {pending.requestedOn !== null && (
            <span className="font-semibold"> → {pending.requestedOn ? "ALL ON" : "ALL OFF"}</span>
          )}
        </span>
      )}
      {!pending && lastResult && <CommandStatusPill command={lastResult} />}

      <ConfirmDialog
        isOpen={asking !== null}
        title={asking === null ? "" : bulkConfirmTitle(asking, deviceId)}
        cancelLabel={BULK_CANCEL}
        confirmLabel={bulkConfirmButton(asking ?? true)}
        onCancel={() => setAsking(null)}
        onConfirm={() => {
          const on = asking;
          setAsking(null);
          if (on !== null) onConfirm(on);
        }}
      >
        <p className="text-sm text-text-secondary">{BULK_CONFIRM_BODY}</p>
      </ConfirmDialog>
    </div>
  );
};
