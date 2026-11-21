import { useAppSelector } from "@store/hooks";
import { selectAuthPermissions, selectAuthRoles } from "@store/slices/authSlice";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

interface RoleGuardProps {
  children: ReactNode;
  allowedRoles?: string[];
  allowedPermissions?: string[];
  requireAll?: boolean;
  fallback?: ReactNode;
  redirectTo?: string;
}

/**
 * Role/permission guard. Reads `state.auth.user.roles / permissions`
 * (CurrentUserDto). The UI only hides things: the server always enforces.
 */
const RoleGuard = ({
  children,
  allowedRoles = [],
  allowedPermissions = [],
  requireAll = false,
  fallback = null,
  redirectTo = "/403",
}: RoleGuardProps) => {
  const userRoles = useAppSelector(selectAuthRoles) ?? [];
  const userPermissions = useAppSelector(selectAuthPermissions) ?? [];

  const check = (needed: string[], have: string[]) =>
    needed.length === 0 ||
    (requireAll
      ? needed.every((n) => have.includes(n))
      : needed.some((n) => have.includes(n)));

  const hasRoleAccess = check(allowedRoles, userRoles);
  const hasPermissionAccess = check(allowedPermissions, userPermissions);

  // Default: either a matching role OR a matching permission grants access
  // (only a constraint that was actually given counts). requireAll: both.
  const constrained = allowedRoles.length > 0 || allowedPermissions.length > 0;
  const hasAccess = !constrained
    ? true
    : requireAll
      ? hasRoleAccess && hasPermissionAccess
      : (allowedRoles.length > 0 && hasRoleAccess) ||
        (allowedPermissions.length > 0 && hasPermissionAccess);

  if (!hasAccess) {
    return fallback ?? <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
};

export default RoleGuard;
