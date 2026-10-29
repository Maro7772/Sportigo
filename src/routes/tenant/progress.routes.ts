import { Router } from "express";
import {
  bulkDeleteProgress,
  createProgress,
  deleteProgress,
  getProgress,
  listProgress,
  updateProgress,
} from "../../controllers/tenant/progress.controller";
import { requireTenantRole } from "../../middlewares/tenantAuth";
import { validate } from "../../middlewares/validate";
import { catchAsync } from "../../utils/catchAsync";
import { bulkDeleteSchema, idParamSchema } from "../../validators/common";
import {
  createProgressSchema,
  listProgressSchema,
  updateProgressSchema,
} from "../../validators/tenant/progress";

const router = Router();

// Reads: admin + coach + viewer
router.get("/", validate(listProgressSchema), catchAsync(listProgress));
router.get("/:id", validate(idParamSchema), catchAsync(getProgress));

// Writes: admin + coach
router.post(
  "/bulk-delete",
  requireTenantRole("admin", "coach"),
  validate(bulkDeleteSchema),
  catchAsync(bulkDeleteProgress)
);
router.delete(
  "/bulk",
  requireTenantRole("admin", "coach"),
  validate(bulkDeleteSchema),
  catchAsync(bulkDeleteProgress)
);

router.post(
  "/",
  requireTenantRole("admin", "coach"),
  validate(createProgressSchema),
  catchAsync(createProgress)
);
router.put(
  "/:id",
  requireTenantRole("admin", "coach"),
  validate(updateProgressSchema),
  catchAsync(updateProgress)
);
router.patch(
  "/:id",
  requireTenantRole("admin", "coach"),
  validate(updateProgressSchema),
  catchAsync(updateProgress)
);
router.delete(
  "/:id",
  requireTenantRole("admin", "coach"),
  validate(idParamSchema),
  catchAsync(deleteProgress)
);

export default router;
