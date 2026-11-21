import UserService, { type AuthMeta } from '@/services/user.service';
import { handleSuccess } from '@utils/responsehandler/index.utils';
import type { CookieOptions, Request, Response } from 'express';

const refreshCookieName = (): string => process.env.REFRESH_COOKIE_NAME ?? "cimcms_rt";

// Must equal the path the browser sees (e.g. /api/v1/user/token), or the cookie is never sent.
const refreshCookiePath = (): string =>
  process.env.REFRESH_COOKIE_PATH ?? `/${process.env.MAIN_ROUTE ?? "api/v1"}/user/token`;

const refreshCookieBaseOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  path: refreshCookiePath(),
});

const setRefreshCookie = (res: Response, token: string): void => {
  const days = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? "7");
  res.cookie(refreshCookieName(), token, {
    ...refreshCookieBaseOptions(),
    maxAge: days * 24 * 60 * 60 * 1000,
  });
};

const readRefreshCookie = (req: Request): string | undefined => {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[refreshCookieName()];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const authMeta = (req: Request): AuthMeta => ({
  ip: req.ip ?? null,
  userAgent: req.header("User-Agent") ?? null,
  requestId: req.requestId ?? null,
});

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
    const id = req.params.id as string;
    const result = await UserService.getUserRoleById(id);
    handleSuccess(res, result, 'User Role fetched successfully');
  }

  static async updateUserRole(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const { name, status } = req.body;
    const result = await UserService.updateUserRole(id, { name, status });
    handleSuccess(res, result, 'User Role updated successfully');
  }

  static async deleteUserRole(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const result = await UserService.deleteUserRole(id);
    handleSuccess(res, result, 'User Role deleted successfully');
  }

  static async toggleUserRole(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
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
    const id = req.params.id as string;
    const { name, status } = req.body;
    const result = await UserService.updatePermission(id, { name, status });
    handleSuccess(res, result, 'Permission updated successfully');
  }

  static async deletePermission(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const result = await UserService.deletePermission(id);
    handleSuccess(res, result, 'Permission deleted successfully');
  }

  static async togglePermission(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
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
    const { email, password, name, roles } = req.body;
    const result = await UserService.createUser(
      email as string,
      password as string,
      name as string,
      roles as string[] | undefined,
    );
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
    const id = req.params.id as string;
    const result = await UserService.getUserById(id);
    handleSuccess(res, result, 'User fetched successfully');
  }

  static async updateUser(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const { name, email, status } = req.body;
    const result = await UserService.updateUser(id, {
      name: name as string,
      email: email as string,
      status: status as string | undefined,
    });
    handleSuccess(res, result, 'User updated successfully');
  }

  static async deleteUser(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
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
    const { accessToken, refreshToken, user } = await UserService.login(
      email as string,
      password as string,
      authMeta(req),
    );
    setRefreshCookie(res, refreshToken);
    // The refresh token is never in the body.
    handleSuccess(res, { accessToken, user }, "Login successful");
  }

  static async refresh(req: Request, res: Response): Promise<void> {
    const { accessToken, refreshToken, user } = await UserService.refresh(
      readRefreshCookie(req),
      authMeta(req),
    );
    setRefreshCookie(res, refreshToken);
    handleSuccess(res, { accessToken, user }, "Token refreshed");
  }

  static async logout(req: Request, res: Response): Promise<void> {
    await UserService.logout(readRefreshCookie(req), authMeta(req));
    res.clearCookie(refreshCookieName(), refreshCookieBaseOptions());
    handleSuccess(res, null, "Logged out");
  }

  static async me(req: Request, res: Response): Promise<void> {
    const user = await UserService.getCurrentUser(req.subject?.userId as string);
    handleSuccess(res, user, "Current user fetched successfully");
  }

  static async resetPassword(req: Request, res: Response): Promise<void> {
    const { email, newPassword } = req.body;
    await UserService.resetPassword(email as string, newPassword as string);
    handleSuccess(res, null, 'Password reset successfully');
  }
}

export default UserController;
