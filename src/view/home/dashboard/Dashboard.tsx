import { selectAllDevices } from "@store/slices/devicesSlice";
import { selectAllFarms } from "@store/slices/farmsSlice";
import { selectNotifications } from "@store/slices/notificationsSlice";
import { useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import DataTableDemo from "./DataTableDemo_Version2";

/* ═══════════════════════════════════════════
   Mock Data — replace with real API later
   ═══════════════════════════════════════════ */

const hourlyReadings = [65, 63, 60, 58, 55, 53, 52, 54, 58, 62, 66, 68, 72, 74, 73, 71, 69, 67, 65, 64, 62, 61, 63, 65];

/* ═══════════════════════════════════════════
   Small reusable pieces
   ═══════════════════════════════════════════ */

const SvgIcon = ({ d, className = "w-5 h-5" }: { d: string; className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
        <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
);

const StatusDot = ({ status }: { status: string }) => {
    const color =
        status === "online" ? "bg-primary" : status === "warning" ? "bg-warning" : "bg-error";
    return (
        <span className="relative flex h-2.5 w-2.5">
            {status === "online" && (
                <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${color} opacity-40`} />
            )}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${color}`} />
        </span>
    );
};

const SeverityBadge = ({ severity }: { severity: string }) => {
    const style =
        severity === "high"
            ? "bg-error/10 text-error"
            : severity === "medium"
                ? "bg-warning/10 text-warning"
                : "bg-primary/10 text-primary";
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
            {severity}
        </span>
    );
};

const BatteryIcon = ({ level }: { level: number }) => {
    const color = level > 60 ? "text-primary" : level > 25 ? "text-warning" : "text-error";
    return (
        <div className={`flex items-center gap-1 text-xs font-medium ${color}`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 10h-1V8a1 1 0 00-1-1H4a1 1 0 00-1 1v8a1 1 0 001 1h15a1 1 0 001-1v-2h1a1 1 0 001-1v-2a1 1 0 00-1-1z" />
                <rect x="5" y="9" width={Math.round((level / 100) * 12)} height="6" rx="0.5" fill="currentColor" opacity="0.7" />
            </svg>
            {level}%
        </div>
    );
};

/* ── Mini sparkline chart using SVG ── */
const SparkLine = ({ data, height = 40, color = "var(--color-primary)" }: { data: number[]; height?: number; color?: string }) => {
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const w = 200;
    const points = data
        .map((v, i) => `${(i / (data.length - 1)) * w},${height - ((v - min) / range) * (height - 4)}`)
        .join(" ");
    const areaPoints = `0,${height} ${points} ${w},${height}`;
    return (
        <svg viewBox={`0 0 ${w} ${height}`} className="w-full" preserveAspectRatio="none">
            <defs>
                <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <polygon points={areaPoints} fill="url(#sparkGrad)" />
            <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
    );
};

/* ── Circular progress ring ── */
const ProgressRing = ({ value, size = 48, stroke = 4, color = "var(--color-primary)" }: { value: number; size?: number; stroke?: number; color?: string }) => {
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (value / 100) * circumference;
    return (
        <svg width={size} height={size} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-border)" strokeWidth={stroke} />
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth={stroke}
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                className="transition-all duration-700 ease-out"
            />
        </svg>
    );
};

/* ═══════════════════════════════════════════
   Dashboard Page
   ═══════════════════════════════════════════ */

const Dashboard = () => {
    const [selectedPeriod, setSelectedPeriod] = useState<"today" | "week" | "month">("today");
    const navigate = useNavigate();

    // Live data from Redux store
    const farms = useSelector(selectAllFarms);
    const allDevices = useSelector(selectAllDevices);
    const notifications = useSelector(selectNotifications);

    const totalDevices = allDevices.length;
    const onlineDevices = allDevices.filter((d) => d.status === "online").length;
    const errorDevices = allDevices.filter((d) => d.status === "error").length;
    const unreadAlerts = notifications.filter((n) => !n.read).length;

    const stats = [
        {
            label: "Total Farms",
            value: String(farms.length),
            change: "+0",
            trend: "up" as const,
            icon: "M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 004 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
            color: "primary",
        },
        {
            label: "Active Devices",
            value: String(onlineDevices),
            change: `${onlineDevices}/${totalDevices}`,
            trend: "up" as const,
            icon: "M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z",
            color: "secondary",
        },
        {
            label: "Device Errors",
            value: String(errorDevices),
            change: errorDevices > 0 ? "Attention needed" : "All clear",
            trend: errorDevices > 0 ? "down" as const : "up" as const,
            icon: "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z",
            color: "warning",
        },
        {
            label: "Active Alerts",
            value: String(unreadAlerts),
            change: unreadAlerts > 0 ? "Unread" : "None",
            trend: unreadAlerts > 0 ? "down" as const : "up" as const,
            icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
            color: "error",
        },
    ];

    const colorMap: Record<string, { bg: string; text: string; ring: string }> = {
        primary: { bg: "bg-primary/10", text: "text-primary", ring: "ring-primary/20" },
        secondary: { bg: "bg-secondary/10", text: "text-secondary", ring: "ring-secondary/20" },
        warning: { bg: "bg-warning/10", text: "text-warning", ring: "ring-warning/20" },
        error: { bg: "bg-error/10", text: "text-error", ring: "ring-error/20" },
    };

    // Top devices (first 5)
    const devices = allDevices.slice(0, 5).map((d) => ({
        name: d.name,
        zone: farms.find((f) => f.id === d.farmId)?.name ?? "—",
        status: d.status === "error" ? "warning" : d.status,
        battery: d.batteryLevel ?? 0,
        signal: d.signalStrength ?? "weak",
    }));

    // Alerts from notifications
    const alerts = notifications.slice(0, 5).map((n, idx) => ({
        id: idx,
        message: n.message,
        severity: n.severity === "critical" ? "high" : n.severity === "warning" ? "medium" : "low",
        time: (() => {
            const diff = Date.now() - new Date(n.timestamp).getTime();
            const mins = Math.floor(diff / 60_000);
            if (mins < 60) return `${mins} min ago`;
            return `${Math.floor(mins / 60)} hr ago`;
        })(),
    }));

    // Farm health zones
    const cropZones = farms.slice(0, 4).map((f) => {
        const fDevices = allDevices.filter((d) => d.farmId === f.id);
        const health = fDevices.length
            ? Math.round((fDevices.filter((d) => d.status === "online").length / fDevices.length) * 100)
            : 0;
        return {
            name: f.name,
            crop: f.location,
            health,
            moisture: Math.floor(Math.random() * 30) + 50,
            area: f.area ?? "—",
        };
    });

    const greeting = () => {
        const h = new Date().getHours();
        if (h < 12) return "Good morning";
        if (h < 18) return "Good afternoon";
        return "Good evening";
    };

    return (
        <div className="space-y-6">
            {/* ── Header row ── */}
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-text-primary">{greeting()}, Admin</h1>
                    <p className="text-sm text-text-secondary mt-0.5">
                        Here's what's happening across your farm today.
                    </p>
                </div>

                {/* Period toggle */}
                <div className="flex items-center rounded-btn bg-surface border border-border p-0.5 text-sm font-medium shadow-sm">
                    {(["today", "week", "month"] as const).map((p) => (
                        <button
                            key={p}
                            type="button"
                            onClick={() => setSelectedPeriod(p)}
                            className={`px-3 py-1.5 rounded-btn capitalize transition-colors cursor-pointer ${selectedPeriod === p
                                ? "bg-primary text-text-inverted shadow-sm"
                                : "text-text-secondary hover:text-text-primary"
                                }`}
                        >
                            {p}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── KPI Stat Cards ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((s) => {
                    const c = colorMap[s.color];
                    return (
                        <div
                            key={s.label}
                            className="relative overflow-hidden rounded-card bg-surface border border-border p-5 shadow-sm hover:shadow-md transition-shadow group"
                        >
                            {/* decorative ring */}
                            <div className={`absolute -top-4 -right-4 w-20 h-20 rounded-full ${c.bg} opacity-60 group-hover:scale-110 transition-transform`} />

                            <div className="relative flex items-start justify-between">
                                <div className="space-y-1">
                                    <p className="text-xs font-medium uppercase tracking-wider text-text-secondary">{s.label}</p>
                                    <p className="text-2xl font-bold text-text-primary">{s.value}</p>
                                    <div className="flex items-center gap-1 text-xs font-medium">
                                        <span className={s.trend === "up" ? "text-primary" : "text-error"}>
                                            {s.trend === "up" ? "↑" : "↓"} {s.change}
                                        </span>
                                        <span className="text-text-secondary">vs last period</span>
                                    </div>
                                </div>
                                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${c.bg} ring-1 ${c.ring}`}>
                                    <SvgIcon d={s.icon} className={`w-5 h-5 ${c.text}`} />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ── Mid Section: Moisture Chart + Crop Zones ── */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {/* Moisture trend */}
                <div className="lg:col-span-3 rounded-card bg-surface border border-border p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-base font-semibold text-text-primary">Soil Moisture Trend</h2>
                            <p className="text-xs text-text-secondary mt-0.5">Last 24 hours — hourly average</p>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-text-secondary">
                            <span className="inline-block w-3 h-0.5 rounded-full bg-primary" /> Moisture %
                        </div>
                    </div>

                    {/* Y-axis labels + chart area */}
                    <div className="flex gap-2">
                        <div className="flex flex-col justify-between text-[10px] text-text-secondary py-0.5 w-6 text-right shrink-0">
                            <span>80</span>
                            <span>70</span>
                            <span>60</span>
                            <span>50</span>
                        </div>
                        <div className="flex-1 relative">
                            {/* Grid lines */}
                            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                                {[0, 1, 2, 3].map((i) => (
                                    <div key={i} className="border-t border-border/60" />
                                ))}
                            </div>
                            <SparkLine data={hourlyReadings} height={120} />
                        </div>
                    </div>

                    {/* X-axis labels */}
                    <div className="flex justify-between text-[10px] text-text-secondary mt-1 pl-8">
                        <span>00:00</span>
                        <span>06:00</span>
                        <span>12:00</span>
                        <span>18:00</span>
                        <span>23:00</span>
                    </div>
                </div>

                {/* Crop Zone health */}
                <div className="lg:col-span-2 rounded-card bg-surface border border-border p-5 shadow-sm">
                    <h2 className="text-base font-semibold text-text-primary mb-4">Crop Health by Zone</h2>
                    <div className="space-y-4">
                        {cropZones.map((z) => {
                            const healthColor =
                                z.health >= 85
                                    ? "var(--color-primary)"
                                    : z.health >= 70
                                        ? "var(--color-warning)"
                                        : "var(--color-error)";
                            return (
                                <div key={z.name} className="flex items-center gap-3">
                                    <ProgressRing value={z.health} color={healthColor} />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-medium text-text-primary truncate">
                                                {z.name} — {z.crop}
                                            </p>
                                            <span className="text-xs text-text-secondary shrink-0 ml-2">{z.area}</span>
                                        </div>
                                        <div className="flex items-center gap-3 mt-1">
                                            <span className="text-xs text-text-secondary">
                                                Health <span className="font-semibold text-text-primary">{z.health}%</span>
                                            </span>
                                            <span className="text-xs text-text-secondary">
                                                Moisture <span className="font-semibold text-text-primary">{z.moisture}%</span>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* ── Bottom Section: Device List + Alerts ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Device inventory */}
                <div className="rounded-card bg-surface border border-border shadow-sm">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                        <h2 className="text-base font-semibold text-text-primary">Device Overview</h2>
                        <span className="text-xs text-text-secondary">{devices.filter((d) => d.status === "online").length}/{devices.length} online</span>
                    </div>

                    <div className="divide-y divide-border">
                        {devices.map((d) => (
                            <div key={d.name} className="flex items-center gap-3 px-5 py-3 hover:bg-primary/3 transition-colors">
                                <StatusDot status={d.status} />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-text-primary truncate">{d.name}</p>
                                    <p className="text-xs text-text-secondary truncate">{d.zone}</p>
                                </div>
                                <BatteryIcon level={d.battery} />
                                <SignalIcon strength={d.signal} />
                            </div>
                        ))}
                    </div>

                    <div className="px-5 py-3 border-t border-border">
                        <button type="button" onClick={() => navigate("/devices")} className="text-xs font-medium text-primary hover:text-primary-light transition-colors cursor-pointer">
                            View all devices →
                        </button>
                    </div>
                </div>

                {/* Recent alerts */}
                <div className="rounded-card bg-surface border border-border shadow-sm">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                        <h2 className="text-base font-semibold text-text-primary">Recent Alerts</h2>
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-error/10 text-error text-xs font-bold px-1.5">
                            {alerts.filter((a) => a.severity === "high").length}
                        </span>
                    </div>

                    <div className="divide-y divide-border">
                        {alerts.map((a) => (
                            <div key={a.id} className="flex items-start gap-3 px-5 py-3 hover:bg-primary/3 transition-colors">
                                <div className="mt-0.5">
                                    <SvgIcon
                                        d={
                                            a.severity === "high"
                                                ? "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                                                : a.severity === "medium"
                                                    ? "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                                                    : "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                        }
                                        className={`w-4 h-4 ${a.severity === "high" ? "text-error" : a.severity === "medium" ? "text-warning" : "text-primary"}`}
                                    />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-text-primary">{a.message}</p>
                                    <p className="text-xs text-text-secondary mt-0.5">{a.time}</p>
                                </div>
                                <SeverityBadge severity={a.severity} />
                            </div>
                        ))}
                    </div>

                    <div className="px-5 py-3 border-t border-border">
                        <button type="button" onClick={() => navigate("/farms")} className="text-xs font-medium text-primary hover:text-primary-light transition-colors cursor-pointer">
                            View all farms →
                        </button>
                    </div>
                </div>
            </div>

            {/* <DataTableDemo /> */}


            {/* ── Quick-Actions Bar ── */}
            <div className="rounded-card bg-surface border border-border p-5 shadow-sm">
                <h2 className="text-base font-semibold text-text-primary mb-3">Quick Actions</h2>
                <div className="flex flex-wrap gap-2">
                    {[
                        { label: "View Farms", icon: "M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 004 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z", href: "/farms" },
                        { label: "All Devices", icon: "M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z", href: "/devices" },
                        { label: "System Settings", icon: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z", href: "/settings" },
                    ].map((a) => (
                        <button
                            key={a.label}
                            type="button"
                            onClick={() => navigate(a.href)}
                            className="inline-flex items-center gap-1.5 rounded-btn border border-border bg-surface px-3 py-2 text-sm font-medium text-text-primary hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer"
                        >
                            <SvgIcon d={a.icon} className="w-4 h-4 text-primary" />
                            {a.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

/* ── Signal strength indicator ── */
const SignalIcon = ({ strength }: { strength: string }) => {
    const bars = strength === "strong" ? 3 : strength === "good" ? 2 : 1;
    const color = bars === 3 ? "text-primary" : bars === 2 ? "text-warning" : "text-error";
    return (
        <div className={`flex items-end gap-px ${color}`}>
            {[1, 2, 3].map((i) => (
                <div
                    key={i}
                    className={`w-1 rounded-sm ${i <= bars ? "bg-current" : "bg-border"}`}
                    style={{ height: `${6 + i * 3}px` }}
                />
            ))}
        </div>
    );
};

export default Dashboard;
