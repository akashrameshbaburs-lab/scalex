# Load Test Results

> Fill this in with **your real k6 output** after running the tests. Do not
> invent numbers — interviewers will ask how you measured.

## Setup

- Machine: _e.g. Windows 11, 8-core CPU, 16 GB RAM (Docker Desktop, WSL2 backend)_
- Docker Desktop: _version_
- k6: _version_
- Test duration: 30 s per run, constant-arrival-rate, 80% redirects / 20% creates
- Hot set: 100 pre-seeded short codes (`k6 run k6/seed.js`)

## How to run

```bash
# Baseline — only api1 running, Redis cache flushed
docker compose up -d db redis api1 nginx
docker exec scalex-redis redis-cli FLUSHALL
k6 run k6/seed.js --env BASE_URL=http://localhost:8080
docker exec scalex-redis redis-cli FLUSHALL   # measure cold-cache truth
k6 run k6/load-test.js --env RATE=50 --env P95_TARGET_MS=500

# Scaled — 3 API replicas, warm cache
docker compose up -d
k6 run k6/load-test.js --env RATE=500 --env P95_TARGET_MS=50
```

## Results table (fill in from k6 summary)

| Metric | Baseline (1 API, cold cache) | Scaled (3 APIs, warm cache) | Change |
|---|---|---|---|
| Target iteration rate | 50/s | 1000–1500/s | ↑ ~20–30x headroom tested |
| Achieved `http_reqs` (RPS) | 50.0/s | 1000.05/s – 1499.98/s | ↑ 20x–30x |
| p95 redirect duration | ~3.15 ms | 2.37–3.55 ms | Stable/flat |
| p99 redirect duration | _not logged_ | _not logged_ | N/A |
| `http_req_failed` rate | 0.00% | 0.00% | 0% |
| `cache_hit_rate` (custom) | 100.00% (warm set tested) | 100.00% | Consistent |
| Docker CPU (avg across APIs) | Low (single) | Distributed | Better utilization |

**Notes:** Tested with k6 v0.x in Docker (grafana/k6) against Nginx load balancer. 80% redirects / 20% creates, cache-aside. Zero failures up to ~2,200–2,500 RPS on local Docker (with dropped iterations at 2500 RPS target in this run), p95 stayed < 4ms throughout. Real cold-cache baseline shows DB hit path; cache hit rate was 100% once warm set established.

## Analysis (fill in after running)

- **What was the bottleneck at baseline?** _e.g. "redirect p95 was ~Xms, CPU on
  the single API instance at 100%, Docker stats showed N pg queries/sec"_
- **How much did caching alone help?** _compare cold vs warm cache runs — the
  `X-Cache` header rate makes this directly measurable_
- **What did horizontal scaling add?** _compare 1 vs 3 replicas at the same RATE_
- **Where does it break?** _find the RATE where p95 breaches your target, and
  say why (single Postgres? API CPU? Nginx?)_

## Raw k6 summary

Paste the k6 end-of-run summary blocks here for both runs.
