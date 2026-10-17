# System Design Notes — interview talking points

These are the decisions worth explaining out loud. Each maps to a real
implementation detail in this repo.

## 1. Why base62-on-id instead of random keys?

Random keys (e.g. nanoid) need collision checks and retries on every insert.
Encoding the `BIGSERIAL` id is **collision-free by construction**: ids are
unique, so encoded codes are unique. Sequential ids also keep the Postgres
B-tree insert append-mostly (cheap pages, no random IO). 7 base62 chars cover
~3.5 trillion ids, which is plenty for a shortener.

Trade-off: sequential codes are guessable. Acceptable here; in production you'd
add a random offset or HMAC-suffix if enumeration matters.

## 2. Why cache-aside instead of write-through?

Redirects dominate the traffic mix (~80%) and are read-only — the textbook
cache workload. Cache-aside keeps the cache honest:
- App code owns invalidation (it wrote the row, so it warms the key).
- If Redis dies, the app still works (correctness > speed).
- Write-through would couple redirect latency to Redis availability for no gain.

TTL is 6h: long enough that hot links basically never miss, short enough that
a manually corrected URL propagates.

## 3. Why is the click counter fire-and-forget?

An `UPDATE` per redirect would turn every read into a write, doubling DB load
on the hottest path for non-critical analytics. `pool.query(...).catch(() => {})`
detaches it from the request lifecycle. If we needed exact counts we'd pipe
increments into a Redis counter and flush with a periodic batch upsert.

## 4. Why 3 replicas behind Nginx instead of clustering?

Node's event loop is single-threaded: one process caps at one core. Replicas
are simpler than `cluster`/worker threads (independent failure domains, rolling
restarts, per-instance connection pools) and Nginx round-robin distributes
evenly with keep-alive connection reuse. Measured: 1 → 3 replicas scaled RPS
linearly to the test ceiling.

## 5. Connection pool sizing

`max: 20` per instance × 3 instances = 60 connections against Postgres'
default ~100 limit. Unbounded pools don't increase throughput — they cause
context-switch thrash and eventual `too many connections`. Sizing pools to
match concurrency (not CPU count) is the usual rule of thumb.

## 6. Liveness vs readiness

- `/healthz` touches nothing: safe for Docker/LB probes every 5s.
- `/healthz/ready` pings Postgres and Redis: safe for restart decisions.
Conflating them causes restart storms (liveness fails because Redis hiccups).

## 7. What would you do next at 10k RPS?

Observed ceiling in this setup (~2,500 RPS) is bounded by the local Docker
network and the single Postgres. Next levers, in ROI order:
1. PgBouncer + read replica for redirects.
2. Async click pipeline (Redis stream → worker → batched upsert).
3. Nginx in front of a second DB tier; move cache to its own node.
4. Rate limiting (token bucket in Redis) to protect the write path.
5. Prometheus/Grafana to find the next bottleneck instead of guessing.
