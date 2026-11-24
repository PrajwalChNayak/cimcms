import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/setup/postgres.ts"],
    env: { BROKER_LOG: "silent" },
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Tests share one database; run files one after another.
    fileParallelism: false,
  },
});
