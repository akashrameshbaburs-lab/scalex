import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  port: parseInt(required("PORT", "8080"), 10),
  nodeEnv: required("NODE_ENV", "development"),
  pg: {
    host: required("PG_HOST", "localhost"),
    port: parseInt(required("PG_PORT", "5432"), 10),
    user: required("PG_USER", "scalex"),
    password: required("PG_PASSWORD", "scalex"),
    database: required("PG_DATABASE", "scalex"),
  },
  redis: {
    host: required("REDIS_HOST", "localhost"),
    port: parseInt(required("REDIS_PORT", "6379"), 10),
  },
  baseUrl: required("BASE_URL", "http://localhost:8080"),
  // Redis TTL for cached short codes (seconds). 6h is a good balance:
  // long enough to keep hot keys cached, short enough to refresh stats.
  cacheTtlSeconds: parseInt(required("CACHE_TTL_SECONDS", "21600"), 10),
};
