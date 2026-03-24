import { Constants } from "@utils/constant.utils";
import ResponseEntity from "@utils/responsehandler/responseentity.utils";
import dotenv from "dotenv";
import type { Response } from "express";
import jwt from "jsonwebtoken";
dotenv.config();

export const ResponseType = {
  SUCCESS: "success",
  ERROR: "error",
  INFO: "info",
  WARNING: "warning",
} as const;

interface ResponseOptions {
  result?: unknown;
  statusCode?: number;
  status?: boolean | string;
  message?: string;
  type?: string;
}

interface UserPayload {
  id: number;
  [key: string]: unknown;
}

class ResponseBuilder {
  static build(options: ResponseOptions = {}): ResponseEntity {
    const {
      result = null,
      statusCode = Constants.HTTPOK,
      status = Constants.SUCCESS_STATUS,
      message = "",
    } = options;

    return new ResponseEntity(result, statusCode, status, message);
  }

  static send(res: Response, options: ResponseOptions): Response {
    const response = this.build(options);
    return res.status(options.statusCode ?? Constants.HTTPOK).json(response);
  }
}

const handleResponse = (res: Response, options: ResponseOptions): Response => {
  return ResponseBuilder.send(res, options);
};

const handleError = async (
  res: Response,
  error: unknown,
  statusCode: number = Constants.HTTPINTERNALSERVERERROR,
): Promise<Response> => {
  const err = error as {
    statusCode?: number;
    status?: string;
    message?: string;
  };
  return handleResponse(res, {
    result: null,
    statusCode: err.statusCode ?? statusCode,
    status: err.status ?? Constants.FAILED_STATUS,
    message: err.message ?? "An error occurred",
    type: ResponseType.ERROR,
  });
};

const handleSuccess = (
  res: Response,
  result: unknown,
  message: string,
  statusCode: number = Constants.HTTPOK,
): Response => {
  return handleResponse(res, {
    result,
    statusCode,
    status: Constants.SUCCESS_STATUS,
    message,
    type: ResponseType.SUCCESS,
  });
};

const handleLogin = (res: Response, user: UserPayload): Response => {
  const users = { userId: user?.id };
  const authToken = jwt.sign(users, process.env.JWT_SECRET_KEY as string, {
    expiresIn: "30d",
  });

  return handleSuccess(
    res,
    { authToken, user },
    Constants.LOGIN_SUCCESS_MESSAGE,
  );
};

const handleDataCreation = (
  res: Response,
  result: unknown,
  message: string = Constants.DATA_SAVE_MESSAGE,
): Response => {
  return handleSuccess(res, result, message, Constants.HTTPCREATED);
};

const handleDataNotCreation = (
  res: Response,
  message: string = Constants.DATA_NOT_SAVE_MESSAGE,
): Response => {
  return handleResponse(res, {
    statusCode: Constants.HTTPINTERNALSERVERERROR,
    status: Constants.FAILED_STATUS,
    message,
    type: ResponseType.ERROR,
  });
};

const handleDataRetrieval = (
  res: Response,
  result: unknown,
  message: string = Constants.DATA_FETCH_MESSAGE,
): Response => {
  return handleSuccess(res, result, message);
};

const handleNotFound = (
  res: Response,
  message: string = Constants.DATA_NOT_FOUND_MESSAGE,
): Response => {
  return handleResponse(res, {
    statusCode: Constants.HTTPNOTFOUND,
    status: Constants.FAILED_STATUS,
    message,
    type: ResponseType.ERROR,
  });
};

const handleBadRequest = (
  res: Response,
  message: string = Constants.INVALID_DATA_ERROR_MESSAGE,
): Response => {
  return handleResponse(res, {
    statusCode: Constants.HTTPBADREQUEST,
    status: Constants.FAILED_STATUS,
    message,
    type: ResponseType.ERROR,
  });
};

const handleUnauthorized = (res: Response): Response => {
  return handleResponse(res, {
    statusCode: Constants.UNAUTHORIZED,
    status: Constants.FAILED_STATUS,
    message: Constants.UNAUTHORIZED_MESSAGE,
    type: ResponseType.ERROR,
  });
};

const handleCustomResponse = (
  res: Response,
  success: boolean | string,
  statusCode: number,
  result: unknown,
  message: string,
): Response => {
  return handleResponse(res, { statusCode, status: success, result, message });
};

export {
  handleBadRequest,
  handleCustomResponse,
  handleDataCreation,
  handleDataNotCreation,
  handleDataRetrieval,
  handleError,
  handleLogin,
  handleNotFound,
  handleResponse,
  handleSuccess,
  handleUnauthorized,
  ResponseBuilder,
};
