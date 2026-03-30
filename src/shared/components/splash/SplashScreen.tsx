import { useCallback, useEffect, useState } from "react";

interface SplashScreenProps {
    /** Minimum display time in ms before splash can dismiss */
    minDuration?: number;
    /** Called when the splash screen finishes its exit animation */
    onFinished?: () => void;
}

/* ── Inline SVG leaf used for floating decorations ── */
const LeafIcon = ({ className }: { className?: string }) => (
    <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20c4 0 8.71-5.29 9-10z"
            fill="currentColor"
            opacity="0.6"
        />
        <path
            d="M17 8c.67-1 1.77-2.42 3-4 1.23 1.58 2.33 3 3 4-2 4.97-6.04 8-9.98 9.97L12 16c1-2 3-5.29 5-8z"
            fill="currentColor"
            opacity="0.35"
        />
    </svg>
);

/* ── Abstract circuit / tech node decoration ── */
const TechNode = ({
    className,
    size = 6,
}: {
    className?: string;
    size?: number;
}) => (
    <div
        className={`rounded-full border border-primary/20 ${className ?? ""}`}
        style={{ width: size, height: size }}
    >
        <div
            className="rounded-full bg-primary/30"
            style={{
                width: size * 0.5,
                height: size * 0.5,
                margin: size * 0.25 - 0.5,
            }}
        />
    </div>
);

/* ── Dashed connector lines for subtle tech feel ── */
const ConnectorLine = ({
    className,
    vertical = false,
}: {
    className?: string;
    vertical?: boolean;
}) => (
    <div
        className={`${vertical ? "w-px h-16" : "h-px w-16"} ${className ?? ""}`}
        style={{
            backgroundImage: vertical
                ? "linear-gradient(to bottom, var(--color-primary) 50%, transparent 50%)"
                : "linear-gradient(to right, var(--color-primary) 50%, transparent 50%)",
            backgroundSize: vertical ? "1px 8px" : "8px 1px",
            opacity: 0.12,
        }}
    />
);

