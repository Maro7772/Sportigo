import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import mongoose from "mongoose";
import { env } from "./config/env";
import apiRoutes from "./routes";
import { UPLOAD_DIR } from "./config/upload";
import { errorHandler } from "./middlewares/errorHandler";
import { notFoundHandler } from "./middlewares/notFound";

const DB_STATES: Record<number, string> = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
  99: "uninitialized",
};

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(helmet({ crossOriginResourcePolicy: false }));

  const allowAllOrigins = env.CORS_ORIGINS.includes("*");
  app.use(
    cors({
      origin: allowAllOrigins
        ? true
        : (origin, callback) => {
            if (!origin || env.CORS_ORIGINS.includes(origin)) {
              return callback(null, true);
            }
            return callback(new Error(`CORS blocked: ${origin}`));
          },
      credentials: true,
    }),
  );

  app.use(compression());
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true, limit: "2mb" }));
  app.use(cookieParser());

  if (!env.isProduction) {
    app.use(morgan("dev"));
  }

  app.use("/api", apiRoutes);

  // Uploaded images (payment proofs, logos...) are served as static files.
  app.use(
    "/uploads",
    express.static(UPLOAD_DIR, {
      maxAge: env.isProduction ? "7d" : 0,
      fallthrough: false,
    })
  );

  // Health check is intentionally outside `/api` so probes can hit it directly.
  app.get("/health", (_req, res) => {
    const database = DB_STATES[mongoose.connection.readyState] ?? "unknown";

    return res.status(database === "connected" ? 200 : 503).json({
      success: database === "connected",
      data: {
        status: database === "connected" ? "ok" : "degraded",
        database,
        uptime: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
