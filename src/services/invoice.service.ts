import { Types } from "mongoose";
import { Order, type OrderStatus } from "../models/Order";
import { Package, type IPackageCycle } from "../models/Package";
import { Club } from "../models/Club";
import { PaymentMethod } from "../models/PaymentMethod";
import { getOrCreateSettings } from "../models/Settings";
import { ForbiddenError, NotFound } from "../errors";

export interface InvoiceItem {
  package_id: string;
  package_name: string;
  game_name?: string | null;
  cycle_name: string;
  months: number;
  teams_limit: number;
  players_limit: number;
  unit_price: number;
  discount: number;
  fine: number;
  final_price: number;
}

export interface InvoiceData {
  invoice_number: string;
  order_number: string;
  order_id: string;
  status: OrderStatus;
  is_paid: boolean;
  issued_at: Date;
  paid_at: Date | null;
  club: {
    id: string;
    name: string;
    subdomain: string;
  };
  provider: {
    name: string;
    service: string;
  };
  item: InvoiceItem;
  pricing: {
    subtotal: number;
    discount: number;
    fine: number;
    total: number;
    currency: string;
  };
  payment: {
    method_name: string;
    payment_reference: string | null;
    payment_proof: string | null;
    paid_at: Date | null;
  };
  notes: string | null;
}

function findCycle(
  cycles: IPackageCycle[],
  cycleId?: Types.ObjectId | string | null
): IPackageCycle | undefined {
  if (!cycleId) return cycles[0];
  return cycles.find((c) => String(c._id) === String(cycleId));
}

/**
 * Builds standard invoice structured data from an Order.
 * Optionally verifies that the order belongs to the requesting club.
 */
export async function buildInvoiceData(
  orderId: string,
  allowedClubId?: string
): Promise<InvoiceData> {
  const order = await Order.findById(orderId).lean();
  if (!order) {
    throw new NotFound("Order not found");
  }

  if (allowedClubId && String(order.club_id) !== String(allowedClubId)) {
    throw new ForbiddenError("You are not authorized to view this invoice");
  }

  const [club, pkg, paymentMethod, settings] = await Promise.all([
    Club.findById(order.club_id).lean(),
    Package.findById(order.package_id).populate("game_id", "name").lean(),
    PaymentMethod.findById(order.payment_method_id).lean(),
    getOrCreateSettings(),
  ]);

  if (!club) {
    throw new NotFound("Club associated with this order was not found");
  }

  const cycle = pkg ? findCycle(pkg.cycles, order.cycle_id) : undefined;
  const gameName = pkg?.game_id && typeof pkg.game_id === "object" && "name" in pkg.game_id
    ? (pkg.game_id as { name: string }).name
    : null;

  const cycleName = cycle?.name ?? (order.cycle_id ? "Custom Cycle" : "Standard Cycle");
  const months = cycle?.months ?? 1;

  const invoiceNumber = `INV-${order.order_number}`;

  return {
    invoice_number: invoiceNumber,
    order_number: order.order_number,
    order_id: String(order._id),
    status: order.status,
    is_paid: order.status === "paid",
    issued_at: order.createdAt,
    paid_at: order.paid_at ?? null,
    club: {
      id: String(club._id),
      name: club.name,
      subdomain: club.subdomain,
    },
    provider: {
      name: "Scouting Platform",
      service: "Club Scouting & Analytics Management System",
    },
    item: {
      package_id: pkg ? String(pkg._id) : String(order.package_id),
      package_name: pkg?.name ?? "Subscription Package",
      game_name: gameName,
      cycle_name: cycleName,
      months,
      teams_limit: pkg?.teams ?? 0,
      players_limit: pkg?.players ?? 0,
      unit_price: order.price,
      discount: order.discount,
      fine: order.fine,
      final_price: order.final_price,
    },
    pricing: {
      subtotal: order.price,
      discount: order.discount,
      fine: order.fine,
      total: order.final_price,
      currency: "EGP",
    },
    payment: {
      method_name: paymentMethod?.name ?? "Direct Payment",
      payment_reference: order.payment_reference ?? null,
      payment_proof: order.payment_proof ?? null,
      paid_at: order.paid_at ?? null,
    },
    notes: order.notes ?? null,
  };
}