const SplashScreen: React.FC<SplashScreenProps> = ({
    minDuration = 3000,
    onFinished,
}) => {
    const [exiting, setExiting] = useState(false);
    const [visible, setVisible] = useState(true);

    const beginExit = useCallback(() => {
        setExiting(true);
        setTimeout(() => {
            setVisible(false);
            onFinished?.();
        }, 500); // matches splash-exit animation duration
    }, [onFinished]);

    useEffect(() => {
        const timer = setTimeout(beginExit, minDuration);
        return () => clearTimeout(timer);
    }, [minDuration, beginExit]);

    if (!visible) return null;

    return (
        <div
            className={`fixed inset-0 z-9999 flex items-center justify-center overflow-hidden
        splash-gradient-bg ${exiting ? "splash-exit" : ""}`}
            role="status"
            aria-label="Loading application"
        >
            {/* ── Animated grid overlay ── */}
            <div className="absolute inset-0 splash-grid-bg" />

            {/* ── Decorative hex / radial glow ── */}
            <div className="absolute inset-0 pointer-events-none">
                <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{
                        width: "min(600px, 90vw)",
                        height: "min(600px, 90vw)",
                        background:
                            "radial-gradient(circle, rgba(118,184,42,0.08) 0%, transparent 70%)",
                    }}
                />
            </div>

            {/* ── Floating Leaves (nature element) ── */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <LeafIcon className="splash-leaf-1 absolute bottom-[28%] left-[18%] w-7 h-7 text-primary" />
                <LeafIcon className="splash-leaf-2 absolute bottom-[22%] right-[20%] w-5 h-5 text-primary-light" />
                <LeafIcon className="splash-leaf-3 absolute bottom-[35%] left-[42%] w-6 h-6 text-primary/80" />
                <LeafIcon className="splash-leaf-4 absolute bottom-[25%] right-[35%] w-4 h-4 text-accent" />
            </div>

            {/* ── Tech decorator nodes ── */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden splash-fade-in-delayed-2">
                <TechNode className="absolute top-[15%] left-[12%]" size={8} />
                <TechNode className="absolute top-[20%] right-[15%]" size={6} />
                <TechNode className="absolute bottom-[18%] left-[25%]" size={5} />
                <TechNode className="absolute bottom-[30%] right-[10%]" size={7} />

                <ConnectorLine className="absolute top-[15%] left-[calc(12%+12px)]" />
                <ConnectorLine
                    className="absolute top-[calc(20%+10px)] right-[15%]"
                    vertical
                />
                <ConnectorLine className="absolute bottom-[18%] left-[calc(25%+10px)]" />
            </div>

            {/* ── Main Content ── */}
            <div className="relative z-10 flex flex-col items-center gap-6 px-6">
                {/* Logo Area */}
                <div className="splash-fade-in splash-logo-pulse flex flex-col items-center gap-3">
                    {/* Outer ring / spinner */}
                    <div className="relative">
                        <div
                            className="absolute inset-0 rounded-full"
                            style={{
                                border: "2px dashed var(--color-primary)",
                                opacity: 0.2,
                                animation: "splash-ring-spin 12s linear infinite",
                                margin: -8,
                                borderRadius: "9999px",
                            }}
                        />
                        {/* Logo container */}
                        <div
                            className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-surface flex items-center justify-center"
                            style={{
                                boxShadow:
                                    "0 8px 32px rgba(118,184,42,0.15), 0 2px 8px rgba(0,0,0,0.06)",
                            }}
                        >
                            {/* Stylized leaf + circuit logo */}
                            <svg
                                className="w-14 h-14 sm:w-16 sm:h-16"
                                viewBox="0 0 64 64"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                {/* Leaf body */}
                                <path
                                    d="M32 6C18 14 10 28 10 42c0 2 .5 4 1.5 5.5C14 52 22 54 32 54s18-2 20.5-6.5c1-1.5 1.5-3.5 1.5-5.5C54 28 46 14 32 6z"
                                    fill="var(--color-primary)"
                                    opacity="0.85"
                                />
                                {/* Leaf vein – main */}
                                <path
                                    d="M32 14v34"
                                    stroke="var(--color-surface)"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    opacity="0.7"
                                />
                                {/* Leaf veins – branches */}
                                <path
                                    d="M32 22l-8 8M32 22l8 8M32 32l-10 6M32 32l10 6"
                                    stroke="var(--color-surface)"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    opacity="0.45"
                                />
                                {/* Circuit dots on leaf */}
                                <circle
                                    cx="24"
                                    cy="30"
                                    r="2"
                                    fill="var(--color-primary-light)"
                                />
                                <circle
                                    cx="40"
                                    cy="30"
                                    r="2"
                                    fill="var(--color-primary-light)"
                                />
                                <circle
                                    cx="22"
                                    cy="38"
                                    r="1.5"
                                    fill="var(--color-accent)"
                                />
                                <circle
                                    cx="42"
                                    cy="38"
                                    r="1.5"
                                    fill="var(--color-accent)"
                                />
                                {/* Small circuit lines */}
                                <path
                                    d="M24 30h-4M40 30h4"
                                    stroke="var(--color-primary-light)"
                                    strokeWidth="1"
                                    strokeLinecap="round"
                                    opacity="0.6"
                                />
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Brand name */}
                <div className="splash-fade-in-delayed flex flex-col items-center gap-1">
                    <h1
                        className="text-3xl sm:text-4xl font-bold tracking-tight"
                        style={{ color: "var(--color-text-primary)" }}
                    >
                        Cultivo
                        <span
                            className="ml-1.5 font-light"
                            style={{ color: "var(--color-secondary)" }}
                        >
                            IoT
                        </span>
                    </h1>
                    <p
                        className="text-sm sm:text-base tracking-widest uppercase font-medium"
                        style={{ color: "var(--color-text-secondary)" }}
                    >
                        Smart Agriculture, Smarter Future
                    </p>
                </div>

                {/* Progress bar */}
                <div className="splash-fade-in-delayed-2 w-52 sm:w-64">
                    <div
                        className="h-1 rounded-full overflow-hidden"
                        style={{ backgroundColor: "var(--color-border)" }}
                    >
                        <div
                            className="h-full rounded-full splash-progress-bar"
                            style={{
                                background: `linear-gradient(90deg, var(--color-primary), var(--color-primary-light))`,
                            }}
                        />
                    </div>
                </div>

                {/* Animated dots */}
                <div className="splash-fade-in-delayed-3 flex items-center gap-2">
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            className="w-1.5 h-1.5 rounded-full bg-primary"
                            style={{
                                animation: `splash-dot-pulse 1.4s ease-in-out ${i * 0.16}s infinite`,
                            }}
                        />
                    ))}
                </div>
            </div>

            {/* ── Bottom branding ── */}
            <div className="absolute bottom-6 sm:bottom-8 splash-fade-in-delayed-3">
                <p
                    className="text-xs tracking-wide"
                    style={{ color: "var(--color-text-secondary)" }}
                >
                    Powered by{" "}
                    <span className="font-semibold" style={{ color: "var(--color-secondary)" }}>
                        CPBall Research
                    </span>
                </p>
            </div>
        </div>
    );
};

export default SplashScreen;
