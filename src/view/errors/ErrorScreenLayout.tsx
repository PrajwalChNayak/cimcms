import type { ReactNode } from "react";

/* ── Reused decorative elements matching the Splash Screen ── */

const LeafIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
            d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20c4 0 8.71-5.29 9-10z"
            fill="currentColor" opacity="0.6"
        />
        <path
            d="M17 8c.67-1 1.77-2.42 3-4 1.23 1.58 2.33 3 3 4-2 4.97-6.04 8-9.98 9.97L12 16c1-2 3-5.29 5-8z"
            fill="currentColor" opacity="0.35"
        />
    </svg>
);

const TechNode = ({ className, size = 6 }: { className?: string; size?: number }) => (
    <div
        className={`rounded-full border border-primary/20 ${className ?? ""}`}
        style={{ width: size, height: size }}
    >
        <div
            className="rounded-full bg-primary/30"
            style={{ width: size * 0.5, height: size * 0.5, margin: size * 0.25 - 0.5 }}
        />
    </div>
);

const ConnectorLine = ({ className, vertical = false }: { className?: string; vertical?: boolean }) => (
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

interface ErrorScreenLayoutProps {
    children: ReactNode;
}

const ErrorScreenLayout: React.FC<ErrorScreenLayoutProps> = ({ children }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden splash-gradient-bg px-4">
        {/* Grid overlay */}
        <div className="absolute inset-0 splash-grid-bg" />

        {/* Radial glow */}
        <div className="absolute inset-0 pointer-events-none">
            <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                    width: "min(600px, 90vw)",
                    height: "min(600px, 90vw)",
                    background: "radial-gradient(circle, rgba(118,184,42,0.06) 0%, transparent 70%)",
                }}
            />
        </div>

        {/* Floating leaves */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <LeafIcon className="splash-leaf-1 absolute bottom-[28%] left-[18%] w-7 h-7 text-primary" />
            <LeafIcon className="splash-leaf-2 absolute bottom-[22%] right-[20%] w-5 h-5 text-primary-light" />
            <LeafIcon className="splash-leaf-3 absolute bottom-[35%] left-[42%] w-6 h-6 text-primary/80" />
            <LeafIcon className="splash-leaf-4 absolute bottom-[25%] right-[35%] w-4 h-4 text-accent" />
        </div>

        {/* Tech nodes */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <TechNode className="absolute top-[15%] left-[12%]" size={8} />
            <TechNode className="absolute top-[20%] right-[15%]" size={6} />
            <TechNode className="absolute bottom-[18%] left-[25%]" size={5} />
            <TechNode className="absolute bottom-[30%] right-[10%]" size={7} />
            <ConnectorLine className="absolute top-[15%] left-[calc(12%+12px)]" />
            <ConnectorLine className="absolute top-[calc(20%+10px)] right-[15%]" vertical />
            <ConnectorLine className="absolute bottom-[18%] left-[calc(25%+10px)]" />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center gap-5 text-center splash-fade-in">
            {children}
        </div>

        {/* Bottom branding */}
        <div className="absolute bottom-6 sm:bottom-8">
            <p className="text-xs tracking-wide" style={{ color: "var(--color-text-secondary)" }}>
                Powered by{" "}
                <span className="font-semibold" style={{ color: "var(--color-secondary)" }}>
                    CPBall Research
                </span>
            </p>
        </div>
    </div>
);

export default ErrorScreenLayout;
