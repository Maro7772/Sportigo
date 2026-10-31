import { Router } from "express";
import {
  getTenantSettings,
  updateTenantSettings,
  uploadTenantLogo,
} from "../../controllers/tenant/tenantSettings.controller";
import { requireTenantRole } from "../../middlewares/tenantAuth";
import { validate } from "../../middlewares/validate";
import { catchAsync } from "../../utils/catchAsync";
import { imageUpload } from "../../config/upload";
import { updateTenantSettingsSchema } from "../../validators/tenant/settings";

const router = Router();

// Every role can read the branding (the dashboard needs it).
router.get("/", catchAsync(getTenantSettings));

// Only the club admin can change it.
router.put(
  "/",
  requireTenantRole("admin"),
  imageUpload,
  validate(updateTenantSettingsSchema),
  catchAsync(updateTenantSettings)
);
router.patch(
  "/",
  requireTenantRole("admin"),
  imageUpload,
  validate(updateTenantSettingsSchema),
  catchAsync(updateTenantSettings)
);
router.post("/logo", requireTenantRole("admin"), imageUpload, catchAsync(uploadTenantLogo));

export default router;
