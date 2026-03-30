import type { ReactNode } from "react";
import { useSelector } from "react-redux";
import { Navigate } from "react-router-dom";

interface AuthState {
    roles: string[];
    permissions: string[];
}

interface RootState {
    auth: AuthState;
}

interface RoleGuardProps {
    children: ReactNode;
    allowedRoles?: string[];
    allowedPermissions?: string[];
    requireAll?: boolean;
    fallback?: ReactNode;
    redirectTo?: string;
}

/**
 * Role-based Guard Component
 * Provides fine-grained access control based on roles and permissions
 */
const RoleGuard = ({
    children,
    allowedRoles = [],
    allowedPermissions = [],
    requireAll = false,
    fallback = null,
    redirectTo = "/unauthorized",
}: RoleGuardProps) => {
    const userRoles = useSelector((state: RootState) => state.auth.roles);
    const userPermissions = useSelector(
        (state: RootState) => state.auth.permissions,
    );

    // Check role access
    let hasRoleAccess = true;
    if (allowedRoles.length > 0) {
        if (requireAll) {
            hasRoleAccess = allowedRoles.every((role) => userRoles.includes(role));
        } else {
            hasRoleAccess = allowedRoles.some((role) => userRoles.includes(role));
        }
    }

    // Check permission access
    let hasPermissionAccess = true;
    if (allowedPermissions.length > 0) {
        if (requireAll) {
            hasPermissionAccess = allowedPermissions.every((permission) =>
                userPermissions.includes(permission),
            );
        } else {
            hasPermissionAccess = allowedPermissions.some((permission) =>
                userPermissions.includes(permission),
            );
        }
    }

    // Grant access if user has either role OR permission access
    // (unless requireAll is true, then they need both)
    const hasAccess = requireAll
        ? hasRoleAccess && hasPermissionAccess
        : hasRoleAccess || hasPermissionAccess;

    if (!hasAccess) {
        return fallback ?? <Navigate to={redirectTo} replace />;
    }

    return <>{children}</>;
};

export default RoleGuard;
