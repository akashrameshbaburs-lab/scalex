import http from "k6/http";
import { check } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";
const SEED_COUNT = parseInt(__ENV.SEED_COUNT || "100", 10);

export const options = {
  vus: 1,
  iterations: 1,
};

export default function () {
  for (let i = 0; i < SEED_COUNT; i++) {
    const res = http.post(
      `${BASE_URL}/api/shorten`,
      JSON.stringify({ url: `https://example.com/seed/${i}` }),
      { headers: { "Content-Type": "application/json" } }
    );
    check(res, { "seed created": (r) => r.status === 201 });
  }
}
