import { Router } from "express";
import {
  approveOrder,
  bulkDeleteOrders,
  createOrder,
  deleteOrder,
  getOrder,
  getOrderInvoice,
  getOrderInvoiceHtml,
  listOrders,
  rejectOrder,
  updateOrder,
  updateOrderStatus,
} from "../controllers/order.controller";
import { authenticate, authorize } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { catchAsync } from "../utils/catchAsync";
import { imageUpload } from "../config/upload";
import { uploadOrderPaymentProof } from "../controllers/upload.controller";
import { bulkDeleteSchema, idParamSchema } from "../validators/common";
import {
  approveOrderSchema,
  createOrderSchema,
  listOrdersSchema,
  rejectOrderSchema,
  updateOrderSchema,
  updateOrderStatusSchema,
} from "../validators/order";

const router = Router();

router.use(authenticate, authorize("super_admin"));

router.get("/", validate(listOrdersSchema), catchAsync(listOrders));

router.post("/bulk-delete", validate(bulkDeleteSchema), catchAsync(bulkDeleteOrders));
router.delete("/bulk", validate(bulkDeleteSchema), catchAsync(bulkDeleteOrders));

router.get("/:id", validate(idParamSchema), catchAsync(getOrder));
router.get("/:id/invoice", validate(idParamSchema), catchAsync(getOrderInvoice));
router.get("/:id/invoice/html", validate(idParamSchema), catchAsync(getOrderInvoiceHtml));
router.post("/", validate(createOrderSchema), catchAsync(createOrder));
router.patch("/:id/status", validate(updateOrderStatusSchema), catchAsync(updateOrderStatus));
router.post("/:id/approve", validate(approveOrderSchema), catchAsync(approveOrder));
router.post("/:id/reject", validate(rejectOrderSchema), catchAsync(rejectOrder));
router.post("/:id/payment-proof", imageUpload, catchAsync(uploadOrderPaymentProof));
router.put("/:id", validate(updateOrderSchema), catchAsync(updateOrder));
router.patch("/:id", validate(updateOrderSchema), catchAsync(updateOrder));
router.delete("/:id", validate(idParamSchema), catchAsync(deleteOrder));

export default router;
