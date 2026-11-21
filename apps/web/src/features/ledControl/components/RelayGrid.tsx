import { RelayCard } from "@features/ledControl/components/RelayCard";
import type { RelayView } from "@features/ledControl/hooks/useLedController";

interface RelayGridProps {
  relays: RelayView[];
  simulation: boolean;
  showControls: boolean;
  canCommand: boolean;
  bulkPending: boolean;
  onSet: (relay: number, on: boolean) => void;
}

/** 4x4 on desktop, 2 columns on mobile. */
export const RelayGrid = ({ relays, ...rest }: RelayGridProps) => (
  <div
    className="grid grid-cols-2 md:grid-cols-4 gap-3"
    data-testid="relay-grid"
  >
    {relays.map((view) => (
      <RelayCard key={view.relay} view={view} {...rest} />
    ))}
  </div>
);
