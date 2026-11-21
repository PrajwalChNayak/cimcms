import type { Column } from "@/shared/components/ui/DataTable";
import type { Permission } from "@/types";

export const COLUMNS: Column<Permission>[] = [
    {
        key: "name",
        header: "Permission",
        sortable: true,
        isSearchable: true,
        render: (value) => <span className="text-sm text-gray-800">{value as string}</span>,
    },
    {
        key: "status",
        header: "Status",
        sortable: true,
        isSearchable: false,
        render: (value) => (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-700">
                {value as string}
            </span>
        ),
    },
    {
        key: "createdAt",
        header: "Created At",
        sortable: true,
        render: (value) =>
            value ? (
                new Date(value as string).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                })
            ) : (
                <span className="text-sm text-gray-500">—</span>
            ),
    },
];