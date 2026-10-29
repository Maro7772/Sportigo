import { Router } from "express";
import {
  bulkDeletePaymentMethods,
  createPaymentMethod,
  deletePaymentMethod,
  getPaymentMethod,
  listPaymentMethods,
  selectPaymentMethods,
  updatePaymentMethod,
} from "../controllers/paymentMethod.controller";
import { authenticate, authorize } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { catchAsync } from "../utils/catchAsync";
import { bulkDeleteSchema, idParamSchema } from "../validators/common";
import {
  createPaymentMethodSchema,
  listPaymentMethodsSchema,
  updatePaymentMethodSchema,
} from "../validators/paymentMethod";

const router = Router();

router.use(authenticate, authorize("super_admin"));

router.get("/", validate(listPaymentMethodsSchema), catchAsync(listPaymentMethods));
router.get("/select", catchAsync(selectPaymentMethods));

router.post("/bulk-delete", validate(bulkDeleteSchema), catchAsync(bulkDeletePaymentMethods));
router.delete("/bulk", validate(bulkDeleteSchema), catchAsync(bulkDeletePaymentMethods));

router.get("/:id", validate(idParamSchema), catchAsync(getPaymentMethod));
router.post("/", validate(createPaymentMethodSchema), catchAsync(createPaymentMethod));
router.put("/:id", validate(updatePaymentMethodSchema), catchAsync(updatePaymentMethod));
router.patch("/:id", validate(updatePaymentMethodSchema), catchAsync(updatePaymentMethod));
router.delete("/:id", validate(idParamSchema), catchAsync(deletePaymentMethod));

export default router;
