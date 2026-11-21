import { createApp } from "@/createApp";
import type { Express } from "express";

let app: Express | undefined;

/** One shared app per test file (module registry is per file in vitest). */
export function getTestApp(): Express {
  app ??= createApp();
  return app;
}
