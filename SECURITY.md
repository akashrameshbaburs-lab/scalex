# Security Policy

## Scope

ScaleX is a portfolio/load-testing project intended to run **locally via Docker**.
It is not hardened for public internet exposure; treat it as a development
system.

## Supported versions

Only the latest commit on `main` receives fixes.

## Production-hardening checklist

The `.env.example` values are development defaults. Before using any of this
outside a local demo, change at least:

| Variable | Why |
| --- | --- |
| `PG_PASSWORD` | Dev default (`scalex`) is public in this repo |
| `BASE_URL` | Must match the real public origin (redirect host allow-listing) |

Additional notes:

- Short codes are generated from a cryptographic random source (`crypto.randomBytes`
  mapped over base62); the code space (6 chars ≈ 57 billion) plus a uniqueness
  constraint in Postgres prevents prediction/collision attacks.
- The API is rate-limited at the nginx layer for the load test; any public
  deployment should keep (or tighten) that limit on `/api/shorten`.
- No user PII is stored — only URL targets and click counters.

## Reporting a vulnerability

Please open a GitHub issue describing the issue and steps to reproduce. Issues
labeled `security` take priority.
