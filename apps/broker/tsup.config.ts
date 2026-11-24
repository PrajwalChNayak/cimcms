import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  // Bundle the workspace package so the runtime image needs no workspace link.
  noExternal: ["@cimcms/contracts"],
});
