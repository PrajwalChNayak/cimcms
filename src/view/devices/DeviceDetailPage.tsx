import { mockHistoricalData } from "@api/mockData";
import { DeviceIcon, deviceTypeBg, deviceTypeLabel } from "@shared/components/ui/DeviceIcon";
import { LineChart } from "@shared/components/ui/LineChart";
import { StatusBadge } from "@shared/components/ui/StatusBadge";
import { selectAllDevices, toggleDoorLock } from "@store/slices/devicesSlice";
import { selectAllFarms } from "@store/slices/farmsSlice";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";

const timeAgo = (iso?: string) => {
    if (!iso) return "—";
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
};

const chartColorMap: Record<string, string> = {
    wind_sensor: "#38bdf8",
    water_temp_sensor: "#60a5fa",
    water_flow_meter: "#22d3ee",
    soil_moisture: "#34d399",
    weather_station: "#fbbf24",
    irrigation_valve: "#2dd4bf",
};

const InfoRow = ({ label, value }: { label: string; value: string | number }) => (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
        <span className="text-sm text-text-secondary">{label}</span>
        <span className="text-sm font-medium text-text-primary">{value}</span>
    </div>
);

const signalLabel = (s: string | undefined) =>
    s ? s.charAt(0).toUpperCase() + s.slice(1) : "—";

export const DeviceDetailPage = () => {
    const { deviceId } = useParams<{ deviceId: string }>();
    const navigate = useNavigate();
    const dispatch = useDispatch();

    const devices = useSelector(selectAllDevices);
    const farms = useSelector(selectAllFarms);

    const device = devices.find((d) => d.id === deviceId);
    const farm = farms.find((f) => f.id === device?.farmId);
    const history = deviceId ? (mockHistoricalData[deviceId] ?? []) : [];

    if (!device) {
        return (
            <div className="flex flex-col items-center justify-center flex-1 py-20 text-center p-6">
                <p className="text-text-secondary text-sm mb-3">Device not found</p>
                <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className="text-xs text-primary hover:underline cursor-pointer"
                >
                    Go Back
                </button>
            </div>
        );
    }

    const bgColor = deviceTypeBg[device.type] ?? "bg-slate-500/10";
    const chartColor = chartColorMap[device.type] ?? "#6366f1";
    const isDoorLock = device.type === "door_lock";

    return (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-xs text-text-secondary">
                <button type="button" onClick={() => navigate("/farms")} className="hover:text-text-primary cursor-pointer transition-colors">
                    Farms
                </button>
                {farm && (
                    <>
                        <span>/</span>
                        <button type="button" onClick={() => navigate(`/farms/${farm.id}`)} className="hover:text-text-primary cursor-pointer transition-colors">
                            {farm.name}
                        </button>
                    </>
                )}
                <span>/</span>
                <span className="text-text-primary">{device.name}</span>
            </div>

            {/* Header card */}
            <div className="rounded-card bg-surface border border-border shadow-sm p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-2xl ${bgColor} flex items-center justify-center shrink-0`}>
                            <DeviceIcon type={device.type} className="w-7 h-7" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-text-primary">{device.name}</h1>
                            <p className="text-sm text-text-secondary">{deviceTypeLabel[device.type]}</p>
                            {farm && (
                                <p className="text-xs text-text-secondary mt-0.5 flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    {farm.name}
                                </p>
                            )}
                        </div>
                    </div>
                    <StatusBadge status={device.status} />
                </div>

                {/* Current reading spotlight */}
                {device.lastReading && (
                    <div className="mt-5 pt-5 border-t border-border">
                        <p className="text-xs text-text-secondary mb-1 uppercase tracking-wider">Current Reading</p>
                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-bold text-text-primary">
                                {String(device.lastReading.value)}
                            </span>
                            {device.lastReading.unit && (
                                <span className="text-xl text-text-secondary">{device.lastReading.unit}</span>
                            )}
                        </div>
                        <p className="text-xs text-text-secondary mt-1">
                            Last updated {timeAgo(device.lastSeen)}
                        </p>
                    </div>
                )}
            </div>

            {/* Charts + Controls row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Historical chart */}
                <div className="lg:col-span-2 rounded-card bg-surface border border-border shadow-sm p-5">
                    <h2 className="text-sm font-semibold text-text-primary mb-1">24-Hour History</h2>
                    <p className="text-xs text-text-secondary mb-4">
                        {device.lastReading?.unit ? `Value in ${device.lastReading.unit}` : "Sensor readings"}
                    </p>
                    {history.length > 0 ? (
                        <LineChart
                            data={history}
                            unit={device.lastReading?.unit ?? ""}
                            color={chartColor}
                            height={220}
                        />
                    ) : (
                        <div className="flex items-center justify-center h-40 text-text-secondary text-sm">
                            No historical data available
                        </div>
                    )}
                </div>

                {/* Controls & config */}
                <div className="space-y-4">
                    {/* Door Lock Toggle */}
                    {isDoorLock && (
                        <div className="rounded-card bg-surface border border-border shadow-sm p-5">
                            <h2 className="text-sm font-semibold text-text-primary mb-4">Lock Control</h2>
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <p className="text-sm text-text-primary">
                                        {device.isLocked ? "Locked" : "Unlocked"}
                                    </p>
                                    <p className="text-xs text-text-secondary mt-0.5">Tap to toggle</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => dispatch(toggleDoorLock(device.id))}
                                    className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50 ${device.isLocked ? "bg-primary" : "bg-border"
                                        }`}
                                >
                                    <span
                                        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${device.isLocked ? "translate-x-6" : "translate-x-0"
                                            }`}
                                    />
                                </button>
                            </div>
                            <div
                                className={`text-center py-3 rounded-btn text-sm font-semibold ${device.isLocked
                                        ? "bg-primary/10 text-primary"
                                        : "bg-emerald-50 text-emerald-700"
                                    }`}
                            >
                                <svg className="w-5 h-5 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    {device.isLocked ? (
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    ) : (
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                                    )}
                                </svg>
                                {device.isLocked ? "Door is Locked" : "Door is Unlocked"}
                            </div>
                        </div>
                    )}

                    {/* Device Info */}
                    <div className="rounded-card bg-surface border border-border shadow-sm p-5">
                        <h2 className="text-sm font-semibold text-text-primary mb-2">Device Info</h2>
                        <div>
                            <InfoRow label="Device ID" value={device.id} />
                            <InfoRow label="Firmware" value={device.firmwareVersion ?? "—"} />
                            <InfoRow label="Battery" value={device.batteryLevel !== undefined ? `${device.batteryLevel}%` : "—"} />
                            <InfoRow label="Signal" value={signalLabel(device.signalStrength)} />
                            <InfoRow label="Last Seen" value={timeAgo(device.lastSeen)} />
                            <InfoRow
                                label="Added"
                                value={new Date(device.createdAt).toLocaleDateString()}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
