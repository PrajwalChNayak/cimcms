import prisma from "@models/prisma.client";
import BaseRepository, {
  type FieldMappings,
} from "@repositories/base.repository";

export interface UserRecord {
  id: number;
  password?: string;
  [key: string]: unknown;
}

interface UserRoleData {
  roleId: number;
  isActive?: boolean;
  [key: string]: unknown;
}

class UserRepository extends BaseRepository {
  static override _modelName = "user";

  static override _fieldMappings: FieldMappings = {
    exact: ["status"],
    text: [
      "name",
      "email",
      "emp_code",
      "contact_number",
      "emergency_contact",
      "address",
    ],
    date: ["dob", "doj", "given_date", "created_at", "updated_at"],
    number: [
      "role_id",
      "department_id",
      "reporting_manager_id",
      "crated_by",
      "updated_by",
    ],
  };

  static async createUserDetails(
    userData: Record<string, unknown>,
  ): Promise<UserRecord> {
    return this.create<UserRecord>(userData);
  }

  static async getUserDetailsById(userId: number): Promise<UserRecord | null> {
    return this.findById<UserRecord>(userId, {
      additionalWhere: { status: { not: "DELETED" } },
      include: {
        UserRole: {
          select: {
            role: { select: { id: true, name: true } },
          },
        },
        department: { select: { id: true, name: true } },
        reportingManager: { select: { id: true, emp_code: true, name: true } },
      },
    });
  }

  static async updateUserDetails(
    userId: number,
    updatedUserData: Record<string, unknown>,
  ): Promise<UserRecord> {
    return this.updateById<UserRecord>(userId, updatedUserData);
  }

  static async updateLastLoginTime(userId: number): Promise<UserRecord> {
    return this.updateById<UserRecord>(userId, { last_login: new Date() });
  }

  static async getAllUsers(
    page: number,
    limit: number,
    query: Record<string, unknown>,
  ) {
    const { department_id, role_id, reporting_manager_id, ...searchParams } =
      query;

    const roleFilter = role_id
      ? { UserRole: { some: { roleId: Number(role_id), isActive: true } } }
      : {};

    const additionalWhere: Record<string, unknown> = {
      status: { not: "DELETED" },
      ...(department_id ? { department_id: Number(department_id) } : {}),
      ...(reporting_manager_id
        ? { reporting_manager_id: Number(reporting_manager_id) }
        : {}),
      ...roleFilter,
    };

    const include = {
      department: { select: { id: true, name: true } },
      UserRole: {
        where: role_id
          ? { roleId: Number(role_id), isActive: true }
          : { isActive: true },
        select: {
          role: { select: { id: true, name: true } },
        },
      },
    };

    const result = await this.findAll<UserRecord>(page, limit, searchParams, {
      additionalWhere,
      orderBy: { id: "desc" },
      include,
    });

    result.data = result.data.map(
      ({ password: _pwd, ...user }: UserRecord) => user as UserRecord,
    );
    return result;
  }

  static async deleteUserById(userId: number): Promise<UserRecord> {
    return this.updateById<UserRecord>(userId, { status: "DELETED" });
  }

  static async getUserDetailsByEmail(
    email: string,
  ): Promise<UserRecord | null> {
    return this.findOne<UserRecord>(
      { email },
      {
        include: {
          department: { select: { name: true } },
          UserRole: { select: { userId: true, roleId: true, isActive: true } },
        },
      },
    );
  }

  static async getUserDetailsByEmpCode(
    empCode: string,
  ): Promise<UserRecord | null> {
    return this.findOne<UserRecord>(
      { emp_code: empCode },
      {
        include: {
          UserRole: { select: { userId: true, roleId: true, isActive: true } },
          department: { select: { name: true } },
        },
      },
    );
  }

  static async resetPassword(
    userId: number,
    hashedNewPassword: string,
  ): Promise<UserRecord> {
    return this.updateById<UserRecord>(userId, { password: hashedNewPassword });
  }

  static async getAllUsersWithoutPagination(
    query: Record<string, unknown>,
  ): Promise<UserRecord[]> {
    return this.findAllWithoutPagination<UserRecord>({
      searchParams: query,
      additionalWhere: { status: { not: "DELETED" } },
      include: {
        password: false,
        UserRole: { select: { role: { select: { name: true } } } },
        department: { select: { name: true } },
      },
    });
  }

  static async updateUserProfileImage(
    userId: number,
    updatedProfileImage: Record<string, unknown>,
  ): Promise<UserRecord> {
    return this.updateById<UserRecord>(userId, updatedProfileImage);
  }

  static async assignedUserToRole(
    userId: number,
    roleId: number,
    assignedUserRoleData: UserRoleData,
  ) {
    return prisma.user_role.upsert({
      where: { userId_roleId: { userId, roleId } },
      update: assignedUserRoleData as Record<string, unknown>,
      create: { userId, roleId },
    });
  }

  static async getUserPasswordByEmpCode(
    empCode: string,
  ): Promise<UserRecord | null> {
    return this.findOne<UserRecord>({ emp_code: empCode });
  }

  static async findHierarchyTree(managerId: number) {
    return prisma.user.findMany({
      where: {
        reporting_manager_id: managerId,
        status: { not: "DELETED" },
      },
      select: {
        id: true,
        name: true,
        emp_code: true,
        email: true,
        image: true,
        department_id: true,
        reporting_manager_id: true,
        UserRole: { select: { roleId: true } },
        department: { select: { name: true } },
      },
    });
  }

  static async isHr(userId: number): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { UserRole: { select: { role: { select: { name: true } } } } },
    });
    return (
      user?.UserRole?.some(
        (ur: { role?: { name?: string | null } | null }) =>
          ur.role?.name?.toLowerCase() === "hr",
      ) ?? false
    );
  }
}

export default UserRepository;
