import { Router, type Request, type Response, type NextFunction } from "express";
import authRoutes from "./auth.routes";
import gameRoutes from "./game.routes";
import actionRoutes from "./action.routes";
import packageRoutes from "./package.routes";
import clubRoutes from "./club.routes";
import orderRoutes from "./order.routes";
import paymentMethodRoutes from "./paymentMethod.routes";
import settingsRoutes from "./settings.routes";
import dashboardRoutes from "./dashboard.routes";
import uploadRoutes from "./upload.routes";
import tenantRoutes from "./tenant";
import { extractSubdomain, isSuperAdminLabel } from "../middlewares/tenant";
import { ForbiddenError } from "../errors";

const router = Router();

/**
 * Super Admin routes are served from the apex domain (`sportego.org`) and from
 * the reserved hosts (`admin.sportego.org`, `api.sportego.org`,
 * `www.sportego.org`). Requests sent from a tenant host
 * (e.g. `ahly.sportego.org/api/clubs`) are blocked, so a club can never reach
 * the platform API by accident.
 */
function restrictToSuperAdminHost(req: Request, _res: Response, next: NextFunction) {
  const subdomain = extractSubdomain(req);

  if (subdomain && !isSuperAdminLabel(subdomain)) {
    throw new ForbiddenError(
      "Super Admin API cannot be accessed from a tenant subdomain."
    );
  }

  next();
}

router.use("/tenant", tenantRoutes);

// Super admin routes below
router.use(restrictToSuperAdminHost);
router.use("/auth", authRoutes);
router.use("/games", gameRoutes);
router.use("/actions", actionRoutes);
router.use("/packages", packageRoutes);
router.use("/clubs", clubRoutes);
router.use("/orders", orderRoutes);
router.use("/payment-methods", paymentMethodRoutes);
router.use("/settings", settingsRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/uploads", uploadRoutes);
router.use("/tenant", tenantRoutes);

export default router;
