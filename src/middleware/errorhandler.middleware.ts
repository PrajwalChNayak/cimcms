import {
  PrismaClientInitializationError,
  PrismaClientKnownRequestError,
  PrismaClientRustPanicError,
  PrismaClientUnknownRequestError,
  PrismaClientValidationError,
} from "@prisma/client/runtime/library.js";
import { AppError } from "@utils/errors/custom.errors";
import logger from "@utils/logger.utils";
import { handleError } from "@utils/responsehandler/index.utils";
import type { NextFunction, Request, Response } from "express";

interface ParsedDbError {
  message: string;
  code: string;
  status: number;
}

interface MappedError {
  statusCode?: number;
  errorCode?: string;
  message?: string;
  stack?: string;
}

const extractField = (
  meta: Record<string, unknown> = {},
  reqBody: Record<string, unknown> = {},
  errorCode: string | null = null,
): string => {
  if (errorCode === "P2002" && meta.target) {
    if (Array.isArray(meta.target) && meta.target.length > 0) {
      const userFields = (meta.target as string[]).filter(
        (f) =>
          !["tenantId", "tenant_id", "companyId", "company_id", "id"].includes(
            f,
          ),
      );
      if (userFields.length > 0) {
        return userFields.length === 1
          ? formatFieldName(userFields[0])
          : userFields.map(formatFieldName).join(", ");
      }
      return (meta.target as string[]).length === 1
        ? formatFieldName((meta.target as string[])[0])
        : (meta.target as string[]).map(formatFieldName).join(", ");
    }
    if (typeof meta.target === "string") {
      return formatFieldName(meta.target);
    }
  }

  let raw: unknown =
    meta.field_name ??
    meta.column ??
    (Array.isArray(meta.target) ? meta.target[0] : meta.target);

  if (Array.isArray(raw)) raw = raw[0];
  if (!raw || typeof raw !== "string") return guessFromBody(reqBody);

  return formatFieldName(raw as string);
};

const formatFieldName = (field: string): string => {
  if (!field || typeof field !== "string") return "field";
  return field
    .replace(/_key$/, "")
    .replace(/_fkey$/, "")
    .replace(/_pkey$/, "");
};

const guessFromBody = (body: Record<string, unknown> = {}): string => {
  const keys = Object.keys(body);
  return keys.length ? keys[0] : "field";
};

const prismaKnownErrorMessages = (code: string, field: string): string =>
  ({
    P2000: `The value for '${field}' is too long.`,
    P2001: `No record found for '${field}'.`,
    P2002: `The value for '${field}' already exists. This field must be unique.`,
    P2003: `The field '${field}' contains an invalid reference.`,
    P2004: `A database constraint failed.`,
    P2005: `Invalid data type supplied for '${field}'.`,
    P2006: `Invalid value supplied for '${field}'.`,
    P2007: `Data validation failed in '${field}'.`,
    P2008: `Query parsing failed. Please check your request.`,
    P2009: `Failed to validate the query structure.`,
    P2010: `A database error occurred.`,
    P2011: `'${field}' cannot be null.`,
    P2012: `Missing required field '${field}'.`,
    P2013: `Missing required argument '${field}'.`,
    P2014: `Invalid relational operation on '${field}'.`,
    P2015: `Record for '${field}' could not be found.`,
    P2016: `Query interpretation error.`,
    P2017: `Related record for '${field}' does not exist.`,
    P2018: `Required connected record for '${field}' not found.`,
    P2019: `Invalid input for '${field}'.`,
    P2020: `Value for '${field}' is out of range.`,
    P2021: `Invalid table specified.`,
    P2022: `Invalid column value for '${field}'.`,
    P2023: `Inconsistent database state.`,
    P2024: `A database timeout occurred. Please try again.`,
    P2025: `The requested record could not be found.`,
    P2026: `Unsupported operation.`,
    P2027: `Multiple query engines attempted to run simultaneously.`,
    P2028: `Transaction API error.`,
    P2029: `Query builder error.`,
    P2030: `Cannot modify a required relation on '${field}'.`,
    P2031: `Missing dependent records.`,
    P2033: `Invalid argument supplied for '${field}'.`,
    P2034: `Transaction aborted due to a conflict or deadlock. Please retry.`,
  })[code] ?? "A database error occurred.";

const extractErrorMessage = (err: unknown): string => {
  if (typeof err === "string") return err;
  const e = err as { message?: string; msg?: string };
  if (e.message) return e.message;
  if (e.msg) return e.msg;
  return "An unexpected error occurred.";
};

