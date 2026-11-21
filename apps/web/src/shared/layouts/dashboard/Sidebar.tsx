import { ENV } from "@config/env";
import { getNavigationItems } from "@shared/layouts/dashboard/navigationConfig";
import SidebarItem from "@shared/layouts/dashboard/SidebarItem";
import { useAppSelector } from "@store/hooks";
import { logout, selectAuthPermissions, selectAuthRoles } from "@store/slices/authSlice";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";

/* ── Leaf + Circuit Logo (same as Splash Screen) ── */
const AppLogo = () => (
    <svg className="w-9 h-9" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M32 6C18 14 10 28 10 42c0 2 .5 4 1.5 5.5C14 52 22 54 32 54s18-2 20.5-6.5c1-1.5 1.5-3.5 1.5-5.5C54 28 46 14 32 6z" fill="var(--color-primary)" opacity="0.85" />
        <path d="M32 14v34" stroke="var(--color-surface)" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
        <path d="M32 22l-8 8M32 22l8 8M32 32l-10 6M32 32l10 6" stroke="var(--color-surface)" strokeWidth="1.5" strokeLinecap="round" opacity="0.45" />
        <circle cx="24" cy="30" r="2" fill="var(--color-primary-light)" />
        <circle cx="40" cy="30" r="2" fill="var(--color-primary-light)" />
        <path d="M24 30h-4M40 30h4" stroke="var(--color-primary-light)" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
    </svg>
);

/* ── Collapse / Expand toggle icon ── */
const CollapseIcon = ({ collapsed }: { collapsed: boolean }) => (
    <svg
        className={`w-4 h-4 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="2"
    >
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
);

/* ── Logout icon ── */
const LogoutIcon = () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
    </svg>
);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Sidebar — full navigation component
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

interface SidebarProps {
    isCollapsed: boolean;
    onToggle: () => void;
    onNavigate?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isCollapsed, onToggle, onNavigate }) => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const permissions = useAppSelector(selectAuthPermissions);
    const roles = useAppSelector(selectAuthRoles);
    const navigationItems = getNavigationItems({
        permissions: permissions ?? [],
        roles: roles ?? [],
        cimcms: ENV.FF_CIMCMS,
    });

    const handleLogout = () => {
        dispatch(logout());
        navigate("/login", { replace: true });
    };

    return (
        <aside
            className={`
        flex flex-col h-full bg-surface border-r border-border
        transition-[width] duration-300 ease-in-out
        ${isCollapsed ? "w-18" : "w-64"}
      `}
        >
            {/* ── Logo area ── */}
            <div
                className={`
          flex items-center shrink-0 h-16 border-b border-border px-4
          ${isCollapsed ? "justify-center" : "gap-3"}
        `}
            >
                <AppLogo />
                {!isCollapsed && (
                    <h1 className="text-lg font-bold tracking-tight" style={{ color: "var(--color-text-primary)" }}>
                        Cultivo
                        <span className="ml-0.5 font-light" style={{ color: "var(--color-secondary)" }}>IoT</span>
                    </h1>
                )}
            </div>

            {/* ── Navigation items ── */}
            <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
                <div className="flex flex-col gap-1">
                    {navigationItems.map((item) => (
                        <SidebarItem
                            key={item.label}
                            item={item}
                            isCollapsed={isCollapsed}
                            onNavigate={onNavigate}
                        />
                    ))}
                </div>
            </nav>

            {/* ── Bottom area (collapse toggle + logout) ── */}
            <div className="shrink-0 border-t border-border px-3 py-3 flex flex-col gap-1">
                {/* Logout */}
                <button
                    type="button"
                    onClick={handleLogout}
                    className={`
            group flex w-full items-center gap-3 rounded-btn px-3 py-2.5
            text-sm font-medium text-text-secondary
            hover:bg-error/8 hover:text-error transition-colors duration-200 cursor-pointer
            ${isCollapsed ? "justify-center" : ""}
          `}
                >
                    <LogoutIcon />
                    {!isCollapsed && <span>Logout</span>}
                </button>

                {/* Collapse toggle (desktop only) */}
                <button
                    type="button"
                    onClick={onToggle}
                    className={`
            hidden md:flex w-full items-center gap-3 rounded-btn px-3 py-2
            text-xs font-medium text-text-secondary
            hover:bg-primary/5 hover:text-text-primary transition-colors duration-200 cursor-pointer
            ${isCollapsed ? "justify-center" : ""}
          `}
                >
                    <CollapseIcon collapsed={isCollapsed} />
                    {!isCollapsed && <span>Collapse</span>}
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
