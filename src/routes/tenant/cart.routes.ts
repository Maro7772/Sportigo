import { Router } from "express";
import {
  checkoutCart,
  clearCart,
  getCart,
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
  updateCartSchema,
} from "../../validators/tenant/cart";

const router = Router();

// Billing / renewal is reserved to the club admin.
router.use(requireTenantRole("admin"));

// The club owns exactly one cart, so no endpoint takes a cart-item id.
router.get("/", catchAsync(getCart));

// Checks out the whole cart and turns it into a pending order.
router.post("/checkout", imageUpload, validate(checkoutCartSchema), catchAsync(checkoutCart));

router.post("/", validate(createCartSchema), catchAsync(saveCartItem));
router.put("/", validate(updateCartSchema), catchAsync(updateCartItem));
router.patch("/", validate(updateCartSchema), catchAsync(updateCartItem));
router.delete("/", catchAsync(clearCart));

export default router;
