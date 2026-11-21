import { Modal } from "@/shared/components/ui/Modal";
import type { CreatePermissionBody } from "@appTypes/permission.types";
import { useState, type FormEvent } from "react";

interface CreatePermissionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreate: (body: CreatePermissionBody) => Promise<unknown>;
    isCreating: boolean;
}

export const CreatePermissionModal = ({
    isOpen,
    onClose,
    onCreate,
    isCreating,
}: CreatePermissionModalProps) => {
    const [name, setName] = useState("");
    const [status, setStatus] = useState("ACTIVE");
    const [errors, setErrors] = useState<Record<string, string>>({});

    const reset = () => {
        setName("");
        setStatus("ACTIVE");
        setErrors({});
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const validate = () => {
        const validation: Record<string, string> = {};
        if (!name.trim()) validation.name = "Name is required";
        if (!status.trim()) validation.status = "Status is required";
        return validation;
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        const validation = validate();
        if (Object.keys(validation).length > 0) {
            setErrors(validation);
            return;
        }

        try {
            await onCreate({ name: name.trim(), status: status.trim() });
            handleClose();
        } catch {
            // error handling is managed by the API layer or parent component
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Create Permission"
            size="md"
            footer={
                <>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="px-4 py-2 text-sm rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        form="create-permission-form"
                        disabled={isCreating}
                        className="px-4 py-2 text-sm rounded-xl bg-primary text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isCreating ? "Creating…" : "Create"}
                    </button>
                </>
            }
        >
            <form id="create-permission-form" onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                        Name <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => {
                            setName(e.target.value);
                            setErrors((prev) => ({ ...prev, name: "" }));
                        }}
                        placeholder="READ_FARM"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    />
                    {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
                </div>

                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                        Status <span className="text-red-500">*</span>
                    </label>
                    <select
                        value={status}
                        onChange={(e) => {
                            setStatus(e.target.value);
                            setErrors((prev) => ({ ...prev, status: "" }));
                        }}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    >
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="INACTIVE">INACTIVE</option>
                    </select>
                    {errors.status && <p className="mt-1 text-xs text-red-500">{errors.status}</p>}
                </div>
            </form>
        </Modal>
    );
};
