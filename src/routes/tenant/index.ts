import { Router } from "express";
import { getTenantInfo } from "../../controllers/tenant/info.controller";
import { requireTenantSubscription, resolveTenant } from "../../middlewares/tenant";
import { tenantAuthenticate } from "../../middlewares/tenantAuth";
import { catchAsync } from "../../utils/catchAsync";
import authRoutes from "./auth.routes";
import gameRoutes from "./game.routes";
import actionRoutes from "./action.routes";
import adminRoutes from "./admin.routes";
import settingsRoutes from "./settings.routes";
import teamRoutes from "./team.routes";
import playerRoutes from "./player.routes";
import matchRoutes from "./match.routes";
import progressRoutes from "./progress.routes";
import cartRoutes from "./cart.routes";
import orderRoutes from "./order.routes";
import packageRoutes from "./package.routes";
import paymentMethodRoutes from "./paymentMethod.routes";
import uploadRoutes from "./upload.routes";

/**
 * Tenant API.
 *
 * 1. `resolveTenant`   -> subdomain -> club -> its own database (`ahly` -> db `ahly`)
 * 2. `/auth`           -> public login, then authenticated me/change-password
 * 3. `tenantAuthenticate` -> every route below needs `Authorization: Bearer <token>`
 * 4. `requireTenantSubscription` -> the scouting workspace needs active/grace;
 *    auth, info, settings, packages, payment-methods, cart, orders and uploads stay reachable so the club can renew.
 */
const router = Router();

router.use(resolveTenant);

router.use("/auth", authRoutes);

// Everything below requires a valid tenant token issued for THIS club.
router.use(tenantAuthenticate);

router.get("/info", catchAsync(getTenantInfo));

router.use("/settings", settingsRoutes);
router.use("/uploads", uploadRoutes);
router.use("/packages", packageRoutes);
router.use("/payment-methods", paymentMethodRoutes);
router.use("/cart", cartRoutes);
router.use("/orders", orderRoutes);

router.use("/games", gameRoutes);

router.use("/actions", actionRoutes);

router.use("/teams", requireTenantSubscription, teamRoutes);
router.use("/players", requireTenantSubscription, playerRoutes);
router.use("/matches", requireTenantSubscription, matchRoutes);
router.use("/player-progress", requireTenantSubscription, progressRoutes);
router.use("/admins", requireTenantSubscription, adminRoutes);

export default router;
