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

const Dashboard = lazy(() => import("@view/home/dashboard/Dashboard.tsx"));
const Login = lazy(() => import("@view/auth/LoginPage.tsx"));
const ForbiddenScreen = lazy(() => import("@view/errors/ForbiddenScreen.tsx"));
const NotFoundScreen = lazy(() => import("@view/errors/NotFoundScreen.tsx"));
const ServerErrorScreen = lazy(() => import("@view/errors/ServerErrorScreen.tsx"));
const FarmsPage = lazy(() => import("@view/farms/FarmsPage.tsx").then((m) => ({ default: m.FarmsPage })));
const FarmDetailPage = lazy(() => import("@view/farms/FarmDetailPage.tsx").then((m) => ({ default: m.FarmDetailPage })));
const DevicesPage = lazy(() => import("@view/devices/DevicesPage.tsx").then((m) => ({ default: m.DevicesPage })));
const DeviceDetailPage = lazy(() => import("@view/devices/DeviceDetailPage.tsx").then((m) => ({ default: m.DeviceDetailPage })));
const SettingsPage = lazy(() => import("@view/settings/SettingsPage.tsx").then((m) => ({ default: m.SettingsPage })));

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
    SettingsPage,
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
export const AppRouter = () => {
    const isAuthenticated = useSelector(selectIsAuthenticated);

    return (
        <BrowserRouter>
            <ErrorBoundary>
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
            </ErrorBoundary>
        </BrowserRouter>
    );
};

export default AppRouter;
