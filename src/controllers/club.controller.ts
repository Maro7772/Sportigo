import type { FilterQuery } from "mongoose";
import type { Request, Response } from "express";
import { Club, type IClub } from "../models/Club";
import { Package } from "../models/Package";
import { Order } from "../models/Order";
import { getOrCreateSettings } from "../models/Settings";
import { BadRequest, ConflictError, NotFound } from "../errors";
import { SuccessResponse } from "../utils/response";
import { buildListQuery, parseBoolean } from "../utils/listQuery";
import { buildPaginationMeta } from "../utils/pagination";
import { evaluateSubscription } from "../services/subscription.service";
import { dropTenantDatabase } from "../config/tenant";
import { initTenantDatabase, defaultTenantAdminEmail } from "../services/tenantAuth.service";

const SORT_FIELDS = ["name", "subdomain", "status", "start_date", "end_date", "createdAt"];
const DAY_MS = 24 * 60 * 60 * 1000;

async function assertPackageExists(packageId: string): Promise<void> {
  const exists = await Package.exists({ _id: packageId });
  if (!exists) throw new NotFound("Package not found");
}

/** Adds the computed subscription state (grace-aware) to a club document. */
function serializeClub(club: any, allowedDays: number) {
  const plain = typeof club.toObject === "function" ? club.toObject() : club;
  const subscription = evaluateSubscription(club, allowedDays);

  return {
    ...plain,
    subscription_status: subscription.status,
    subscription,
  };
}

export async function listClubs(req: Request, res: Response) {
  const { filter, page, limit, skip, sort } = buildListQuery(req, {
    searchFields: ["name", "subdomain"],
    sortFields: SORT_FIELDS,
    defaultSort: "createdAt",
    defaultOrder: -1,
  });

  const settings = await getOrCreateSettings();
  const allowedDays = settings.allowed_days;

  const status = parseBoolean(req.query.status);
  if (status !== undefined) filter.status = status;

  if (typeof req.query.package_id === "string" && req.query.package_id) {
    filter.package_id = req.query.package_id;
  }

  const now = new Date();
  const graceCutoff = new Date(now.getTime() - allowedDays * DAY_MS);

  const subscription = String(req.query.subscription_status ?? "").toLowerCase();
  if (subscription === "inactive") {
    filter.status = false;
  } else if (subscription === "pending") {
    filter.status = true;
    filter.start_date = { $gt: now };
  } else if (subscription === "active") {
    filter.status = true;
    filter.$and = [
      { $or: [{ start_date: null }, { start_date: { $lte: now } }] },
      { $or: [{ end_date: null }, { end_date: { $gte: now } }] },
    ];
  } else if (subscription === "grace") {
    filter.status = true;
    filter.end_date = { $lt: now, $gte: graceCutoff };
  } else if (subscription === "expired") {
    filter.status = true;
    filter.end_date = { $lt: graceCutoff };
  }

  const [items, total] = await Promise.all([
    Club.find(filter as FilterQuery<IClub>)
      .populate("package_id", "name status teams players")
      .sort(sort)
      .skip(skip)
      .limit(limit),
    Club.countDocuments(filter as FilterQuery<IClub>),
  ]);

  return SuccessResponse(res, {
    items: items.map((club) => serializeClub(club, allowedDays)),
    pagination: buildPaginationMeta(total, page, limit),
  });
}

export async function selectClubs(_req: Request, res: Response) {
  const items = await Club.find({ status: true })
    .select("name subdomain")
    .sort({ name: 1 })
    .lean();

  return SuccessResponse(res, { items });
}

export async function getClub(req: Request, res: Response) {
  const [club, settings] = await Promise.all([
    Club.findById(req.params.id).populate("package_id", "name status teams players cycles"),
    getOrCreateSettings(),
  ]);

  if (!club) throw new NotFound("Club not found");

  const ordersCount = await Order.countDocuments({ club_id: club._id });

  return SuccessResponse(res, {
    club: serializeClub(club, settings.allowed_days),
    stats: { orders: ordersCount },
  });
}

export async function getClubSubscription(req: Request, res: Response) {
  const [club, settings] = await Promise.all([
    Club.findById(req.params.id).populate("package_id", "name status teams players cycles"),
    getOrCreateSettings(),
  ]);

  if (!club) throw new NotFound("Club not found");

  const subscription = evaluateSubscription(club, settings.allowed_days);

  return SuccessResponse(res, {
    subscription,
    club: {
      _id: club._id,
      name: club.name,
      subdomain: club.subdomain,
      status: club.status,
      package_id: club.package_id,
      start_date: club.start_date,
      end_date: club.end_date,
    },
  });
}

