import Redis from "ioredis";
import { config } from "../config";

export const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on("error", (err) => {
  console.error("Redis connection error", err);
});

export const CACHE_PREFIX = "short:";

export async function cacheGet(code: string): Promise<string | null> {
  try {
    return await redis.get(CACHE_PREFIX + code);
  } catch {
    return null; // degrade to DB on cache failure
  }
}

export async function cacheSet(code: string, url: string): Promise<void> {
  try {
    await redis.set(CACHE_PREFIX + code, url, "EX", config.cacheTtlSeconds);
  } catch {
    // ignore - cache is best-effort
  }
}

export async function pingRedis(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}
