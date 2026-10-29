import type { ErrorRequestHandler } from "express";
import mongoose from "mongoose";
import { ZodError } from "zod";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AppError } from "../errors";
import type { ApiErrorBody } from "../utils/response";

function normalizeMongooseError(error: any): {
  statusCode: number;
  message: string;
  details?: unknown;
} | null {
  // Duplicate key (unique index)
  if (error?.code === 11000) {
    const fields = error.keyValue ? Object.keys(error.keyValue) : [];
    return {
      statusCode: 409,
      message: fields.length
        ? `A record with the same ${fields.join(", ")} already exists`
        : "Duplicate value",
      details: error.keyValue,
    };
  }

  if (error instanceof mongoose.Error.CastError) {
    return {
      statusCode: 400,
      message: `Invalid ${error.path}: ${error.value}`,
    };
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return {
      statusCode: 422,
      message: "Validation failed",
      details: Object.values(error.errors).map((item) => ({
        field: item.path,
        message: item.message,
      })),
    };
  }

  if (error?.type === "entity.parse.failed") {
    return { statusCode: 400, message: "Invalid JSON body" };
  }

  // Multer (file upload) errors
  if (error?.name === "MulterError") {
    return {
      statusCode: 400,
      message:
        error.code === "LIMIT_FILE_SIZE"
          ? "Image is too large"
          : error.message || "File upload failed",
    };
  }

  return null;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let statusCode = 500;
  let message = "Internal Server Error";
  let details: unknown;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    message = "Validation failed";
    details = err.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
  } else if (err instanceof jwt.TokenExpiredError) {
    statusCode = 401;
    message = "Token expired";
  } else if (err instanceof jwt.JsonWebTokenError) {
    statusCode = 401;
    message = "Invalid token";
  } else {
    const normalized = normalizeMongooseError(err);
    if (normalized) {
      statusCode = normalized.statusCode;
      message = normalized.message;
      details = normalized.details;
    } else if (err instanceof Error) {
      message = env.isProduction ? "Internal Server Error" : err.message;
    }
  }

  if (statusCode >= 500) {
    console.error(`[${new Date().toISOString()}]`, err);
  }

  const body: ApiErrorBody = {
    success: false,
    error: { code: statusCode, message, ...(details !== undefined ? { details } : {}) },
  };

  res.status(statusCode).json(body);
};
