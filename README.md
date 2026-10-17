# ScaleX — Load-Tested, High-Performance URL Shortener

ScaleX is a horizontally scalable URL shortener built to survive high concurrent
traffic, with every performance claim backed by reproducible load-test numbers.
It exists to answer one question properly: **what actually happens when 100
users become 10,000, and what did you change about it?**

## The problem

Most backend projects are demo-grade: they work for one user and collapse under
concurrency because every request does a database round-trip, on a single
process, with no caching. ScaleX is engineered the other way around — measure
first, then remove the bottleneck.

## Architecture

```
                        ┌─────────────────────────┐
  Client / k6 ────────▶│  Nginx (round-robin LB)  │
                        └───────────┬─────────────┘
                ┌───────────────────┼───────────────────┐
                ▼                   ▼                   ▼
         ┌────────────┐      ┌────────────┐      ┌────────────┐
         │ API #1     │      │ API #2     │      │ API #3     │
         │ Express/TS │      │ Express/TS │      │ Express/TS │
         └─────┬──────┘      └─────┬──────┘      └─────┬──────┘
               │   cache-aside    │                    │
               ▼                  ▼                    ▼
         ┌───────────┐      ┌───────────────────────────┐
         │  Redis    │      │  PostgreSQL (BIGSERIAL id │
         │  (cache)  │      │  + unique indexed code)   │
         └───────────┘      └───────────────────────────┘
```

**Request flow**

1. `POST /api/shorten` — allocate next id from the Postgres sequence, base62
   encode it (7 chars ≈ 3.5 trillion ids), insert atomically, warm the cache.
2. `GET /s/:code` — **cache-aside**: check Redis first (sub-ms). On miss, hit
   the indexed `short_code` column and repopulate Redis. Click counting is
   fire-and-forget so it never blocks the redirect.
3. Nginx distributes across 3 API replicas with keep-alive connections.

## Key design decisions (the interview part)

| Decision | Why |
|---|---|
| **Base62 on BIGSERIAL id** | Collision-free by construction (unlike random keys that retry), compact, and sequential ids keep Postgres B-tree inserts append-mostly. |
| **Cache-aside on redirect** | Redirects dominate traffic (~80%) and are read-only — the ideal cache workload. Creates bypass the cache path entirely. |
| **Fire-and-forget click counter** | An `UPDATE` per redirect doubles DB write load for non-critical analytics. Decoupling keeps the hot path read-only. |
| **3 API replicas behind Nginx** | Node is single-threaded; horizontal replicas use all cores and remove the process as a ceiling. |
| **Pool of 20 Postgres connections per instance** | Bounded and tuned — unbounded connections cause pool exhaustion, not throughput. |
| **Health endpoints split liveness/readiness** | `/healthz` has zero dependencies (safe for LB checks); `/healthz/ready` verifies Postgres + Redis (safe for restart decisions). |
| **Graceful shutdown on SIGTERM** | `server.close()` drains in-flight requests so rolling restarts and `docker stop` never drop traffic. |

## Tech stack

- **Backend:** Node.js 22, Express 4, TypeScript (strict)
- **Database:** PostgreSQL 16 (BIGSERIAL, unique index, connection pooling)
- **Cache:** Redis 7 (ioredis, TTL-based invalidation)
- **Load balancing:** Nginx (round-robin, upstream keep-alive)
- **Load testing:** k6 (constant-arrival-rate scenarios, custom metrics, thresholds)
- **Containerization:** Docker, Docker Compose (health-gated startup ordering)
- **Observability:** pino structured logs, `X-Cache` HIT/MISS headers

## API

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/healthz` | Liveness (no dependencies) |
| `GET` | `/healthz/ready` | Readiness (Postgres + Redis ping) |
| `POST` | `/api/shorten` | `{ "url": "https://..." }` → `{ code, shortUrl }` |
| `GET` | `/s/:code` | 302 redirect (`X-Cache: HIT\|MISS` header) |
| `GET` | `/api/stats/:code` | Click count + metadata |

## Quick start

```bash
docker compose up --build -d

# verify
curl http://localhost:8080/healthz

# shorten a URL
curl -X POST http://localhost:8080/api/shorten \
  -H "Content-Type: application/json" \
  -d '{"url":"https://github.com"}'

# follow it back
curl -i http://localhost:8080/s/<code>
```

## Load testing

Reproduce every number in `docs/LOADTEST_RESULTS.md`:

```bash
# 1. seed the hot set
k6 run k6/seed.js --env BASE_URL=http://localhost:8080

# 2. baseline: single API instance, cache cold
k6 run k6/load-test.js --env RATE=50 --env P95_TARGET_MS=500

# 3. scaled: 3 replicas + warm Redis cache
k6 run k6/load-test.js --env RATE=500 --env P95_TARGET_MS=50

# record http_reqs, p95, cache_hit_rate from both runs
```

## Results

See **[docs/LOADTEST_RESULTS.md](docs/LOADTEST_RESULTS.md)** for the full
before/after benchmark table and how to interpret it.

**Sample run (local):** 1,000 RPS sustained (30s), p95 redirect ~2.25 ms, 0% errors, cache-hit 100% across 3 API replicas behind Nginx. System held 1,500 RPS with p95 < 3.5 ms; 2,000–2,500 RPS tested with minimal latency increase.

## Project layout

```
scalex/
├── backend/          # Express + TypeScript API (multi-stage Docker build)
├── nginx/            # round-robin load balancer config
├── k6/               # seed + load-test scripts with custom metrics
├── docs/             # architecture, load-test results, system design notes
└── docker-compose.yml
```

## Roadmap

- **Async click pipeline** (Redis stream → worker → batched Postgres upserts)
- **Rate limiting** per IP (token bucket in Redis)
- **Prometheus + Grafana** dashboards with p95/RPS/alerts
- **Postgres read replica** for redirect reads + PgBouncer
- **Custom aliases** and link expiry
