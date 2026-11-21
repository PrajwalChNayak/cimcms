import { COLUMNS } from "@/features/user/RoleManagement/component/columns";
import DataTable from "@/shared/components/ui/DataTable";
import { CreateRoleModal } from "@/features/user/RoleManagement/component/CreateRoleModal";
import type { Role } from "@appTypes/role.types";
import { useRoleViewModel } from "@viewModels/useRoleViewModel";
import { useState } from "react";



export const RoleManagementPanel = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const {
        data,
        pagination,
        isLoading,
        isFetching,
        page,
        loadPage,
        handleServerSearch,
        createRole,
        isCreating,
    } = useRoleViewModel();

    return (
        <div className="rounded-3xl border border-gray-200 bg-white shadow-sm p-6">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-base font-semibold text-gray-800">Role Management</h2>
                    <p className="text-xs text-gray-500">View, search, and create roles using the backend API.</p>
                </div>
                <button
                    type="button"
                    onClick={() => setIsModalOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
                >
                    Create Role
                </button>
            </div>

            <DataTable<Role>
                title="Roles"
                subtitle={pagination ? `${pagination.total} record${pagination.total !== 1 ? "s" : ""}` : undefined}
                columns={COLUMNS}
                data={data}
                loading={isLoading || isFetching}
                searchable
                searchMode="server"
                onServerSearch={handleServerSearch}
                stickyHeader
                emptyMessage="No roles found"
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

            <CreateRoleModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onCreate={createRole}
                isCreating={isCreating}
            />
        </div>
    );
};
