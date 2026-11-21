import { LED_CHANNEL_COUNT } from "@cimcms/contracts";
import { newRow, type AssignmentDraft } from "@features/experiments/experimentValidation";
import { WindowEditor } from "@features/schedules/components/WindowEditor";

interface AssignmentsEditorProps {
  rows: AssignmentDraft[];
  /** Physical ids of the devices that have relay channels. */
  deviceIds: string[];
  disabled: boolean;
  onChange: (next: AssignmentDraft[]) => void;
}

/** One row per relay: group label (condition), device, relay and its on/off windows. */
export const AssignmentsEditor = ({ rows, deviceIds, disabled, onChange }: AssignmentsEditorProps) => {
  const patch = (key: string, p: Partial<AssignmentDraft>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...p } : r)));

  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <section
          key={r.key}
          className="rounded-card border border-border bg-surface p-3 space-y-3"
          data-testid={`row-${i + 1}`}
        >
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <label className="block">
              <span className="block font-medium mb-1">Group</span>
              <input
                aria-label={`Row ${i + 1} group`}
                value={r.groupLabel}
                disabled={disabled}
                maxLength={40}
                placeholder="e.g. Control"
                onChange={(e) => patch(r.key, { groupLabel: e.target.value })}
                className="rounded-btn border border-border px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="block font-medium mb-1">Device</span>
              <select
                aria-label={`Row ${i + 1} device`}
                value={r.deviceId}
                disabled={disabled}
                onChange={(e) => patch(r.key, { deviceId: e.target.value })}
                className="rounded-btn border border-border px-3 py-2"
              >
                <option value="">Choose…</option>
                {deviceIds.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block font-medium mb-1">Relay</span>
              <select
                aria-label={`Row ${i + 1} relay`}
                value={r.relay}
                disabled={disabled}
                onChange={(e) => patch(r.key, { relay: Number(e.target.value) })}
                className="rounded-btn border border-border px-3 py-2"
              >
                {Array.from({ length: LED_CHANNEL_COUNT }, (_, n) => n + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange(rows.filter((x) => x.key !== r.key))}
                className="ml-auto text-xs text-rose-700 hover:underline cursor-pointer"
                aria-label={`Remove row ${i + 1}`}
              >
                Remove row
              </button>
            )}
          </div>
          <WindowEditor
            windows={r.windows}
            disabled={disabled}
            labelPrefix={`Row ${i + 1} `}
            onChange={(windows) => patch(r.key, { windows })}
          />
        </section>
      ))}
      {!disabled && (
        <button
          type="button"
          onClick={() => onChange([...rows, newRow({ relay: Math.min(rows.length + 1, LED_CHANNEL_COUNT) })])}
          className="rounded-btn border border-border px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-background cursor-pointer"
        >
          Add relay
        </button>
      )}
    </div>
  );
};
