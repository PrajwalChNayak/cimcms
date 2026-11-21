import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import path from "path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  // API_PORT / MAIN_ROUTE (no VITE_ prefix) are only used by the dev proxy.
  const env = loadEnv(mode, process.cwd(), "");
  const apiPort = env.API_PORT || "3814";
  const mainRoute = (env.MAIN_ROUTE || "api/v1").replace(/^\/+|\/+$/g, "");
  const apiOrigin = `http://localhost:${apiPort}`;

  return {
    plugins: [
      react(),
      babel({ presets: [reactCompilerPreset()] }),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
        "@api": path.resolve(import.meta.dirname, "./src/api"),
        "@store": path.resolve(import.meta.dirname, "./src/store"),
        "@shared": path.resolve(import.meta.dirname, "./src/shared"),
        "@config": path.resolve(import.meta.dirname, "./src/config"),
        "@appTypes": path.resolve(import.meta.dirname, "./src/types"),
        "@repository": path.resolve(import.meta.dirname, "./src/repository"),
        "@viewModels": path.resolve(import.meta.dirname, "./src/viewmodels"),
        "@pages": path.resolve(import.meta.dirname, "./src/pages"),
        "@components": path.resolve(import.meta.dirname, "./src/components"),
        "@view": path.resolve(import.meta.dirname, "./src/view"),
        "@features": path.resolve(import.meta.dirname, "./src/features"),
      },
    },
    server: {
      // Same-origin in dev too (D-6): browser talks to Vite, Vite forwards.
      proxy: {
        "/api": {
          target: apiOrigin,
          changeOrigin: true,
          rewrite: (p: string) => p.replace(/^\/api/, `/${mainRoute}`),
        },
        "/socket.io": { target: apiOrigin, ws: true, changeOrigin: true },
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
      css: false,
      // Absolute URL so MSW can intercept requests in jsdom.
      env: { VITE_API_BASE_URL: "http://localhost:3999/api" },
    },
  };
});
