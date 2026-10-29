import type { Request } from "express";
import { escapeRegex } from "./helpers";
import { getPaginationParams, getSort, type ListQuery } from "./pagination";

export interface BuildListQueryOptions {
  /** Fields matched (case-insensitive, contains) by `?search=` */
  searchFields?: string[];
  /** Fields that may be used with `?sort_by=` */
  sortFields: string[];
  defaultSort?: string;
  defaultOrder?: 1 | -1;
}

/**
 * Builds the common list query (pagination + search + sort).
 * Resource specific filters are added by the controller afterwards.
 */
export function buildListQuery(
  req: Request,
  options: BuildListQueryOptions
): ListQuery {
  const { page, limit, skip } = getPaginationParams(req);
  const search = String(req.query.search ?? "").trim();

  const filter: Record<string, unknown> = {};

  if (search && options.searchFields?.length) {
    const regex = new RegExp(escapeRegex(search), "i");
    filter.$or = options.searchFields.map((field) => ({ [field]: regex }));
  }

  const sort = getSort(
    req,
    options.sortFields,
    options.defaultSort ?? "createdAt",
    options.defaultOrder ?? -1
  );

  return { filter, page, limit, skip, sort, search };
}

/** Parses `?status=true|false` (also accepts 1/0, active/inactive). */
export function parseBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;

  const normalized = String(value).toLowerCase();
  if (["true", "1", "active", "enabled", "yes"].includes(normalized)) return true;
  if (["false", "0", "inactive", "disabled", "no"].includes(normalized)) return false;

  return undefined;
}

/** Converts a comma separated query value into an array of strings. */
export function toArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const values = (Array.isArray(value) ? value : String(value).split(","))
    .map((item) => String(item).trim())
    .filter(Boolean);
  return values.length ? values : undefined;
}
