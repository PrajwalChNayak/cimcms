export class AppError extends Error {
  statusCode: number;
  errorCode: string;
  status: string;
  isOperational: boolean;
  details?: unknown;

  constructor(
    message: string,
    statusCode: number,
    errorCode: string,
    details?: unknown,
  ) {
    super(message);
    this.details = details;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.isOperational = true;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, errorCode = "VALIDATION_ERROR", details?: unknown) {
    super(message, 400, errorCode, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string) {
    super(message, 401, "AUTHENTICATION_ERROR");
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, "NOT_FOUND_ERROR");
  }
}
