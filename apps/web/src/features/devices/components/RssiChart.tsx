import type { ReadingPoint } from "@appTypes/device.types";
import { lazy, Suspense } from "react";

// echarts is heavy: load it only when the detail page actually shows the chart.
const LineChart = lazy(() =>
  import("@shared/components/ui/LineChart").then((m) => ({
    default: m.LineChart,
  })),
);

export const RssiChart = ({ data }: { data: ReadingPoint[] }) => {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-text-secondary text-sm">
        No signal history yet
      </div>
    );
  }
  return (
    <Suspense
      fallback={
        <div className="h-40 flex items-center justify-center text-sm text-text-secondary">
          Loading chart…
        </div>
      }
    >
      <LineChart data={data} unit="dBm" color="#38bdf8" height={220} />
    </Suspense>
  );
};
