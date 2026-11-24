import type { NextFunction, Request, Response } from 'express';

// ─── requirePermission ────────────────────────────────────────────────────────
/**
 * Factory guard — pass one or more permission names.
 * User must have ALL of them.
 *
 * @example
 * router.get('/farm', authenticateToken, loadUserPermissions, requirePermission('READ_FARM'), ...)
 */
/** Staff access tokens carry `typ: 'access'`. Consumer tokens (no typ) never pass a role/permission guard. */
const isStaffToken = (req: Request): boolean =>
  (req.subject as { typ?: unknown } | undefined)?.typ === 'access';

export function requirePermission(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userPerms = isStaffToken(req) && Array.isArray(req.subject?.permissions) ? req.subject.permissions : [];
    const missing = permissions.filter((p) => !userPerms.includes(p));
    if (missing.length > 0) {
      res.status(403).json({
        success: false,
        errorCode: 'FORBIDDEN',
      message: 'Forbidden: missing permission(s)',
        missing,
      });
      return;
    }
    next();
  };
}

// ─── requireRole ─────────────────────────────────────────────────────────────
/**
 * Factory guard — pass one or more role names.
 * User must have AT LEAST ONE of them.
 *
 * @example
 * router.delete('/farm/:id', authenticateToken, loadUserPermissions, requireRole('ADMIN', 'SUPER_ADMIN'), ...)
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userRoles = isStaffToken(req) && Array.isArray(req.subject?.roles) ? req.subject.roles : [];
    const hasRole = roles.some((r) => userRoles.includes(r));
    if (!hasRole) {
      res.status(403).json({
        success: false,
        errorCode: 'FORBIDDEN',
        message: 'Forbidden: insufficient role',
        required: roles,
      });
      return;
    }
    next();
  };
}
