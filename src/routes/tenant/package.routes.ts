import { Router } from "express";
import {
  getTenantPackage,
  listTenantPackages,
} from "../../controllers/tenant/package.controller";
import { validate } from "../../middlewares/validate";
import { catchAsync } from "../../utils/catchAsync";
import { idParamSchema } from "../../validators/common";
import { listTenantPackagesSchema } from "../../validators/tenant/package";

const router = Router();

// Packages can be browsed by all authenticated club users even when subscription is expired.
router.get("/", validate(listTenantPackagesSchema), catchAsync(listTenantPackages));
router.get("/:id", validate(idParamSchema), catchAsync(getTenantPackage));

export default router;
