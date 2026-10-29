import { Router } from "express";
import {
  bulkDeleteTeams,
  createTeam,
  deleteTeam,
  getTeam,
  listTeams,
  selectTeams,
  updateTeam,
} from "../../controllers/tenant/team.controller";
import { requireTenantRole } from "../../middlewares/tenantAuth";
import { validate } from "../../middlewares/validate";
import { catchAsync } from "../../utils/catchAsync";
import { bulkDeleteSchema, idParamSchema } from "../../validators/common";
import {
  createTeamSchema,
  listTeamsSchema,
  updateTeamSchema,
} from "../../validators/tenant/team";

const router = Router();

// Reads: admin + coach + viewer
router.get("/", validate(listTeamsSchema), catchAsync(listTeams));
router.get("/select", catchAsync(selectTeams));
router.get("/:id", validate(idParamSchema), catchAsync(getTeam));

// Writes: admin + coach
router.post(
  "/bulk-delete",
  requireTenantRole("admin", "coach"),
  validate(bulkDeleteSchema),
  catchAsync(bulkDeleteTeams)
);
router.delete(
  "/bulk",
  requireTenantRole("admin", "coach"),
  validate(bulkDeleteSchema),
  catchAsync(bulkDeleteTeams)
);

router.post(
  "/",
  requireTenantRole("admin", "coach"),
  validate(createTeamSchema),
  catchAsync(createTeam)
);
router.put(
  "/:id",
  requireTenantRole("admin", "coach"),
  validate(updateTeamSchema),
  catchAsync(updateTeam)
);
router.patch(
  "/:id",
  requireTenantRole("admin", "coach"),
  validate(updateTeamSchema),
  catchAsync(updateTeam)
);
router.delete(
  "/:id",
  requireTenantRole("admin", "coach"),
  validate(idParamSchema),
  catchAsync(deleteTeam)
);

export default router;
