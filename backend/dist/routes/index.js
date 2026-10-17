"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const pool_1 = require("../db/pool");
const redis_1 = require("../db/redis");
const url_controller_1 = require("../controllers/url.controller");
exports.router = (0, express_1.Router)();
// Liveness - no dependencies, always fast (used by Docker + Nginx)
exports.router.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok" });
});
// Readiness - verifies Postgres + Redis are reachable (LB/diagnostics)
exports.router.get("/healthz/ready", async (_req, res) => {
    const [db, redis] = await Promise.all([(0, pool_1.pingDb)(), (0, redis_1.pingRedis)()]);
    const ok = db && redis;
    res.status(ok ? 200 : 503).json({
        status: ok ? "ready" : "degraded",
        checks: { postgres: db, redis },
    });
});
exports.router.post("/api/shorten", url_controller_1.shorten);
exports.router.get("/s/:code", url_controller_1.redirect);
exports.router.get("/api/stats/:code", url_controller_1.stats);
