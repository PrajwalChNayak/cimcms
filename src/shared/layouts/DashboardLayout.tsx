import { useState } from "react";
import { Outlet } from "react-router-dom";

/**
 * Enhanced Dashboard Layout
 * Modern layout for authenticated users with responsive sidebar navigation
 * Features collapsible sidebar and mobile-friendly design
 */
export const DashboardLayout = () => {
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

    const toggleSidebar = () => {
        setIsSidebarCollapsed(!isSidebarCollapsed);
    };

    const toggleMobileSidebar = () => {
        setIsMobileSidebarOpen(!isMobileSidebarOpen);
    };

    const closeMobileSidebar = () => {
        setIsMobileSidebarOpen(false);
    };

    return (
        <div className="flex h-screen bg-gray-50 overflow-hidden">
            {/* ── Mobile Sidebar Overlay ── */}
            <div
                className={`fixed inset-0 z-40 md:hidden transition-opacity duration-300 ${isMobileSidebarOpen
                    ? "opacity-100 pointer-events-auto"
                    : "opacity-0 pointer-events-none"
                    }`}
            >
                {/* Backdrop */}
                <div
                    className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                    onClick={closeMobileSidebar}
                />

                {/* Drawer */}
                <div
                    className={`relative flex flex-col w-64 h-full shadow-2xl transform transition-transform duration-300 ease-in-out ${isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
                        }`}
                >
                    {/* Close button */}
                    <button
                        type="button"
                        onClick={closeMobileSidebar}
                        className="absolute top-4 -right-10 z-50 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors"
                    >
                        <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>

                    {/* <Sidebar
                        isCollapsed={false}
                        onToggle={closeMobileSidebar}
                        isMobile={true}
                    /> */}
                </div>
            </div>

            {/* ── Desktop Sidebar ── */}
            <div className="hidden md:flex shrink-0">
                {/* <Sidebar
                    isCollapsed={isSidebarCollapsed}
                    onToggle={toggleSidebar}
                    isMobile={false}
                /> */}
            </div>

            {/* Main content area */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                {/* <Header
                    onSidebarToggle={toggleSidebar}
                    onMobileSidebarToggle={toggleMobileSidebar}
                /> */}

                {/* Main content */}
                <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-4 md:p-6">
                    <div>
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
};

export default DashboardLayout;
