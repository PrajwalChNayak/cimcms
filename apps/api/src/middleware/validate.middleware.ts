import { ValidationError } from "@utils/errors/custom.errors";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodType } from "zod";

interface ValidateSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
  headers?: ZodType;
}

type Part = keyof ValidateSchemas;
const PARTS: Part[] = ["params", "query", "headers", "body"];

/**
 * Validates request parts with Zod. On success the parsed values replace
 * req.body / req.query / req.params (headers are validated only, not replaced).
 * On failure throws ValidationError(VALIDATION_FAILED) with the issues in details.
 */
export const validate = (schemas: ValidateSchemas): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const issues: { in: Part; path: PropertyKey[]; message: string; code: string }[] = [];

    for (const part of PARTS) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (!result.success) {
        for (const i of result.error.issues) {
          issues.push({ in: part, path: i.path, message: i.message, code: i.code });
        }
        continue;
      }
      if (part === "headers") continue;
      // req.query is a getter in some Express versions; define it explicitly.
      Object.defineProperty(req, part, {
        value: result.data,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }

    if (issues.length > 0) {
      throw new ValidationError("Request validation failed.", "VALIDATION_FAILED", issues);
    }
    next();
  };
};

export default validate;
