import type { Request } from "express";

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface ListQuery {
  filter: Record<string, unknown>;
  page: number;
  limit: number;
  skip: number;
  sort: Record<string, 1 | -1>;
  search: string;
}

const MAX_LIMIT = 100;

export function getPaginationParams(req: Request): PaginationParams {
  const rawPage = Number(req.query.page);
  const rawLimit = Number(req.query.limit);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), MAX_LIMIT)
      : 10;

  return { page, limit, skip: (page - 1) * limit };
}

export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number
): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

export function getSort(
  req: Request,
  allowedFields: string[],
  defaultField = "createdAt",
  defaultOrder: 1 | -1 = -1
): Record<string, 1 | -1> {
  const requested = String(req.query.sort_by ?? req.query.sortBy ?? "");
  const field = allowedFields.includes(requested) ? requested : defaultField;

  const rawOrder = String(req.query.order ?? req.query.sort ?? "").toLowerCase();
  const order: 1 | -1 =
    rawOrder === "asc" || rawOrder === "1" || rawOrder === "oldest"
      ? 1
      : rawOrder === "desc" || rawOrder === "-1" || rawOrder === "newest"
        ? -1
        : defaultOrder;

  return { [field]: order };
}
