import type { JSX } from "react";
import { Suspense, lazy } from "react";
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
import { LoadingSpinner } from "@shared/components/loading/index.ts";

// Route configuration
import ForbiddenScreen from '@/view/errors/ForbiddenScreen';
import NotFoundScreen from "@/view/errors/NotFoundScreen";
import ServerErrorScreen from "@/view/errors/ServerErrorScreen";
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
const Login = lazy(() => import("@view/auth/LoginPage.tsx"));

// Component mapping
const componentMap: Record<string, React.LazyExoticComponent<() => JSX.Element>> = {
    Login,
    ForbiddenScreen,
    NotFoundScreen,
    ServerErrorScreen
};

/**
 * Get component by name
 */
const getComponent = (componentName: string): (() => JSX.Element) => {
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

    const routeElement = (
        <Suspense fallback={<LoadingSpinner />}>
            <Component />
        </Suspense>
    );

    if (isProtected) {
        return (
            <ProtectedRoute
                requiredPermissions={route.permissions ?? []}
                requiredRoles={route.roles ?? []}
            >
                {routeElement}
            </ProtectedRoute>
        );
    }

    return <PublicRoute>{routeElement}</PublicRoute>;
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
