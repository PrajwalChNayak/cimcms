interface EnvConfig {
  API_BASE_URL: string;
  API_TIMEOUT: number;
  ENABLE_LOGGING: boolean;
  /** Socket.IO path (same origin through the Vite proxy / Nginx, D-6) */
  SOCKET_PATH: string;
}

// Same-origin deployment (D-6): /api -> API, /socket.io -> WebSocket.
const DEFAULT_API_BASE_URL = "/api";

const DEV_CONFIG: EnvConfig = {
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL,
  API_TIMEOUT: 30000,
  ENABLE_LOGGING: true,
  SOCKET_PATH: import.meta.env.VITE_SOCKET_PATH ?? "/socket.io",
};

const PROD_CONFIG: EnvConfig = {
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL,
  API_TIMEOUT: 15000,
  ENABLE_LOGGING: false,
  SOCKET_PATH: import.meta.env.VITE_SOCKET_PATH ?? "/socket.io",
};

export const ENV: EnvConfig = import.meta.env.DEV ? DEV_CONFIG : PROD_CONFIG;
