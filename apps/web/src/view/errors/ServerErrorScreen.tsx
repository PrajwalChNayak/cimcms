import ErrorScreenLayout from "@view/errors/ErrorScreenLayout";
import { useNavigate } from "react-router-dom";

const ServerIcon = () => (
    <svg className="w-16 h-16 sm:w-20 sm:h-20" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Server box top */}
        <rect x="16" y="14" width="48" height="16" rx="3" stroke="var(--color-warning)" strokeWidth="2.5" opacity="0.7" />
        <circle cx="26" cy="22" r="2.5" fill="var(--color-warning)" opacity="0.6" />
        <rect x="34" y="20" width="20" height="4" rx="1" fill="var(--color-warning)" opacity="0.2" />
        {/* Server box bottom */}
        <rect x="16" y="36" width="48" height="16" rx="3" stroke="var(--color-warning)" strokeWidth="2.5" opacity="0.7" />
        <circle cx="26" cy="44" r="2.5" fill="var(--color-error)" opacity="0.7" />
        <rect x="34" y="42" width="20" height="4" rx="1" fill="var(--color-warning)" opacity="0.2" />
        {/* Lightning bolt — error indicator */}
        <path d="M43 56l-4 8h6l-4 8" stroke="var(--color-error)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
        {/* Connection lines */}
        <path d="M16 30h48" stroke="var(--color-warning)" strokeWidth="1" strokeDasharray="4 3" opacity="0.3" />
        {/* Tech circuit accents */}
        <circle cx="16" cy="58" r="1.5" fill="var(--color-accent)" />
        <circle cx="64" cy="58" r="1.5" fill="var(--color-accent)" />
        <path d="M16 58h-6M64 58h6" stroke="var(--color-primary-light)" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
    </svg>
);

const ServerErrorScreen: React.FC = () => {
    const navigate = useNavigate();

    return (
        <ErrorScreenLayout>
            <ServerIcon />
            <h1
                className="text-7xl sm:text-8xl font-bold tracking-tighter"
                style={{ color: "var(--color-warning)" }}
            >
                500
            </h1>
            <div className="flex flex-col items-center gap-2">
                <h2
                    className="text-xl sm:text-2xl font-semibold"
                    style={{ color: "var(--color-text-primary)" }}
                >
                    Server Error
                </h2>
                <p
                    className="text-sm sm:text-base text-center max-w-sm leading-relaxed"
                    style={{ color: "var(--color-text-secondary)" }}
                >
                    Something went wrong on our end. Our team has been notified and is working to fix it.
                </p>
            </div>
            <div className="mt-2 flex flex-col sm:flex-row items-center gap-3">
                <button
                    onClick={() => window.location.reload()}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-btn text-sm sm:text-base font-semibold text-text-inverted bg-primary hover:bg-primary-light transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Try Again
                </button>
                <button
                    onClick={() => navigate("/")}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-btn text-sm sm:text-base font-semibold border-2 border-primary text-primary hover:bg-primary hover:text-text-inverted transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer"
                >
                    Go Home
                </button>
            </div>
        </ErrorScreenLayout>
    );
};

export default ServerErrorScreen;