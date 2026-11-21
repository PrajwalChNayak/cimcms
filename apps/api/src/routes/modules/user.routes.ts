import UserController from '@/controllers/user.controller';
import authenticateToken from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/permission.middleware';
import { loginLimiter } from '@/security/limiter.security';
import { Router } from 'express';

export default (router: Router): void => {
  router.post('/user/role', authenticateToken, UserController.createUserRole);
  router.get('/user/role', authenticateToken, UserController.getUserRoles);
  router.put('/user/role/:id', authenticateToken, UserController.updateUserRole);
  router.put('/user/role/toggle/:id', authenticateToken, UserController.toggleUserRole);

  router.post('/user/permission', authenticateToken, UserController.createPermission);
  router.get('/user/permission', authenticateToken, UserController.getPermissions);
  router.put('/user/permission/:id', authenticateToken, UserController.updatePermission);
  router.put(
    '/user/permission/toggle/:id',
    authenticateToken,
    UserController.togglePermission,
  );

  router.post(
    '/user/role/permission',
    authenticateToken,
    UserController.assignPermissionToRole,
  );

  router.delete(
    '/user/role/permission',
    authenticateToken,
    UserController.removePermissionFromRole,
  );

  router.post('/user', authenticateToken, UserController.createUser);
  router.get(
    '/user',
    authenticateToken,
    requireRole('SUPER_ADMIN'),
    UserController.getUsers,
  );
  router.get(
    '/user/:id',
    authenticateToken,
    requireRole('SUPER_ADMIN'),
    UserController.getUserById,
  );
  router.put(
    '/user/:id',
    authenticateToken,
    requireRole('SUPER_ADMIN'),
    UserController.updateUser,
  );
  router.delete(
    '/user/:id',
    authenticateToken,
    requireRole('SUPER_ADMIN'),
    UserController.deleteUser,
  );

  router.post('/user/login', loginLimiter, UserController.login);
  router.post('/user/reset-password', authenticateToken, UserController.resetPassword);

  router.post(
    '/user/assign/role',
    authenticateToken,
    requireRole('SUPER_ADMIN'),
    UserController.assignRoleToUser,
  );
  router.delete(
    '/user/revoke/role',
    authenticateToken,
    requireRole('SUPER_ADMIN'),
    UserController.removeRoleFromUser,
  );
};
