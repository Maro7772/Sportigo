import { Router } from "express";
import { getSettings, updateSettings } from "../controllers/settings.controller";
import { authenticate, authorize } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { catchAsync } from "../utils/catchAsync";
import { updateSettingsSchema } from "../validators/settings";

const router = Router();

router.use(authenticate, authorize("super_admin"));

router.get("/", catchAsync(getSettings));
router.put("/", validate(updateSettingsSchema), catchAsync(updateSettings));
router.patch("/", validate(updateSettingsSchema), catchAsync(updateSettings));

export default router;
