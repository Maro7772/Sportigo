import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { env } from "./env";
import { BadRequest } from "../errors";

/** Absolute path of the local uploads directory. */
export const UPLOAD_DIR = path.isAbsolute(env.UPLOAD_DIR)
  ? env.UPLOAD_DIR
  : path.resolve(process.cwd(), env.UPLOAD_DIR);

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const ALLOWED_EXTENSIONS = /^\.(jpe?g|png|webp|gif)$/i;

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, UPLOAD_DIR),
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname);
    const safeExtension = ALLOWED_EXTENSIONS.test(extension)
      ? extension.toLowerCase()
      : ".jpg";
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    callback(null, `${unique}${safeExtension}`);
  },
});

/**
 * Multer middleware for a single image.
 *
 * Accepted field names: `image`, `file`, `icon`.
 * - `image` / `file` are the generic uploads (`/api/uploads`, `/api/orders/:id/payment-proof`).
 * - `icon` is used by `/api/payment-methods` (icon image of the payment method).
 */
export const imageUpload = multer({
  storage,
  limits: { fileSize: env.UPLOAD_MAX_MB * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      callback(
        new BadRequest("Only JPEG, PNG, WEBP or GIF images are allowed"),
      );
      return;
    }

    callback(null, true);
  },
}).fields([
  { name: "image", maxCount: 1 },
  { name: "file", maxCount: 1 },
  { name: "icon", maxCount: 1 }, // ⬅️ جديد
  { name: "payment_proof", maxCount: 1 },
]);

/**
 * Returns the first uploaded file from any accepted field name.
 * Order matters: `image` → `file` → `icon` → `req.file` (single).
 */
export function getUploadedImage(req: {
  files?: unknown;
  file?: Express.Multer.File;
}): Express.Multer.File | undefined {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;

  return (
    files?.image?.[0] ??
    files?.file?.[0] ??
    files?.icon?.[0] ??
    files?.payment_proof?.[0] ??
    req.file
  );
}

/** Public URL used to serve an uploaded file. */
export function publicUploadUrl(filename: string): string {
  return `/uploads/${filename}`;
}

function requestOrigin(req: {
  protocol: string;
  get(name: string): string | undefined;
}): string {
  if (env.PUBLIC_BASE_URL) return env.PUBLIC_BASE_URL;
  return `${req.protocol}://${req.get("host") ?? "localhost"}`;
}

/** Turns a stored upload path into a full public URL (`https://sportego.org/uploads/...`). */
export function absoluteUploadUrl(
  req: { protocol: string; get(name: string): string | undefined },
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;

  const pathname = url.startsWith("/") ? url : `/${url}`;
  return `${requestOrigin(req)}${pathname}`;
}

function uploadPathname(url: string): string | null {
  if (url.startsWith("/uploads/")) return url;

  try {
    if (/^https?:\/\//i.test(url)) {
      const pathname = new URL(url).pathname;
      return pathname.startsWith("/uploads/") ? pathname : null;
    }
  } catch {
    return null;
  }

  return null;
}

/** Converts a public upload URL into its absolute path on disk. */
export function uploadPathFromUrl(
  url: string | null | undefined,
): string | null {
  if (!url) return null;

  const pathname = uploadPathname(url);
  if (!pathname) return null;

  const filename = path.basename(pathname);
  return path.join(UPLOAD_DIR, filename);
}

/** Best-effort removal of a file from the uploads directory. */
export function removeUploadedFile(filePath: string | null): void {
  if (!filePath) return;

  fs.unlink(filePath, () => {
    // Ignore: the file may already be gone.
  });
}
