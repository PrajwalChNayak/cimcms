import { MAX_WINDOWS_PER_CHANNEL } from "@cimcms/contracts";
import { DAY_LABELS } from "@features/schedules/scheduleText";
import { newWindow, type WindowDraft } from "@features/schedules/scheduleValidation";

interface WindowEditorProps {
  windows: WindowDraft[];
  disabled: boolean;
  onChange: (next: WindowDraft[]) => void;
  /** Prefix of the accessible names when several editors share a page, e.g. "Row 2 ". */
  labelPrefix?: string;
}

/** Days and on/off times (IST) of the windows of one schedule. */
export const WindowEditor = ({ windows, disabled, onChange, labelPrefix = "" }: WindowEditorProps) => {
  const patch = (key: string, p: Partial<WindowDraft>) =>
    onChange(windows.map((w) => (w.key === key ? { ...w, ...p } : w)));
  const toggleDay = (w: WindowDraft, day: number) =>
    patch(w.key, {
      days: w.days.includes(day) ? w.days.filter((d) => d !== day) : [...w.days, day].sort((a, b) => a - b),
    });

  return (
    <div className="space-y-3">
      {windows.map((w, i) => (
        <fieldset
          key={w.key}
          className="rounded-card border border-border bg-surface p-3 space-y-2"
          data-testid={`${labelPrefix.trim().toLowerCase().replace(/\s+/g, "-")}${labelPrefix ? "-" : ""}window-${i + 1}`}
        >
          <legend className="px-1 text-sm font-semibold text-text-primary">Window {i + 1}</legend>
          <div className="flex flex-wrap gap-2" role="group" aria-label={`${labelPrefix}Days of window ${i + 1}`}>
            {DAY_LABELS.map((label, d) => (
              <label key={label} className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  aria-label={`${labelPrefix}Window ${i + 1} ${label}`}
                  checked={w.days.includes(d + 1)}
                  disabled={disabled}
                  onChange={() => toggleDay(w, d + 1)}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              On at
              <input
                type="time"
                aria-label={`${labelPrefix}Window ${i + 1} on time`}
                value={w.on}
                disabled={disabled}
                onChange={(e) => patch(w.key, { on: e.target.value })}
                className="rounded-btn border border-border px-2 py-1"
              />
            </label>
            <label className="flex items-center gap-2">
              Off at
              <input
                type="time"
                aria-label={`${labelPrefix}Window ${i + 1} off time`}
                value={w.off}
                disabled={disabled}
                onChange={(e) => patch(w.key, { off: e.target.value })}
                className="rounded-btn border border-border px-2 py-1"
              />
            </label>
            {w.off < w.on && w.off !== "" && (
              <span className="text-xs text-text-secondary">ends the next day</span>
            )}
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange(windows.filter((x) => x.key !== w.key))}
                className="ml-auto text-xs text-rose-700 hover:underline cursor-pointer"
                aria-label={`${labelPrefix}Remove window ${i + 1}`}
              >
                Remove
              </button>
            )}
          </div>
        </fieldset>
      ))}
      {!disabled && (
        <button
          type="button"
          disabled={windows.length >= MAX_WINDOWS_PER_CHANNEL}
          onClick={() => onChange([...windows, newWindow({ on: "18:00", off: "22:00" })])}
          className="rounded-btn border border-border px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-background disabled:opacity-40 cursor-pointer"
        >
          Add window
        </button>
      )}
    </div>
  );
};