export async function createClub(req: Request, res: Response) {
  if (req.body.package_id) await assertPackageExists(req.body.package_id);

  const club = await Club.create({
    name: req.body.name,
    status: req.body.status ?? true,
    subdomain: req.body.subdomain,
    package_id: req.body.package_id ?? null,
    start_date: req.body.start_date ?? null,
    end_date: req.body.end_date ?? null,
  });

  // Prepare the club database (indexes + settings + first admin) right away so
  // the club can log in on its subdomain immediately.
  const tenant = await initTenantDatabase({
    subdomain: club.subdomain,
    name: club.name,
  });

  const [populated, settings] = await Promise.all([
    club.populate("package_id", "name status teams players"),
    getOrCreateSettings(),
  ]);

  return SuccessResponse(
    res,
    {
      club: serializeClub(populated, settings.allowed_days),
      tenant: {
        database: tenant.database,
        admin_created: Boolean(tenant.admin),
        admin_email: tenant.admin?.email ?? defaultTenantAdminEmail(club.subdomain),
      },
    },
    201,
    "Club created successfully"
  );
}

export async function updateClub(req: Request, res: Response) {
  const club = await Club.findById(req.params.id);
  if (!club) throw new NotFound("Club not found");

  if (req.body.package_id !== undefined && req.body.package_id !== null) {
    await assertPackageExists(req.body.package_id);
  }

  if (req.body.name !== undefined) club.name = req.body.name;
  if (req.body.status !== undefined) club.status = req.body.status;

  if (req.body.subdomain !== undefined && req.body.subdomain !== club.subdomain) {
    throw new BadRequest(
      "subdomain cannot be changed: it is the name of the club's database. Create a new club instead."
    );
  }

  if (req.body.package_id !== undefined) club.package_id = req.body.package_id;
  if (req.body.start_date !== undefined) club.start_date = req.body.start_date;
  if (req.body.end_date !== undefined) club.end_date = req.body.end_date;

  if (club.start_date && club.end_date && club.end_date < club.start_date) {
    throw new BadRequest("end_date must be greater than or equal to start_date");
  }

  await club.save();

  const [populated, settings] = await Promise.all([
    club.populate("package_id", "name status teams players"),
    getOrCreateSettings(),
  ]);

  return SuccessResponse(
    res,
    { club: serializeClub(populated, settings.allowed_days) },
    200,
    "Club updated successfully"
  );
}

export async function deleteClub(req: Request, res: Response) {
  const club = await Club.findById(req.params.id);
  if (!club) throw new NotFound("Club not found");

  const ordersCount = await Order.countDocuments({ club_id: club._id });
  if (ordersCount > 0) {
    throw new ConflictError(
      `Cannot delete this club: it has ${ordersCount} order(s). Deactivate it instead.`
    );
  }

  const subdomain = club.subdomain;
  await club.deleteOne();

  // The database belongs to the club; leaving it behind would leak its data
  // into a future club that picks the same subdomain.
  await dropTenantDatabase(subdomain).catch((error) => {
    console.error(`⚠️  Could not drop the tenant database "${subdomain}":`, error);
  });

  return SuccessResponse(res, { id: req.params.id }, 200, "Club deleted successfully");
}

export async function bulkDeleteClubs(req: Request, res: Response) {
  const ids: string[] = req.body.ids;

  const ordersCount = await Order.countDocuments({ club_id: { $in: ids } });
  if (ordersCount > 0) {
    throw new ConflictError(
      `Cannot delete: some clubs have ${ordersCount} order(s). Deactivate them instead.`
    );
  }

  const clubs = await Club.find({ _id: { $in: ids } }).select("subdomain").lean();

  const result = await Club.deleteMany({ _id: { $in: ids } });

  await Promise.all(
    clubs.map((club) =>
      dropTenantDatabase(club.subdomain).catch((error) => {
        console.error(`⚠️  Could not drop the tenant database "${club.subdomain}":`, error);
      })
    )
  );

  return SuccessResponse(
    res,
    { deletedCount: result.deletedCount },
    200,
    `${result.deletedCount} club(s) deleted successfully`
  );
}
