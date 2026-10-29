import { Router } from "express";
import {
  bulkDeletePackages,
  createPackage,
  deletePackage,
  getPackage,
  listPackages,
  selectPackages,
  updatePackage,
} from "../controllers/package.controller";
import { authenticate, authorize } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { catchAsync } from "../utils/catchAsync";
import { bulkDeleteSchema, idParamSchema } from "../validators/common";
import {
  createPackageSchema,
  listPackagesSchema,
  updatePackageSchema,
} from "../validators/package";

const router = Router();

router.use(authenticate, authorize("super_admin"));

router.get("/", validate(listPackagesSchema), catchAsync(listPackages));
router.get("/select", catchAsync(selectPackages));

router.post("/bulk-delete", validate(bulkDeleteSchema), catchAsync(bulkDeletePackages));
router.delete("/bulk", validate(bulkDeleteSchema), catchAsync(bulkDeletePackages));

router.get("/:id", validate(idParamSchema), catchAsync(getPackage));
router.post("/", validate(createPackageSchema), catchAsync(createPackage));
router.put("/:id", validate(updatePackageSchema), catchAsync(updatePackage));
router.patch("/:id", validate(updatePackageSchema), catchAsync(updatePackage));
router.delete("/:id", validate(idParamSchema), catchAsync(deletePackage));

export default router;
