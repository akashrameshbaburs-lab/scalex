"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const config_1 = require("./config");
const pool_1 = require("./db/pool");
const redis_1 = require("./db/redis");
const logger_1 = require("./utils/logger");
async function main() {
    // fail fast if dependencies are unreachable
    await pool_1.pool.query("SELECT 1");
    await redis_1.redis.ping();
    const app = (0, app_1.createApp)();
    const server = app.listen(config_1.config.port, () => {
        logger_1.logger.info(`ScaleX API listening on :${config_1.config.port}`);
    });
    // graceful shutdown so rolling restarts / docker stop don't drop requests
    const shutdown = async (signal) => {
        logger_1.logger.info(`${signal} received, shutting down`);
        server.close(async () => {
            await pool_1.pool.end();
            redis_1.redis.disconnect();
            process.exit(0);
        });
        setTimeout(() => process.exit(1), 10000).unref();
    };
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("SIGINT", () => void shutdown("SIGINT"));
}
main().catch((err) => {
    logger_1.logger.error({ err }, "fatal startup error");
    process.exit(1);
});
