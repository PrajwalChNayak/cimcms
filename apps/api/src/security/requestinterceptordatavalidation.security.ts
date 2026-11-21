import { handleBadRequest } from "@utils/responsehandler/index.utils";
import { NextFunction, Request, Response } from "express";

const isValidUrlString = (urlString: string): boolean => {
  return !(urlString.includes("%") || urlString.includes("script"));
};

const isValidQueryParam = (value: string): boolean => {
  return /^[a-zA-Z0-9\s_@.-]*$/.test(value) && !value.includes("--");
};

const validateQueryParams = (searchParams: URLSearchParams): boolean => {
  for (const [, value] of searchParams) {
    if (!isValidQueryParam(value)) return false;
  }
  return true;
};

export default function requestInterceptorDataValidation(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!isValidUrlString(req.originalUrl)) {
    handleBadRequest(res);
    return;
  }

  const fullUrl = new URL(req.originalUrl, `http://${req.headers.host}`);
  if (!validateQueryParams(fullUrl.searchParams)) {
    handleBadRequest(res);
    return;
  }

  next();
}
