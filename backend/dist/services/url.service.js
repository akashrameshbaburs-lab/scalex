"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveCode = resolveCode;
exports.createShortUrl = createShortUrl;
exports.incrementClicks = incrementClicks;
exports.getStats = getStats;
exports.buildShortUrl = buildShortUrl;
const pool_1 = require("../db/pool");
const redis_1 = require("../db/redis");
const base62_1 = require("../utils/base62");
const config_1 = require("../config");
const MAX_RETRIES = 3; // guard against the (unlikely) unique-code collision
/**
 * Cache-aside resolution for GET /s/:code
 * 1. Try Redis (fast path, sub-millisecond)
 * 2. On miss, SELECT from Postgres (indexed on short_code) and repopulate cache
 */
async function resolveCode(code) {
    const cached = await (0, redis_1.cacheGet)(code);
    if (cached !== null) {
        return { found: true, url: cached, cacheHit: true };
    }
    const { rows } = await pool_1.pool.query("SELECT original_url FROM urls WHERE short_code = $1", [code]);
    if (rows.length === 0) {
        return { found: false, url: null, cacheHit: false };
    }
    const url = rows[0].original_url;
    await (0, redis_1.cacheSet)(code, url);
    return { found: true, url, cacheHit: false };
}
/**
 * Insert a new short URL in a single statement:
 * 1. Allocate the next id from the table's sequence (same source of truth
 *    as BIGSERIAL, so ids stay unique and monotonic).
 * 2. base62-encode it in JS and insert (id, short_code, original_url) atomically.
 * On the astronomically-unlikely unique collision, retry with a fresh id.
 */
async function createShortUrl(originalUrl) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const { rows: idRows } = await pool_1.pool.query("SELECT nextval(pg_get_serial_sequence('urls', 'id')) AS id");
        const code = (0, base62_1.encode)(BigInt(idRows[0].id));
        try {
            await pool_1.pool.query("INSERT INTO urls (id, short_code, original_url) VALUES ($1, $2, $3)", [idRows[0].id, code, originalUrl]);
        }
        catch (err) {
            const e = err;
            if (e.code === "23505")
                continue; // unique violation -> retry with new id
            throw err;
        }
        await (0, redis_1.cacheSet)(code, originalUrl);
        return code;
    }
    throw new Error("Failed to allocate a unique short code");
}
/** Fire-and-forget click counter. Decoupled from the redirect path. */
function incrementClicks(code) {
    pool_1.pool.query("UPDATE urls SET clicks = clicks + 1 WHERE short_code = $1", [
        code,
    ]).catch(() => undefined);
}
async function getStats(code) {
    const { rows } = await pool_1.pool.query("SELECT original_url, clicks, created_at FROM urls WHERE short_code = $1", [code]);
    return rows.length > 0 ? rows[0] : null;
}
function buildShortUrl(code) {
    return `${config_1.config.baseUrl}/s/${code}`;
}
