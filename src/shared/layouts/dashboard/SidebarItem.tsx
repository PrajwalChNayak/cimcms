import type { NavItem } from "@shared/layouts/dashboard/types";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/* ── Chevron icon for submenu toggle ── */
const ChevronIcon = ({ open }: { open: boolean }) => (
    <svg
        className={`w-4 h-4 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="2"
    >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
);

/* ── Tooltip for collapsed mode ── */
const Tooltip = ({ label, visible }: { label: string; visible: boolean }) => {
    if (!visible) return null;
    return (
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50 pointer-events-none">
            <div
                className="whitespace-nowrap rounded-btn px-2.5 py-1 text-xs font-medium text-text-inverted"
                style={{ backgroundColor: "var(--color-secondary)" }}
            >
                {label}
            </div>
        </div>
    );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SidebarItem — a single nav entry
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

interface SidebarItemProps {
    item: NavItem;
    isCollapsed: boolean;
    onNavigate?: () => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ item, isCollapsed, onNavigate }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const hasChildren = !!item.children?.length;

    const isActive = item.path
        ? location.pathname === item.path
        : item.children?.some((c) => location.pathname === c.path) ?? false;

    const isChildActive = (path: string) => location.pathname === path;

    // Auto-open submenu if a child is active
    const [open, setOpen] = useState(isActive && hasChildren);
    const [hovering, setHovering] = useState(false);

    // Submenu height animation
    const submenuRef = useRef<HTMLDivElement>(null);
    const [submenuHeight, setSubmenuHeight] = useState(0);

    useEffect(() => {
        if (submenuRef.current) {
            setSubmenuHeight(open ? submenuRef.current.scrollHeight : 0);
        }
    }, [open]);

    // Expand submenu when child becomes active via navigation
    useEffect(() => {
        if (hasChildren && item.children?.some((c) => location.pathname === c.path)) {
            setOpen(true);
        }
    }, [location.pathname, hasChildren, item.children]);

    const handleClick = () => {
        if (hasChildren) {
            if (isCollapsed) return; // tooltip-only in collapsed mode
            setOpen((v) => !v);
        } else if (item.path) {
            navigate(item.path);
            onNavigate?.();
        }
    };

    return (
        <div
            className="relative"
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
        >
            {/* Main row */}
            <button
                type="button"
                onClick={handleClick}
                className={`
          group relative flex w-full items-center gap-3 rounded-btn px-3 py-2.5
          text-sm font-medium transition-all duration-200 cursor-pointer
          ${isActive
                        ? "bg-primary/15 text-primary"
                        : "text-text-secondary hover:bg-primary/5 hover:text-text-primary"
                    }
        `}
            >
                {/* Active indicator bar */}
                {isActive && (
                    <span
                        className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-0.75 rounded-r-full bg-primary"
                    />
                )}

                {/* Icon */}
                <span className={`shrink-0 ${isActive ? "text-primary" : "text-text-secondary group-hover:text-primary"}`}>
                    {item.icon}
                </span>

                {/* Label (hidden in collapsed) */}
                {!isCollapsed && (
                    <>
                        <span className="flex-1 text-left truncate">{item.label}</span>
                        {hasChildren && <ChevronIcon open={open} />}
                    </>
                )}
            </button>

            {/* Tooltip in collapsed mode */}
            {isCollapsed && <Tooltip label={item.label} visible={hovering} />}

            {/* Submenu */}
            {hasChildren && !isCollapsed && (
                <div
                    className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
                    style={{ maxHeight: submenuHeight }}
                >
                    <div ref={submenuRef} className="ml-5 mt-1 flex flex-col gap-0.5 border-l border-border pl-3">
                        {item.children!.map((child) => (
                            <button
                                key={child.path}
                                type="button"
                                onClick={() => {
                                    navigate(child.path);
                                    onNavigate?.();
                                }}
                                className={`
                  flex items-center rounded-btn px-3 py-2 text-[13px] transition-colors duration-150 cursor-pointer
                  ${isChildActive(child.path)
                                        ? "font-semibold text-primary bg-primary/10"
                                        : "text-text-secondary hover:text-text-primary hover:bg-primary/5"
                                    }
                `}
                            >
                                {child.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SidebarItem;
