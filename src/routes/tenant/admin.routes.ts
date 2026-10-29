import { Router } from "express";
import {
  bulkDeleteAdmins,
  createAdmin,
  deleteAdmin,
  getAdmin,
  listAdmins,
  selectAdmins,
  updateAdmin,
} from "../../controllers/tenant/admin.controller";
import { requireTenantRole } from "../../middlewares/tenantAuth";
import { validate } from "../../middlewares/validate";
import { catchAsync } from "../../utils/catchAsync";
import { bulkDeleteSchema, idParamSchema } from "../../validators/common";
import {
  createTenantAdminSchema,
  listTenantAdminsSchema,
  updateTenantAdminSchema,
} from "../../validators/tenant/admin";

const router = Router();

// Staff management is reserved to the club admin.
router.use(requireTenantRole("admin"));

router.get("/", validate(listTenantAdminsSchema), catchAsync(listAdmins));
router.get("/select", catchAsync(selectAdmins));

router.post("/bulk-delete", validate(bulkDeleteSchema), catchAsync(bulkDeleteAdmins));
router.delete("/bulk", validate(bulkDeleteSchema), catchAsync(bulkDeleteAdmins));

router.post("/", validate(createTenantAdminSchema), catchAsync(createAdmin));
router.get("/:id", validate(idParamSchema), catchAsync(getAdmin));
router.put("/:id", validate(updateTenantAdminSchema), catchAsync(updateAdmin));
router.patch("/:id", validate(updateTenantAdminSchema), catchAsync(updateAdmin));
router.delete("/:id", validate(idParamSchema), catchAsync(deleteAdmin));

export default router;
