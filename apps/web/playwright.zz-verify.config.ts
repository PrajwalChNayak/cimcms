// TEMPORARY (verification only, delete).
import base from "./playwright.config";
const ws = base.webServer as { command: string };
export default { ...base, webServer: { ...ws, command: `${ws.command} --config vite.zz-verify.config.ts` } };
