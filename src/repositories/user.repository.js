import prisma from "../models/index.model.js";

class UserRepository {

  static async createRole(roleData) {
    return await prisma.role.create({
      data: roleData,
      select: {
        id: true,
        roleName: true,
        description: true,
      }
    });
  }

  static async getAllRoles() {
    return await prisma.role.findMany();
  }

  static async getRoleById(roleId) {
    return await prisma.role.findUnique({
      where: {
        id: roleId
      }
    });
  }
  static async updateRole(roleId, roleData) {
    return await prisma.role.update({
      where: {
        id: roleId
      },
      data: roleData,
      select: {
        id: true,
        roleName: true,
        description: true,
      }
    });
  }


  static async createPermission(permissionData) {
    return await prisma.permission.create({
      data: permissionData,
      select: {
        id: true,
        permissionName: true,
        description: true,
      }
    });
  }

  static async getAllPermissions() {
    return await prisma.permission.findMany();
  }

  static async getPermissionById(permissionId) {
    return await prisma.permission.findUnique({
      where: {
        id: permissionId
      }
    });
  }

  static async updatePermission(permissionId, permissionData) {
    return await prisma.permission.update({
      where: {
        id: permissionId
      },
      data: permissionData,
      select: {
        id: true,
        permissionName: true,
        description: true,
      }
    });
  }

  //#RolePermission
  static async assignPermissionToRole(rolePermissionData) {
    return await prisma.rolePermission.create({
      data: rolePermissionData,
      select: {
        id: true,
        roleId: true,
        permissionId: true,
      }
    });
  }
  static async removePermissionFromRole(rolePermissionData) {
    const { roleId, permissionId } = rolePermissionData;
    return await prisma.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId,
          permissionId
        }
      }
    });
  }

  static async getRolePermissions(roleId) {
    return await prisma.rolePermission.findMany({
      where: {
        roleId: roleId
      },
      select: {
        id: true,
        role: {
          select: {
            roleName: true,
            description: true
          }
        },
        permission: {
          select: {
            permissionName: true,
            description: true
          }
        }
      }
    });
  }

  static async createUser(userData) {
    return await prisma.user.create({
      data: userData,
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        roleId: true,
        isActive: true
      }
    });
  }
  static async getAllUsers() {
    return await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        role: {
          select: {
            roleName: true,
            description: true,
            rolePermissions: {
              select: {
                permission: {
                  select: {
                    permissionName: true,
                    description: true
                  }
                }
              }
            }
          }
        },
        isActive: true
      }
    });
  }
  static getUserById(userId) {
    return prisma.user.findUnique({
      where: {
        id: userId
      },
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        role: {
          select: {
            roleName: true,
            description: true,
            rolePermissions: {
              select: {
                permission: {
                  select: {
                    permissionName: true,
                    description: true
                  }
                }
              }
            }
          }
        },
        isActive: true
      }
    });
  }

  static async updateUser(userId, userData) {
    return await prisma.user.update({
      where: {
        id: userId
      },
      data: userData,
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        roleId: true,
        isActive: true
      }
    });
  }
  static async getUserByEmail(email) {
    return await prisma.user.findUnique({
      where: {
        email: email
      },
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        password: true,
        salt: true,
        role: {
          select: {
            roleName: true,
            description: true,
            rolePermissions: {
              select: {
                permission: {
                  select: {
                    permissionName: true,
                    description: true
                  }
                }
              }
            }
          }
        },
        isActive: true
      }
    });
  }
}

export default UserRepository;
