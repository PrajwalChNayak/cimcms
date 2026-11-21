import Argon from '@/utils/argon.utils';
import { type FieldNameDetail } from '@middleware/fileuploader.middleware';
import type { Permission, Role } from '@prisma/client';
import PermissionRepository from '@repositories/permission.repository';
import RoleRepository from '@repositories/role.repository';
import RolePermissionRepository from '@repositories/rolepermission.repository';
import UserRepository from '@repositories/user.repository';
import UserRoleRepository from '@repositories/userrole.repository';
import { Constants } from '@utils/constant.utils';
import PaginationUtils from '@utils/pagination.utils';
import jwt from 'jsonwebtoken';

type ReqUser = { userId: number };

const userImageField = (ownerId?: number): FieldNameDetail[] => [
  {
    name: 'image',
    maxCount: 1,
    folderName: Constants.USER_IMAGE_FOLDER,
    isOptional: true,
    ownerId,
  },
];

class UserService {
  // ─── Role CRUD ────────────────────────────────────────────────────────────

  static async createUserRole(name: string, status?: string): Promise<Role> {
    return RoleRepository.create<Role>({ name, ...(status && { status }) });
  }

  static async getUserRoles(
    page: number,
    limit: number,
    name?: string,
    status?: string,
  ): Promise<Record<string, unknown>> {
    const { page: p, limit: l } = PaginationUtils.getPaginationParams({
      page: String(page),
      limit: String(limit),
    });
    const searchParams: Record<string, unknown> = {};
    if (name) searchParams.name = name;
    if (status) searchParams.status = status;
    return RoleRepository.findAll<Role>(p, l, searchParams, {
      orderBy: { createdAt: 'desc' },
    });
  }

  static async getUserRoleById(id: string): Promise<Record<string, unknown> | null> {
    return RoleRepository.findWithPermissions(id);
  }

  static async updateUserRole(
    id: string,
    data: { name?: string; status?: string },
  ): Promise<Role> {
    return RoleRepository.updateById<Role>(id as unknown as number, data);
  }

  static async deleteUserRole(id: string): Promise<Role> {
    await RoleRepository.assertNotSystem(id);
    return RoleRepository.softDelete<Role>(id as unknown as number);
  }

  static async toggleUserRole(id: string, currentStatus: string): Promise<Role> {
    return RoleRepository.toggleStatus<Role>(id as unknown as number, currentStatus);
  }

  // ─── Permission CRUD ──────────────────────────────────────────────────────

  static async createPermission(name: string, status?: string): Promise<Permission> {
    return PermissionRepository.create<Permission>({ name, ...(status && { status }) });
  }

  static async getPermissions(
    page: number,
    limit: number,
    name?: string,
    status?: string,
  ): Promise<Record<string, unknown>> {
    const { page: p, limit: l } = PaginationUtils.getPaginationParams({
      page: String(page),
      limit: String(limit),
    });
    const searchParams: Record<string, unknown> = {};
    if (name) searchParams.name = name;
    if (status) searchParams.status = status;
    return PermissionRepository.findAll<Permission>(p, l, searchParams, {
      orderBy: { createdAt: 'desc' },
    });
  }

  static async updatePermission(
    id: string,
    data: { name?: string; status?: string },
  ): Promise<Permission> {
    return PermissionRepository.updateById<Permission>(id as unknown as number, data);
  }

  static async deletePermission(id: string): Promise<Permission> {
    await PermissionRepository.assertNotSystem(id);
    return PermissionRepository.softDelete<Permission>(id as unknown as number);
  }

  static async togglePermission(id: string, currentStatus: string): Promise<Permission> {
    return PermissionRepository.toggleStatus<Permission>(
      id as unknown as number,
      currentStatus,
    );
  }

  // ─── RolePermission junction ──────────────────────────────────────────────

  /** Assigns a permission to a role via the RolePermission junction table. */
  static async assignPermissionToRole(
    roleId: string,
    permissionId: string,
  ): Promise<Record<string, unknown>> {
    return RolePermissionRepository.assign(roleId, permissionId);
  }

