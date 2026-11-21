import Argon from '@/utils/argon.utils';
import { type FieldNameDetail } from '@middleware/fileuploader.middleware';
import type { Permission, Role, User } from '@prisma/client';
import PermissionRepository from '@repositories/permission.repository';
import RoleRepository from '@repositories/role.repository';
import RolePermissionRepository from '@repositories/rolepermission.repository';
import UserRepository from '@repositories/user.repository';
import UserRoleRepository from '@repositories/userrole.repository';
import { Constants } from '@utils/constant.utils';
import PaginationUtils, { type PaginationResult } from '@utils/pagination.utils';
import { AppError, AuthenticationError } from '@utils/errors/custom.errors';
import AuditService from '@/services/audit.service';
import RefreshTokenRepository from '@repositories/refreshtoken.repository';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';

export interface CurrentUserDto {
  id: string;
  email: string;
  name?: string;
  roles: string[];
  permissions: string[];
}

export interface AuthMeta {
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export const hashRefreshToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export const refreshTtlMs = (): number =>
  Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? '7') * 24 * 60 * 60 * 1000;


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
  ): Promise<PaginationResult<Role>> {
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
    return RoleRepository.updateById<Role>(id, data);
  }

  static async deleteUserRole(id: string): Promise<Role> {
    await RoleRepository.assertNotSystem(id);
    return RoleRepository.softDelete<Role>(id);
  }

  static async toggleUserRole(id: string, currentStatus: string): Promise<Role> {
    return RoleRepository.toggleStatus<Role>(id, currentStatus);
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
  ): Promise<PaginationResult<Permission>> {
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
    return PermissionRepository.updateById<Permission>(id, data);
  }

  static async deletePermission(id: string): Promise<Permission> {
    await PermissionRepository.assertNotSystem(id);
    return PermissionRepository.softDelete<Permission>(id);
  }

  static async togglePermission(id: string, currentStatus: string): Promise<Permission> {
    return PermissionRepository.toggleStatus<Permission>(
      id,
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
  ): Promise<PaginationResult<Partial<User>>> {
    const searchParams = {
      ...(name && { name }),
      ...(status && { status }),
    };

    return UserRepository.findAll<Partial<User>>(page, limit, searchParams, {
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
    return UserRepository.updateById(id, data);
  }

  static async deleteUser(id: string): Promise<Record<string, unknown>> {
    return UserRepository.softDelete(id);
  }

  // ─── User Auth ────────────────────────────────────────────────────────────

  /** Loads roles and permissions from the DB (never from a token). */
  private static async loadCurrentUser(user: User): Promise<CurrentUserDto> {
    const userRoles = await UserRoleRepository.findByUserId(user.id);
    const roles = [...new Set(userRoles.map((ur) => ur.role.name))];
    const permissionSets = await Promise.all(
      userRoles.map((ur) => RolePermissionRepository.findByRoleId(ur.roleId)),
    );
    const permissions = [
      ...new Set(permissionSets.flat().map((rp) => rp.permission.name)),
    ];
    return {
      id: user.id,
      email: user.email,
      ...(user.name ? { name: user.name } : {}),
      roles,
      permissions,
    };
  }

  private static signAccessToken(me: CurrentUserDto): string {
    return jwt.sign(
      {
        userId: me.id,
        email: me.email,
        roles: me.roles,
        permissions: me.permissions,
        typ: 'access',
      },
      process.env.JWT_SECRET_KEY as string,
      { expiresIn: (process.env.ACCESS_TOKEN_TTL ?? '15m') as jwt.SignOptions['expiresIn'] },
    );
  }

  private static isActive(user: User): boolean {
    return !(
      user.status === 'INACTIVE' ||
      user.status === 'BLOCK' ||
      user.status === 'DELETED'
    );
  }

  /** Creates a refresh token (opaque, 32 random bytes); only its sha256 is stored. */
  private static async issueRefreshToken(
    userId: string,
    familyId: string,
    meta: AuthMeta,
  ): Promise<string> {
    const refreshToken = randomBytes(32).toString('base64url');
    await RefreshTokenRepository.create({
      userId,
      tokenHash: hashRefreshToken(refreshToken),
      familyId,
      expiresAt: new Date(Date.now() + refreshTtlMs()),
      revokedAt: null,
      replacedByHash: null,
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
    });
    return refreshToken;
  }

  static async login(
    email: string,
    password: string,
    meta: AuthMeta = {},
  ): Promise<{ accessToken: string; refreshToken: string; user: CurrentUserDto }> {
    const fail = async (message: string, reason: string): Promise<never> => {
      // Audit holds the email only, never the password.
      await AuditService.record({
        action: 'LOGIN_FAILED',
        entity: 'User',
        actorEmail: typeof email === 'string' ? email : null,
        actorType: 'SYSTEM',
        data: { reason },
        ip: meta.ip,
        requestId: meta.requestId,
      });
      throw new AuthenticationError(message);
    };

    const user = await UserRepository.findByEmail(email);
    if (!user) {
      return fail('Invalid email or password', 'UNKNOWN_USER');
    }
    if (!UserService.isActive(user)) {
      return fail('Account is not active', 'INACTIVE');
    }
    const isValid = await Argon.verifyPassword(password, user.password);
    if (!isValid) {
      return fail('Invalid email or password', 'BAD_PASSWORD');
    }

    const me = await UserService.loadCurrentUser(user);
    const accessToken = UserService.signAccessToken(me);
    const refreshToken = await UserService.issueRefreshToken(user.id, randomUUID(), meta);
    await AuditService.record({
      action: 'LOGIN_SUCCEEDED',
      entity: 'User',
      entityId: user.id,
      actorId: user.id,
      actorEmail: user.email,
      ip: meta.ip,
      requestId: meta.requestId,
    });
    return { accessToken, refreshToken, user: me };
  }

  /**
   * Rotates a refresh token. Reuse of an already-revoked token kills the whole
   * family (token theft signal). Roles and permissions are reloaded from the DB.
   */
  static async refresh(
    presentedToken: string | undefined,
    meta: AuthMeta = {},
  ): Promise<{ accessToken: string; refreshToken: string; user: CurrentUserDto }> {
    const reject = (message = 'Invalid or expired refresh token'): never => {
      throw new AppError(message, 401, 'UNAUTHENTICATED');
    };
    const auditReuse = async (
      record: { id: string; userId: string; familyId: string },
      race: boolean,
    ): Promise<void> => {
      await RefreshTokenRepository.revokeFamily(record.familyId);
      await AuditService.record({
        action: 'REFRESH_TOKEN_REUSE',
        entity: 'RefreshToken',
        entityId: record.id,
        actorId: record.userId,
        data: { familyId: record.familyId, ...(race ? { race: true } : {}) },
        ip: meta.ip,
        requestId: meta.requestId,
      });
    };
    if (!presentedToken) return reject('Refresh token missing');

    const oldHash = hashRefreshToken(presentedToken);
    const record = await RefreshTokenRepository.findByHash(oldHash);
    if (!record) return reject();

    if (record.revokedAt) {
      await auditReuse(record, false);
      return reject();
    }
    if (record.expiresAt.getTime() <= Date.now()) return reject();

    const user = (await UserRepository.findById(record.userId)) as User | null;
    if (!user || !UserService.isActive(user)) {
      await RefreshTokenRepository.revokeFamily(record.familyId);
      return reject();
    }

    const nextToken = randomBytes(32).toString('base64url');
    const nextHash = hashRefreshToken(nextToken);
    // Atomic claim: if a parallel request already rotated it, treat as reuse.
    const claimed = await RefreshTokenRepository.revokeIfActive(oldHash, nextHash);
    if (!claimed) {
      await auditReuse(record, true);
      return reject();
    }
    await RefreshTokenRepository.create({
      userId: user.id,
      tokenHash: nextHash,
      familyId: record.familyId,
      expiresAt: new Date(Date.now() + refreshTtlMs()),
      revokedAt: null,
      replacedByHash: null,
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
    });

    const me = await UserService.loadCurrentUser(user);
    return { accessToken: UserService.signAccessToken(me), refreshToken: nextToken, user: me };
  }

  /** Revokes the presented refresh token. Always succeeds (idempotent). */
  static async logout(presentedToken: string | undefined, meta: AuthMeta = {}): Promise<void> {
    if (!presentedToken) return;
    const record = await RefreshTokenRepository.findByHash(hashRefreshToken(presentedToken));
    if (!record) return;
    await RefreshTokenRepository.revokeIfActive(record.tokenHash, null);
    await AuditService.record({
      action: 'LOGOUT',
      entity: 'User',
      entityId: record.userId,
      actorId: record.userId,
      ip: meta.ip,
      requestId: meta.requestId,
    });
  }

  /** CurrentUserDto from the DB for GET /user/me. */
  static async getCurrentUser(userId: string): Promise<CurrentUserDto> {
    const user = (await UserRepository.findById(userId)) as User | null;
    if (!user || !UserService.isActive(user)) {
      throw new AppError('Invalid or expired token', 401, 'UNAUTHENTICATED');
    }
    return UserService.loadCurrentUser(user);
  }

  static async resetPassword(email: string, newPassword: string): Promise<void> {
    const user = await UserRepository.findByEmail(email);
    if (!user) {
      throw new Error('User not found');
    }
    const hashedPassword = await Argon.hashPassword(newPassword);
    return UserRepository.updateById(user.id, {
      password: hashedPassword,
    });
  }
}

export { userImageField };
export default UserService;
