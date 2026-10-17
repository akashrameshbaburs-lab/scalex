# ScaleX Architecture

## System overview

```
                        ┌──────────────────────────┐
  Client / k6 ────────▶ │ Nginx (round-robin LB)   │  :8080
                        └───────────┬──────────────┘
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
       ┌────────────┐        ┌────────────┐        ┌────────────┐
       │  API #1    │        │  API #2    │        │  API #3    │   Express + TS
       └─────┬──────┘        └─────┬──────┘        └─────┬──────┘
             │    cache-aside     │                     │
             ▼                    ▼                     ▼
       ┌───────────┐        ┌────────────────────────────────┐
       │   Redis   │◀──────▶│        PostgreSQL 16           │
       │  (cache)  │        │  urls(id, short_code, url, …)  │
       └───────────┘        └────────────────────────────────┘
```

## Request paths

### Shorten — `POST /api/shorten`
1. Validate body with zod (max length 2048, valid URL).
2. `SELECT nextval('urls_id_seq')` → allocate id.
3. Base62-encode the id → `short_code` (7 chars ≈ 3.5 trillion ids).
4. Single atomic `INSERT (id, short_code, original_url)`.
5. Best-effort `SET short:<code> <url> EX <ttl>` to warm the cache.
6. Return `{ code, shortUrl, originalUrl }`.

### Redirect — `GET /s/:code` (hot path)
1. `GET short:<code>` in Redis → on HIT, 302 immediately (sub-ms).
2. On MISS → indexed `SELECT original_url FROM urls WHERE short_code = $1`.
3. Repopulate Redis (TTL 6h), 302 to target.
4. `UPDATE urls SET clicks = clicks + 1` is **fire-and-forget** so the
   redirect stays read-only and never blocks on a write.
5. `X-Cache: HIT|MISS` header lets load tests measure cache effectiveness.

### Health
- `GET /healthz` — liveness, zero dependencies (safe for LB checks).
- `GET /healthz/ready` — readiness, pings Postgres + Redis (safe for restarts).

## Scaling model

| Layer | Mechanism | Bottleneck it removes |
|---|---|---|
| Process | 3 API replicas (Node is single-threaded) | single-core CPU ceiling |
| Connection | Nginx upstream keep-alive | TCP handshake per request |
| Data | Redis cache-aside | Postgres read load on hot codes |
| DB | Bounded pool (20 conns/instance) | connection exhaustion |
| Writes | Async click counter | write amplification on hot path |

## Failure handling

- **Redis down** → `cacheGet`/`cacheSet` degrade to no-op; redirects fall
  through to Postgres (slower but correct).
- **API instance killed** → Nginx round-robin skips it; `/healthz` gates
  readiness.
- **SIGTERM (rolling restart)** → `server.close()` drains in-flight requests,
  10s hard-exit fallback.
- **Short-code collision** (astronomically unlikely) → insert retry with a
  fresh id, max 3 attempts.

## Security posture

- `helmet` default headers, CORS enabled.
- Zod input validation with length caps; `express.json` body limit 16kb.
- Parameterized queries only (no string interpolation into SQL).
- Runs as non-root `node` user in the container.
