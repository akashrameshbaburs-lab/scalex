import { pool } from "../db/pool";
import { cacheGet, cacheSet } from "../db/redis";
import { encode } from "../utils/base62";
import { config } from "../config";

const MAX_RETRIES = 3; // guard against the (unlikely) unique-code collision

export type ResolveResult =
  | { found: true; url: string; cacheHit: boolean }
  | { found: false; url: null; cacheHit: false };

/**
 * Cache-aside resolution for GET /s/:code
 * 1. Try Redis (fast path, sub-millisecond)
 * 2. On miss, SELECT from Postgres (indexed on short_code) and repopulate cache
 */
export async function resolveCode(code: string): Promise<ResolveResult> {
  const cached = await cacheGet(code);
  if (cached !== null) {
    return { found: true, url: cached, cacheHit: true };
  }

  const { rows } = await pool.query(
    "SELECT original_url FROM urls WHERE short_code = $1",
    [code]
  );

  if (rows.length === 0) {
    return { found: false, url: null, cacheHit: false };
  }

  const url: string = rows[0].original_url;
  await cacheSet(code, url);
  return { found: true, url, cacheHit: false };
}

/**
 * Insert a new short URL in a single statement:
 * 1. Allocate the next id from the table's sequence (same source of truth
 *    as BIGSERIAL, so ids stay unique and monotonic).
 * 2. base62-encode it in JS and insert (id, short_code, original_url) atomically.
 * On the astronomically-unlikely unique collision, retry with a fresh id.
 */
export async function createShortUrl(originalUrl: string): Promise<string> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const { rows: idRows } = await pool.query(
      "SELECT nextval(pg_get_serial_sequence('urls', 'id')) AS id"
    );
    const code = encode(BigInt(idRows[0].id));
    try {
      await pool.query(
        "INSERT INTO urls (id, short_code, original_url) VALUES ($1, $2, $3)",
        [idRows[0].id, code, originalUrl]
      );
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === "23505") continue; // unique violation -> retry with new id
      throw err;
    }
    await cacheSet(code, originalUrl);
    return code;
  }
  throw new Error("Failed to allocate a unique short code");
}

/** Fire-and-forget click counter. Decoupled from the redirect path. */
export function incrementClicks(code: string): void {
  pool.query("UPDATE urls SET clicks = clicks + 1 WHERE short_code = $1", [
    code,
  ]).catch(() => undefined);
}

export async function getStats(
  code: string
): Promise<{ original_url: string; clicks: number; created_at: string } | null> {
  const { rows } = await pool.query(
    "SELECT original_url, clicks, created_at FROM urls WHERE short_code = $1",
    [code]
  );
  return rows.length > 0 ? rows[0] : null;
}

export function buildShortUrl(code: string): string {
  return `${config.baseUrl}/s/${code}`;
}
