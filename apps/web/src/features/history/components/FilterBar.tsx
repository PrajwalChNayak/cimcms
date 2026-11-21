import { useState, type FormEvent } from "react";

export interface FilterField<K extends string> {
  key: K;
  label: string;
  type: "select" | "text" | "date";
  /** for type "select"; an empty "All" option is always first */
  options?: readonly string[];
}

interface FilterBarProps<K extends string> {
  fields: readonly FilterField<K>[];
  /** values currently applied (from the URL) */
  values: Record<K, string>;
  onApply: (next: Record<K, string>) => void;
}

const inputClass =
  "rounded-btn border border-border bg-surface px-2.5 py-1.5 text-sm text-text-primary";

/** Draft filter form: nothing is requested until "Apply". */
export const FilterBar = <K extends string>({
  fields,
  values,
  onApply,
}: FilterBarProps<K>) => {
  const [draft, setDraft] = useState<Record<K, string>>(values);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onApply(draft);
  };
  const reset = () => {
    const empty = Object.fromEntries(fields.map((f) => [f.key, ""])) as Record<K, string>;
    setDraft(empty);
    onApply(empty);
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-card bg-surface border border-border shadow-sm p-3 flex flex-wrap items-end gap-3"
      aria-label="Filters"
    >
      {fields.map((f) => (
        <label key={f.key} className="flex flex-col gap-1 text-xs text-text-secondary">
          {f.label}
          {f.type === "select" ? (
            <select
              className={inputClass}
              value={draft[f.key]}
              onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
            >
              <option value="">All</option>
              {f.options?.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              className={inputClass}
              type={f.type}
              value={draft[f.key]}
              onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
            />
          )}
        </label>
      ))}
      <button
        type="submit"
        className="rounded-btn bg-primary px-4 py-1.5 text-sm font-semibold text-text-inverted hover:bg-primary-light cursor-pointer"
      >
        Apply
      </button>
      <button
        type="button"
        onClick={reset}
        className="rounded-btn border border-border px-4 py-1.5 text-sm text-text-primary hover:bg-background cursor-pointer"
      >
        Reset
      </button>
    </form>
  );
};
