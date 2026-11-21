import { SIMULATION_BANNER } from "@features/ledControl/ledText";

/**
 * Shown on every page that shows relay states when `simulationMode === true`
 * (plan section 9). Exact text, never reworded.
 */
export const SimulationBanner = () => (
  <div
    className="rounded-btn px-4 py-3 text-sm font-medium bg-violet-50 text-violet-800 ring-1 ring-violet-200"
    role="status"
    data-testid="simulation-banner"
  >
    {SIMULATION_BANNER}
  </div>
);
