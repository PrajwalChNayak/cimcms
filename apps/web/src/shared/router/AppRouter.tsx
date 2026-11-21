import { ENV } from "@config/env";
import type { JSX } from "react";
import { lazy } from "react";
import { useSelector } from "react-redux";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

// Route components
import { ProtectedRoute } from "@shared/router/ProtectedRoute.tsx";
import { PublicRoute } from "@shared/router/PublicRoute.tsx";

// Layouts
import { AuthLayout } from "@shared/layouts/AuthLayout.tsx";
import { DashboardLayout } from "@shared/layouts/DashboardLayout.tsx";
import { PublicLayout } from "@shared/layouts/PublicLayout.tsx";

// Loading component

// Route configuration

import type { RouteConfig } from "@shared/router/routes.ts";
import {
    errorRoutes,
    protectedRoutes,
    publicRoutes,
    redirects,
} from "@shared/router/routes.ts";
import ErrorBoundary from "@shared/utils/ErrorBoundary";
import { selectIsAuthenticated } from "@store/slices/authSlice.ts";

// Lazy load only dashboard and new request related components

const LegacyDashboard = lazy(() => import("@view/home/dashboard/Dashboard.tsx"));
const CimcmsDashboard = lazy(() => import("@view/home/dashboard/CimcmsDashboard.tsx"));
// Feature flag VITE_FF_CIMCMS: CIMCMS dashboard when true, the old farm/consumer one when false.
const Dashboard = ENV.FF_CIMCMS ? CimcmsDashboard : LegacyDashboard;
const Login = lazy(() => import("@view/auth/LoginPage.tsx"));
const ForbiddenScreen = lazy(() => import("@view/errors/ForbiddenScreen.tsx"));
const NotFoundScreen = lazy(() => import("@view/errors/NotFoundScreen.tsx"));
const ServerErrorScreen = lazy(() => import("@view/errors/ServerErrorScreen.tsx"));
const FarmsPage = lazy(() => import("@view/farms/FarmsPage.tsx").then((m) => ({ default: m.FarmsPage })));
const FarmDetailPage = lazy(() => import("@view/farms/FarmDetailPage.tsx").then((m) => ({ default: m.FarmDetailPage })));
const DevicesPage = lazy(() => import("@view/devices/DevicesPage.tsx").then((m) => ({ default: m.DevicesPage })));
const DeviceDetailPage = lazy(() => import("@view/devices/DeviceDetailPage.tsx").then((m) => ({ default: m.DeviceDetailPage })));
const LedControlPage = lazy(() => import("@view/devices/LedControlPage.tsx").then((m) => ({ default: m.LedControlPage })));
const DeviceCommandsPage = lazy(() => import("@view/history/DeviceCommandsPage.tsx").then((m) => ({ default: m.DeviceCommandsPage })));
const DeviceEventsPage = lazy(() => import("@view/history/DeviceEventsPage.tsx").then((m) => ({ default: m.DeviceEventsPage })));
const ReportsPage = lazy(() => import("@view/reports/ReportsPage.tsx").then((m) => ({ default: m.ReportsPage })));
const AuditPage = lazy(() => import("@view/history/AuditPage.tsx").then((m) => ({ default: m.AuditPage })));
const RoomsPage = lazy(() => import("@view/rooms/RoomsPage.tsx").then((m) => ({ default: m.RoomsPage })));
const RoomDetailPage = lazy(() => import("@view/rooms/RoomDetailPage.tsx").then((m) => ({ default: m.RoomDetailPage })));
const ModePage = lazy(() => import("@view/devices/ModePage.tsx").then((m) => ({ default: m.ModePage })));
const SystemPage = lazy(() => import("@view/system/SystemPage.tsx").then((m) => ({ default: m.SystemPage })));
const SchedulesPage = lazy(() => import("@view/schedules/SchedulesPage.tsx").then((m) => ({ default: m.SchedulesPage })));
const SchedulePage = lazy(() => import("@view/schedules/SchedulePage.tsx").then((m) => ({ default: m.SchedulePage })));
const ExperimentsPage = lazy(() => import("@view/experiments/ExperimentsPage.tsx").then((m) => ({ default: m.ExperimentsPage })));
const ExperimentPage = lazy(() => import("@view/experiments/ExperimentPage.tsx").then((m) => ({ default: m.ExperimentPage })));
const SettingsPage = lazy(() => import("@view/settings/SettingsPage.tsx").then((m) => ({ default: m.SettingsPage })));
const MasterTypeConstantPage = lazy(() => import("@/view/master/MasterTypeConstantPage").then((m) => ({ default: m.MasterTypeConstantPage })));
const UsersManagementPage = lazy(() => import("@/view/master/UsersManagementPage").then((m) => ({ default: m.UsersManagementPage })));

