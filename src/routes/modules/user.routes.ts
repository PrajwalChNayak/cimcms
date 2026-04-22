import UserController from '@/controllers/user.controller';
import authenticateToken from '@/middleware/auth.middleware';
import { Router } from 'express';

export default (router: Router): void => {
  router.post('/user/role', authenticateToken, UserController.createUserRole);
  router.get('/user/role', authenticateToken, UserController.getUserRoles);
  router.put('/user/role/:id', authenticateToken, UserController.updateUserRole);
  router.put('/user/role/toggle/:id', authenticateToken, UserController.toggleUserRole);

  router.post('/user/permission', authenticateToken, UserController.createPermission);
  router.get('/user/permission', authenticateToken, UserController.getPermissions);
  router.put('/user/permission/:id', authenticateToken, UserController.updatePermission);
  router.put('/user/permission/toggle/:id', authenticateToken, UserController.togglePermission);

  router.post('/user/role/permission', authenticateToken, UserController.assignPermissionToRole);

  router.delete(
    '/user/role/permission',
    authenticateToken,
    UserController.removePermissionFromRole,
  );

  router.post('/user', authenticateToken, UserController.createUser);
  router.get('/user', authenticateToken, UserController.getUsers);
  router.get('/user/:id', authenticateToken, UserController.getUserById);
  router.put('/user/:id', authenticateToken, UserController.updateUser);
  router.delete('/user/:id', authenticateToken, UserController.deleteUser);

  router.post('/user/login', UserController.login);
  router.post('/user/reset-password', UserController.resetPassword);

  router.post('/user/assign/role', authenticateToken, UserController.assignRoleToUser);
  router.delete('/user/revoke/role', authenticateToken, UserController.removeRoleFromUser);
};
