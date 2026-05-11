import DataTable, { type Column } from "@/shared/components/ui/DataTable";
import { PermissionManagementPanel } from "@/features/user/PermissionManagement/component/PermissionManagementPanel";
import { RoleManagementPanel } from "@/features/user/RoleManagement/component/RoleManagementPanel";
import { useState } from "react";

const TABS = ["Users", "Roles", "Permissions"] as const;
type UserTab = (typeof TABS)[number];

interface UserRow {
    id: string;
    name: string;
    email: string;
    role: string;
}

const users: UserRow[] = [
    { id: "1", name: "Alice Johnson", email: "alice@example.com", role: "Admin" },
    { id: "2", name: "Bob Martin", email: "bob@example.com", role: "Editor" },
    { id: "3", name: "Clara Nguyen", email: "clara@example.com", role: "Viewer" },
];


const userColumns: Column<UserRow>[] = [
    {
        key: "name",
        header: "Name",
        sortable: true,
        render: (value) => <span className="text-sm text-gray-800">{value as string}</span>,
    },
    {
        key: "email",
        header: "Email",
        sortable: true,
        render: (value) => <span className="text-sm text-gray-600">{value as string}</span>,
    },
    {
        key: "role",
        header: "Role",
        sortable: true,
        render: (value) => <span className="text-sm font-medium text-gray-700">{value as string}</span>,
    },
];


export const UsersManagementPage = () => {
    const [activeTab, setActiveTab] = useState<UserTab>("Users");

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-xl font-bold text-gray-800">Users</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Manage users, roles, and permissions from a single place.
                    </p>
                </div>
            </div>

            <div className="flex flex-wrap gap-2 rounded-xl bg-gray-100 p-2">
                {TABS.map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveTab(tab)}
                        className={`rounded-xl px-4 py-2 text-sm font-medium transition ${activeTab === tab
                            ? "bg-primary text-white"
                            : "text-gray-600 hover:bg-white hover:text-gray-900"
                            }`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {activeTab === "Users" ? (
                <div className="rounded-3xl border border-gray-200 bg-white shadow-sm p-6">
                    <div className="mb-4">
                        <h2 className="text-base font-semibold text-gray-800">User Management</h2>
                        <p className="text-xs text-gray-500">Manage application users and their assigned roles.</p>
                    </div>

                    <DataTable
                        title="Users"
                        subtitle={`${users.length} record${users.length !== 1 ? "s" : ""}`}
                        columns={userColumns}
                        data={users}
                        loading={false}
                        emptyMessage="No users found"
                        stickyHeader
                    />
                </div>
            ) : activeTab === "Roles" ? (
                <RoleManagementPanel />
            ) : (
                <PermissionManagementPanel />
            )}
        </div>
    );
};
