import type { Device, DeviceType } from "@appTypes/device.types";
import { DeviceCard } from "@shared/components/ui/DeviceCard";
import { deviceTypeLabel } from "@shared/components/ui/DeviceIcon";
import { Modal } from "@shared/components/ui/Modal";
import { SearchInput } from "@shared/components/ui/SearchInput";
import { StatCard } from "@shared/components/ui/StatCard";
import { addDevice, selectAllDevices, selectDevicesSearch, setDevicesSearch } from "@store/slices/devicesSlice";
import { selectAllFarms } from "@store/slices/farmsSlice";
import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";

const DEVICE_TYPES: DeviceType[] = [
    "wind_sensor",
    "water_temp_sensor",
    "door_lock",
    "water_flow_meter",
    "moisture",
    "weather_station",
    "irrigation_valve",
];

const STATUS_FILTERS: Array<Device["status"] | "all"> = ["all", "online", "offline", "error"];

export const FarmDetailPage = () => {
    const { farmId } = useParams<{ farmId: string }>();
    const navigate = useNavigate();
    const dispatch = useDispatch();

    const farms = useSelector(selectAllFarms);
    const allDevices = useSelector(selectAllDevices);
    const searchQuery = useSelector(selectDevicesSearch);

    const farm = farms.find((f) => f.id === farmId);
    const farmDevices = allDevices.filter((d) => d.farmId === farmId);

    const [statusFilter, setStatusFilter] = useState<Device["status"] | "all">("all");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formName, setFormName] = useState("");
    const [formType, setFormType] = useState<DeviceType>("wind_sensor");

    if (!farm) {
        return (
            <div className="flex flex-col items-center justify-center flex-1 py-20 text-center p-6">
                <p className="text-text-secondary text-sm mb-3">Farm not found</p>
                <button
                    type="button"
                    onClick={() => navigate("/farms")}
                    className="text-xs text-primary hover:underline cursor-pointer"
                >
                    Back to Farms
                </button>
            </div>
        );
    }

    const filtered = farmDevices.filter((d) => {
        const matchSearch =
            d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            deviceTypeLabel[d.type].toLowerCase().includes(searchQuery.toLowerCase());
        const matchStatus = statusFilter === "all" || d.status === statusFilter;
        return matchSearch && matchStatus;
    });

    const online = farmDevices.filter((d) => d.status === "online").length;
    const offline = farmDevices.filter((d) => d.status === "offline").length;
    const errors = farmDevices.filter((d) => d.status === "error").length;

    const handleAddDevice = () => {
        if (!formName.trim() || !farmId) return;
        const newDevice: Device = {
            id: `dev-${Date.now()}`,
            name: formName,
            type: formType,
            farmId,
            status: "offline",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        dispatch(addDevice(newDevice));
        setFormName("");
        setFormType("wind_sensor");
        setIsModalOpen(false);
    };

    return (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            {/* Back + Header */}
            <div>
                <button
                    type="button"
                    onClick={() => navigate("/farms")}
                    className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary mb-4 transition-colors cursor-pointer"
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    All Farms
                </button>

                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div>
                        <h1 className="text-xl font-bold text-text-primary">{farm.name}</h1>
                        <div className="flex items-center gap-3 mt-1">
                            {farm.location && (
                                <span className="text-sm text-text-secondary flex items-center gap-1">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    {farm.location}
                                </span>
                            )}
                            {farm.area && (
                                <span className="text-xs text-text-secondary bg-background border border-border px-2 py-0.5 rounded-full">{farm.area}</span>
                            )}
                        </div>
                        {farm.description && (
                            <p className="text-sm text-text-secondary mt-1 max-w-lg">{farm.description}</p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsModalOpen(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors cursor-pointer shrink-0"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        Add Device
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label="Total Devices"
                    value={farmDevices.length}
                    icon="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
                    color="primary"
                />
                <StatCard
                    label="Online"
                    value={online}
                    icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    color="emerald"
                />
                <StatCard
                    label="Offline"
                    value={offline}
                    icon="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    color="sky"
                />
                <StatCard
                    label="Errors"
                    value={errors}
                    icon="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                    color="rose"
                />
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <SearchInput
                    value={searchQuery}
                    onChange={(v) => dispatch(setDevicesSearch(v))}
                    placeholder="Search devices…"
                    className="flex-1 max-w-sm"
                />
                <div className="flex items-center gap-2">
                    {STATUS_FILTERS.map((s) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => setStatusFilter(s)}
                            className={`px-3 py-1.5 rounded-btn text-xs font-medium capitalize transition-colors cursor-pointer border ${statusFilter === s
                                ? "bg-primary text-text-inverted border-primary"
                                : "bg-surface text-text-secondary hover:bg-primary/5 hover:text-text-primary border-border"
                                }`}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </div>

            {/* Devices grid */}
            {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-16 h-16 rounded-card bg-background border border-border flex items-center justify-center mb-4">
                        <svg className="w-8 h-8 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                        </svg>
                    </div>
                    <p className="text-text-secondary text-sm">No devices found</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filtered.map((device) => (
                        <DeviceCard key={device.id} device={device} />
                    ))}
                </div>
            )}

            {/* Add Device Modal */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title="Add New Device"
                footer={
                    <>
                        <button
                            type="button"
                            onClick={() => setIsModalOpen(false)}
                            className="px-4 py-2 rounded-btn text-sm text-text-secondary hover:text-text-primary hover:bg-background transition-colors cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleAddDevice}
                            disabled={!formName.trim()}
                            className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        >
                            Add Device
                        </button>
                    </>
                }
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1.5">Device Name *</label>
                        <input
                            type="text"
                            value={formName}
                            onChange={(e) => setFormName(e.target.value)}
                            placeholder="e.g. Wind Sensor WS-03"
                            className="w-full px-3 py-2 rounded-btn border border-border bg-surface text-text-primary placeholder-text-secondary text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1.5">Device Type</label>
                        <select
                            value={formType}
                            onChange={(e) => setFormType(e.target.value as DeviceType)}
                            className="w-full px-3 py-2 rounded-btn border border-border bg-surface text-text-primary text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        >
                            {DEVICE_TYPES.map((t) => (
                                <option key={t} value={t}>
                                    {deviceTypeLabel[t]}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