// Component mapping
const componentMap: Record<string, React.LazyExoticComponent<React.FC>> = {
    Login,
    Dashboard,
    ForbiddenScreen,
    NotFoundScreen,
    ServerErrorScreen,
    FarmsPage,
    FarmDetailPage,
    DevicesPage,
    DeviceDetailPage,
    LedControlPage,
    DeviceCommandsPage,
    DeviceEventsPage,
    AuditPage,
    ReportsPage,
    RoomsPage,
    RoomDetailPage,
    ModePage,
    SystemPage,
    SchedulesPage,
    SchedulePage,
    ExperimentsPage,
    ExperimentPage,
    SettingsPage,
    MasterTypeConstantPage,
    UsersManagementPage,
};

/**
 * Get component by name
 */
const getComponent = (componentName: string): (React.FC) => {
    const Component = componentMap[componentName];
    if (!Component) {
        console.error(`Component "${componentName}" not found in componentMap`);
        return () => <div>Component &quot;{componentName}&quot; not found</div>;
    }
    return Component;
};

/**
 * Render route with protection
 */
const renderRoute = (route: RouteConfig, isProtected = false): JSX.Element => {
    const Component = getComponent(route.element);

    // const routeElement = (
    //     <Suspense fallback={<SplashScreen />}>
    //         <Component />
    //     </Suspense>
    // );

    if (isProtected) {
        return (
            <ProtectedRoute
                requiredPermissions={route.permissions ?? []}
                requiredRoles={route.roles ?? []}
            >
                <Component />
            </ProtectedRoute>
        );
    }

    return <PublicRoute> <Component /></PublicRoute>;
};

/**
 * Main App Router
 */
/** The route table only (no router): lets tests render it inside a MemoryRouter. */
export const AppRoutes = () => {
    const isAuthenticated = useSelector(selectIsAuthenticated);

    return (
        <>
                <Routes>
                    {/* Default redirect */}
                    <Route
                        path="/"
                        element={
                            <Navigate
                                to={isAuthenticated ? redirects.afterLogin : redirects.default}
                                replace
                            />
                        }
                    />

                    {/* Auth routes with AuthLayout */}
                    <Route element={<AuthLayout />}>
                        {publicRoutes
                            .filter((route) => route.layout === "AuthLayout")
                            .map((route) => (
                                <Route
                                    key={route.path}
                                    path={
                                        route.path.startsWith("/")
                                            ? route.path.substring(1)
                                            : route.path
                                    }
                                    element={renderRoute(route, false)}
                                />
                            ))}
                    </Route>

                    {/* Protected routes with DashboardLayout */}
                    <Route element={<DashboardLayout />}>
                        {protectedRoutes
                            .filter((route) => route.layout === "DashboardLayout")
                            .map((route) => (
                                <Route
                                    key={route.path}
                                    path={
                                        route.path.startsWith("/")
                                            ? route.path.substring(1)
                                            : route.path
                                    }
                                    element={renderRoute(route, true)}
                                />
                            ))}
                    </Route>

                    {/* Public routes with PublicLayout */}
                    <Route element={<PublicLayout />}>
                        {publicRoutes
                            .filter(
                                (route) => route.layout === "PublicLayout" || !route.layout,
                            )
                            .map((route) => (
                                <Route
                                    key={route.path}
                                    path={
                                        route.path.startsWith("/")
                                            ? route.path.substring(1)
                                            : route.path
                                    }
                                    element={renderRoute(route, false)}
                                />
                            ))}
                    </Route>

                    {/* Error routes */}
                    <Route element={<PublicLayout />}>
                        {errorRoutes.map((route) => (
                            <Route
                                key={route.path}
                                path={
                                    route.path.startsWith("/")
                                        ? route.path.substring(1)
                                        : route.path
                                }
                                element={renderRoute(route, false)}
                            />
                        ))}
                    </Route>

                    {/* Catch all - redirect to 404 */}
                    <Route path="*" element={<Navigate to="/404" replace />} />
                </Routes>
        </>
    );
};

export const AppRouter = () => (
    <BrowserRouter>
        <ErrorBoundary>
            <AppRoutes />
        </ErrorBoundary>
    </BrowserRouter>
);

export default AppRouter;
