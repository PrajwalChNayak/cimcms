import UserController from '../../controllers/user.controller.js';
import authenticateToken from '../../middleware/auth.middleware.js';

export default (router) => {

  router.post('/role', authenticateToken, UserController.createRole);
  router.get('/role', authenticateToken, UserController.getAllRoles);
  router.get('/role/:id', authenticateToken, UserController.getRoleById);
  router.put('/role/:id', authenticateToken, UserController.updateRole);

  router.post('/permission', authenticateToken, UserController.createPermission);
  router.get('/permission', authenticateToken, UserController.getAllPermissions);
  router.get('/permission/:id', authenticateToken, UserController.getPermissionById);
  router.put('/permission/:id', authenticateToken, UserController.updatePermission);

  router.post('/role/permission', authenticateToken, UserController.assignPermissionToRole);
  router.delete('/role/permission', authenticateToken, UserController.removePermissionFromRole);
  router.get('/role/permission/:id', authenticateToken, UserController.getRolePermissions);

  router.post('/user', authenticateToken, UserController.createUser);
  router.get('/user', authenticateToken, UserController.getAllUsers);
  router.get('/user/:id', authenticateToken, UserController.getUserById);
  router.put('/user/:id', authenticateToken, UserController.updateUser);
  router.post('/login', UserController.loginUser);

  return router;
};