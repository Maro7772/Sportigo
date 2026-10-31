import { Router } from "express";
import { listTenantGames, selectTenantGames } from "../../controllers/tenant/game.controller";
import { catchAsync } from "../../utils/catchAsync";
import { validate } from "../../middlewares/validate";
import { listQuerySchema } from "../../validators/common";

const router = Router();

// Games are defined by the platform (super admin) and shared by all clubs.
// Any authenticated club member can read them; they are needed to create teams.
router.get("/select", catchAsync(selectTenantGames));
router.get("/", validate(listQuerySchema), catchAsync(listTenantGames));

export default router;