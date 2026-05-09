import { NotificationBell } from "@shared/components/ui/NotificationBell";
import Breadcrumb from "@shared/layouts/dashboard/Breadcrumb";
import { useRef, useState } from "react";

/* ── Icon components ── */

const MenuIcon = () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
);

const SearchIcon = () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Header — top bar of the dashboard
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

interface HeaderProps {
    onSidebarToggle: () => void;
    onMobileSidebarToggle: () => void;
}

const Header: React.FC<HeaderProps> = ({ onSidebarToggle, onMobileSidebarToggle }) => {
    const [searchFocused, setSearchFocused] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);

    return (
        <header
            className="shrink-0 h-16 flex items-center justify-between gap-4 border-b border-border bg-surface px-4 md:px-6"
            style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
        >
            {/* Left section */}
            <div className="flex items-center gap-3 min-w-0">
                {/* Mobile menu toggle */}
                <button
                    type="button"
                    onClick={onMobileSidebarToggle}
                    className="md:hidden shrink-0 flex items-center justify-center w-9 h-9 rounded-btn text-text-secondary hover:bg-primary/5 hover:text-text-primary transition-colors cursor-pointer"
                >
                    <MenuIcon />
                </button>

                {/* Desktop sidebar toggle */}
                <button
                    type="button"
                    onClick={onSidebarToggle}
                    className="hidden md:flex shrink-0 items-center justify-center w-9 h-9 rounded-btn text-text-secondary hover:bg-primary/5 hover:text-text-primary transition-colors cursor-pointer"
                >
                    <MenuIcon />
                </button>

                {/* Breadcrumb */}
                <div className="hidden sm:block min-w-0">
                    <Breadcrumb />
                </div>
            </div>

            {/* Right section */}
            <div className="flex items-center gap-2">
                {/* Search */}
                <div
                    className={`
            hidden sm:flex items-center gap-2 rounded-btn border px-3 py-1.5
            transition-all duration-200
            ${searchFocused
                            ? "border-primary ring-2 ring-primary/20 w-56"
                            : "border-border w-44 hover:border-text-secondary/30"
                        }
          `}
                >
                    <SearchIcon />
                    <input
                        type="text"
                        placeholder="Search…"
                        className="w-full bg-transparent text-sm text-text-primary placeholder-text-secondary outline-none"
                        onFocus={() => setSearchFocused(true)}
                        onBlur={() => setSearchFocused(false)}
                    />
                </div>

                {/* Mobile search icon */}
                <button
                    type="button"
                    className="sm:hidden flex items-center justify-center w-9 h-9 rounded-btn text-text-secondary hover:bg-primary/5 hover:text-text-primary transition-colors cursor-pointer"
                >
                    <SearchIcon />
                </button>

                {/* Notifications */}
                <NotificationBell />

                {/* Profile */}
                <div className="relative" ref={profileRef}>
                    <button
                        type="button"
                        onClick={() => setProfileOpen((v) => !v)}
                        className="flex items-center gap-2 rounded-btn p-1 pr-2 hover:bg-primary/5 transition-colors cursor-pointer"
                    >
                        <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-text-inverted"
                            style={{ background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))" }}
                        >
                            AD
                        </div>
                        <svg
                            className={`hidden sm:block w-3.5 h-3.5 text-text-secondary transition-transform duration-200 ${profileOpen ? "rotate-180" : ""}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                    </button>

                    {/* Dropdown */}
                    {profileOpen && (
                        <>
                            {/* Invisible backdrop to close */}
                            <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                            <div
                                className="absolute right-0 top-full mt-2 z-50 w-56 rounded-card bg-surface border border-border py-1"
                                style={{ boxShadow: "0 8px 30px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)" }}
                            >
                                {/* User info */}
                                <div className="px-4 py-3 border-b border-border">
                                    <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Admin User</p>
                                    <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>admin@cultivo.io</p>
                                </div>

                                <div className="py-1">
                                    {(["Profile", "Account Settings", "Help & Support"] as const).map((item) => (
                                        <button
                                            key={item}
                                            type="button"
                                            onClick={() => setProfileOpen(false)}
                                            className="w-full text-left px-4 py-2 text-sm text-text-secondary hover:bg-primary/5 hover:text-text-primary transition-colors cursor-pointer"
                                        >
                                            {item}
                                        </button>
                                    ))}
                                </div>

                                <div className="border-t border-border py-1">
                                    <button
                                        type="button"
                                        onClick={() => setProfileOpen(false)}
                                        className="w-full text-left px-4 py-2 text-sm text-error hover:bg-error/8 transition-colors cursor-pointer"
                                    >
                                        Sign out
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
};

export default Header;
