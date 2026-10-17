import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { StatusCodes } from "http-status-codes";
import { router } from "./routes";
import { logger } from "./utils/logger";
import { config } from "./config";

export function createApp() {
  const app = express();

  app.set("trust proxy", true);
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "16kb" }));

  // structured request logs; disabled for health checks to keep logs sane
  app.use(
    pinoHttp({
      logger,
      autoLogging: {
        ignore: (req) =>
          req.url === "/healthz" || req.url === "/healthz/ready",
      },
    })
  );

  app.use(router);

  app.use((_req: Request, res: Response) => {
    res.status(StatusCodes.NOT_FOUND).json({ error: "not_found" });
  });

  // centralized error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, "unhandled error");
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "internal_error",
      ...(config.nodeEnv !== "production" && { message: err.message }),
    });
  });

  return app;
}
