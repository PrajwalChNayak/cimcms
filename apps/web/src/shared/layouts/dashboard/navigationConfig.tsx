import type { NavItem } from "@shared/layouts/dashboard/types";

/* ── SVG icon helpers ── */

const icon = (d: string) => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
        <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
);

const allNavigationItems: NavItem[] = [
    {
        label: "Dashboard",
        path: "/dashboard",
        icon: icon("M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1"),
    },
    {
        label: "Farms",
        path: "/farms",
        hideWhenCimcms: true,
        icon: icon("M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 004 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"),
    },
    {
        label: "Devices",
        path: "/devices",
        permissions: ["DEVICE_READ"],
        icon: icon("M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"),
    },
    {
        label: "Audit",
        path: "/audit",
        permissions: ["AUDIT_READ"],
        icon: icon("M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"),
    },
    {
        label: "MasterTypeConstant",
        path: "/master-type-constant",
        hideWhenCimcms: true,
        icon: icon("M4 6h16M4 10h16M4 14h16M4 18h16"),
    },
    {
        label: "Users",
        path: "/users",
        roles: ["ADMIN", "SUPER_ADMIN"],
        icon: icon("M15 11a3 3 0 11-6 0 3 3 0 016 0z M5 20a7 7 0 0114 0"),
    },
    {
        label: "Settings",
        path: "/settings",
        icon: icon("M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"),
    },
];

export interface NavContext {
    permissions: readonly string[];
    roles: readonly string[];
    /** VITE_FF_CIMCMS */
    cimcms: boolean;
}

/**
 * Menu entries the user may see. Only hides: the route guard and the server still enforce.
 * Same rules as ProtectedRoute: every listed permission is needed, any one listed role is enough.
 */
export const getNavigationItems = ({ permissions, roles, cimcms }: NavContext): NavItem[] =>
    allNavigationItems.filter(
        (item) =>
            !(cimcms && item.hideWhenCimcms) &&
            (item.permissions ?? []).every((p) => permissions.includes(p)) &&
            (!item.roles?.length || item.roles.some((r) => roles.includes(r))),
    );

/** Unfiltered list (kept for existing imports). */
export const navigationItems = allNavigationItems;
