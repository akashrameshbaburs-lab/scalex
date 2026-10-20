"use strict";

// Tests for the Express app factory (src/app.ts -> dist/app.js).
//
// createApp() is a factory and does NOT listen on import (that happens in
// dist/server.js), so we bind it to an ephemeral loopback port ourselves.
// No test below ever queries Postgres or Redis: they exercise only the
// health endpoint, schema validation failures, and the 404 fallback.
//
// Two import-time side effects are handled explicitly:
//   - pino request logs are silenced so they don't interleave with the
//     test runner's output stream;
//   - dist/db/redis.js creates its ioredis client eagerly, so the socket is
//     disconnected in `after` to let the test process exit.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { logger } = require("../dist/utils/logger.js");
const { createApp } = require("../dist/app.js");
const { redis } = require("../dist/db/redis.js");

logger.level = "silent";

let server;
let baseUrl;

// Minimal HTTP helper: resolves status, headers, raw body and parsed JSON body.
function request(path, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      baseUrl + path,
      {
        method,
        agent: false, // close the socket after each response so server.close() completes
        headers: payload
          ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload), ...headers }
          : headers,
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            raw,
            body: raw ? JSON.parse(raw) : null,
          })
        );
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Collect "METHOD /path" entries from the app's router, descending into
// routers mounted with app.use(router).
function collectRoutes(app) {
  const routes = [];
  const walk = (stack) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) {
          routes.push(`${method.toUpperCase()} ${layer.route.path}`);
        }
      } else if (layer.handle && Array.isArray(layer.handle.stack)) {
        walk(layer.handle.stack); // mounted express Router
      }
    }
  };
  walk(app._router ? app._router.stack : app.router.stack);
  return routes;
}

before(async () => {
  server = http.createServer(createApp());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  redis.disconnect();
});

test("createApp returns a fresh Express application instance (no listen on import)", () => {
  // The factory pattern itself proves import side effects are absent: this
  // file already imported dist/app.js without binding a port (server.ts owns
  // the .listen() call), and two calls yield two distinct apps.
  const a = createApp();
  const b = createApp();
  assert.notEqual(a, b);
  assert.equal(typeof a.listen, "function");
  assert.equal(typeof a.handle, "function");
});

test("route table exposes health, shorten, redirect and stats routes", () => {
  const expected = [
    "GET /healthz",
    "GET /healthz/ready",
    "POST /api/shorten",
    "GET /s/:code",
    "GET /api/stats/:code",
  ];
  assert.deepEqual(collectRoutes(createApp()).sort(), expected.sort());
});

test("unknown paths return 404 with { error: not_found }", async () => {
  const res = await request("/definitely/not/a/route");
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: "not_found" });
});

test("GET /healthz returns 200 { status: ok } without touching the database", async () => {
  const res = await request("/healthz");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: "ok" });
});

test("helmet security headers and CORS are applied", async () => {
  const res = await request("/healthz", { headers: { origin: "http://example.com" } });
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  assert.ok(res.headers["content-security-policy"], "expected a CSP header from helmet");
  assert.equal(res.headers["access-control-allow-origin"], "*");
});

test("POST /api/shorten with a missing url returns 400 validation_error", async () => {
  const res = await request("/api/shorten", { method: "POST", body: {} });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "validation_error");
  assert.deepEqual(res.body.details.fieldErrors.url, ["Required"]);
});

test("POST /api/shorten with a malformed url returns 400 validation_error", async () => {
  const res = await request("/api/shorten", { method: "POST", body: { url: "not a url" } });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "validation_error");
  assert.deepEqual(res.body.details.fieldErrors.url, ["must be a valid URL"]);
});

test("GET /s/<invalid-code> returns an empty 404 before any lookup", async () => {
  // "not_a_code" fails codeParamSchema (underscore), so the controller
  // short-circuits with 404 and never reaches resolveCode()/Redis/Postgres.
  const res = await request("/s/not_a_code");
  assert.equal(res.status, 404);
  assert.equal(res.raw, "");
});
