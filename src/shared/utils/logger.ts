// Logger Configuration
interface LoggerConfig {
  enableRemoteLogging: boolean;
  remoteLogEndpoint: string;
  environment: string;
}

const config: LoggerConfig = {
  enableRemoteLogging: import.meta.env.PROD,
  remoteLogEndpoint:
    import.meta.env.VITE_LOG_ENDPOINT || "https://logs.example.com/ingest",
  environment: import.meta.env.MODE || "development",
};

interface LogContext {
  [key: string]: unknown;
}

interface RemoteLogData extends LogContext {
  level: string;
  message: string;
  timestamp: string;
  environment: string;
  userAgent: string;
  url: string;
}

/**
 * Send logs to remote logging service
 */
const sendRemoteLog = async (
  level: string,
  message: string,
  data: LogContext = {},
): Promise<void> => {
  if (!config.enableRemoteLogging) return;

  try {
    const logData: RemoteLogData = {
      level,
      message,
      timestamp: new Date().toISOString(),
      environment: config.environment,
      userAgent: navigator.userAgent,
      url: window.location.href,
      ...data,
    };

    if (navigator.sendBeacon) {
      navigator.sendBeacon(config.remoteLogEndpoint, JSON.stringify(logData));
    } else {
      await fetch(config.remoteLogEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(logData),
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // silent fail
  }
};

/**
 * Error logging
 */
export const logError = (
  message: string,
  error?: unknown,
  context: LogContext = {},
): void => {
  const errorData = {
    error: error instanceof Error ? error.message : String(error || ""),
    stack: error instanceof Error ? error.stack : "",
    ...context,
  };

  console.error(`[ERROR] ${message}`, errorData);

  sendRemoteLog("error", message, errorData);

  if ((window as any).gtag) {
    try {
      (window as any).gtag("event", "exception", {
        description: `${message}: ${
          error instanceof Error ? error.message : String(error || "")
        }`,
        fatal: (context as any)?.fatal || false,
      });
    } catch {}
  }
};

/**
 * Warning logging
 */
export const logWarning = (message: string, context: LogContext = {}): void => {
  console.warn(`[WARNING] ${message}`, context);
  sendRemoteLog("warning", message, context);
};

/**
 * Info logging
 */
export const logInfo = (message: string, context: LogContext = {}): void => {
  console.info(`[INFO] ${message}`, context);
  sendRemoteLog("info", message, context);
};
