import errorHandler from "@middleware/errorhandler.middleware";
import apiRoute from "@routes/index.routes";
import { apiReference } from "@scalar/express-api-reference";
import limiter from "@security/limiter.security";
import requestInterceptorDataValidation from "@security/requestinterceptordatavalidation.security";
import { NotFoundError } from "@utils/errors/custom.errors";
import logger from "@utils/logger.utils";
import cors from "cors";
import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import "express-async-errors";
import helmet from "helmet";
import path from "path";
import yaml from "yamljs";

const app = express();

const openapiFile = path.resolve(process.cwd(), "openapi.yaml");
const openapiSpec = yaml.load(openapiFile) as Record<string, unknown>;

const apiBaseUrl = `http://localhost:${process.env.PORT}/${process.env.MAIN_ROUTE}`;

openapiSpec["servers"] = [
  {
    url: apiBaseUrl,
    description: "Local API",
  },
];

// Scalar API Docs
app.use(
  "/api-docs",
  apiReference({
    content: openapiSpec,
    theme: "purple",
  }),
);

app.use(express.json());
app.use(cors());
// app.use(sessionCustom);
app.use(`/${process.env.MAIN_ROUTE}`, apiRoute);

app.use(requestInterceptorDataValidation);

app.use(limiter);

// Content Security Policy (CSP)
app.use(
  helmet.contentSecurityPolicy({
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
  }),
);

// HTTP Strict Transport Security (HSTS)
app.use(
  helmet.hsts({
    maxAge: 63072000, // 2 years in seconds
    includeSubDomains: true,
    preload: true,
  }),
);

// X-Content-Type-Options
app.use(helmet.xContentTypeOptions());

// Referrer-Policy / X-Frame-Options
app.use(helmet.frameguard({ action: "deny" }));
app.use(helmet.referrerPolicy({ policy: "same-origin" }));

// 404 handler
app.all("*", (_req: Request, _res: Response, next: NextFunction) => {
  next(
    new NotFoundError(
      `Cannot Find ${_req.method} ${_req.originalUrl} on this server.`,
    ),
  );
});

// Error handler must be last
app.use(errorHandler);

app.listen(process.env.PORT, async () => {
  logger.info(`App is Running ON PORT => ${process.env.PORT}`);
  logger.info(
    `API Documentation available at http://localhost:${process.env.PORT}/api-docs`,
  );
});
