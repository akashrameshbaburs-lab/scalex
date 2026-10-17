import { createApp } from "./app";
import { config } from "./config";
import { pool } from "./db/pool";
import { redis } from "./db/redis";
import { logger } from "./utils/logger";

async function main() {
  // fail fast if dependencies are unreachable
  await pool.query("SELECT 1");
  await redis.ping();

  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info(`ScaleX API listening on :${config.port}`);
  });

  // graceful shutdown so rolling restarts / docker stop don't drop requests
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await pool.end();
      redis.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "fatal startup error");
  process.exit(1);
});
