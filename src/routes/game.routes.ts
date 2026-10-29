import { Router } from "express";
import {
  bulkDeleteGames,
  createGame,
  deleteGame,
  getGame,
  listGames,
  selectGames,
  updateGame,
} from "../controllers/game.controller";
import { authenticate, authorize } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { catchAsync } from "../utils/catchAsync";
import { bulkDeleteSchema, idParamSchema } from "../validators/common";
import { createGameSchema, listGamesSchema, updateGameSchema } from "../validators/game";

const router = Router();

router.use(authenticate, authorize("super_admin"));

router.get("/", validate(listGamesSchema), catchAsync(listGames));
router.get("/select", catchAsync(selectGames));

router.post("/bulk-delete", validate(bulkDeleteSchema), catchAsync(bulkDeleteGames));
router.delete("/bulk", validate(bulkDeleteSchema), catchAsync(bulkDeleteGames));

router.get("/:id", validate(idParamSchema), catchAsync(getGame));
router.post("/", validate(createGameSchema), catchAsync(createGame));
router.put("/:id", validate(updateGameSchema), catchAsync(updateGame));
router.patch("/:id", validate(updateGameSchema), catchAsync(updateGame));
router.delete("/:id", validate(idParamSchema), catchAsync(deleteGame));

export default router;
