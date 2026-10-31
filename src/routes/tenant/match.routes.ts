import { Router } from "express";
import {
  bulkDeleteMatches,
  createMatch,
  deleteMatch,
  getMatch,
  listMatches,
  updateMatch,
  getMatchPlayersActions,
  getAllMatchesPlayersActions,
} from "../../controllers/tenant/match.controller";
import { requireTenantRole } from "../../middlewares/tenantAuth";
import { validate } from "../../middlewares/validate";
import { catchAsync } from "../../utils/catchAsync";
import { bulkDeleteSchema, idParamSchema } from "../../validators/common";
import {
  createMatchSchema,
  listMatchesSchema,
  updateMatchSchema,
} from "../../validators/tenant/match";

const router = Router();

// Reads: admin + coach + viewer
router.get("/", validate(listMatchesSchema), catchAsync(listMatches));

// 👇 المسارات الجديدة الخاصة باللاعبين والأكشنز (لازم تكون قبل /:id)
router.get("/players-actions", catchAsync(getAllMatchesPlayersActions));
router.get("/:id/players-actions", catchAsync(getMatchPlayersActions));

router.get("/:id", validate(idParamSchema), catchAsync(getMatch));

// Writes: admin + coach
router.post(
  "/bulk-delete",
  requireTenantRole("admin", "coach"),
  validate(bulkDeleteSchema),
  catchAsync(bulkDeleteMatches),
);
router.delete(
  "/bulk",
  requireTenantRole("admin", "coach"),
  validate(bulkDeleteSchema),
  catchAsync(bulkDeleteMatches),
);

router.post(
  "/",
  requireTenantRole("admin", "coach"),
  validate(createMatchSchema),
  catchAsync(createMatch),
);
router.put(
  "/:id",
  requireTenantRole("admin", "coach"),
  validate(updateMatchSchema),
  catchAsync(updateMatch),
);
router.patch(
  "/:id",
  requireTenantRole("admin", "coach"),
  validate(updateMatchSchema),
  catchAsync(updateMatch),
);
router.delete(
  "/:id",
  requireTenantRole("admin", "coach"),
  validate(idParamSchema),
  catchAsync(deleteMatch),
);

export default router;
