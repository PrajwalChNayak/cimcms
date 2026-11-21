import {
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
 * ProtectedRoute component - Enhanced with comprehensive debugging
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

    // No role/permission data is stored — empty arrays always grant access
    const canAccess =
        requiredPermissions.length === 0 && requiredRoles.length === 0;

    console.log("🛡️ ProtectedRoute Check:", {
        pathname: location.pathname,
        isAuthenticated,
        userId: (user as { id?: string } | null)?.id,
        requiredPermissions,
        requiredRoles,
        canAccess,
        fallbackPath,
    });

    // Not authenticated - redirect to login
    if (!isAuthenticated) {
        console.log("🛡️ Redirecting to login: User not authenticated");
        return <Navigate to={fallbackPath} state={{ from: location }} replace />;
    }

    // Authenticated but no access - redirect to forbidden
    if (!canAccess) {
        console.log("🛡️ Redirecting to 403: User lacks required permissions/roles");
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

    console.log("🛡️ Access granted, rendering protected content");
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
        <ProtectedRoute requiredRoles={["admin"]} fallbackPath={fallbackPath}>
            {children}
        </ProtectedRoute>
    );
};
