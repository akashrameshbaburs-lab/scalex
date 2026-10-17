"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const pino_http_1 = __importDefault(require("pino-http"));
const http_status_codes_1 = require("http-status-codes");
const routes_1 = require("./routes");
const logger_1 = require("./utils/logger");
const config_1 = require("./config");
function createApp() {
    const app = (0, express_1.default)();
    app.set("trust proxy", true);
    app.use((0, helmet_1.default)());
    app.use((0, cors_1.default)());
    app.use(express_1.default.json({ limit: "16kb" }));
    // structured request logs; disabled for health checks to keep logs sane
    app.use((0, pino_http_1.default)({
        logger: logger_1.logger,
        autoLogging: {
            ignore: (req) => req.url === "/healthz" || req.url === "/healthz/ready",
        },
    }));
    app.use(routes_1.router);
    app.use((_req, res) => {
        res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json({ error: "not_found" });
    });
    // centralized error handler
    app.use((err, _req, res, _next) => {
        logger_1.logger.error({ err }, "unhandled error");
        res.status(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR).json({
            error: "internal_error",
            ...(config_1.config.nodeEnv !== "production" && { message: err.message }),
        });
    });
    return app;
}
