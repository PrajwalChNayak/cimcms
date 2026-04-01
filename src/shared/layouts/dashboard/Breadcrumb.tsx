import { useLocation, useNavigate } from "react-router-dom";

/* ── Build breadcrumb segments from current path ── */

const labelMap: Record<string, string> = {
    dashboard: "Dashboard",
    users: "Users",
    add: "Add",
    products: "Products",
    orders: "Orders",
    reports: "Reports",
    sales: "Sales Report",
    settings: "Settings",
};

const Breadcrumb: React.FC = () => {
    const { pathname } = useLocation();
    const navigate = useNavigate();

    const segments = pathname.split("/").filter(Boolean);

    if (segments.length === 0) return null;

    return (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
            {segments.map((seg, idx) => {
                const path = "/" + segments.slice(0, idx + 1).join("/");
                const label = labelMap[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1);
                const isLast = idx === segments.length - 1;

                return (
                    <span key={path} className="flex items-center gap-1.5">
                        {idx > 0 && (
                            <svg className="w-3.5 h-3.5 text-text-secondary/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                        )}
                        {isLast ? (
                            <span className="font-medium" style={{ color: "var(--color-text-primary)" }}>
                                {label}
                            </span>
                        ) : (
                            <button
                                type="button"
                                onClick={() => navigate(path)}
                                className="text-text-secondary hover:text-primary transition-colors cursor-pointer"
                            >
                                {label}
                            </button>
                        )}
                    </span>
                );
            })}
        </nav>
    );
};

export default Breadcrumb;
