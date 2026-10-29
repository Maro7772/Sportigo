import type { Request, Response } from "express";
import { Package } from "../../models/Package";
import { NotFound } from "../../errors";
import { SuccessResponse } from "../../utils/response";
import { calculateDiscountAmount } from "../../utils/pricing";
import { tenantContext } from "../../middlewares/tenant";

/**
 * `GET /api/tenant/packages`
 * Lists all active packages available for clubs to purchase or renew.
 * Each cycle includes its calculated discount amount and final price.
 */
export async function listTenantPackages(req: Request, res: Response) {
  const { club } = tenantContext(req);

  const query: Record<string, unknown> = { status: true };

  if (typeof req.query.game_id === "string" && req.query.game_id.trim()) {
    query.game_id = req.query.game_id.trim();
  }

  if (typeof req.query.search === "string" && req.query.search.trim()) {
    query.name = { $regex: req.query.search.trim(), $options: "i" };
  }

  const packages = await Package.find(query)
    .populate("game_id", "name")
    .sort({ createdAt: -1 })
    .lean();

  const formatted = packages.map((pkg) => {
    const isCurrent = club.package_id ? String(club.package_id) === String(pkg._id) : false;

    const cycles = pkg.cycles.map((cycle) => {
      const discountAmount = calculateDiscountAmount(
        cycle.price,
        cycle.discount,
        cycle.discount_type
      );
      const finalPrice = Math.max(0, cycle.price - discountAmount);

      return {
        _id: cycle._id,
        name: cycle.name,
        months: cycle.months,
        price: cycle.price,
        discount: cycle.discount,
        discount_type: cycle.discount_type,
        discount_amount: discountAmount,
        final_price: finalPrice,
      };
    });

    return {
      _id: pkg._id,
      name: pkg.name,
      game: pkg.game_id,
      teams: pkg.teams,
      players: pkg.players,
      is_current: isCurrent,
      cycles,
      createdAt: pkg.createdAt,
    };
  });

  return SuccessResponse(res, { packages: formatted });
}

/**
 * `GET /api/tenant/packages/:id`
 * Returns details of an active package by ID.
 */
export async function getTenantPackage(req: Request, res: Response) {
  const { club } = tenantContext(req);

  const pkg = await Package.findOne({ _id: req.params.id, status: true })
    .populate("game_id", "name")
    .lean();

  if (!pkg) {
    throw new NotFound("Package not found or inactive");
  }

  const isCurrent = club.package_id ? String(club.package_id) === String(pkg._id) : false;

  const cycles = pkg.cycles.map((cycle) => {
    const discountAmount = calculateDiscountAmount(
      cycle.price,
      cycle.discount,
      cycle.discount_type
    );
    const finalPrice = Math.max(0, cycle.price - discountAmount);

    return {
      _id: cycle._id,
      name: cycle.name,
      months: cycle.months,
      price: cycle.price,
      discount: cycle.discount,
      discount_type: cycle.discount_type,
      discount_amount: discountAmount,
      final_price: finalPrice,
    };
  });

  return SuccessResponse(res, {
    package: {
      _id: pkg._id,
      name: pkg.name,
      game: pkg.game_id,
      teams: pkg.teams,
      players: pkg.players,
      is_current: isCurrent,
      cycles,
      createdAt: pkg.createdAt,
    },
  });
}
