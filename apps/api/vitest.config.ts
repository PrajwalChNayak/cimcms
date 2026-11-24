import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const src = (dir: string): string => path.resolve(__dirname, "src", dir);

// Same path aliases as tsconfig.json.
export default defineConfig({
  resolve: {
    alias: {
      "@/": `${path.resolve(__dirname, "src")}/`,
      "@controllers/": `${src("controllers")}/`,
      "@middleware/": `${src("middleware")}/`,
      "@models/": `${src("models")}/`,
      "@repositories/": `${src("repositories")}/`,
      "@routes/": `${src("routes")}/`,
      "@security/": `${src("security")}/`,
      "@services/": `${src("services")}/`,
      "@utils/": `${src("utils")}/`,
      "@test/": `${path.resolve(__dirname, "test")}/`,
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/setup/postgres.ts"],
    setupFiles: ["test/setup/env.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Tests share one database; run files one after another.
    fileParallelism: false,
  },
});
