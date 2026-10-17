import http from "k6/http";
import { check } from "k6";
import { Rate, Trend } from "k6/metrics";

const cacheHitRate = new Rate("cache_hit_rate");
const redirectDuration = new Trend("redirect_duration_ms");

const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";
const CODES = (__ENV.CODES || "1,2,3,4,5,6,7,8,9,10").split(",").map((s) => s.trim()).filter(Boolean);

export const options = {
  scenarios: {
    redirects_and_creates: {
      executor: "constant-arrival-rate",
      rate: parseInt(__ENV.RATE || "200", 10),
      timeUnit: "1s",
      duration: __ENV.DURATION || "30s",
      preAllocatedVUs: 100,
      maxVUs: 500,
      exec: "mixedTraffic",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    redirect_duration_ms: [`p(95)<${__ENV.P95_TARGET_MS || "400"}`],
  },
};

export function mixedTraffic() {
  if (CODES.length === 0) return;
  const code = CODES[Math.floor(Math.random() * CODES.length)];

  if (Math.random() < 0.8) {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/s/${code}`, {
      redirects: 0,
      tags: { name: "redirect" },
    });
    redirectDuration.add(Date.now() - start);
    const cacheHit = res.headers["X-Cache"] === "HIT";
    cacheHitRate.add(cacheHit);
    check(res, {
      "redirect status is 302 or 404": (r) => r.status === 302 || r.status === 404,
    });
  } else {
    const payload = JSON.stringify({
      url: `https://example.com/page/${Math.random().toString(36).slice(2)}`,
    });
    const res = http.post(`${BASE_URL}/api/shorten`, payload, {
      headers: { "Content-Type": "application/json" },
      tags: { name: "shorten" },
    });
    check(res, { "shorten status is 201": (r) => r.status === 201 });
  }
}
