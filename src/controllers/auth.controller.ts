import AuthService from "@/services/auth.service";
import { handleSuccess } from "@/utils/responsehandler/index.utils";
import { Request, Response } from "express";

class AuthController {
  static async register(req: Request, res: Response): Promise<void> {
    const { name, email, password, mobileNumber } = req.body;
    const result = await AuthService.register({
      name,
      email,
      password,
      mobileNumber,
    });
    handleSuccess(res, result, "User created successfully");
  }

  static async login(req: Request, res: Response): Promise<void> {
    const { email, password } = req.body;
    const result = await AuthService.login({
      email,
      password,
    });
    handleSuccess(res, result, "Login successful");
  }

  static async me(req: Request, res: Response): Promise<void> {
    const userId = req.subject?.userId;
    const result = await AuthService.me(userId);
    handleSuccess(res, result, "User details fetched successfully");
  }
}

export default AuthController;
