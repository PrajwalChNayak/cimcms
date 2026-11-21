import "dotenv/config";
import { createApp } from "@/createApp";
import logger from "@utils/logger.utils";

const app = createApp();

app.listen(process.env.PORT, () => {
  logger.info(`App is Running ON PORT => ${process.env.PORT}`);
  if (process.env.API_DOCS_ENABLED === "true") {
    logger.info(
      `API Documentation available at http://localhost:${process.env.PORT}/api-docs`,
    );
  }
});