  /** Removes a permission from a role via the RolePermission junction table. */
  static async removePermissionFromRole(
    roleId: string,
    permissionId: string,
  ): Promise<void> {
    return RolePermissionRepository.revoke(roleId, permissionId);
  }

  // ─── UserRole junction ────────────────────────────────────────────────────

  /** Assigns a role to a user via the UserRole junction table. */
  static async assignRoleToUser(
    userId: string,
    roleId: string,
  ): Promise<Record<string, unknown>> {
    return UserRoleRepository.assign(userId, roleId);
  }

  /** Removes a role from a user via the UserRole junction table. */
  static async removeRoleFromUser(userId: string, roleId: string): Promise<void> {
    return UserRoleRepository.revoke(userId, roleId);
  }

  // ─── User CRUD ────────────────────────────────────────────────────────────

  static async createUser(
    email: string,
    password: string,
    name: string,
    roles?: string[],
  ): Promise<Record<string, unknown>> {
    const existingUser = await UserRepository.exists({ email });

    if (existingUser) {
      throw new Error('User with this email already exists');
    }
    const hashedPassword = await Argon.hashPassword(password);

    const user = (await UserRepository.create({
      email,
      password: hashedPassword,
      name,
    })) as { id: string };

    if (roles && roles.length > 0) {
      await Promise.all(
        roles.map((roleId) => UserRoleRepository.assign(user.id, roleId)),
      );
    }

    return UserRepository.findWithRoles(user.id) as Promise<Record<string, unknown>>;
  }

  static async getUsers(
    page: number = 1,
    limit: number = 10,
    name?: string,
    status?: string,
  ): Promise<Record<string, unknown>> {
    const searchParams = {
      ...(name && { name }),
      ...(status && { status }),
    };

    return UserRepository.findAll(page, limit, searchParams, {
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  static async getUserById(id: string): Promise<Record<string, unknown> | null> {
    return UserRepository.findWithRoles(id);
  }

  static async updateUser(
    id: string,
    data: { name?: string; email?: string; status?: string },
  ): Promise<Record<string, unknown>> {
    return UserRepository.updateById(id as unknown as number, data);
  }

  static async deleteUser(id: string): Promise<Record<string, unknown>> {
    return UserRepository.softDelete(id as unknown as number);
  }

  // ─── User Auth ────────────────────────────────────────────────────────────

  static async login(
    email: string,
    password: string,
  ): Promise<{ authToken: string; id: string }> {
    const user = await UserRepository.findByEmail(email);
    if (!user) {
      throw new Error('Invalid email or password');
    }
    if (
      user.status === 'INACTIVE' ||
      user.status === 'BLOCK' ||
      user.status === 'DELETED'
    ) {
      throw new Error('Account is not active');
    }
    const isValid = await Argon.verifyPassword(password, user.password);
    if (!isValid) {
      throw new Error('Invalid email or password');
    }

    // Load roles + permissions once at login and bake them into the token
    const userRoles = await UserRoleRepository.findByUserId(user.id);
    const roles = userRoles.map((ur) => ur.role.name);
    const permissionSets = await Promise.all(
      userRoles.map((ur) => RolePermissionRepository.findByRoleId(ur.roleId)),
    );
    const permissions = [
      ...new Set(permissionSets.flat().map((rp) => rp.permission.name)),
    ];

    const subject: {
      userId: string;
      email: string;
      roles: string[];
      permissions: string[];
    } = {
      userId: user.id,
      email: user.email,
      roles,
      permissions,
    };

    const authToken = jwt.sign(subject, process.env.JWT_SECRET_KEY as string, {
      expiresIn: '30d',
    });
    return { authToken, id: user.id };
  }

  static async resetPassword(email: string, newPassword: string): Promise<void> {
    const user = await UserRepository.findByEmail(email);
    if (!user) {
      throw new Error('User not found');
    }
    const hashedPassword = await Argon.hashPassword(newPassword);
    return UserRepository.updateById(user.id as unknown as number, {
      password: hashedPassword,
    });
  }
}

export { userImageField };
export default UserService;
