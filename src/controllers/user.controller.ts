import UserService from '@/services/user.service';
import { handleSuccess } from '@utils/responsehandler/index.utils';
import { Request, Response } from 'express';

class UserController {
  // ─── Role endpoints ────────────────────────────────────────────────────────

  static async createUserRole(req: Request, res: Response): Promise<void> {
    const { name, status } = req.body;
    const result = await UserService.createUserRole(name as string, status as string | undefined);
    handleSuccess(res, result, 'User Role created successfully');
  }

  static async getUserRoles(req: Request, res: Response): Promise<void> {
    const { page = '1', limit = '10', name, status } = req.query;
    const result = await UserService.getUserRoles(
      +page,
      +limit,
      name as string | undefined,
      status as string | undefined,
    );
    handleSuccess(res, result, 'User Roles fetched successfully');
  }

  static async getUserRoleById(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const result = await UserService.getUserRoleById(id);
    handleSuccess(res, result, 'User Role fetched successfully');
  }

  static async updateUserRole(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { name, status } = req.body;
    const result = await UserService.updateUserRole(id, { name, status });
    handleSuccess(res, result, 'User Role updated successfully');
  }

  static async deleteUserRole(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const result = await UserService.deleteUserRole(id);
    handleSuccess(res, result, 'User Role deleted successfully');
  }

  static async toggleUserRole(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { status } = req.body;
    const result = await UserService.toggleUserRole(id, status as string);
    handleSuccess(res, result, 'User Role toggled successfully');
  }

  // ─── Permission endpoints ─────────────────────────────────────────────────

  static async createPermission(req: Request, res: Response): Promise<void> {
    const { name, status } = req.body;
    const result = await UserService.createPermission(name as string, status as string | undefined);
    handleSuccess(res, result, 'Permission created successfully');
  }

  static async getPermissions(req: Request, res: Response): Promise<void> {
    const { page = '1', limit = '10', name, status } = req.query;
    const result = await UserService.getPermissions(
      +page,
      +limit,
      name as string | undefined,
      status as string | undefined,
    );
    handleSuccess(res, result, 'Permissions fetched successfully');
  }

  static async updatePermission(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { name, status } = req.body;
    const result = await UserService.updatePermission(id, { name, status });
    handleSuccess(res, result, 'Permission updated successfully');
  }

  static async deletePermission(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const result = await UserService.deletePermission(id);
    handleSuccess(res, result, 'Permission deleted successfully');
  }

  static async togglePermission(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { status } = req.body;
    const result = await UserService.togglePermission(id, status as string);
    handleSuccess(res, result, 'Permission toggled successfully');
  }

  // ─── RolePermission junction endpoints ───────────────────────────────────

  static async assignPermissionToRole(req: Request, res: Response): Promise<void> {
    const { roleId, permissionId } = req.body;
    const result = await UserService.assignPermissionToRole(
      roleId as string,
      permissionId as string,
    );
    handleSuccess(res, result, 'Permission assigned to role successfully');
  }

  static async removePermissionFromRole(req: Request, res: Response): Promise<void> {
    const { roleId, permissionId } = req.body;
    await UserService.removePermissionFromRole(roleId as string, permissionId as string);
    handleSuccess(res, null, 'Permission removed from role successfully');
  }

  // ─── User endpoints ───────────────────────────────────────────────────────

  static async createUser(req: Request, res: Response): Promise<void> {
    const { email, password, name, status } = req.body;
    const result = await UserService.createUser(email, password, name, status);
    handleSuccess(res, result, 'User created successfully');
  }

  static async getUsers(req: Request, res: Response): Promise<void> {
    const { page = '1', limit = '10', name, status } = req.query;
    const result = await UserService.getUsers(
      +page,
      +limit,
      name as string | undefined,
      status as string | undefined,
    );
    handleSuccess(res, result, 'Users fetched successfully');
  }

  static async getUserById(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const result = await UserService.getUserById(id);
    handleSuccess(res, result, 'User fetched successfully');
  }

  static async updateUser(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { name, email, status } = req.body;
    const result = await UserService.updateUser(id, { name, email, status });
    handleSuccess(res, result, 'User updated successfully');
  }

  static async deleteUser(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const result = await UserService.deleteUser(id);
    handleSuccess(res, result, 'User deleted successfully');
  }

  // ─── UserRole junction endpoints ──────────────────────────────────────────

  static async assignRoleToUser(req: Request, res: Response): Promise<void> {
    const { userId, roleId } = req.body;
    const result = await UserService.assignRoleToUser(userId as string, roleId as string);
    handleSuccess(res, result, 'Role assigned to user successfully');
  }

  static async removeRoleFromUser(req: Request, res: Response): Promise<void> {
    const { userId, roleId } = req.body;
    await UserService.removeRoleFromUser(userId as string, roleId as string);
    handleSuccess(res, null, 'Role removed from user successfully');
  }

  // ─── User Auth endpoints ──────────────────────────────────────────────────

  static async login(req: Request, res: Response): Promise<void> {
    const { email, password } = req.body;
    const result = await UserService.login(email as string, password as string);
    handleSuccess(res, result, 'Login successful');
  }

  static async resetPassword(req: Request, res: Response): Promise<void> {
    const { email, newPassword } = req.body;
    await UserService.resetPassword(email as string, newPassword as string);
    handleSuccess(res, null, 'Password reset successfully');
  }
}

export default UserController;
