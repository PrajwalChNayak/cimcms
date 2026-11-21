// Runs in every test worker before test files are imported.
// Values here are throw-away test values, not real secrets.
process.env.NODE_ENV = "test";
process.env.MAIN_ROUTE = "api/v1";
process.env.APP_BASE_URL = "http://localhost:5173";
process.env.JWT_SECRET_KEY = "test-only-jwt-secret-not-for-production";
process.env.API_DOCS_ENABLED = "false";
process.env.ARGON2_MEMORY_COST = "4096";
process.env.ARGON2_TIME_COST = "2";
process.env.ARGON2_PARALLELISM = "1";
process.env.ARGON2_HASH_LENGTH = "32";
process.env.ACCESS_TOKEN_TTL = "15m";
process.env.REFRESH_TOKEN_TTL_DAYS = "7";
process.env.REFRESH_COOKIE_NAME = "cimcms_rt";
process.env.REFRESH_COOKIE_PATH = "/api/v1/user/token";
