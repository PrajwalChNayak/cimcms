import UserService from '../services/user.service.js';
import { handleDataCreation, handleDataRetrieval, handleSuccess } from '../utils/responsehandler/index.utils.js';

class UserController {
  //#Role 
  static async createRole(req, res) {
    const role = await UserService.createRole(req.body);
    return handleDataCreation(res, role);
  }

  static async getAllRoles(req, res) {
    const role = await UserService.getAllRoles();
    return handleDataRetrieval(res, role);
  }

  static async getRoleById(req, res) {
    const role = await UserService.getRoleById(req.params.id);
    return handleDataRetrieval(res, role);
  }

  static async updateRole(req, res) {
    const role = await UserService.updateRole(req.params.id, req.body);
    return handleSuccess(res, role, "Role updated successfully");
  }
  //#Permission

  static async createPermission(req, res) {
    const permission = await UserService.createPermission(req.body);
    return handleDataCreation(res, permission);
  }

  static async getAllPermissions(req, res) {
    const permission = await UserService.getAllPermissions();
    return handleDataRetrieval(res, permission);
  }

  static async getPermissionById(req, res) {
    const permission = await UserService.getPermissionById(req.params.id);
    return handleDataRetrieval(res, permission);
  }

  static async updatePermission(req, res) {
    const permission = await UserService.updatePermission(req.params.id, req.body);
    return handleSuccess(res, permission);
  }

  //#RolePermission
  static async assignPermissionToRole(req, res) {
    const rolePermission = await UserService.assignPermissionToRole(req.body);
    return handleDataCreation(res, rolePermission);
  }

  static async removePermissionFromRole(req, res) {
    const rolePermission = await UserService.removePermissionFromRole(req.body);
    return handleSuccess(res, rolePermission);
  }

  static async getRolePermissions(req, res) {
    const rolePermissions = await UserService.getRolePermissions(req.params.id);
    return handleDataRetrieval(res, rolePermissions);
  }

  static async createUser(req, res) {
    const user = await UserService.createUser(req.body);
    return handleDataCreation(res, user);
  }

  static async getAllUsers(req, res) {
    const users = await UserService.getAllUsers();
    return handleDataRetrieval(res, users);
  }

  static async getUserById(req, res) {
    const user = await UserService.getUserById(req.params.id);
    return handleDataRetrieval(res, user);
  }

  static async updateUser(req, res) {
    const user = await UserService.updateUser(req.params.id, req.body);
    return handleSuccess(res, user);
  }


  static async loginUser(req, res) {
    const { email, password } = req.body;
    const user = await UserService.loginUser(email, password);
    return handleDataRetrieval(res, user);
  }
}

export default UserController;
