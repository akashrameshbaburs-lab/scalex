import { Router, Request, Response } from "express";
import { pingDb } from "../db/pool";
import { pingRedis } from "../db/redis";
import { shorten, redirect, stats } from "../controllers/url.controller";

export const router = Router();

// Liveness - no dependencies, always fast (used by Docker + Nginx)
router.get("/healthz", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

// Readiness - verifies Postgres + Redis are reachable (LB/diagnostics)
router.get("/healthz/ready", async (_req: Request, res: Response) => {
  const [db, redis] = await Promise.all([pingDb(), pingRedis()]);
  const ok = db && redis;
  res.status(ok ? 200 : 503).json({
    status: ok ? "ready" : "degraded",
    checks: { postgres: db, redis },
  });
});

router.post("/api/shorten", shorten);
router.get("/s/:code", redirect);
router.get("/api/stats/:code", stats);
