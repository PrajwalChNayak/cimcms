import UserService from '../services/user.service.js';
import { handelDataUpdate, handelServerDataCreated, handelServerDataGet } from '../utils/responsehandler/index.utils.js';

class UserController {
  //#Role 
  static async createRole(req, res) {
    const role = await UserService.createRole(req.body);
    return handelServerDataCreated(res, role);
  }

  static async getAllRoles(req, res) {
    const role = await UserService.getAllRoles();
    return handelServerDataGet(res, role);
  }

  static async getRoleById(req, res) {
    const role = await UserService.getRoleById(req.params.id);
    return handelServerDataGet(res, role);
  }

  static async updateRole(req, res) {
    const role = await UserService.updateRole(req.params.id, req.body);
    return handelDataUpdate(res, role);
  }
  //#Permission

  static async createPermission(req, res) {
    const permission = await UserService.createPermission(req.body);
    return handelServerDataCreated(res, permission);
  }

  static async getAllPermissions(req, res) {
    const permission = await UserService.getAllPermissions();
    return handelServerDataGet(res, permission);
  }

  static async getPermissionById(req, res) {
    const permission = await UserService.getPermissionById(req.params.id);
    return handelServerDataGet(res, permission);
  }

  static async updatePermission(req, res) {
    const permission = await UserService.updatePermission(req.params.id, req.body);
    return handelDataUpdate(res, permission);
  }

  //#RolePermission
  static async assignPermissionToRole(req, res) {
    const rolePermission = await UserService.assignPermissionToRole(req.body);
    return handelServerDataCreated(res, rolePermission);
  }

  static async removePermissionFromRole(req, res) {
    const rolePermission = await UserService.removePermissionFromRole(req.body);
    return handelDataUpdate(res, rolePermission);
  }

  static async getRolePermissions(req, res) {
    const rolePermissions = await UserService.getRolePermissions(req.params.id);
    return handelServerDataGet(res, rolePermissions);
  }

  static async createUser(req, res) {
    const user = await UserService.createUser(req.body);
    return handelServerDataCreated(res, user);
  }

  static async getAllUsers(req, res) {
    const users = await UserService.getAllUsers();
    return handelServerDataGet(res, users);
  }

  static async getUserById(req, res) {
    const user = await UserService.getUserById(req.params.id);
    return handelServerDataGet(res, user);
  }

  static async updateUser(req, res) {
    const user = await UserService.updateUser(req.params.id, req.body);
    return handelDataUpdate(res, user);
  }


  static async loginUser(req, res) {
    const { email, password } = req.body;
    const user = await UserService.loginUser(email, password);
    return handelServerDataGet(res, user);
  }
}

export default UserController;
