import errorHandler from "@middleware/errorhandler.middleware";
import apiRoute from "@routes/index.routes";
import { apiReference } from "@scalar/express-api-reference";
import { generalLimiter } from "@security/limiter.security";
import { NotFoundError } from "@utils/errors/custom.errors";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import "express-async-errors";
import path from "path";
import helmet from "helmet";
import yaml from "yamljs";

/**
 * Builds the Express app without listening, so tests can use it with supertest.
 *
 * Middleware order (T0.4):
 *   trust proxy -> [requestId, T0.6] -> api docs -> helmet -> cors -> json
 *   -> cookies -> general rate limit -> routes -> 404 -> error handler
 */
export const createApp = (): Express => {
  const app = express();

  // Behind Nginx: the rate limiter needs the real client IP (1 proxy hop).
  app.set("trust proxy", 1);

  // TODO(T0.6): app.use(requestId) goes here.

  // Mounted before helmet so the docs page is not broken by the strict CSP.
  if (process.env.API_DOCS_ENABLED === "true") {
    const openapiFile = path.resolve(process.cwd(), "openapi.yaml");
    const openapiSpec = yaml.load(openapiFile) as Record<string, unknown>;
    openapiSpec["servers"] = [
      {
        url: `http://localhost:${process.env.PORT}/${process.env.MAIN_ROUTE}`,
        description: "Local API",
      },
    ];
    app.use("/api-docs", apiReference({ content: openapiSpec, theme: "purple" }));
  }

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      hsts: {
        maxAge: 63072000, // 2 years in seconds
        includeSubDomains: true,
        preload: true,
      },
      frameguard: { action: "deny" },
      referrerPolicy: { policy: "same-origin" },
    }),
  );
  app.use(cors({ origin: process.env.APP_BASE_URL, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(generalLimiter);

  app.use(`/${process.env.MAIN_ROUTE}`, apiRoute);

  app.all("*", (req: Request, _res: Response, next: NextFunction) => {
    next(
      new NotFoundError(
        `Cannot Find ${req.method} ${req.originalUrl} on this server.`,
      ),
    );
  });

  // Error handler must be last
  app.use(errorHandler);

  return app;
};
