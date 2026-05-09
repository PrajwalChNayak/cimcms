interface EnvConfig {
  API_BASE_URL: string;
  API_TIMEOUT: number;
  ENABLE_LOGGING: boolean;
}

const DEV_CONFIG: EnvConfig = {
  API_BASE_URL:
    import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1",
  API_TIMEOUT: 30000,
  ENABLE_LOGGING: true,
};

const PROD_CONFIG: EnvConfig = {
  API_BASE_URL:
    import.meta.env.VITE_API_BASE_URL ??
    "https://iotapi.cultivoiot.in/cultivoiot/v1",
  API_TIMEOUT: 15000,
  ENABLE_LOGGING: false,
};

export const ENV: EnvConfig = import.meta.env.DEV ? DEV_CONFIG : PROD_CONFIG;
