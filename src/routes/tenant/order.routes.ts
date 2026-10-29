import { Router } from "express";
import {
  getTenantOrder,
  getTenantOrderInvoice,
  getTenantOrderInvoiceHtml,
  listTenantOrders,
  purchasePackageDirectly,
  uploadTenantOrderPaymentProof,
} from "../../controllers/tenant/order.controller";
import { requireTenantRole } from "../../middlewares/tenantAuth";
import { validate } from "../../middlewares/validate";
import { catchAsync } from "../../utils/catchAsync";
import { imageUpload } from "../../config/upload";
import { idParamSchema } from "../../validators/common";
import {
  invoiceParamSchema,
  listTenantOrdersSchema,
  purchaseOrderSchema,
} from "../../validators/tenant/order";

const router = Router();

// Billing, orders and invoices are reserved to the club admin
router.use(requireTenantRole("admin"));

router.get("/", validate(listTenantOrdersSchema), catchAsync(listTenantOrders));
router.post("/", validate(purchaseOrderSchema), catchAsync(purchasePackageDirectly));

router.get("/:id", validate(idParamSchema), catchAsync(getTenantOrder));
router.post("/:id/payment-proof", imageUpload, catchAsync(uploadTenantOrderPaymentProof));

router.get("/:id/invoice", validate(invoiceParamSchema), catchAsync(getTenantOrderInvoice));
router.get("/:id/invoice/html", validate(idParamSchema), catchAsync(getTenantOrderInvoiceHtml));

export default router;
