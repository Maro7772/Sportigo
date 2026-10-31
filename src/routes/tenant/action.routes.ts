import { Router } from "express";
import { listTenantActions, selectTenantActions } from "../../controllers/tenant/action.controller";
import { catchAsync } from "../../utils/catchAsync";
import { validate } from "../../middlewares/validate";
import { listQuerySchema } from "../../validators/common";

const router = Router();

// Actions are defined by the platform (super admin) and shared by all clubs.
// Any authenticated club member can read them; needed to record player progress.
router.get("/select", catchAsync(selectTenantActions));
router.get("/", validate(listQuerySchema), catchAsync(listTenantActions));

export default router;