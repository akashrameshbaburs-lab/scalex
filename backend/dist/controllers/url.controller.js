"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shorten = shorten;
exports.redirect = redirect;
exports.stats = stats;
const http_status_codes_1 = require("http-status-codes");
const url_service_1 = require("../services/url.service");
const validation_1 = require("../middlewares/validation");
// POST /api/shorten  { "url": "https://..." }
async function shorten(req, res, next) {
    try {
        const parsed = validation_1.shortenSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({
                error: "validation_error",
                details: parsed.error.flatten(),
            });
            return;
        }
        const code = await (0, url_service_1.createShortUrl)(parsed.data.url);
        res.status(http_status_codes_1.StatusCodes.CREATED).json({
            code,
            shortUrl: (0, url_service_1.buildShortUrl)(code),
            originalUrl: parsed.data.url,
        });
    }
    catch (err) {
        next(err);
    }
}
// GET /s/:code -> 302 redirect (hot path, cache-aside)
async function redirect(req, res, next) {
    try {
        const parsed = validation_1.codeParamSchema.safeParse(req.params);
        if (!parsed.success) {
            res.status(http_status_codes_1.StatusCodes.NOT_FOUND).end();
            return;
        }
        const code = parsed.data.code;
        const result = await (0, url_service_1.resolveCode)(code);
        if (!result.found) {
            res.status(http_status_codes_1.StatusCodes.NOT_FOUND).end();
            return;
        }
        // count click off the critical path so redirect latency stays minimal
        (0, url_service_1.incrementClicks)(code);
        // cacheHit header is useful during load tests to prove cache effectiveness
        res.set("X-Cache", result.cacheHit ? "HIT" : "MISS");
        res.redirect(http_status_codes_1.StatusCodes.MOVED_TEMPORARILY, result.url);
    }
    catch (err) {
        next(err);
    }
}
// GET /api/stats/:code
async function stats(req, res, next) {
    try {
        const parsed = validation_1.codeParamSchema.safeParse(req.params);
        if (!parsed.success) {
            res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({ error: "invalid_code" });
            return;
        }
        const row = await (0, url_service_1.getStats)(parsed.data.code);
        if (!row) {
            res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json({ error: "not_found" });
            return;
        }
        res.json({
            code: parsed.data.code,
            originalUrl: row.original_url,
            clicks: Number(row.clicks),
            createdAt: row.created_at,
        });
    }
    catch (err) {
        next(err);
    }
}
