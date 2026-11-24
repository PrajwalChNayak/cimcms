import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "app.ts",
    "convert.ts",
    // One-off CLI entries so `node dist/src/models/seed.js` works in the runtime image (T4.5).
    "src/models/seed.ts",
    "src/models/seed-admin.ts",
    "src/models/mqtt-account.ts",
  ],
  format: ["esm"],
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  // Bundle the workspace package so the runtime image needs no workspace link (T4.1).
  noExternal: ["@cimcms/contracts"],
  // tsup/esbuild reads tsconfig.json paths natively — no plugin needed
  tsconfig: "tsconfig.json",
});
