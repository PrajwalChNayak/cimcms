import type { MasterTypeConstant } from "@/types";
import CategoryBadge from "./CategoryBadge";


/* ─────────────────────────────────────────
   Column definitions
───────────────────────────────────────── */

export const COLUMNS: Column<MasterTypeConstant>[] = [
    // {
    //     key: "id",
    //     header: "ID",
    //     width: 220,
    //     render: (v) => (
    //         <span className="text-[11px] font-mono text-gray-400 truncate block max-w-50">
    //             {v as string}
    //         </span>
    //     ),
    // },
    {
        key: "type",
        header: "Type",
        sortable: true,
        isSearchable: true,
        render: (v) => (
            <span className="text-xs font-medium text-gray-700 font-mono">
                {v as string}
            </span>
        ),
    },
    {
        key: "value",
        header: "Value",
        sortable: true,
        isSearchable: true,
        render: (v) => (
            <span className="text-xs font-semibold text-gray-800 font-mono">
                {v as string}
            </span>
        ),
    },
    {
        key: "info",
        header: "Info",
        render: (v) => {
            const info = v as MasterTypeConstant["info"];
            return (
                <div className="space-y-1 text-xs">
                    <div className="font-medium text-gray-800">{info.label}</div>
                    <div className="flex flex-wrap items-center gap-2 text-gray-500">
                        <CategoryBadge category={info.category} />
                        {info.unit ? (
                            <span>{info.unit}</span>
                        ) : info.description ? (
                            <span>{info.description}</span>
                        ) : (
                            <span>—</span>
                        )}
                        {info.level && (
                            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[11px] text-gray-600">
                                Level: {info.level}
                            </span>
                        )}
                    </div>
                </div>
            );
        },
    },
    {
        key: "createdAt",
        header: "Created At",
        sortable: true,
        render: (v) =>
            new Date(v as string).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
            }),
    },
];
