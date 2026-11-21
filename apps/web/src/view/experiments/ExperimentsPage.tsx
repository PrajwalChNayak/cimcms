import { useListExperimentsQuery } from "@api/experimentApi";
import { EXPERIMENT_STATUS_TEXT } from "@features/experiments/experimentText";
import { usePermission } from "@shared/hooks/usePermission";
import { formatIst } from "@shared/utils/time";
import { Link } from "react-router-dom";

export const ExperimentsPage = () => {
  const canWrite = usePermission("EXPERIMENT_WRITE");
  const { data, isLoading, isError } = useListExperimentsQuery({ limit: 100 });

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Experiments</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Timed lighting programmes for test groups. Times are Indian Standard Time (IST).
          </p>
        </div>
        {canWrite && (
          <Link
            to="/experiments/new"
            className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-text-inverted"
          >
            Create experiment
          </Link>
        )}
      </div>
      {isLoading && <p className="text-sm text-text-secondary" role="status">Loading experiments…</p>}
      {isError && (
        <div className="rounded-btn px-4 py-3 text-sm bg-rose-50 text-rose-700" role="alert">
          Could not load experiments.
        </div>
      )}
      {data && data.data.length === 0 && <p className="text-sm text-text-secondary">No experiments yet.</p>}
      {data && data.data.length > 0 && (
        <div className="rounded-card border border-border bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-text-secondary">
              <tr>
                <th className="px-4 py-2">Code</th>
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Period</th>
                <th className="px-4 py-2">Relays</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((e) => (
                <tr key={e.id} className="border-t border-border" data-testid={`experiment-row-${e.code}`}>
                  <td className="px-4 py-2 font-mono">{e.code}</td>
                  <td className="px-4 py-2">
                    <Link to={`/experiments/${e.id}`} className="text-primary hover:underline">{e.title}</Link>
                  </td>
                  <td className="px-4 py-2">{EXPERIMENT_STATUS_TEXT[e.status]}</td>
                  <td className="px-4 py-2">{formatIst(e.startsAt)} – {formatIst(e.endsAt)}</td>
                  <td className="px-4 py-2">{e.assignments.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
