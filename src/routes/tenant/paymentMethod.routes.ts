import { Router } from "express";
import { listTenantPaymentMethods } from "../../controllers/tenant/paymentMethod.controller";
import { catchAsync } from "../../utils/catchAsync";

const router = Router();

// Payment methods can be queried by all authenticated tenant users
router.get("/", catchAsync(listTenantPaymentMethods));

export default router;
