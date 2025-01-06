import jwt from 'jsonwebtoken';
import authHashPassword from "../middleware/auth.hash.password.js";
import UserRepository from "../repositories/user.repository.js";
import { JWT_SECRET_KEY } from '../utils/config.utils.js';

class UserService {
  //#Role
  static async createRole(roleData) {
    return await UserRepository.createRole(roleData);
  }

  static async getAllRoles() {
    return await UserRepository.getAllRoles();
  }

  static async getRoleById(roleId) {
    return await UserRepository.getRoleById(roleId);
  }

  static async updateRole(roleId, roleData) {
    return await UserRepository.updateRole(roleId, roleData);
  }
  //#Permission
  static async createPermission(permissionData) {
    return await UserRepository.createPermission(permissionData);
  }

  static async getAllPermissions() {
    return await UserRepository.getAllPermissions();
  }

  static async getPermissionById(permissionId) {
    return await UserRepository.getPermissionById(permissionId);
  }
  static async updatePermission(permissionId, permissionData) {
    return await UserRepository.updatePermission(permissionId, permissionData);
  }

  //#RolePermission
  static async assignPermissionToRole(rolePermissionData) {
    return await UserRepository.assignPermissionToRole(rolePermissionData);
  }

  static async removePermissionFromRole(rolePermissionData) {
    return await UserRepository.removePermissionFromRole(rolePermissionData);
  }

  static async getRolePermissions(roleId) {
    return await UserRepository.getRolePermissions(roleId);
  }

  static async createUser(userData) {
    const { password, ...otherDetails } = userData;
    const salt = authHashPassword.generateSalt();
    const hashedPassword = authHashPassword.hashPassword(password, salt);
    return await UserRepository.createUser({
      password: hashedPassword,
      salt,
      ...otherDetails,
    });
  }

  static async getAllUsers(email) {
    return await UserRepository.getAllUsers(email);
  }

  static async getUserById(userId) {
    return await UserRepository.getUserById(userId);
  }

  static async updateUser(userId, userData) {
    return await UserRepository.updateUser(userId, userData);
  }

  static async loginUser(email, password) {
    const user = await UserRepository.getUserByEmail(email);
    console.log(user);
    if (!user) {
      throw new Error("User not found");
    }
    const hashedPassword = authHashPassword.hashPassword(password, user.salt);
    if (hashedPassword !== user.password) {
      throw new Error("Password is incorrect");
    }
    const authToken = jwt.sign({ email: user.email, userId: user.id }, JWT_SECRET_KEY, {
      expiresIn: "30d"
    });
    return { authToken, ...user };
  }

}

export default UserService;
