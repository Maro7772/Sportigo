import { Router } from "express";
import {
  getTenantSettings,
  updateTenantSettings,
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
// `POST` is the canonical endpoint: it accepts the logo file (multipart/form-data)
// and the branding fields in the same request.
router.post(
  "/",
  requireTenantRole("admin"),
  imageUpload,
  validate(updateTenantSettingsSchema),
  catchAsync(updateTenantSettings)
);
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

export default router;
