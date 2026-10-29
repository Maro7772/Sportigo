import { Router } from "express";
import {
  bulkDeleteClubs,
  createClub,
  deleteClub,
  getClub,
  getClubSubscription,
  listClubs,
  selectClubs,
  updateClub,
} from "../controllers/club.controller";
import { authenticate, authorize } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { catchAsync } from "../utils/catchAsync";
import { bulkDeleteSchema, idParamSchema } from "../validators/common";
import { createClubSchema, listClubsSchema, resetTenantAdminSchema, updateClubSchema } from "../validators/club";
import {
  getClubTenant,
  initClubTenant,
  resetClubTenantAdmin,
} from "../controllers/tenantAdmin.controller";

const router = Router();

router.use(authenticate, authorize("super_admin"));

router.get("/", validate(listClubsSchema), catchAsync(listClubs));
router.get("/select", catchAsync(selectClubs));

router.post("/bulk-delete", validate(bulkDeleteSchema), catchAsync(bulkDeleteClubs));
router.delete("/bulk", validate(bulkDeleteSchema), catchAsync(bulkDeleteClubs));

router.get("/:id/subscription", validate(idParamSchema), catchAsync(getClubSubscription));
router.get("/:id/tenant", validate(idParamSchema), catchAsync(getClubTenant));
router.post("/:id/tenant/init", validate(idParamSchema), catchAsync(initClubTenant));
router.post(
  "/:id/tenant/reset-admin",
  validate(resetTenantAdminSchema),
  catchAsync(resetClubTenantAdmin)
);
router.get("/:id", validate(idParamSchema), catchAsync(getClub));
router.post("/", validate(createClubSchema), catchAsync(createClub));
router.put("/:id", validate(updateClubSchema), catchAsync(updateClub));
router.patch("/:id", validate(updateClubSchema), catchAsync(updateClub));
router.delete("/:id", validate(idParamSchema), catchAsync(deleteClub));

export default router;
