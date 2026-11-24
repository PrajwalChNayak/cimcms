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
import { AppError, AuthenticationError, NotFoundError } from '@utils/errors/custom.errors';
import prisma from '@models/prisma.client';
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


/** A rotated refresh token presented again within this window is a parallel-tab race, not theft. */
const REFRESH_REUSE_GRACE_MS = 10_000;

/** Hash of a random secret, used to spend real Argon2 time on unknown emails. Computed once. */
let dummyHashPromise: Promise<string> | undefined;
const dummyHash = (): Promise<string> =>
  (dummyHashPromise ??= Argon.hashPassword(randomBytes(32).toString('base64url')));

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
    caller?: { roles?: string[] },
  ): Promise<Record<string, unknown>> {
    const existingUser = await UserRepository.exists({ email });

    if (existingUser) {
      throw new AppError('User with this email already exists', 409, 'USER_EXISTS');
    }
    if (roles && roles.length > 0) {
      const found = await prisma.role.findMany({ where: { id: { in: roles } }, select: { id: true, name: true } });
      if (found.length !== new Set(roles).size) {
        throw new AppError('Unknown role id', 400, 'VALIDATION_FAILED');
      }
      // Only a SUPER_ADMIN may create another SUPER_ADMIN.
      if (found.some((r) => r.name === 'SUPER_ADMIN') && !caller?.roles?.includes('SUPER_ADMIN')) {
        throw new AppError('Only a SUPER_ADMIN may grant SUPER_ADMIN', 403, 'FORBIDDEN');
      }
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
    // Disabled or deleted roles and permissions grant nothing.
    const userRoles = (await UserRoleRepository.findByUserId(user.id)).filter(
      (ur) => ur.role.status === 'ACTIVE',
    );
    const roles = [...new Set(userRoles.map((ur) => ur.role.name))];
    const permissionSets = await Promise.all(
      userRoles.map((ur) => RolePermissionRepository.findByRoleId(ur.roleId)),
    );
    const permissions = [
      ...new Set(
        permissionSets
          .flat()
          .filter((rp) => rp.permission.status === 'ACTIVE')
          .map((rp) => rp.permission.name),
      ),
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
      // Same Argon2 cost as a real check, so response time does not reveal unknown emails.
      await Argon.verifyPassword(password, await dummyHash());
      return fail('Invalid email or password', 'UNKNOWN_USER');
    }
    const isValid = await Argon.verifyPassword(password, user.password);
    if (!isValid) {
      return fail('Invalid email or password', 'BAD_PASSWORD');
    }
    // Checked after the password so the account state is never revealed to a guesser.
    if (!UserService.isActive(user)) {
      return fail('Account is not active', 'INACTIVE');
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
    if (record.expiresAt.getTime() <= Date.now()) return reject();

    const activeUser = async (): Promise<User> => {
      const u = (await UserRepository.findById(record.userId)) as User | null;
      if (!u || !UserService.isActive(u)) {
        await RefreshTokenRepository.revokeFamily(record.familyId);
        return reject();
      }
      return u;
    };

    /**
     * Two tabs (or a retried request) can send the same cookie at the same moment. If the
     * token was rotated (not logged out) less than REFRESH_REUSE_GRACE_MS ago and its family
     * is still alive, this is a benign race: issue a sibling token in the same family instead
     * of treating it as theft. Anything older is reuse and kills the family.
     */
    const graceSibling = async (): Promise<{ accessToken: string; refreshToken: string; user: CurrentUserDto } | null> => {
      const fresh = await RefreshTokenRepository.findByHash(oldHash);
      if (!fresh?.revokedAt || !fresh.replacedByHash) return null;
      if (Date.now() - fresh.revokedAt.getTime() > REFRESH_REUSE_GRACE_MS) return null;
      if (!(await RefreshTokenRepository.familyHasActive(fresh.familyId))) return null;
      const u = await activeUser();
      const sibling = await UserService.issueRefreshToken(u.id, fresh.familyId, meta);
      const me = await UserService.loadCurrentUser(u);
      return { accessToken: UserService.signAccessToken(me), refreshToken: sibling, user: me };
    };

    if (record.revokedAt) {
      const sibling = await graceSibling();
      if (sibling) return sibling;
      await auditReuse(record, false);
      return reject();
    }

    const user = await activeUser();

    const nextToken = randomBytes(32).toString('base64url');
    const nextHash = hashRefreshToken(nextToken);
    // Atomic claim: a parallel request may have rotated it a moment ago (grace), else reuse.
    const claimed = await RefreshTokenRepository.revokeIfActive(oldHash, nextHash);
    if (!claimed) {
      const sibling = await graceSibling();
      if (sibling) return sibling;
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

  /**
   * Admin password reset (route needs USER_UPDATE). Only a SUPER_ADMIN may reset a
   * SUPER_ADMIN. All refresh tokens of the target are revoked.
   */
  static async resetPassword(
    email: string,
    newPassword: string,
    caller: { userId?: string; email?: string; roles?: string[] },
    meta: AuthMeta = {},
  ): Promise<void> {
    const user = await UserRepository.findByEmail(email);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    const targetRoles = (await UserRoleRepository.findByUserId(user.id)).map((ur) => ur.role.name);
    if (targetRoles.includes('SUPER_ADMIN') && !caller.roles?.includes('SUPER_ADMIN')) {
      throw new AppError('Only a SUPER_ADMIN may reset a SUPER_ADMIN password', 403, 'FORBIDDEN');
    }
    const hashedPassword = await Argon.hashPassword(newPassword);
    await UserRepository.updateById(user.id, { password: hashedPassword });
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await AuditService.record({
      action: 'PASSWORD_RESET',
      entity: 'User',
      entityId: user.id,
      actorId: caller.userId ?? null,
      actorEmail: caller.email ?? null,
      ip: meta.ip,
      requestId: meta.requestId,
    });
  }
}

export { userImageField };
export default UserService;