/**
 * Generates a responsive, printable HTML invoice representation.
 */
export function renderInvoiceHtml(invoice: InvoiceData): string {
  const statusColors: Record<OrderStatus, { bg: string; text: string; label: string }> = {
    paid: { bg: "#e6f4ea", text: "#137333", label: "PAID" },
    pending: { bg: "#fef7e0", text: "#b06000", label: "PENDING APPROVAL" },
    rejected: { bg: "#fce8e6", text: "#c5221f", label: "REJECTED" },
    cancelled: { bg: "#f1f3f4", text: "#5f6368", label: "CANCELLED" },
    refunded: { bg: "#e8f0fe", text: "#1a73e8", label: "REFUNDED" },
  };

  const currentStatus = statusColors[invoice.status] ?? statusColors.pending;
  const issueDateFormatted = new Date(invoice.issued_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const paidDateFormatted = invoice.paid_at
    ? new Date(invoice.paid_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invoice - ${invoice.invoice_number}</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    body {
      background-color: #f8fafc;
      color: #1e293b;
      padding: 40px 20px;
    }
    .invoice-card {
      max-width: 800px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
      border: 1px solid #e2e8f0;
      padding: 48px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #f1f5f9;
      padding-bottom: 24px;
      margin-bottom: 32px;
    }
    .brand h1 {
      font-size: 24px;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: -0.5px;
    }
    .brand p {
      font-size: 14px;
      color: #64748b;
      margin-top: 4px;
    }
    .invoice-meta {
      text-align: right;
    }
    .invoice-meta h2 {
      font-size: 20px;
      font-weight: 700;
      color: #2563eb;
    }
    .status-badge {
      display: inline-block;
      margin-top: 8px;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.5px;
      background-color: ${currentStatus.bg};
      color: ${currentStatus.text};
    }
    .details-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 32px;
      margin-bottom: 36px;
    }
    .details-block h3 {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #94a3b8;
      margin-bottom: 8px;
    }
    .details-block p {
      font-size: 14px;
      color: #334155;
      line-height: 1.5;
    }
    .details-block .strong {
      font-weight: 600;
      font-size: 16px;
      color: #0f172a;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 32px;
    }
    th {
      background-color: #f8fafc;
      text-align: left;
      padding: 12px 16px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #64748b;
      border-bottom: 1px solid #e2e8f0;
    }
    th.text-right, td.text-right {
      text-align: right;
    }
    td {
      padding: 16px;
      font-size: 14px;
      border-bottom: 1px solid #f1f5f9;
      color: #334155;
    }
    .item-title {
      font-weight: 600;
      color: #0f172a;
    }
    .item-desc {
      font-size: 12px;
      color: #64748b;
      margin-top: 4px;
    }
    .summary-section {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 32px;
    }
    .summary-table {
      width: 280px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      font-size: 14px;
      color: #64748b;
    }
    .summary-row.total {
      border-top: 2px solid #e2e8f0;
      margin-top: 8px;
      padding-top: 12px;
      font-weight: 700;
      font-size: 18px;
      color: #0f172a;
    }
    .footer {
      border-top: 1px solid #f1f5f9;
      padding-top: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      color: #94a3b8;
    }
    .actions {
      margin-top: 24px;
      display: flex;
      justify-content: center;
      gap: 12px;
    }
    .btn {
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }
    .btn-primary {
      background: #2563eb;
      color: #ffffff;
    }
    .btn-primary:hover {
      background: #1d4ed8;
    }
    @media print {
      body {
        background: #ffffff;
        padding: 0;
      }
      .invoice-card {
        box-shadow: none;
        border: none;
        padding: 0;
      }
      .actions {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="invoice-card">
    <div class="header">
      <div class="brand">
        <h1>${invoice.provider.name}</h1>
        <p>${invoice.provider.service}</p>
      </div>
      <div class="invoice-meta">
        <h2>INVOICE</h2>
        <p style="font-size: 14px; font-weight: 600; color: #475569;"># ${invoice.invoice_number}</p>
        <span class="status-badge">${currentStatus.label}</span>
      </div>
    </div>

    <div class="details-grid">
      <div class="details-block">
        <h3>Billed To (Tenant)</h3>
        <p class="strong">${invoice.club.name}</p>
        <p>Subdomain: <code>${invoice.club.subdomain}</code></p>
        <p>Club ID: ${invoice.club.id}</p>
      </div>
      <div class="details-block">
        <h3>Invoice Details</h3>
        <p><strong>Order Number:</strong> ${invoice.order_number}</p>
        <p><strong>Issue Date:</strong> ${issueDateFormatted}</p>
        <p><strong>Paid Date:</strong> ${paidDateFormatted}</p>
        <p><strong>Payment Method:</strong> ${invoice.payment.method_name}</p>
        ${
          invoice.payment.payment_reference
            ? `<p><strong>Reference:</strong> ${invoice.payment.payment_reference}</p>`
            : ""
        }
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th>Duration</th>
          <th class="text-right">Price</th>
          <th class="text-right">Discount</th>
          <th class="text-right">Fine</th>
          <th class="text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <div class="item-title">${invoice.item.package_name}</div>
            <div class="item-desc">
              ${invoice.item.game_name ? `Game: ${invoice.item.game_name} | ` : ""}
              Teams: ${invoice.item.teams_limit > 0 ? invoice.item.teams_limit : "Unlimited"} | 
              Players: ${invoice.item.players_limit > 0 ? invoice.item.players_limit : "Unlimited"}
            </div>
          </td>
          <td>${invoice.item.cycle_name} (${invoice.item.months} mo)</td>
          <td class="text-right">${invoice.item.unit_price.toFixed(2)}</td>
          <td class="text-right">${invoice.item.discount > 0 ? `-${invoice.item.discount.toFixed(2)}` : "0.00"}</td>
          <td class="text-right">${invoice.item.fine > 0 ? `+${invoice.item.fine.toFixed(2)}` : "0.00"}</td>
          <td class="text-right"><strong>${invoice.item.final_price.toFixed(2)}</strong></td>
        </tr>
      </tbody>
    </table>

    <div class="summary-section">
      <div class="summary-table">
        <div class="summary-row">
          <span>Subtotal:</span>
          <span>${invoice.pricing.subtotal.toFixed(2)} ${invoice.pricing.currency}</span>
        </div>
        ${
          invoice.pricing.discount > 0
            ? `<div class="summary-row">
                 <span>Discount:</span>
                 <span>-${invoice.pricing.discount.toFixed(2)} ${invoice.pricing.currency}</span>
               </div>`
            : ""
        }
        ${
          invoice.pricing.fine > 0
            ? `<div class="summary-row">
                 <span>Late Renewal Fine:</span>
                 <span>+${invoice.pricing.fine.toFixed(2)} ${invoice.pricing.currency}</span>
               </div>`
            : ""
        }
        <div class="summary-row total">
          <span>Total:</span>
          <span>${invoice.pricing.total.toFixed(2)} ${invoice.pricing.currency}</span>
        </div>
      </div>
    </div>

    ${
      invoice.notes
        ? `<div style="background: #f8fafc; padding: 12px 16px; border-radius: 6px; font-size: 13px; color: #64748b; margin-bottom: 24px;">
             <strong>Notes:</strong> ${invoice.notes}
           </div>`
        : ""
    }

    <div class="footer">
      <div>Thank you for choosing ${invoice.provider.name}</div>
      <div>Generated on ${new Date().toLocaleDateString("en-US")}</div>
    </div>
  </div>

  <div class="actions">
    <button class="btn btn-primary" onclick="window.print()">Print / Save as PDF</button>
  </div>
</body>
</html>`;
}
