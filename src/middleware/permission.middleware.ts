import type { NextFunction, Request, Response } from 'express';



// ─── requirePermission ────────────────────────────────────────────────────────
/**
 * Factory guard — pass one or more permission names.
 * User must have ALL of them.
 *
 * @example
 * router.get('/farm', authenticateToken, loadUserPermissions, requirePermission('READ_FARM'), ...)
 */
export function requirePermission(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userPerms = req.subject?.permissions ?? [];
    const missing = permissions.filter((p) => !userPerms.includes(p));
    if (missing.length > 0) {
      res.status(403).json({
        success: false,
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
    const userRoles = req.subject?.roles ?? [];
    const hasRole = roles.some((r) => userRoles.includes(r));
    if (!hasRole) {
      res.status(403).json({
        success: false,
        message: 'Forbidden: insufficient role',
        required: roles,
      });
      return;
    }
    next();
  };
}
