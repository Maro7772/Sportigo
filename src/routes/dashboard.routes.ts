import { Router } from "express";
import { getDashboard } from "../controllers/dashboard.controller";
import { authenticate, authorize } from "../middlewares/auth";
import { catchAsync } from "../utils/catchAsync";

const router = Router();

router.use(authenticate, authorize("super_admin"));

router.get("/", catchAsync(getDashboard));

export default router;
