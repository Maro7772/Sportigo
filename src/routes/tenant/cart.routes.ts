import { Router } from "express";
import {
  checkoutCart,
  clearCart,
  getCart,
  replaceCart,
  saveCartItem,
  updateCartItem,
} from "../../controllers/tenant/cart.controller";
import { requireTenantRole } from "../../middlewares/tenantAuth";
import { validate } from "../../middlewares/validate";
import { catchAsync } from "../../utils/catchAsync";
import { imageUpload } from "../../config/upload";
import {
  checkoutCartSchema,
  createCartSchema,
  deleteCartSchema,
  replaceCartSchema,
  updateCartSchema,
} from "../../validators/tenant/cart";

const router = Router();

// Billing / renewal is reserved to the club admin.
router.use(requireTenantRole("admin"));

// The club owns exactly one cart that holds many lines, and no endpoint takes a
// cart-line id: a line is identified by its `package_id`.
router.get("/", catchAsync(getCart));

// Checks out the whole cart and turns every line into a pending order.
router.post("/checkout", imageUpload, validate(checkoutCartSchema), catchAsync(checkoutCart));

router.post("/", validate(createCartSchema), catchAsync(saveCartItem));
router.put("/", validate(replaceCartSchema), catchAsync(replaceCart));
router.patch("/", validate(updateCartSchema), catchAsync(updateCartItem));
router.delete("/", validate(deleteCartSchema), catchAsync(clearCart));

export default router;
