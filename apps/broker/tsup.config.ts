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
  esbuildPlugins: [
    {
      // The generated Prisma client (src/generated/prisma) must NOT be bundled: it finds its query
      // engine and schema next to its own files (__dirname). dist/main.js imports it from
      // ../src/generated/prisma, so the runtime image keeps that folder (see Dockerfile).
      name: "external-generated-prisma",
      setup(build) {
        build.onResolve({ filter: /\/generated\/prisma\/index\.js$/ }, () => ({
          path: "../src/generated/prisma/index.js",
          external: true,
        }));
      },
    },
  ],
});
