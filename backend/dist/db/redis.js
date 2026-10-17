"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CACHE_PREFIX = exports.redis = void 0;
exports.cacheGet = cacheGet;
exports.cacheSet = cacheSet;
exports.pingRedis = pingRedis;
const ioredis_1 = __importDefault(require("ioredis"));
const config_1 = require("../config");
exports.redis = new ioredis_1.default({
    host: config_1.config.redis.host,
    port: config_1.config.redis.port,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
});
exports.redis.on("error", (err) => {
    console.error("Redis connection error", err);
});
exports.CACHE_PREFIX = "short:";
async function cacheGet(code) {
    try {
        return await exports.redis.get(exports.CACHE_PREFIX + code);
    }
    catch {
        return null; // degrade to DB on cache failure
    }
}
async function cacheSet(code, url) {
    try {
        await exports.redis.set(exports.CACHE_PREFIX + code, url, "EX", config_1.config.cacheTtlSeconds);
    }
    catch {
        // ignore - cache is best-effort
    }
}
async function pingRedis() {
    try {
        const pong = await exports.redis.ping();
        return pong === "PONG";
    }
    catch {
        return false;
    }
}