const parseDatabaseError = (message: string): ParsedDbError | null => {
  if (!message || typeof message !== "string") return null;

  const duplicateMatch = message.match(
    /Duplicate entry '(.+?)' for key '(.+?)'/i,
  );
  if (duplicateMatch) {
    return {
      message: `The value '${duplicateMatch[1]}' already exists.`,
      code: "DUPLICATE_ENTRY",
      status: 409,
    };
  }

  const fkMatch = message.match(
    /foreign key constraint fails.*REFERENCES `(\w+)`/i,
  );
  if (fkMatch) {
    return {
      message: `Invalid reference to '${fkMatch[1]}'. The related record does not exist.`,
      code: "FK_CONSTRAINT_ERROR",
      status: 400,
    };
  }

  const dataLongMatch = message.match(/Data too long for column '(\w+)'/i);
  if (dataLongMatch) {
    return {
      message: `The value for '${dataLongMatch[1]}' is too long.`,
      code: "DATA_TOO_LONG",
      status: 400,
    };
  }

  const nullMatch = message.match(/Column '(\w+)' cannot be null/i);
  if (nullMatch) {
    return {
      message: `The field '${nullMatch[1]}' is required and cannot be empty.`,
      code: "NULL_CONSTRAINT",
      status: 400,
    };
  }

  const unknownColMatch = message.match(/Unknown column '(\w+)'/i);
  if (unknownColMatch) {
    return {
      message: `Invalid field '${unknownColMatch[1]}'.`,
      code: "UNKNOWN_COLUMN",
      status: 400,
    };
  }

  return null;
};

