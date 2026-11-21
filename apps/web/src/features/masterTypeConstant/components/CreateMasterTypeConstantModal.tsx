import { Modal } from "@/shared/components/ui/Modal";
import type { CreateMasterTypeConstantBody } from "@appTypes/masterTypeConstant.types";
import { useRef, useState } from "react";

interface InfoField {
    id: number;
    key: string;
    value: string;
}

export const CreateMasterTypeConstantModal = ({
    isOpen,
    onClose,
    onCreate,
    isCreating,
}: {
    isOpen: boolean;
    onClose: () => void;
    onCreate: (body: CreateMasterTypeConstantBody) => Promise<unknown>;
    isCreating: boolean;
}) => {
    const idRef = useRef(1);
    const [type, setType] = useState("");
    const [value, setValue] = useState("");
    const [infoFields, setInfoFields] = useState<InfoField[]>([
        { id: 0, key: "", value: "" },
    ]);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const reset = () => {
        setType("");
        setValue("");
        setInfoFields([{ id: 0, key: "", value: "" }]);
        setErrors({});
        idRef.current = 1;
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const updateField = (id: number, field: "key" | "value", val: string) =>
        setInfoFields((prev) => prev.map((f) => (f.id === id ? { ...f, [field]: val } : f)));

    const addField = () =>
        setInfoFields((prev) => [...prev, { id: idRef.current++, key: "", value: "" }]);

    const removeField = (id: number) =>
        setInfoFields((prev) => prev.filter((f) => f.id !== id));

    const validate = () => {
        const errs: Record<string, string> = {};
        if (!type.trim()) errs.type = "Type is required";
        if (!value.trim()) errs.value = "Value is required";

        const validInfoEntries = infoFields.filter(
            (field) => field.key.trim() && field.value.trim(),
        );
        if (validInfoEntries.length === 0) {
            errs.info = "At least one info key/value pair is required";
        }

        return errs;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const errs = validate();
        if (Object.keys(errs).length > 0) {
            setErrors(errs);
            return;
        }

        const info: Record<string, string> = {};
        for (const f of infoFields) {
            if (f.key.trim() && f.value.trim()) info[f.key.trim()] = f.value.trim();
        }

        try {
            await onCreate({ type: type.trim(), value: value.trim(), info });
            handleClose();
        } catch {
            // errors surfaced via toast / RTK
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Create Master Type Constant"
            size="lg"
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
                        form="create-mtc-form"
                        disabled={isCreating}
                        className="px-4 py-2 text-sm rounded-xl bg-primary text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isCreating ? "Creating…" : "Create"}
                    </button>
                </>
            }
        >
            <form id="create-mtc-form" onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                        Type <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        value={type}
                        onChange={(e) => {
                            setType(e.target.value);
                            setErrors((p) => ({ ...p, type: "" }));
                        }}
                        placeholder="e.g. DEVICE_TYPE"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all font-mono"
                    />
                    {errors.type && <p className="mt-1 text-xs text-red-500">{errors.type}</p>}
                </div>

                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                        Value <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        value={value}
                        onChange={(e) => {
                            setValue(e.target.value);
                            setErrors((p) => ({ ...p, value: "" }));
                        }}
                        placeholder="e.g. LIGHT_SENSOR"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all font-mono"
                    />
                    {errors.value && <p className="mt-1 text-xs text-red-500">{errors.value}</p>}
                </div>

                <div>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-gray-700">Info</span>
                        <button
                            type="button"
                            onClick={addField}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:opacity-75 font-medium transition-opacity"
                        >
                            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                <path
                                    fillRule="evenodd"
                                    d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                                    clipRule="evenodd"
                                />
                            </svg>
                            Add field
                        </button>
                    </div>
                    <div className="space-y-2 border border-gray-100 rounded-xl p-3 bg-gray-50">
                        {infoFields.map((field) => (
                            <div key={field.id} className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={field.key}
                                    onChange={(e) => updateField(field.id, "key", e.target.value)}
                                    placeholder="key"
                                    className="w-28 shrink-0 px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all font-mono"
                                />
                                <input
                                    type="text"
                                    value={field.value}
                                    onChange={(e) => updateField(field.id, "value", e.target.value)}
                                    placeholder="value"
                                    className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                                />
                                <button
                                    type="button"
                                    onClick={() => removeField(field.id)}
                                    className="p-1.5 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                                >
                                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                        <path
                                            fillRule="evenodd"
                                            d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zm-1 7a1 1 0 112 0v4a1 1 0 11-2 0V9zm4 0a1 1 0 112 0v4a1 1 0 11-2 0V9z"
                                            clipRule="evenodd"
                                        />
                                    </svg>
                                </button>
                            </div>
                        ))}
                        {errors.info && <p className="text-xs text-red-500 mt-1">{errors.info}</p>}
                    </div>
                </div>
            </form>
        </Modal>
    );
};