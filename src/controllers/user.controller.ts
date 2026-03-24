import UserService from "@services/user.service";
import {
  handleDataRetrieval,
  handleLogin,
  handleSuccess,
} from "@utils/responsehandler/index.utils";
import { Request, Response } from "express";

class UserController {
  static async createUserDetails(req: Request, res: Response): Promise<void> {
    const createdUserDetails = await UserService.createUserDetails(
      req.body,
      req.files as Express.Multer.File[] | undefined,
      req.user,
    );
    handleSuccess(res, createdUserDetails, "User created successfully");
  }

  static async updateUserDetails(req: Request, res: Response): Promise<void> {
    const userId = req.params.userId;
    const updatedUserData = await UserService.updateUserDetails(
      userId,
      req.body,
      req.user!,
    );
    handleSuccess(res, updatedUserData, "User updated successfully");
  }

  static async getUserDetailsById(req: Request, res: Response): Promise<void> {
    const userId = req.params.userId;
    const getUserDetails = await UserService.getUserDetailsById(userId);
    handleDataRetrieval(res, getUserDetails, "User fetched successfully");
  }

  static async getAllUsers(req: Request, res: Response): Promise<void> {
    const getAllUsers = await UserService.getAllUsers(
      req.query as Record<string, unknown>,
    );
    handleDataRetrieval(res, getAllUsers, "User fetched successfully");
  }

  static async deleteUserById(req: Request, res: Response): Promise<void> {
    const userId = req.params.userId;
    const deletedUserDetails = await UserService.deleteUserById(userId);
    handleSuccess(res, deletedUserDetails, "User deleted successfully");
  }

  static async login(req: Request, res: Response): Promise<void> {
    const { emailOrempCode, password } = req.body as {
      emailOrempCode: string;
      password: string;
    };
    const getUserDetails = await UserService.login(emailOrempCode, password);
    handleLogin(res, getUserDetails as { id: number; [key: string]: unknown });
  }

  static async resetPassword(req: Request, res: Response): Promise<void> {
    const { empCode, oldPassword, newPassword } = req.body as {
      empCode: string;
      oldPassword: string;
      newPassword: string;
    };
    const resetPasswordDetails = await UserService.resetPassword(
      empCode,
      oldPassword,
      newPassword,
    );
    handleSuccess(res, resetPasswordDetails, "Password reset successfully");
  }

  static async getAllUsersWithoutPagination(
    req: Request,
    res: Response,
  ): Promise<void> {
    const getAllUsersData = await UserService.getAllUsersWithoutPagination(
      req.query as Record<string, unknown>,
    );
    handleSuccess(res, getAllUsersData, "User fetched successfully");
  }

  static async updateUserProfileImage(
    req: Request,
    res: Response,
  ): Promise<void> {
    const userId = req.params.userId;
    const updatedUserProfileImageData =
      await UserService.updateUserProfileImage(
        userId,
        req.files as Express.Multer.File[] | undefined,
        req.user,
      );
    handleSuccess(
      res,
      updatedUserProfileImageData,
      "User profile image updated successfully",
    );
  }
}

export default UserController;
