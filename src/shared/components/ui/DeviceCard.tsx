import type { Device } from "@appTypes/device.types";
import { useNavigate } from "react-router-dom";
import { DeviceIcon, deviceTypeBg, deviceTypeLabel } from "./DeviceIcon";
import { StatusBadge } from "./StatusBadge";

interface DeviceCardProps {
    device: Device;
    showFarm?: boolean;
    farmName?: string;
}

const batteryIcon = (level: number) => {
    if (level >= 80) return "text-emerald-400";
    if (level >= 30) return "text-amber-400";
    return "text-rose-400";
};

const signalBars = (strength: Device["signalStrength"]) => {
    const filled = { strong: 3, good: 2, weak: 1, none: 0 }[strength ?? "none"] ?? 0;
    return (
        <div className="flex items-end gap-0.5 h-3.5">
            {[1, 2, 3].map((bar) => (
                <div
                    key={bar}
                    className={`w-1 rounded-sm transition-colors ${bar <= filled ? "bg-emerald-500" : "bg-border"
                        }`}
                    style={{ height: `${bar * 33}%` }}
                />
            ))}
        </div>
    );
};

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

export const DeviceCard = ({ device, showFarm, farmName }: DeviceCardProps) => {
    const navigate = useNavigate();
    const bgColor = deviceTypeBg[device.type] ?? "bg-slate-500/10";

    return (
        <button
            type="button"
            onClick={() => navigate(`/devices/${device.id}`)}
            className="group w-full text-left rounded-card bg-surface border border-border shadow-sm p-4 hover:shadow-md hover:border-primary/30 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
            {/* Top row */}
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                    <div className={`w-9 h-9 rounded-xl ${bgColor} flex items-center justify-center shrink-0`}>
                        <DeviceIcon type={device.type} className="w-4.5 h-4.5" />
                    </div>
                    <div>
                        <h4 className="text-sm font-semibold text-text-primary group-hover:text-primary transition-colors leading-tight">
                            {device.name}
                        </h4>
                        <p className="text-xs text-text-secondary mt-0.5">
                            {deviceTypeLabel[device.type]}
                        </p>
                    </div>
                </div>
                <StatusBadge status={device.status} size="sm" />
            </div>

            {/* Reading */}
            <div className="mb-3 px-3 py-2 rounded-btn bg-background border border-border">
                {device.lastReading ? (
                    <div className="flex items-baseline gap-1">
                        <span className="text-xl font-bold text-text-primary">
                            {String(device.lastReading.value)}
                        </span>
                        {device.lastReading.unit && (
                            <span className="text-sm text-text-secondary">{device.lastReading.unit}</span>
                        )}
                    </div>
                ) : (
                    <span className="text-sm text-text-secondary">No reading available</span>
                )}
                <p className="text-xs text-text-secondary mt-0.5">
                    Updated {timeAgo(device.lastSeen)}
                </p>
            </div>

            {/* Bottom row */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    {/* Battery */}
                    {device.batteryLevel !== undefined && (
                        <div className={`flex items-center gap-1 text-xs ${batteryIcon(device.batteryLevel)}`}>
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M2 7a2 2 0 012-2h12a2 2 0 012 2v2h1a1 1 0 110 2h-1v2a2 2 0 01-2 2H4a2 2 0 01-2-2V7zm2-1a1 1 0 00-1 1v6a1 1 0 001 1h12a1 1 0 001-1V7a1 1 0 00-1-1H4z" />
                                <path d="M4 8h10v4H4V8zm8 1a1 1 0 00-1 1v2h2V9a1 1 0 00-1-1z" />
                            </svg>
                            <span>{device.batteryLevel}%</span>
                        </div>
                    )}
                    {/* Signal */}
                    {device.signalStrength && signalBars(device.signalStrength)}
                </div>

                {showFarm && farmName && (
                    <span className="text-xs text-text-secondary truncate max-w-24">{farmName}</span>
                )}
            </div>
        </button>
    );
};
