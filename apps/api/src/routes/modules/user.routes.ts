import UserController from '@/controllers/user.controller';
import authenticateToken from '@/middleware/auth.middleware';
import requireAppOrigin from '@/middleware/origin.middleware';
import { requirePermission, requireRole } from '@/middleware/permission.middleware';
import { validate } from '@/middleware/validate.middleware';
import { loginIpLimiter, loginLimiter } from '@/security/limiter.security';
import { idSchema } from '@cimcms/contracts';
import { Router } from 'express';
import { z } from 'zod';

const PASSWORD_MIN = 12;

const loginBody = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(256),
});

const createUserBody = z.object({
  email: z.email().max(254),
  password: z.string().min(PASSWORD_MIN).max(256),
  name: z.string().trim().min(1).max(120),
  roles: z.array(idSchema).max(10).optional(),
});

const resetPasswordBody = z.object({
  email: z.email().max(254),
  newPassword: z.string().min(PASSWORD_MIN).max(256),
});

/**
 * Role and permission structure is SUPER_ADMIN only: an ADMIN changing what a role
 * grants could raise their own or anyone's privileges. Reads need ROLE_READ /
 * PERMISSION_READ. User management needs the USER_* permissions.
 */
export default (router: Router): void => {
  // Registered before /user/:id so "me" and "token" are not read as ids.
  router.post('/user/token/refresh', requireAppOrigin, UserController.refresh);
  router.post('/user/token/logout', requireAppOrigin, UserController.logout);
  router.get('/user/me', authenticateToken, UserController.me);

  const superAdmin = [authenticateToken, requireRole('SUPER_ADMIN')];

  router.post('/user/role', ...superAdmin, UserController.createUserRole);
  router.get('/user/role', authenticateToken, requirePermission('ROLE_READ'), UserController.getUserRoles);
  router.put('/user/role/toggle/:id', ...superAdmin, UserController.toggleUserRole);
  router.put('/user/role/:id', ...superAdmin, UserController.updateUserRole);

  router.post('/user/permission', ...superAdmin, UserController.createPermission);
  router.get(
    '/user/permission',
    authenticateToken,
    requirePermission('PERMISSION_READ'),
    UserController.getPermissions,
  );
  router.put('/user/permission/toggle/:id', ...superAdmin, UserController.togglePermission);
  router.put('/user/permission/:id', ...superAdmin, UserController.updatePermission);

  router.post('/user/role/permission', ...superAdmin, UserController.assignPermissionToRole);
  router.delete('/user/role/permission', ...superAdmin, UserController.removePermissionFromRole);

  router.post(
    '/user',
    authenticateToken,
    requirePermission('USER_CREATE'),
    validate({ body: createUserBody }),
    UserController.createUser,
  );
  router.get('/user', authenticateToken, requireRole('SUPER_ADMIN'), UserController.getUsers);
  router.get('/user/:id', authenticateToken, requireRole('SUPER_ADMIN'), UserController.getUserById);
  router.put('/user/:id', authenticateToken, requireRole('SUPER_ADMIN'), UserController.updateUser);
  router.delete('/user/:id', authenticateToken, requireRole('SUPER_ADMIN'), UserController.deleteUser);

  router.post(
    '/user/login',
    loginIpLimiter,
    loginLimiter,
    validate({ body: loginBody }),
    UserController.login,
  );
  router.post(
    '/user/reset-password',
    authenticateToken,
    requirePermission('USER_UPDATE'),
    validate({ body: resetPasswordBody }),
    UserController.resetPassword,
  );

  router.post('/user/assign/role', ...superAdmin, UserController.assignRoleToUser);
  router.delete('/user/revoke/role', ...superAdmin, UserController.removeRoleFromUser);
};
