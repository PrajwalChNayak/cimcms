// TEMPORARY (verification only, delete): separate Vite cache dir.
import base from "./vite.config";
export default (env: { mode: string; command: "build" | "serve" }) => {
  const c = (base as unknown as (e: typeof env) => Record<string, unknown>)(env);
  return { ...c, cacheDir: "node_modules/.vite-zz-verify" };
};
