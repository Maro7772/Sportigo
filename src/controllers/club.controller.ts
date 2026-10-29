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
import { evaluateSubscription, addMonths } from "../services/subscription.service";
import { dropTenantDatabase } from "../config/tenant";
import { initTenantDatabase, defaultTenantAdminEmail } from "../services/tenantAuth.service";

const SORT_FIELDS = ["name", "subdomain", "status", "start_date", "end_date", "createdAt"];
const DAY_MS = 24 * 60 * 60 * 1000;

async function getPackageOrThrow(packageId: string) {
  const pkg = await Package.findById(packageId);
  if (!pkg) throw new NotFound("Package not found");
  return pkg;
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
  let startDate = req.body.start_date ? new Date(req.body.start_date) : null;
  let endDate = req.body.end_date ? new Date(req.body.end_date) : null;

  if (req.body.package_id) {
    const pkg = await getPackageOrThrow(req.body.package_id);

    // If client did not explicitly send dates, calculate them automatically from package duration
    if (!startDate && !endDate) {
      let cycle = req.body.cycle_id
        ? pkg.cycles.find((c: any) => String(c._id) === String(req.body.cycle_id))
        : undefined;

      if (!cycle && pkg.cycles.length > 0) {
        cycle = pkg.cycles[0];
      }

      if (cycle) {
        startDate = new Date();
        endDate = addMonths(startDate, cycle.months);
      }
    }
  }

  const club = await Club.create({
    name: req.body.name,
    status: req.body.status ?? true,
    subdomain: req.body.subdomain,
    package_id: req.body.package_id ?? null,
    start_date: startDate,
    end_date: endDate,
  });

  // Prepare the club database (indexes + settings + first admin with optional custom password/email)
  const tenant = await initTenantDatabase(
    {
      subdomain: club.subdomain,
      name: club.name,
    },
    {
      name: req.body.admin_name,
      email: req.body.admin_email,
      password: req.body.admin_password,
    }
  );

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
        /**
         * Plain-text password returned ONCE at club creation.
         * null when the super admin explicitly sent admin_password in the request
         * (they already know it) or when an admin already existed.
         */
        admin_password: tenant.admin_password,
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
    await getPackageOrThrow(req.body.package_id);
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

  const force = req.query.force === "true" || req.query.cascade === "true";
  const ordersCount = await Order.countDocuments({ club_id: club._id });

  if (ordersCount > 0 && !force) {
    throw new ConflictError(
      `Cannot delete this club: it has ${ordersCount} order(s). Use ?force=true or deactivate it instead.`
    );
  }

  const subdomain = club.subdomain;

  if (ordersCount > 0) {
    await Order.deleteMany({ club_id: club._id });
  }

  await club.deleteOne();

  // The database belongs to the club; dropping it cleans up all club data
  await dropTenantDatabase(subdomain).catch((error) => {
    console.error(`⚠️  Could not drop the tenant database "${subdomain}":`, error);
  });

  return SuccessResponse(res, { id: req.params.id }, 200, "Club deleted successfully");
}

export async function bulkDeleteClubs(req: Request, res: Response) {
  const ids: string[] = req.body.ids;
  const force = req.query.force === "true" || req.query.cascade === "true";

  const ordersCount = await Order.countDocuments({ club_id: { $in: ids } });
  if (ordersCount > 0 && !force) {
    throw new ConflictError(
      `Cannot delete: some clubs have ${ordersCount} order(s). Use ?force=true or deactivate them instead.`
    );
  }

  if (ordersCount > 0) {
    await Order.deleteMany({ club_id: { $in: ids } });
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