const errorMapper = (err: unknown, req: Request): AppError => {
  const e = err as Record<string, unknown>;

  if (err instanceof AppError) return err;

  if (e.name === "ValidationError") {
    return new AppError(String(e.message), 400, "VALIDATION_ERROR");
  }

  if (e.name === "JsonWebTokenError") {
    return new AppError("Invalid authentication token.", 401, "AUTH_ERROR");
  }
  if (e.name === "TokenExpiredError") {
    return new AppError(
      "Your session has expired. Please log in again.",
      401,
      "AUTH_EXPIRED",
    );
  }
  if (e.name === "NotBeforeError") {
    return new AppError("Token is not yet valid.", 401, "AUTH_NOT_VALID");
  }

  if (err instanceof PrismaClientKnownRequestError) {
    const field = extractField(
      err.meta as Record<string, unknown>,
      req.body as Record<string, unknown>,
      err.code,
    );
    const message = prismaKnownErrorMessages(err.code, field);
    const status =
      err.code === "P2002"
        ? 409
        : err.code === "P2025"
          ? 404
          : err.code === "P2024"
            ? 503
            : 400;
    return new AppError(message, status, `PRISMA_${err.code}`);
  }

  if (err instanceof PrismaClientValidationError) {
    const msg = err.message;
    const unknownArg = msg.match(/Unknown argument `(\w+)`/);
    const invalidValue = msg.match(/Invalid value for argument `(\w+)`/);
    const missingArg = msg.match(/Argument `(\w+)` is missing/);
    const invalidType = msg.match(/Argument `(\w+)`: Invalid value provided/);
    const expectedType = msg.match(/Expected (.+?), provided (.+)/);

    let field: string | null = null;
    let reason = "contains invalid data.";

    if (unknownArg) {
      field = unknownArg[1];
      reason = "is not recognized.";
    } else if (invalidValue) {
      field = invalidValue[1];
      reason = "contains an invalid value.";
    } else if (missingArg) {
      field = missingArg[1];
      reason = "is required but was not provided.";
    } else if (invalidType) {
      field = invalidType[1];
      reason = expectedType
        ? `should be ${expectedType[1]} but received ${expectedType[2]}.`
        : "has an invalid type.";
    }

    if (!field) {
      const anyField = msg.match(/`(\w+)`/);
      field = anyField
        ? anyField[1]
        : guessFromBody(req.body as Record<string, unknown>);
    }

    return new AppError(
      `The field '${field}' ${reason}`,
      400,
      "PRISMA_VALIDATION_ERROR",
    );
  }

  if (err instanceof PrismaClientInitializationError) {
    return new AppError(
      "Unable to connect to the database. Please try again later.",
      503,
      "DATABASE_CONNECTION_ERROR",
    );
  }

  if (err instanceof PrismaClientRustPanicError) {
    return new AppError(
      "A critical database error occurred. Please contact support.",
      500,
      "DATABASE_CRITICAL_ERROR",
    );
  }

  if (err instanceof PrismaClientUnknownRequestError) {
    const raw = err.message || "";
    const signalMatch = raw.match(/message:\s*"([^"]+)"/);
    if (signalMatch)
      return new AppError(signalMatch[1], 400, "MYSQL_SIGNAL_ERROR");
    const dbError = parseDatabaseError(raw);
    if (dbError)
      return new AppError(dbError.message, dbError.status, dbError.code);
    return new AppError("A database error occurred.", 400, "DATABASE_ERROR");
  }

  if (e.name === "MulterError") {
    const multerMessages: Record<string, string> = {
      LIMIT_FILE_SIZE: "File size is too large.",
      LIMIT_FILE_COUNT: "Too many files uploaded.",
      LIMIT_FIELD_KEY: "Field name is too long.",
      LIMIT_FIELD_VALUE: "Field value is too long.",
      LIMIT_FIELD_COUNT: "Too many fields.",
      LIMIT_UNEXPECTED_FILE: `Unexpected file field '${String(e.field)}'.`,
      LIMIT_PART_COUNT: "Too many parts in the request.",
    };
    const message = multerMessages[String(e.code)] || "File upload error.";
    return new AppError(message, 400, `MULTER_${String(e.code)}`);
  }

  if (err instanceof SyntaxError && e.status === 400 && "body" in e) {
    return new AppError(
      "Invalid JSON format in request body.",
      400,
      "JSON_PARSE_ERROR",
    );
  }

  if (err instanceof TypeError) {
    return new AppError(
      "An internal server error occurred.",
      500,
      "TYPE_ERROR",
    );
  }
  if (err instanceof ReferenceError) {
    return new AppError(
      "An internal server error occurred.",
      500,
      "REFERENCE_ERROR",
    );
  }
  if (err instanceof RangeError) {
    return new AppError(
      "A value is out of the allowed range.",
      400,
      "RANGE_ERROR",
    );
  }
  if (err instanceof URIError) {
    return new AppError("Invalid URI format.", 400, "URI_ERROR");
  }

  if (e.code === "ECONNREFUSED")
    return new AppError(
      "Unable to connect to a required service.",
      503,
      "CONNECTION_REFUSED",
    );
  if (e.code === "ECONNRESET")
    return new AppError(
      "Connection was reset. Please try again.",
      503,
      "CONNECTION_RESET",
    );
  if (e.code === "ETIMEDOUT" || e.code === "ESOCKETTIMEDOUT")
    return new AppError(
      "Request timed out. Please try again.",
      504,
      "REQUEST_TIMEOUT",
    );
  if (e.code === "ENOTFOUND")
    return new AppError(
      "Unable to resolve the requested resource.",
      503,
      "DNS_ERROR",
    );

  if (e.type === "entity.too.large")
    return new AppError("Request body is too large.", 413, "PAYLOAD_TOO_LARGE");
  if (e.type === "charset.unsupported")
    return new AppError(
      "Unsupported character encoding.",
      415,
      "UNSUPPORTED_CHARSET",
    );
  if (e.type === "encoding.unsupported")
    return new AppError(
      "Unsupported content encoding.",
      415,
      "UNSUPPORTED_ENCODING",
    );

  if (e.status === 429 || e.statusCode === 429)
    return new AppError(
      String(e.message) || "Too many requests. Please slow down.",
      429,
      "RATE_LIMIT_EXCEEDED",
    );
  if (e.status === 401 || e.statusCode === 401)
    return new AppError(
      String(e.message) || "Authentication required.",
      401,
      "AUTHENTICATION_REQUIRED",
    );
  if (e.status === 403 || e.statusCode === 403)
    return new AppError(
      String(e.message) || "Access denied.",
      403,
      "ACCESS_DENIED",
    );
  if (e.status === 404 || e.statusCode === 404)
    return new AppError(
      String(e.message) || "Resource not found.",
      404,
      "NOT_FOUND",
    );

  if (typeof e.code === "string" && e.code.startsWith("ER_")) {
    const dbError = parseDatabaseError(String(e.message));
    if (dbError)
      return new AppError(dbError.message, dbError.status, dbError.code);
    return new AppError("A database error occurred.", 400, String(e.code));
  }

  if (e.code === "EENVELOPE" || e.code === "EAUTH") {
    return new AppError(
      "Failed to send email. Please try again later.",
      500,
      "EMAIL_ERROR",
    );
  }

  if (e.code === "NoSuchBucket" || e.code === "NoSuchKey")
    return new AppError(
      "The requested file could not be found.",
      404,
      "FILE_NOT_FOUND",
    );
  if (e.code === "AccessDenied")
    return new AppError(
      "Access to the file storage is denied.",
      403,
      "STORAGE_ACCESS_DENIED",
    );

  if (e.statusCode || e.status) {
    const statusCode = Number(e.statusCode ?? e.status);
    return new AppError(
      extractErrorMessage(err),
      statusCode,
      String(e.code ?? "GENERIC_ERROR"),
    );
  }

  const message =
    process.env.NODE_ENV === "production"
      ? "An unexpected error occurred. Please try again later."
      : extractErrorMessage(err);

  return new AppError(message, 500, "INTERNAL_SERVER_ERROR");
};

const errorHandler = async (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const mapped = errorMapper(err, req) as MappedError;

  const statusCode = mapped.statusCode ?? 500;
  const errorCode = mapped.errorCode ?? "UNKNOWN_ERROR";
  const message = mapped.message ?? "An unexpected error occurred.";

  const details = {
    message,
    errorCode,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: req.user?.userId ?? "anonymous",
    time: new Date().toISOString(),
  };

  if (statusCode >= 500) {
    logger.error("Server Error:", { ...details, stack: (err as Error).stack });
  } else if (statusCode >= 400) {
    logger.warn("Client Error:", details);
  }

  const isProd = process.env.NODE_ENV === "production";

  const response: Record<string, unknown> = {
    success: false,
    statusCode,
    message,
    errorCode,
  };

  if (!isProd) {
    response.stack = mapped.stack ?? (err as Error).stack;
    response.details = details;
    response.originalError = (err as Error).message;
  }

  await handleError(res, response, statusCode);
};

export default errorHandler;
