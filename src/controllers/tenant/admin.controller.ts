import type { FilterQuery } from "mongoose";
import type { Request, Response } from "express";
import { BadRequest, ConflictError, NotFound } from "../../errors";
import { SuccessResponse } from "../../utils/response";
import { buildListQuery } from "../../utils/listQuery";
import { buildPaginationMeta } from "../../utils/pagination";
import { tenantModels } from "../../middlewares/tenant";
import { tenantUser } from "../../middlewares/tenantAuth";
import type { ITenantAdmin, TenantModels } from "../../models/tenant";

const SORT_FIELDS = ["name", "email", "role", "status", "createdAt", "updatedAt"];

/** Active admins that can still manage the club (excluding `excludeId`). */
async function otherActiveAdmins(
  models: TenantModels,
  excludeId?: unknown
): Promise<number> {
  const filter: Record<string, unknown> = { role: "admin", status: true };
  if (excludeId) filter._id = { $ne: excludeId };

  return models.Admin.countDocuments(filter);
}

async function assertEmailFree(
  models: TenantModels,
  email: string,
  excludeId?: unknown
): Promise<void> {
  const filter: Record<string, unknown> = { email };
  if (excludeId) filter._id = { $ne: excludeId };

  if (await models.Admin.exists(filter)) {
    throw new ConflictError("An admin with this email already exists");
  }
}

async function assertPhoneFree(
  models: TenantModels,
  phone: string,
  excludeId?: unknown
): Promise<void> {
  const filter: Record<string, unknown> = { phone };
  if (excludeId) filter._id = { $ne: excludeId };

  if (await models.Admin.exists(filter)) {
    throw new ConflictError("An admin with this phone number already exists");
  }
}

/** `GET /api/tenant/admins` */
export async function listAdmins(req: Request, res: Response) {
  const models = tenantModels(req);

  const { filter, page, limit, skip, sort } = buildListQuery(req, {
    searchFields: ["name", "email", "phone"],
    sortFields: SORT_FIELDS,
    defaultSort: "createdAt",
    defaultOrder: -1,
  });

  const role = String(req.query.role ?? "").trim();
  if (role) filter.role = role;

  const status = String(req.query.status ?? "").trim();
  if (status === "true" || status === "false") filter.status = status === "true";

  const [items, total] = await Promise.all([
    models.Admin.find(filter as FilterQuery<ITenantAdmin>)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    models.Admin.countDocuments(filter as FilterQuery<ITenantAdmin>),
  ]);

  return SuccessResponse(res, {
    admins: items,
    items,
    pagination: buildPaginationMeta(total, page, limit),
  });
}

/** `GET /api/tenant/admins/select` */
export async function selectAdmins(req: Request, res: Response) {
  const models = tenantModels(req);

  const items = await models.Admin.find({ status: true })
    .select("name email role")
    .sort({ name: 1 })
    .lean();

  return SuccessResponse(res, { items });
}

/** `GET /api/tenant/admins/:id` */
export async function getAdmin(req: Request, res: Response) {
  const models = tenantModels(req);

  const admin = await models.Admin.findById(req.params.id).lean();
  if (!admin) throw new NotFound("Admin not found");

  return SuccessResponse(res, { admin });
}

/** `POST /api/tenant/admins` */
export async function createAdmin(req: Request, res: Response) {
  const models = tenantModels(req);
  const { name, email, phone, password, role, status } = req.body;

  await assertEmailFree(models, email);
  if (phone) await assertPhoneFree(models, phone);

  const admin = await models.Admin.create({
    name,
    email,
    phone: phone || undefined,
    password,
    role,
    status: status ?? true,
  });

  return SuccessResponse(res, { admin: admin.toJSON() }, 201, "Admin created successfully");
}

/** `PUT|PATCH /api/tenant/admins/:id` */
export async function updateAdmin(req: Request, res: Response) {
  const models = tenantModels(req);
  const currentUser = tenantUser(req);

  const admin = await models.Admin.findById(req.params.id);
  if (!admin) throw new NotFound("Admin not found");

  const isSelf = String(admin._id) === currentUser.id;

  if (isSelf && req.body.status === false) {
    throw new BadRequest("You cannot deactivate your own account");
  }

  if (isSelf && req.body.role !== undefined && req.body.role !== "admin") {
    throw new BadRequest("You cannot change your own role");
  }

  if (req.body.email !== undefined) {
    await assertEmailFree(models, req.body.email, admin._id);
    admin.email = req.body.email;
  }

  if (req.body.phone !== undefined) {
    const phone = req.body.phone ? String(req.body.phone).trim() : "";
    if (phone) await assertPhoneFree(models, phone, admin._id);
    admin.phone = phone || null;
  }

  // Never leave the club without a single active admin.
  const wasActiveAdmin = admin.role === "admin" && admin.status;
  const willStayActiveAdmin =
    (req.body.role ?? admin.role) === "admin" && (req.body.status ?? admin.status) === true;

  if (wasActiveAdmin && !willStayActiveAdmin) {
    const remaining = await otherActiveAdmins(models, admin._id);
    if (remaining === 0) {
      throw new ConflictError(
        "Cannot demote or deactivate the last active admin of this club"
      );
    }
  }

  if (req.body.name !== undefined) admin.name = req.body.name;
  if (req.body.role !== undefined) admin.role = req.body.role;
  if (req.body.status !== undefined) admin.status = req.body.status;
  if (req.body.password !== undefined) admin.password = req.body.password;

  await admin.save();

  return SuccessResponse(res, { admin: admin.toJSON() }, 200, "Admin updated successfully");
}

/** `DELETE /api/tenant/admins/:id` */
export async function deleteAdmin(req: Request, res: Response) {
  const models = tenantModels(req);
  const currentUser = tenantUser(req);

  const admin = await models.Admin.findById(req.params.id);
  if (!admin) throw new NotFound("Admin not found");

  if (String(admin._id) === currentUser.id) {
    throw new BadRequest("You cannot delete your own account");
  }

  if (admin.role === "admin" && admin.status) {
    const remaining = await otherActiveAdmins(models, admin._id);
    if (remaining === 0) {
      throw new ConflictError("Cannot delete the last active admin of this club");
    }
  }

  await admin.deleteOne();

  return SuccessResponse(res, { id: req.params.id }, 200, "Admin deleted successfully");
}

/** `POST /api/tenant/admins/bulk-delete` */
export async function bulkDeleteAdmins(req: Request, res: Response) {
  const models = tenantModels(req);
  const currentUser = tenantUser(req);
  const ids: string[] = req.body.ids;

  if (ids.includes(currentUser.id)) {
    throw new BadRequest("You cannot delete your own account");
  }

  const targets = await models.Admin.find({ _id: { $in: ids } })
    .select("role status")
    .lean();

  const removesActiveAdmin = targets.some((admin) => admin.role === "admin" && admin.status);

  if (removesActiveAdmin) {
    const remaining = await models.Admin.countDocuments({
      _id: { $nin: ids },
      role: "admin",
      status: true,
    });

    if (remaining === 0) {
      throw new ConflictError("Cannot delete the last active admin of this club");
    }
  }

  const result = await models.Admin.deleteMany({ _id: { $in: ids } });

  return SuccessResponse(
    res,
    { deletedCount: result.deletedCount },
    200,
    `${result.deletedCount} admin(s) deleted successfully`
  );
}
