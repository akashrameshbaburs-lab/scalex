import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import {
  buildShortUrl,
  createShortUrl,
  getStats,
  incrementClicks,
  resolveCode,
} from "../services/url.service";
import { codeParamSchema, shortenSchema } from "../middlewares/validation";
import { logger } from "../utils/logger";

// POST /api/shorten  { "url": "https://..." }
export async function shorten(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = shortenSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(StatusCodes.BAD_REQUEST).json({
        error: "validation_error",
        details: parsed.error.flatten(),
      });
      return;
    }
    const code = await createShortUrl(parsed.data.url);
    res.status(StatusCodes.CREATED).json({
      code,
      shortUrl: buildShortUrl(code),
      originalUrl: parsed.data.url,
    });
  } catch (err) {
    next(err);
  }
}

// GET /s/:code -> 302 redirect (hot path, cache-aside)
export async function redirect(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = codeParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(StatusCodes.NOT_FOUND).end();
      return;
    }
    const code = parsed.data.code;
    const result = await resolveCode(code);

    if (!result.found) {
      res.status(StatusCodes.NOT_FOUND).end();
      return;
    }

    // count click off the critical path so redirect latency stays minimal
    incrementClicks(code);
    // cacheHit header is useful during load tests to prove cache effectiveness
    res.set("X-Cache", result.cacheHit ? "HIT" : "MISS");
    res.redirect(StatusCodes.MOVED_TEMPORARILY, result.url);
  } catch (err) {
    next(err);
  }
}

// GET /api/stats/:code
export async function stats(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = codeParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(StatusCodes.BAD_REQUEST).json({ error: "invalid_code" });
      return;
    }
    const row = await getStats(parsed.data.code);
    if (!row) {
      res.status(StatusCodes.NOT_FOUND).json({ error: "not_found" });
      return;
    }
    res.json({
      code: parsed.data.code,
      originalUrl: row.original_url,
      clicks: Number(row.clicks),
      createdAt: row.created_at,
    });
  } catch (err) {
    next(err);
  }
}
