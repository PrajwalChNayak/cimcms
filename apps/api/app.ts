import "dotenv/config";
import { createApp } from "@/createApp";
import { initTimeseries } from "@models/init/timeseries";
import logger from "@utils/logger.utils";

const app = createApp();

async function bootstrap(): Promise<void> {
  // Must run before anything writes telemetry. Idempotent (safe on every boot).
  await initTimeseries();

  // Later tasks: start the MQTT client here (T2.5), AFTER initTimeseries(), so
  // the first inbound telemetry message never creates a plain collection.

  app.listen(process.env.PORT, () => {
    logger.info(`App is Running ON PORT => ${process.env.PORT}`);
    if (process.env.API_DOCS_ENABLED === "true") {
      logger.info(
        `API Documentation available at http://localhost:${process.env.PORT}/api-docs`,
      );
    }
  });
}

bootstrap().catch((err: unknown) => {
  logger.error("Bootstrap failed", err);
  process.exit(1);
});
