import { Router } from "express";
import {
  changeTenantPassword,
  getTenantMe,
  tenantLogin,
  tenantLogout,
} from "../../controllers/tenant/auth.controller";
import { tenantAuthenticate } from "../../middlewares/tenantAuth";
import { validate } from "../../middlewares/validate";
import { catchAsync } from "../../utils/catchAsync";
import {
  tenantChangePasswordSchema,
  tenantLoginSchema,
} from "../../validators/tenant/auth";

const router = Router();

// Public: the club is resolved from the subdomain, the account from its own DB.
router.post("/login", validate(tenantLoginSchema), catchAsync(tenantLogin));

router.get("/me", tenantAuthenticate, catchAsync(getTenantMe));
router.post("/logout", tenantAuthenticate, catchAsync(tenantLogout));

router.put(
  "/change-password",
  tenantAuthenticate,
  validate(tenantChangePasswordSchema),
  catchAsync(changeTenantPassword)
);
router.patch(
  "/change-password",
  tenantAuthenticate,
  validate(tenantChangePasswordSchema),
  catchAsync(changeTenantPassword)
);

export default router;
