import type { Request, Response } from "express";
import { PaymentMethod } from "../../models/PaymentMethod";
import { SuccessResponse } from "../../utils/response";

/**
 * `GET /api/tenant/payment-methods`
 * Lists active payment methods so the tenant knows which payment channels are available
 * and any instructions (description/account info) associated with each.
 */
export async function listTenantPaymentMethods(_req: Request, res: Response) {
  const paymentMethods = await PaymentMethod.find({ status: true })
    .select("name description status createdAt")
    .sort({ name: 1 })
    .lean();

  return SuccessResponse(res, { payment_methods: paymentMethods });
}
