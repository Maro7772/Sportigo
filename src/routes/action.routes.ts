import { Router } from "express";
import {
  bulkDeleteActions,
  createAction,
  deleteAction,
  getAction,
  listActions,
  selectActions,
  updateAction,
} from "../controllers/action.controller";
import { authenticate, authorize } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { catchAsync } from "../utils/catchAsync";
import { bulkDeleteSchema, idParamSchema } from "../validators/common";
import { createActionSchema, listActionsSchema, updateActionSchema } from "../validators/action";

const router = Router();

router.use(authenticate, authorize("super_admin"));

router.get("/", validate(listActionsSchema), catchAsync(listActions));
router.get("/select", catchAsync(selectActions));

router.post("/bulk-delete", validate(bulkDeleteSchema), catchAsync(bulkDeleteActions));
router.delete("/bulk", validate(bulkDeleteSchema), catchAsync(bulkDeleteActions));

router.get("/:id", validate(idParamSchema), catchAsync(getAction));
router.post("/", validate(createActionSchema), catchAsync(createAction));
router.put("/:id", validate(updateActionSchema), catchAsync(updateAction));
router.patch("/:id", validate(updateActionSchema), catchAsync(updateAction));
router.delete("/:id", validate(idParamSchema), catchAsync(deleteAction));

export default router;
