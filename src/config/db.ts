import mongoose from "mongoose";
import { env } from "./env";

/** Checks whether the connection string already includes a database name. */
function hasDatabaseName(uri: string): boolean {
  const withoutProtocol = uri.replace(/^mongodb(\+srv)?:\/\//i, "");
  const slashIndex = withoutProtocol.indexOf("/");
  if (slashIndex === -1) return false;

  const afterSlash = withoutProtocol.slice(slashIndex + 1).split("?")[0];
  return afterSlash.trim().length > 0;
}

export async function connectDB(): Promise<void> {
  mongoose.set("strictQuery", true);

  mongoose.connection.on("connected", () => {
    console.log("✅ MongoDB connected");
  });

  mongoose.connection.on("error", (error) => {
    console.error("❌ MongoDB connection error:", error);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("⚠️  MongoDB disconnected");
  });

  await mongoose.connect(env.MONGODB_URI, {
    // Generous timeouts: remote servers (or a slow link) can take longer than
    // the 10s defaults, which shows up as "server monitor timeout".
    serverSelectionTimeoutMS: 30_000,
    connectTimeoutMS: 30_000,
    socketTimeoutMS: 180_000,
    ...(hasDatabaseName(env.MONGODB_URI) ? {} : { dbName: env.MONGODB_DB_NAME }),
  });
}

export async function disconnectDB(): Promise<void> {
  await mongoose.connection.close();
}
