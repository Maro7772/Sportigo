import type { Response } from "express";

interface SuccessBody<T> {
  success: true;
  message?: string;
  data: T;
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: number;
    message: string;
    details?: unknown;
  };
}

export function SuccessResponse<T>(
  res: Response,
  data: T,
  statusCode = 200,
  message?: string
): Response {
  const body: SuccessBody<T> = { success: true, data };
  if (message) body.message = message;
  return res.status(statusCode).json(body);
}

export function ErrorResponse(
  res: Response,
  message: string,
  statusCode = 500,
  details?: unknown
): Response {
  const body: ApiErrorBody = {
    success: false,
    error: { code: statusCode, message, ...(details !== undefined ? { details } : {}) },
  };
  return res.status(statusCode).json(body);
}
