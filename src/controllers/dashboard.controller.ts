import type { Request, Response } from "express";
import { Game } from "../models/Game";
import { Action } from "../models/Action";
import { Package } from "../models/Package";
import { Club } from "../models/Club";
import { Order } from "../models/Order";
import { PaymentMethod } from "../models/PaymentMethod";
import { getOrCreateSettings } from "../models/Settings";
import {
  evaluateSubscription,
  type SubscriptionState,
} from "../services/subscription.service";
import { SuccessResponse } from "../utils/response";
import { roundMoney } from "../utils/helpers";

const DAY_MS = 86_400_000;
const EXPIRING_SOON_DAYS = 7;

const CLUB_STATES: SubscriptionState[] = [
  "active",
  "pending",
  "grace",
  "expired",
  "inactive",
];

const ORDER_STATES = ["pending", "paid", "rejected", "cancelled", "refunded"] as const;
type OrderState = (typeof ORDER_STATES)[number];

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * One call that powers the super admin dashboard:
 * counters, subscription breakdown, revenue, top packages, recent orders and
 * clubs that are about to expire.
 */
export async function getDashboard(req: Request, res: Response) {
  const rawMonths = Number(req.query.months);
  const months =
    Number.isFinite(rawMonths) && rawMonths > 0
      ? Math.min(Math.floor(rawMonths), 24)
      : 12;

  const now = new Date();
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const expiringBefore = new Date(now.getTime() + EXPIRING_SOON_DAYS * DAY_MS);

  const [
    games,
    actions,
    packages,
    clubsCount,
    ordersCount,
    paymentMethods,
    settings,
    clubs,
    ordersByStatusRaw,
    paidTotalsRaw,
    monthTotalsRaw,
    pendingTotalsRaw,
    topPackagesRaw,
    recentOrders,
    expiringRaw,
  ] = await Promise.all([
    Game.countDocuments(),
    Action.countDocuments(),
    Package.countDocuments(),
    Club.countDocuments(),
    Order.countDocuments(),
    PaymentMethod.countDocuments(),
    getOrCreateSettings(),
    Club.find().select("status start_date end_date").lean(),
    Order.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Order.aggregate<{ total: number; count: number }>([
      { $match: { status: "paid" } },
      {
        $group: {
          _id: null,
          total: { $sum: "$final_price" },
          count: { $sum: 1 },
        },
      },
    ]),
    Order.aggregate<{
      _id: { year: number; month: number };
      revenue: number;
      orders: number;
    }>([
      { $match: { status: "paid", paid_at: { $gte: rangeStart } } },
      {
        $group: {
          _id: { year: { $year: "$paid_at" }, month: { $month: "$paid_at" } },
          revenue: { $sum: "$final_price" },
          orders: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]),
    Order.aggregate<{ total: number; count: number }>([
      { $match: { status: "pending" } },
      {
        $group: {
          _id: null,
          total: { $sum: "$final_price" },
          count: { $sum: 1 },
        },
      },
    ]),
    Order.aggregate<{
      package_id: string;
      name?: string;
      orders: number;
      revenue: number;
    }>([
      { $match: { status: "paid" } },
      {
        $group: {
          _id: "$package_id",
          orders: { $sum: 1 },
          revenue: { $sum: "$final_price" },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "packages",
          localField: "_id",
          foreignField: "_id",
          as: "package",
        },
      },
      { $unwind: { path: "$package", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          package_id: "$_id",
          name: "$package.name",
          orders: 1,
          revenue: 1,
        },
      },
    ]),
    Order.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate([
        { path: "club_id", select: "name subdomain" },
        { path: "package_id", select: "name" },
        { path: "payment_method_id", select: "name" },
      ])
      .lean(),
    Club.find({
      status: true,
      end_date: { $gte: now, $lte: expiringBefore },
    })
      .select("name subdomain end_date package_id")
      .sort({ end_date: 1 })
      .limit(10)
      .populate("package_id", "name")
      .lean(),
  ]);

  const clubsByStatus = Object.fromEntries(
    CLUB_STATES.map((state) => [state, 0])
  ) as Record<SubscriptionState, number>;

  for (const club of clubs) {
    const { status } = evaluateSubscription(club, settings.allowed_days, now);
    clubsByStatus[status] += 1;
  }

  const ordersByStatus = Object.fromEntries(
    ORDER_STATES.map((state) => [state, 0])
  ) as Record<OrderState, number>;

  for (const row of ordersByStatusRaw) {
    if ((ORDER_STATES as readonly string[]).includes(row._id)) {
      ordersByStatus[row._id as OrderState] = row.count;
    }
  }

  const revenueByMonth = new Map(
    monthTotalsRaw.map((row) => [
      monthKey(row._id.year, row._id.month),
      { revenue: row.revenue, orders: row.orders },
    ])
  );

  const monthlyRevenue = Array.from({ length: months }, (_, index) => {
    const date = new Date(
      rangeStart.getFullYear(),
      rangeStart.getMonth() + index,
      1
    );
    const key = monthKey(date.getFullYear(), date.getMonth() + 1);
    const row = revenueByMonth.get(key);

    return {
      month: key,
      revenue: roundMoney(row?.revenue ?? 0),
      orders: row?.orders ?? 0,
    };
  });

  const currentMonthKey = monthKey(now.getFullYear(), now.getMonth() + 1);
  const thisMonthRevenue =
    monthlyRevenue.find((row) => row.month === currentMonthKey)?.revenue ?? 0;

  const paidTotals = paidTotalsRaw[0];
  const pendingTotals = pendingTotalsRaw[0];

  return SuccessResponse(res, {
    summary: {
      games,
      actions,
      packages,
      clubs: clubsCount,
      orders: ordersCount,
      payment_methods: paymentMethods,
      clubs_by_status: clubsByStatus,
      orders_by_status: ordersByStatus,
      revenue: {
        total: roundMoney(paidTotals?.total ?? 0),
        paid_orders: paidTotals?.count ?? 0,
        this_month: thisMonthRevenue,
        pending: roundMoney(pendingTotals?.total ?? 0),
        pending_orders: pendingTotals?.count ?? 0,
      },
    },
    monthly_revenue: monthlyRevenue,
    top_packages: topPackagesRaw.map((row) => ({
      ...row,
      revenue: roundMoney(row.revenue),
    })),
    recent_orders: recentOrders,
    upcoming_expirations: expiringRaw.map((club) => ({
      ...club,
      days_left: club.end_date
        ? Math.max(
            0,
            Math.ceil((new Date(club.end_date).getTime() - now.getTime()) / DAY_MS)
          )
        : null,
    })),
  });
}
