import { COLUMNS } from "@/features/masterTypeConstant/components/columns";
import { CreateMasterTypeConstantModal } from "@/features/masterTypeConstant/components/CreateMasterTypeConstantModal";
import DataTable from "@/shared/components/ui/DataTable";
import type { MasterTypeConstant } from "@appTypes/masterTypeConstant.types";
import { useMasterTypeConstantViewModel } from "@viewModels/useMasterTypeConstantViewModel";
import { useState } from "react";



/* ─────────────────────────────────────────
   Page
───────────────────────────────────────── */
export const MasterTypeConstantPage = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const {
        data,
        pagination,
        isLoading,
        isFetching,
        page,
        loadPage,
        handleServerSearch,
        createConstant,
        isCreating,
    } = useMasterTypeConstantViewModel();

    return (
        <div className="p-6 space-y-6">
            {/* Page header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-gray-800">MasterTypeConstant</h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Manage and view all MasterTypeConstant records used across the platform.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setIsModalOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
                >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                    </svg>
                    Create
                </button>
            </div>

            {/* Data table */}
            <DataTable<MasterTypeConstant>
                title="MasterTypeConstant"
                subtitle={
                    pagination
                        ? `${pagination.total} record${pagination.total !== 1 ? "s" : ""}`
                        : undefined
                }
                columns={COLUMNS}
                data={data}
                loading={isLoading || isFetching}
                searchable
                searchMode="server"
                onServerSearch={handleServerSearch}
                stickyHeader
                emptyMessage="No MasterTypeConstant records found"
                pagination={
                    pagination
                        ? {
                            page,
                            pageSize: pagination.limit,
                            total: pagination.total,
                            onChange: loadPage,
                            showGoToPage: true,
                        }
                        : undefined
                }
            />

            {/* Create modal */}
            <CreateMasterTypeConstantModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onCreate={createConstant}
                isCreating={isCreating}
            />
        </div>
    );
};
