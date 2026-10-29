import { Router } from "express";
import {
  bulkDeletePlayers,
  createPlayer,
  deletePlayer,
  getPlayer,
  listPlayers,
  updatePlayer,
} from "../../controllers/tenant/player.controller";
import { requireTenantRole } from "../../middlewares/tenantAuth";
import { validate } from "../../middlewares/validate";
import { catchAsync } from "../../utils/catchAsync";
import { bulkDeleteSchema, idParamSchema } from "../../validators/common";
import {
  createPlayerSchema,
  listPlayersSchema,
  updatePlayerSchema,
} from "../../validators/tenant/player";

const router = Router();

// Reads: admin + coach + viewer
router.get("/", validate(listPlayersSchema), catchAsync(listPlayers));
router.get("/:id", validate(idParamSchema), catchAsync(getPlayer));

// Writes: admin + coach
router.post(
  "/bulk-delete",
  requireTenantRole("admin", "coach"),
  validate(bulkDeleteSchema),
  catchAsync(bulkDeletePlayers)
);
router.delete(
  "/bulk",
  requireTenantRole("admin", "coach"),
  validate(bulkDeleteSchema),
  catchAsync(bulkDeletePlayers)
);

router.post(
  "/",
  requireTenantRole("admin", "coach"),
  validate(createPlayerSchema),
  catchAsync(createPlayer)
);
router.put(
  "/:id",
  requireTenantRole("admin", "coach"),
  validate(updatePlayerSchema),
  catchAsync(updatePlayer)
);
router.patch(
  "/:id",
  requireTenantRole("admin", "coach"),
  validate(updatePlayerSchema),
  catchAsync(updatePlayer)
);
router.delete(
  "/:id",
  requireTenantRole("admin", "coach"),
  validate(idParamSchema),
  catchAsync(deletePlayer)
);

export default router;
