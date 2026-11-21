import {
    selectAuthPermissions,
    selectAuthRoles,
    selectCurrentUser,
    selectIsAuthenticated,
} from "@store/slices/authSlice.ts";
import type { ReactNode } from "react";
import { useSelector } from "react-redux";
import { Navigate, useLocation } from "react-router-dom";

interface ProtectedRouteProps {
    children: ReactNode;
    requiredPermissions?: string[];
    requiredRoles?: string[];
    fallbackPath?: string;
}

/**
 * ProtectedRoute: requires a signed-in user and enforces route permissions/roles
 */
export const ProtectedRoute = ({
    children,
    requiredPermissions = [],
    requiredRoles = [],
    fallbackPath = "/login",
}: ProtectedRouteProps) => {
    const location = useLocation();
    const isAuthenticated = useSelector(selectIsAuthenticated);
    const user = useSelector(selectCurrentUser);

    const userPermissions = useSelector(selectAuthPermissions) ?? [];
    const userRoles = useSelector(selectAuthRoles) ?? [];

    // Enforced from the signed-in user (CurrentUserDto). Every listed permission
    // is required; any one of the listed roles is enough. Server still enforces.
    const canAccess =
        requiredPermissions.every((p) => userPermissions.includes(p)) &&
        (requiredRoles.length === 0 ||
            requiredRoles.some((r) => userRoles.includes(r)));

    // Not authenticated - redirect to login
    if (!isAuthenticated) {
        return <Navigate to={fallbackPath} state={{ from: location }} replace />;
    }

    // Authenticated but no access - redirect to forbidden
    if (!canAccess) {
        return (
            <Navigate
                to="/403"
                state={{
                    from: location,
                    reason: "Insufficient permissions",
                    required: { permissions: requiredPermissions, roles: requiredRoles },
                    user: { id: (user as { id?: string } | null)?.id },
                }}
                replace
            />
        );
    }

    // Authenticated and has access - render children
    return <>{children}</>;
};

interface RoleBasedRouteProps {
    children: ReactNode;
    allowedRoles?: string[];
    fallbackPath?: string;
}

/**
 * RoleBasedRoute component - Simplified role-based protection
 */
export const RoleBasedRoute = ({
    children,
    allowedRoles = [],
    fallbackPath = "/403",
}: RoleBasedRouteProps) => {
    return (
        <ProtectedRoute requiredRoles={allowedRoles} fallbackPath={fallbackPath}>
            {children}
        </ProtectedRoute>
    );
};

interface PermissionBasedRouteProps {
    children: ReactNode;
    requiredPermissions?: string[];
    fallbackPath?: string;
}

/**
 * PermissionBasedRoute component - Simplified permission-based protection
 */
export const PermissionBasedRoute = ({
    children,
    requiredPermissions = [],
    fallbackPath = "/403",
}: PermissionBasedRouteProps) => {
    return (
        <ProtectedRoute
            requiredPermissions={requiredPermissions}
            fallbackPath={fallbackPath}
        >
            {children}
        </ProtectedRoute>
    );
};

interface AdminRouteProps {
    children: ReactNode;
    fallbackPath?: string;
}

/**
 * AdminRoute component - Shortcut for admin-only routes
 */
export const AdminRoute = ({ children, fallbackPath = "/403" }: AdminRouteProps) => {
    return (
        <ProtectedRoute requiredRoles={["ADMIN", "SUPER_ADMIN"]} fallbackPath={fallbackPath}>
            {children}
        </ProtectedRoute>
    );
};
