import { setupServer } from "msw/node";

// Default: no handlers. Tests add their own via server.use(...).
export const server = setupServer();
