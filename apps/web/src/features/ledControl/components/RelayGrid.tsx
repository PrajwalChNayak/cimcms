import { RelayCard } from "@features/ledControl/components/RelayCard";
import type { RelayView } from "@features/ledControl/hooks/useLedController";

interface RelayGridProps {
  relays: RelayView[];
  /** Group the cards by room (T5.1). */
  groupByRoom?: boolean;
  simulation: boolean;
  showControls: boolean;
  canCommand: boolean;
  bulkPending: boolean;
  onSet: (relay: number, on: boolean) => void;
}

/** 4x4 on desktop, 2 columns on mobile. */
const GRID = "grid grid-cols-2 md:grid-cols-4 gap-3";

export const RelayGrid = ({ relays, groupByRoom = false, ...rest }: RelayGridProps) => {
  if (!groupByRoom) {
    return (
      <div className={GRID} data-testid="relay-grid">
        {relays.map((view) => (
          <RelayCard key={view.relay} view={view} {...rest} />
        ))}
      </div>
    );
  }
  const groups = new Map<string, { title: string; views: RelayView[] }>();
  for (const view of relays) {
    const key = view.room?.roomId ?? "none";
    const title = view.room?.roomName ?? "Not assigned";
    const g = groups.get(key) ?? { title, views: [] };
    g.views.push(view);
    groups.set(key, g);
  }
  // Rooms by name, the "Not assigned" group last.
  const ordered = [...groups.entries()].sort(([ka, a], [kb, b]) =>
    ka === "none" ? 1 : kb === "none" ? -1 : a.title.localeCompare(b.title),
  );
  return (
    <div className="space-y-5" data-testid="relay-grid">
      {ordered.map(([key, g]) => (
        <section key={key} data-testid={`relay-group-${key}`}>
          <h2 className="mb-2 text-sm font-semibold text-text-primary">{g.title}</h2>
          <div className={GRID}>
            {g.views.map((view) => (
              <RelayCard key={view.relay} view={view} {...rest} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};
