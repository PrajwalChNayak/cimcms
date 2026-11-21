import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["app.ts", "convert.ts"],
  format: ["esm"],
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  // tsup/esbuild reads tsconfig.json paths natively — no plugin needed
  tsconfig: "tsconfig.json",
});
