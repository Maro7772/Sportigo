import { Router } from "express";
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

const router = Router();

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
