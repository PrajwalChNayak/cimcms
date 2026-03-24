import UserController from "@controllers/user.controller";
import authenticateToken from "@middleware/auth.middleware";
import { parseMultipart } from "@middleware/fileuploader.middleware";
import { Router } from "express";

export default (router: Router): void => {
  router.post(
    "/users",
    authenticateToken,
    parseMultipart,
    UserController.createUserDetails,
  );
  router.get("/users", authenticateToken, UserController.getAllUsers);
  router.get(
    "/users/getAll",
    authenticateToken,
    UserController.getAllUsersWithoutPagination,
  );
  router.get(
    "/users/:userId",
    authenticateToken,
    UserController.getUserDetailsById,
  );
  router.put(
    "/users/:userId",
    authenticateToken,
    UserController.updateUserDetails,
  );
  router.delete(
    "/users/:userId",
    authenticateToken,
    UserController.deleteUserById,
  );
  router.post("/users/login", UserController.login);
  router.post(
    "/users/reset-password",
    authenticateToken,
    UserController.resetPassword,
  );
  router.patch(
    "/users/update-profile-pic/:userId",
    authenticateToken,
    parseMultipart,
    UserController.updateUserProfileImage,
  );
};
