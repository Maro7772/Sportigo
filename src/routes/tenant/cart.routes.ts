import { Router } from "express";
import {
  bulkDeleteCart,
  checkoutCart,
  createCartItem,
  deleteCartItem,
  getCartItem,
  listCart,
  updateCartItem,
} from "../../controllers/tenant/cart.controller";
import { uploadCartPaymentProof } from "../../controllers/tenant/upload.controller";
import { requireTenantRole } from "../../middlewares/tenantAuth";
import { validate } from "../../middlewares/validate";
import { catchAsync } from "../../utils/catchAsync";
import { imageUpload } from "../../config/upload";
import { bulkDeleteSchema, idParamSchema } from "../../validators/common";
import {
  checkoutCartSchema,
  createCartSchema,
  listCartSchema,
  updateCartSchema,
} from "../../validators/tenant/cart";

const router = Router();

// Billing / renewal is reserved to the club admin.
router.use(requireTenantRole("admin"));

router.get("/", validate(listCartSchema), catchAsync(listCart));

router.post("/bulk-delete", validate(bulkDeleteSchema), catchAsync(bulkDeleteCart));
router.delete("/bulk", validate(bulkDeleteSchema), catchAsync(bulkDeleteCart));

router.post("/", validate(createCartSchema), catchAsync(createCartItem));
router.get("/:id", validate(idParamSchema), catchAsync(getCartItem));
router.put("/:id", validate(updateCartSchema), catchAsync(updateCartItem));
router.patch("/:id", validate(updateCartSchema), catchAsync(updateCartItem));
router.delete("/:id", validate(idParamSchema), catchAsync(deleteCartItem));

router.post("/:id/checkout", imageUpload, validate(checkoutCartSchema), catchAsync(checkoutCart));
router.post("/:id/payment-proof", imageUpload, catchAsync(uploadCartPaymentProof));

export default router;
