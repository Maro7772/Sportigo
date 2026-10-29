import http from "node:http";
import { createApp } from "./app";
import { connectDB, disconnectDB } from "./config/db";
import { env } from "./config/env";
import {
  ensureInitialSuperAdmin,
  ensureSettings,
} from "./services/bootstrap.service";

async function bootstrap(): Promise<void> {
  await connectDB();
  await ensureInitialSuperAdmin();
  await ensureSettings();

  const app = createApp();
  const server = http.createServer(app);

  server.listen(env.PORT, () => {
    console.log(`🚀 Scouting Super Admin API on http://localhost:${env.PORT}`);
    console.log(`   ENV: ${env.NODE_ENV}`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n${signal} received - shutting down...`);

    const forceExit = setTimeout(() => {
      console.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    server.close(async () => {
      await disconnectDB();
      console.log("👋 Server closed");
      process.exit(0);
    });
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled rejection:", reason);
  });

  process.on("uncaughtException", (error) => {
    console.error("Uncaught exception:", error);
    void shutdown("uncaughtException");
  });
}

bootstrap().catch((error) => {
  console.error("❌ Failed to start server:", error);
  process.exit(1);
});
