/**
 * End-to-end smoke test against an in-memory MongoDB.
 * Run with: npm run test:smoke
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";

type ApiResult = { status: number; body: any };

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, extra?: unknown): void {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failed += 1;
    failures.push(label);
    console.error(`  ❌ ${label}`, extra ?? "");
  }
}

function eq(label: string, actual: unknown, expected: unknown): void {
  check(label, actual === expected, { expected, actual });
}

async function main(): Promise<void> {
  const dbPath = fs.mkdtempSync(path.join(os.tmpdir(), "scouting-mongo-"));
  const TENANT_PASSWORD = "Tenant@123456";

  const mongod = await MongoMemoryServer.create({
    instance: { dbPath },
  });

  process.env.NODE_ENV = "test";
  process.env.MONGODB_URI = mongod.getUri("scouting_smoke");
  process.env.JWT_SECRET = "smoke-test-secret-that-is-long-enough-123456";
  process.env.SUPER_ADMIN_NAME = "Smoke Admin";
  process.env.SUPER_ADMIN_EMAIL = "admin@smoke.local";
  process.env.SUPER_ADMIN_PASSWORD = "Admin@123456";
  process.env.CORS_ORIGINS = "*";
  // Password of the first admin created inside every new club database.
  process.env.TENANT_DEFAULT_PASSWORD = "Tenant@123456";

  const { connectDB, disconnectDB } = await import("../src/config/db");
  const { createApp } = await import("../src/app");
  const { ensureInitialSuperAdmin, ensureSettings } = await import(
    "../src/services/bootstrap.service"
  );
  const { seedDemoData } = await import("../src/services/demoSeed.service");

  let server: http.Server | undefined;

  try {
    await connectDB();
    await ensureInitialSuperAdmin();
    await ensureSettings();
    await seedDemoData();

    const app = createApp();
    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));

    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const base = `http://127.0.0.1:${port}/api`;

    const api = async (
      method: string,
      path: string,
      options: { token?: string; body?: unknown; headers?: Record<string, string> } = {}
    ): Promise<ApiResult> => {
      const headers: Record<string, string> = { ...(options.headers ?? {}) };
      if (options.body !== undefined) headers["Content-Type"] = "application/json";
      if (options.token) headers.Authorization = `Bearer ${options.token}`;

      const response = await fetch(`${base}${path}`, {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });

      const body = await response.json().catch(() => null);
      return { status: response.status, body };
    };

    console.log("\n▶ Health & auth");
    const healthResponse = await fetch(`http://127.0.0.1:${port}/health`);
    const health = { status: healthResponse.status, body: await healthResponse.json() };
    eq("health returns 200", health.status, 200);
    eq("health database connected", health.body?.data?.database, "connected");

    const noAuth = await api("GET", "/games");
    eq("games without token -> 401", noAuth.status, 401);

    const badLogin = await api("POST", "/auth/login", {
      body: { email: "admin@smoke.local", password: "wrong-password" },
    });
    eq("wrong password -> 401", badLogin.status, 401);

    const login = await api("POST", "/auth/login", {
      body: { email: "admin@smoke.local", password: "Admin@123456" },
    });
    eq("login -> 200", login.status, 200);
    check("login returns token", typeof login.body?.data?.token === "string");
    check("login never returns password", login.body?.data?.admin?.password === undefined);

    const token: string = login.body.data.token;

    const me = await api("GET", "/auth/me", { token });
    eq("GET /auth/me -> 200", me.status, 200);
    eq("me email matches", me.body?.data?.admin?.email, "admin@smoke.local");

    console.log("\n▶ Games");
    const games = await api("GET", "/games", { token });
    eq("list games -> 200", games.status, 200);
    check(
      "seeded Football game exists",
      games.body?.data?.items?.some((item: any) => item.name === "Football")
    );

    const football = games.body.data.items.find((item: any) => item.name === "Football");

    const badGame = await api("POST", "/games", { token, body: { name: "" } });
    eq("invalid game body -> 400", badGame.status, 400);

    const newGame = await api("POST", "/games", {
      token,
      body: { name: "Basketball" },
    });
    eq("create game -> 201", newGame.status, 201);
    const basketballId: string = newGame.body?.data?.game?._id;

    const duplicateGame = await api("POST", "/games", {
      token,
      body: { name: "Basketball" },
    });
    eq("duplicate game name -> 409", duplicateGame.status, 409);

    const gameDetail = await api("GET", `/games/${football._id}`, { token });
    eq("get game detail -> 200", gameDetail.status, 200);
    check("game detail has action stats", gameDetail.body?.data?.stats?.actions > 0);

    console.log("\n▶ Actions");
    const action = await api("POST", "/actions", {
      token,
      body: { game_id: basketballId, name: "Three pointer" },
    });
    eq("create action -> 201", action.status, 201);
    check("action is populated with game", action.body?.data?.action?.game_id?.name === "Basketball");

    const duplicateAction = await api("POST", "/actions", {
      token,
      body: { game_id: basketballId, name: "Three pointer" },
    });
    eq("duplicate action in same game -> 409", duplicateAction.status, 409);

    const actions = await api("GET", `/actions?game_id=${basketballId}`, { token });
    eq("filter actions by game -> 200", actions.status, 200);
    eq("filter returns 1 action", actions.body?.data?.items?.length, 1);

    console.log("\n▶ Packages");
    const pkg = await api("POST", "/packages", {
      token,
      body: {
        name: "Basketball Pro",
        game_id: basketballId,
        teams: 2,
        players: 12,
        cycles: [
          { name: "Monthly", discount_type: "percentage", price: 400, discount: 0, months: 1 },
          { name: "Season", discount_type: "percentage", price: 1200, discount: 15, months: 6 },
          { name: "Special", discount_type: "amount", price: 1000, discount: 250, months: 3 },
        ],
      },
    });
    eq("create package -> 201", pkg.status, 201);
    const packageId: string = pkg.body?.data?.package?._id;
    const cycleId: string = pkg.body?.data?.package?.cycles?.[0]?._id;

    const updatedPackage = await api("PUT", `/packages/${packageId}`, {
      token,
      body: {
        cycles: [
          { name: "Monthly", discount_type: "percentage", price: 400, discount: 0, months: 1 },
          { name: "Season", discount_type: "percentage", price: 1200, discount: 15, months: 6 },
          { name: "Special", discount_type: "amount", price: 1000, discount: 250, months: 3 },
        ],
      },
    });
    eq("update package cycles -> 200", updatedPackage.status, 200);
    eq(
      "cycle _id is preserved after update",
      updatedPackage.body?.data?.package?.cycles?.[0]?._id,
      cycleId
    );

    const noCycles = await api("POST", "/packages", {
      token,
      body: { name: "Empty", game_id: basketballId, cycles: [] },
    });
    eq("package without cycles -> 400", noCycles.status, 400);

    const duplicateCycle = await api("POST", "/packages", {
      token,
      body: {
        name: "Duplicate cycles",
        game_id: basketballId,
        cycles: [
          { name: "Same", price: 10, discount: 0, months: 1 },
          { name: "Same", price: 20, discount: 0, months: 2 },
        ],
      },
    });
    eq("duplicate cycle names -> 400", duplicateCycle.status, 400);

    const invalidAmountDiscount = await api("POST", "/packages", {
      token,
      body: {
        name: "Invalid amount discount",
        game_id: basketballId,
        cycles: [
          { name: "Special", discount_type: "amount", price: 100, discount: 150, months: 1 },
        ],
      },
    });
    eq("amount discount greater than price -> 400", invalidAmountDiscount.status, 400);

    console.log("\n▶ Clubs");
    const club = await api("POST", "/clubs", {
      token,
      body: {
        name: "Smoke Club",
        subdomain: "Smoke Club",
        package_id: packageId,
        start_date: new Date(Date.now() - 86_400_000).toISOString(),
        end_date: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      },
    });
    eq("create club -> 201", club.status, 201);
    eq("subdomain normalized", club.body?.data?.club?.subdomain, "smoke-club");
    eq("subscription computed as active", club.body?.data?.club?.subscription_status, "active");
    const clubId: string = club.body?.data?.club?._id;

    const duplicateClub = await api("POST", "/clubs", {
      token,
      body: { name: "Other", subdomain: "smoke-club" },
    });
    eq("duplicate subdomain -> 409", duplicateClub.status, 409);

    const badDates = await api("POST", "/clubs", {
      token,
      body: {
        name: "Bad dates",
        subdomain: "bad-dates",
        start_date: "2026-12-01",
        end_date: "2026-01-01",
      },
    });
    eq("end_date before start_date -> 400", badDates.status, 400);

    const populatedClub = await api("GET", `/clubs/${clubId}`, { token });
    eq("club is populated with package", populatedClub.body?.data?.club?.package_id?.name, "Basketball Pro");

    console.log("\n▶ Orders");
    const order = await api("POST", "/orders", {
      token,
      body: {
        club_id: clubId,
        package_id: packageId,
        cycle_id: cycleId,
        payment_method_id: (await api("GET", "/payment-methods/select", { token })).body.data.items[0]._id,
        fine: 50,
        status: "pending",
      },
    });
    eq("create order -> 201", order.status, 201);
    eq("price derived from cycle", order.body?.data?.order?.price, 400);
    eq("final price = price - discount + fine", order.body?.data?.order?.final_price, 450);
    check(
      "order number generated",
      /^ORD-\d{4}-\d{6}$/.test(order.body?.data?.order?.order_number ?? "")
    );
    const orderId: string = order.body?.data?.order?._id;

    const paid = await api("PATCH", `/orders/${orderId}/status`, {
      token,
      body: { status: "paid" },
    });
    eq("update order status -> 200", paid.status, 200);
    eq("order status is paid", paid.body?.data?.order?.status, "paid");
    check("paid_at was set automatically", Boolean(paid.body?.data?.order?.paid_at));
    check(
      "order applied to subscription",
      paid.body?.data?.order?.applied_to_subscription === true
    );
    eq("response reports subscription applied", paid.body?.data?.subscription_applied, true);

    const clubAfterPayment = await api("GET", `/clubs/${clubId}`, { token });
    eq(
      "club subscription is active after payment",
      clubAfterPayment.body?.data?.club?.subscription_status,
      "active"
    );
    const endAfterFirstPayment: string = clubAfterPayment.body?.data?.club?.end_date;

    const updatedOrder = await api("PUT", `/orders/${orderId}`, {
      token,
      body: { discount: 100 },
    });
    eq("update order discount -> 200", updatedOrder.status, 200);
    eq("final price recomputed", updatedOrder.body?.data?.order?.final_price, 350);

    const overDiscount = await api("PUT", `/orders/${orderId}`, {
      token,
      body: { discount: 9999 },
    });
    eq("discount greater than price -> 400", overDiscount.status, 400);

    const refundApplied = await api("PATCH", `/orders/${orderId}/status`, {
      token,
      body: { status: "refunded" },
    });
    eq("cannot refund an applied order -> 409", refundApplied.status, 409);

    const deleteApplied = await api("DELETE", `/orders/${orderId}`, { token });
    eq("cannot delete an applied order -> 409", deleteApplied.status, 409);

    const payAgain = await api("PATCH", `/orders/${orderId}/status`, {
      token,
      body: { status: "paid" },
    });
    eq("marking a paid order as paid again -> 200", payAgain.status, 200);

    const clubAfterSecondPayment = await api("GET", `/clubs/${clubId}`, { token });
    eq(
      "subscription is not extended twice",
      clubAfterSecondPayment.body?.data?.club?.end_date,
      endAfterFirstPayment
    );

    const amountCycleId: string = pkg.body?.data?.package?.cycles?.[2]?._id;
    const amountOrder = await api("POST", "/orders", {
      token,
      body: {
        club_id: clubId,
        package_id: packageId,
        cycle_id: amountCycleId,
        payment_method_id: (await api("GET", "/payment-methods/select", { token })).body.data
          .items[0]._id,
        status: "pending",
      },
    });
    eq("order with amount discount -> 201", amountOrder.status, 201);
    eq("amount discount is not converted to percentage", amountOrder.body?.data?.order?.discount, 250);
    eq("final price with amount discount", amountOrder.body?.data?.order?.final_price, 750);

    const amountOrderId: string = amountOrder.body?.data?.order?._id;
    check(
      "order numbers are unique",
      amountOrder.body?.data?.order?.order_number !== order.body?.data?.order?.order_number
    );

    const proofUpdate = await api("PUT", `/orders/${amountOrderId}`, {
      token,
      body: {
        payment_proof: "https://example.com/proofs/amount.png",
        payment_reference: "WALLET-12345",
      },
    });
    eq("attach payment proof -> 200", proofUpdate.status, 200);
    eq(
      "payment proof saved",
      proofUpdate.body?.data?.order?.payment_proof,
      "https://example.com/proofs/amount.png"
    );
    eq(
      "payment reference saved",
      proofUpdate.body?.data?.order?.payment_reference,
      "WALLET-12345"
    );

    const deleteAmountOrder = await api("DELETE", `/orders/${amountOrderId}`, { token });
    eq("delete pending amount order -> 200", deleteAmountOrder.status, 200);

    console.log("\n▶ Order review flow (proof -> approve / reject)");
    const reviewPaymentMethodId: string = (
      await api("GET", "/payment-methods/select", { token })
    ).body.data.items[0]._id;

    const proofOrder = await api("POST", "/orders", {
      token,
      body: {
        club_id: clubId,
        package_id: packageId,
        cycle_id: cycleId,
        payment_method_id: reviewPaymentMethodId,
        payment_proof: "https://example.com/proofs/receipt-1.jpg",
        payment_reference: "BANK-99881",
        status: "pending",
      },
    });
    eq("pending order with payment proof -> 201", proofOrder.status, 201);
    eq("pending order stays pending", proofOrder.body?.data?.order?.status, "pending");
    eq("pending order is not applied yet", proofOrder.body?.data?.subscription_applied, false);
    const proofOrderId: string = proofOrder.body?.data?.order?._id;

    const clubBeforeApproval = await api("GET", `/clubs/${clubId}`, { token });
    const endBeforeApproval: string = clubBeforeApproval.body?.data?.club?.end_date;

    const approved = await api("POST", `/orders/${proofOrderId}/approve`, {
      token,
      body: { notes: "Payment proof verified" },
    });
    eq("approve pending order -> 200", approved.status, 200);
    eq("approved order is paid", approved.body?.data?.order?.status, "paid");
    check(
      "approval is audited",
      Boolean(approved.body?.data?.order?.approved_at) &&
        Boolean(approved.body?.data?.order?.approved_by)
    );
    eq("approval applied the subscription", approved.body?.data?.subscription_applied, true);
    eq(
      "approval keeps the payment proof",
      approved.body?.data?.order?.payment_proof,
      "https://example.com/proofs/receipt-1.jpg"
    );
    eq(
      "approval saves the review note",
      approved.body?.data?.order?.review_notes,
      "Payment proof verified"
    );

    const clubAfterApproval = await api("GET", `/clubs/${clubId}`, { token });
    check(
      "approval extends the subscription",
      new Date(clubAfterApproval.body?.data?.club?.end_date).getTime() >
        new Date(endBeforeApproval).getTime()
    );

    const approveAgain = await api("POST", `/orders/${proofOrderId}/approve`, {
      token,
      body: {},
    });
    eq("approving an approved order -> 409", approveAgain.status, 409);

    const rejectTarget = await api("POST", "/orders", {
      token,
      body: {
        club_id: clubId,
        package_id: packageId,
        cycle_id: cycleId,
        payment_method_id: reviewPaymentMethodId,
        payment_proof: "https://example.com/proofs/broken.jpg",
        status: "pending",
      },
    });
    eq("create order to reject -> 201", rejectTarget.status, 201);
    const rejectTargetId: string = rejectTarget.body?.data?.order?._id;

    const rejectWithoutReason = await api("POST", `/orders/${rejectTargetId}/reject`, {
      token,
      body: {},
    });
    eq("reject without reason -> 400", rejectWithoutReason.status, 400);

    const rejected = await api("POST", `/orders/${rejectTargetId}/reject`, {
      token,
      body: { reason: "Receipt is unreadable" },
    });
    eq("reject pending order -> 200", rejected.status, 200);
    eq("rejected status", rejected.body?.data?.order?.status, "rejected");
    eq(
      "rejection reason saved",
      rejected.body?.data?.order?.rejection_reason,
      "Receipt is unreadable"
    );
    eq("rejected order is not applied", rejected.body?.data?.order?.applied_to_subscription, false);

    const approveRejected = await api("POST", `/orders/${rejectTargetId}/approve`, {
      token,
      body: {},
    });
    eq("approving a rejected order -> 409", approveRejected.status, 409);

    console.log("\n▶ Delete guards");
    const deleteUsedGame = await api("DELETE", `/games/${basketballId}`, { token });
    eq("delete game used by actions/packages -> 409", deleteUsedGame.status, 409);

    const deleteUsedClub = await api("DELETE", `/clubs/${clubId}`, { token });
    eq("delete club with orders -> 409", deleteUsedClub.status, 409);

    const deleteUsedPackage = await api("DELETE", `/packages/${packageId}`, { token });
    eq("delete package used by club/order -> 409", deleteUsedPackage.status, 409);

    console.log("\n▶ Settings");
    const settings = await api("GET", "/settings", { token });
    eq("get settings -> 200", settings.status, 200);
    eq("default allowed_days", settings.body?.data?.settings?.allowed_days, 0);

    const updatedSettings = await api("PUT", "/settings", {
      token,
      body: { allowed_days: 7, notification: false, fines: 100 },
    });
    eq("update settings -> 200", updatedSettings.status, 200);
    eq("allowed_days updated", updatedSettings.body?.data?.settings?.allowed_days, 7);
    eq("notification updated", updatedSettings.body?.data?.settings?.notification, false);
    eq("fines updated", updatedSettings.body?.data?.settings?.fines, 100);

    console.log("\n▶ Grace period & late renewal (allowed_days = 7)");
    const DAY = 86_400_000;
    const paymentMethodId: string = (
      await api("GET", "/payment-methods/select", { token })
    ).body.data.items[0]._id;

    const lateClub = await api("POST", "/clubs", {
      token,
      body: {
        name: "Late Club",
        subdomain: "late-club",
        package_id: packageId,
        start_date: new Date(Date.now() - 40 * DAY).toISOString(),
        end_date: new Date(Date.now() - 3 * DAY).toISOString(),
      },
    });
    eq("create club with past end_date -> 201", lateClub.status, 201);
    eq(
      "club inside grace period is grace",
      lateClub.body?.data?.club?.subscription_status,
      "grace"
    );
    check(
      "grace days left is computed",
      typeof lateClub.body?.data?.club?.subscription?.grace_days_left === "number"
    );
    const lateClubId: string = lateClub.body?.data?.club?._id;

    const lateSubscription = await api("GET", `/clubs/${lateClubId}/subscription`, {
      token,
    });
    eq("subscription endpoint -> 200", lateSubscription.status, 200);
    eq(
      "subscription endpoint reports grace",
      lateSubscription.body?.data?.subscription?.status,
      "grace"
    );
    eq(
      "grace is a late renewal",
      lateSubscription.body?.data?.subscription?.is_late_renewal,
      true
    );

    const expiredClub = await api("POST", "/clubs", {
      token,
      body: {
        name: "Expired Club",
        subdomain: "expired-club",
        start_date: new Date(Date.now() - 40 * DAY).toISOString(),
        end_date: new Date(Date.now() - 10 * DAY).toISOString(),
      },
    });
    eq("create club past grace -> 201", expiredClub.status, 201);
    eq(
      "club past end_date + allowed_days is expired",
      expiredClub.body?.data?.club?.subscription_status,
      "expired"
    );

    const graceFilter = await api("GET", "/clubs?subscription_status=grace", { token });
    eq("filter clubs by grace -> 200", graceFilter.status, 200);
    eq("grace filter returns one club", graceFilter.body?.data?.items?.length, 1);

    const expiredFilter = await api("GET", "/clubs?subscription_status=expired", {
      token,
    });
    eq("filter clubs by expired -> 200", expiredFilter.status, 200);
    eq("expired filter returns one club", expiredFilter.body?.data?.items?.length, 1);

    const lateOrder = await api("POST", "/orders", {
      token,
      body: {
        club_id: lateClubId,
        package_id: packageId,
        cycle_id: cycleId,
        payment_method_id: paymentMethodId,
        status: "pending",
      },
    });
    eq("late renewal order -> 201", lateOrder.status, 201);
    eq("default fine applied from settings", lateOrder.body?.data?.order?.fine, 100);
    eq(
      "late renewal final price includes the fine",
      lateOrder.body?.data?.order?.final_price,
      500
    );
    const lateOrderId: string = lateOrder.body?.data?.order?._id;

    const payLate = await api("PATCH", `/orders/${lateOrderId}/status`, {
      token,
      body: { status: "paid" },
    });
    eq("pay late renewal order -> 200", payLate.status, 200);

    const lateAfter = await api("GET", `/clubs/${lateClubId}/subscription`, { token });
    eq(
      "late renewal activates the subscription",
      lateAfter.body?.data?.subscription?.status,
      "active"
    );
    eq(
      "late renewal clears the late flag",
      lateAfter.body?.data?.subscription?.is_late_renewal,
      false
    );
    check(
      "late renewal pushes end_date into the future",
      new Date(lateAfter.body?.data?.club?.end_date ?? 0).getTime() > Date.now()
    );

    console.log("\n▶ Delete guards & bulk delete");
    const bulkAppliedOrders = await api("POST", "/orders/bulk-delete", {
      token,
      body: { ids: [orderId, lateOrderId] },
    });
    eq("bulk delete applied orders -> 409", bulkAppliedOrders.status, 409);

    const bulkUsedClubs = await api("POST", "/clubs/bulk-delete", {
      token,
      body: { ids: [clubId, lateClubId] },
    });
    eq("bulk delete clubs with orders -> 409", bulkUsedClubs.status, 409);

    const bulkUsedPackages = await api("POST", "/packages/bulk-delete", {
      token,
      body: { ids: [packageId] },
    });
    eq("bulk delete package in use -> 409", bulkUsedPackages.status, 409);

    const bulkActions = await api("POST", "/actions/bulk-delete", {
      token,
      body: { ids: [action.body.data.action._id] },
    });
    eq("bulk delete actions -> 200", bulkActions.status, 200);
    eq("deleted one action", bulkActions.body?.data?.deletedCount, 1);

    const tempGame = await api("POST", "/games", { token, body: { name: "Temp Game" } });
    eq("create temp game -> 201", tempGame.status, 201);
    const tempGameId: string = tempGame.body?.data?.game?._id;

    const tempAction = await api("POST", "/actions", {
      token,
      body: { game_id: tempGameId, name: "Temp Action" },
    });
    eq("create temp action -> 201", tempAction.status, 201);

    const tempActionId: string = tempAction.body?.data?.action?._id;
    const bulkTempActions = await api("POST", "/actions/bulk-delete", {
      token,
      body: { ids: [tempActionId] },
    });
    eq("bulk delete temp actions -> 200", bulkTempActions.status, 200);

    const bulkTempGame = await api("DELETE", "/games/bulk", {
      token,
      body: { ids: [tempGameId] },
    });
    eq("bulk delete temp game -> 200", bulkTempGame.status, 200);
    eq("deleted one game", bulkTempGame.body?.data?.deletedCount, 1);

    console.log("\n▶ Dashboard");
    const dashboard = await api("GET", "/dashboard", { token });
    eq("dashboard -> 200", dashboard.status, 200);
    const summary = dashboard.body?.data?.summary;
    check("dashboard counts games", summary?.games >= 2);
    check("dashboard counts clubs", summary?.clubs >= 3);
    check("dashboard counts orders", summary?.orders >= 3);
    check(
      "dashboard breaks clubs by subscription state",
      summary?.clubs_by_status?.active >= 1 &&
        summary?.clubs_by_status?.grace === 0 &&
        summary?.clubs_by_status?.expired >= 1
    );
    check(
      "dashboard breaks orders by status",
      summary?.orders_by_status?.paid >= 2 &&
        summary?.orders_by_status?.rejected >= 1 &&
        summary?.orders_by_status?.pending >= 0
    );
    check("dashboard total revenue > 0", summary?.revenue?.total > 0);
    check("dashboard this-month revenue > 0", summary?.revenue?.this_month > 0);
    eq("dashboard returns 12 months by default", dashboard.body?.data?.monthly_revenue?.length, 12);
    check(
      "dashboard months are chronological",
      dashboard.body?.data?.monthly_revenue?.[11]?.month ===
        new Date().toISOString().slice(0, 7)
    );
    check(
      "dashboard has top packages",
      Array.isArray(dashboard.body?.data?.top_packages) &&
        dashboard.body.data.top_packages.length >= 1
    );
    check(
      "dashboard has recent orders",
      Array.isArray(dashboard.body?.data?.recent_orders) &&
        dashboard.body.data.recent_orders.length >= 1
    );
    check(
      "dashboard has upcoming expirations",
      Array.isArray(dashboard.body?.data?.upcoming_expirations)
    );

    const shortDashboard = await api("GET", "/dashboard?months=3", { token });
    eq("dashboard accepts a custom range", shortDashboard.body?.data?.monthly_revenue?.length, 3);

    console.log("\n▶ Password policy (minimum 6)");
    const tooShort = await api("PUT", "/auth/change-password", {
      token,
      body: { current_password: "Admin@123456", new_password: "12345" },
    });
    eq("password shorter than 6 -> 400", tooShort.status, 400);

    const changedPassword = await api("PUT", "/auth/change-password", {
      token,
      body: { current_password: "Admin@123456", new_password: "123456" },
    });
    eq("6-character password accepted -> 200", changedPassword.status, 200);

    const relogin = await api("POST", "/auth/login", {
      body: { email: "admin@smoke.local", password: "123456" },
    });
    eq("login with the 6-character password -> 200", relogin.status, 200);

    console.log("\n▶ Image uploads (multer, local disk)");
    const uploadsDir = path.resolve(process.cwd(), "uploads");
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );

    const uploadForm = new FormData();
    uploadForm.append("image", new Blob([png], { type: "image/png" }), "receipt.png");

    const uploadResponse = await fetch(`${base}/uploads`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: uploadForm,
    });
    const uploadBody: any = await uploadResponse.json();
    eq("upload image -> 201", uploadResponse.status, 201);
    check(
      "upload returns a public url",
      String(uploadBody?.data?.file?.url ?? "").startsWith("/uploads/")
    );
    check("upload returns the file size", uploadBody?.data?.file?.size === png.length);

    const uploadedFilename: string = uploadBody?.data?.file?.filename;
    const uploadedUrl: string = uploadBody?.data?.file?.url;

    const staticResponse = await fetch(`http://127.0.0.1:${port}${uploadedUrl}`);
    eq("uploaded image is served statically -> 200", staticResponse.status, 200);
    eq(
      "uploaded image keeps its content type",
      staticResponse.headers.get("content-type"),
      "image/png"
    );

    const textForm = new FormData();
    textForm.append("image", new Blob(["not an image"], { type: "text/plain" }), "note.txt");
    const badUpload = await fetch(`${base}/uploads`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: textForm,
    });
    eq("non-image upload -> 400", badUpload.status, 400);

    const emptyUpload = await fetch(`${base}/uploads`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    eq("upload without a file -> 400", emptyUpload.status, 400);

    const proofForm = new FormData();
    proofForm.append("image", new Blob([png], { type: "image/png" }), "proof.png");
    const proofUpload = await fetch(`${base}/orders/${proofOrderId}/payment-proof`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: proofForm,
    });
    const proofBody: any = await proofUpload.json();
    eq("upload order payment proof -> 200", proofUpload.status, 200);
    check(
      "order payment proof saved as a local url",
      String(proofBody?.data?.order?.payment_proof ?? "").startsWith("/uploads/")
    );

    const proofFilename: string = String(proofBody?.data?.order?.payment_proof ?? "").replace(
      "/uploads/",
      ""
    );

    fs.rmSync(path.join(uploadsDir, uploadedFilename), { force: true });
    fs.rmSync(path.join(uploadsDir, proofFilename), { force: true });

    console.log("\n▶ Tenant (wildcard subdomain -> separate database)");
    const tenantHeaders: Record<string, string> = { "x-subdomain": "smoke-tenant" };

    const noSubdomain = await api("GET", "/tenant/info");
    eq("tenant without subdomain -> 404", noSubdomain.status, 404);

    const unknownTenant = await api("GET", "/tenant/info", {
      headers: { "x-subdomain": "does-not-exist" },
    });
    eq("unknown subdomain -> 404", unknownTenant.status, 404);

    const tenantClub = await api("POST", "/clubs", {
      token,
      body: {
        name: "Smoke Tenant Club",
        subdomain: "smoke-tenant",
        package_id: packageId,
        start_date: new Date(Date.now() - 10 * DAY).toISOString(),
        end_date: new Date(Date.now() + 300 * DAY).toISOString(),
      },
    });
    eq("create tenant club -> 201", tenantClub.status, 201);
    const tenantClubId: string = tenantClub.body?.data?.club?._id;
    eq(
      "club creation provisions its database",
      tenantClub.body?.data?.tenant?.database,
      "smoke-tenant"
    );
    eq(
      "club creation creates the default admin",
      tenantClub.body?.data?.tenant?.admin_email,
      "admin@smoke-tenant.com"
    );

    const reservedClub = await api("POST", "/clubs", {
      token,
      body: { name: "Reserved", subdomain: "admin" },
    });
    eq("reserved subdomain -> 400", reservedClub.status, 400);

    console.log("\n▶ Tenant auth (login inside the club database)");
    const tenantNoToken = await api("GET", "/tenant/info", { headers: tenantHeaders });
    eq("tenant route without token -> 401", tenantNoToken.status, 401);

    const tenantWrongPassword = await api("POST", "/tenant/auth/login", {
      headers: tenantHeaders,
      body: { email: "admin@smoke-tenant.com", password: "wrong-password" },
    });
    eq("tenant login with wrong password -> 401", tenantWrongPassword.status, 401);

    const tenantUnknownEmail = await api("POST", "/tenant/auth/login", {
      headers: tenantHeaders,
      body: { email: "nobody@smoke-tenant.com", password: TENANT_PASSWORD },
    });
    eq("tenant login with unknown email -> 401", tenantUnknownEmail.status, 401);

    const tenantLogin = await api("POST", "/tenant/auth/login", {
      headers: tenantHeaders,
      body: { email: "admin@smoke-tenant.com", password: TENANT_PASSWORD },
    });
    eq("tenant login -> 200", tenantLogin.status, 200);
    eq("tenant login returns the club", tenantLogin.body?.data?.club?.subdomain, "smoke-tenant");
    eq("tenant login returns the admin role", tenantLogin.body?.data?.admin?.role, "admin");
    eq("tenant token is a Bearer token", tenantLogin.body?.data?.token_type, "Bearer");
    check(
      "tenant login never leaks the password",
      tenantLogin.body?.data?.admin?.password === undefined
    );
    const tenantAdminId: string = tenantLogin.body?.data?.admin?._id;
    const tenantToken: string = tenantLogin.body?.data?.token;

    const tenantIdentifierLogin = await api("POST", "/tenant/auth/login", {
      headers: tenantHeaders,
      body: { identifier: "admin@smoke-tenant.com", password: TENANT_PASSWORD },
    });
    eq("tenant login with identifier -> 200", tenantIdentifierLogin.status, 200);

    const superTokenOnTenant = await api("GET", "/tenant/info", {
      headers: { ...tenantHeaders, Authorization: `Bearer ${token}` },
    });
    eq("super admin token on tenant route -> 401", superTokenOnTenant.status, 401);

    tenantHeaders.Authorization = `Bearer ${tenantToken}`;

    const tenantMe = await api("GET", "/tenant/auth/me", { headers: tenantHeaders });
    eq("tenant me -> 200", tenantMe.status, 200);
    eq("tenant me returns the same admin", tenantMe.body?.data?.admin?.email, "admin@smoke-tenant.com");
    eq("tenant me returns the subscription", tenantMe.body?.data?.subscription?.status, "active");

    const info = await api("GET", "/tenant/info", { headers: tenantHeaders });
    eq("tenant info -> 200", info.status, 200);
    eq("tenant database name = subdomain", info.body?.data?.database, "smoke-tenant");
    eq("tenant info returns the club", info.body?.data?.club?.subdomain, "smoke-tenant");
    eq("new tenant starts with 0 teams", info.body?.data?.counts?.teams, 0);
    eq("new tenant starts with 1 admin", info.body?.data?.counts?.admins, 1);

    const queryTenant = await api("GET", "/tenant/info?subdomain=smoke-tenant", {
      token: tenantToken,
    });
    eq("?subdomain= resolves the tenant -> 200", queryTenant.status, 200);

    console.log("\n▶ Tenant settings");
    const tenantSettings = await api("GET", "/tenant/settings", { headers: tenantHeaders });
    eq("tenant settings -> 200", tenantSettings.status, 200);
    check(
      "tenant settings has default colors",
      Array.isArray(tenantSettings.body?.data?.settings?.color) &&
        tenantSettings.body.data.settings.color.length > 0
    );

    const updatedTenantSettings = await api("PATCH", "/tenant/settings", {
      headers: tenantHeaders,
      body: { background_color: ["#0f172a", "#1e293b"], color: ["#16a34a"] },
    });
    eq("update tenant settings -> 200", updatedTenantSettings.status, 200);
    eq(
      "tenant color saved",
      updatedTenantSettings.body?.data?.settings?.color?.[0],
      "#16a34a"
    );
    eq(
      "tenant background colors saved",
      updatedTenantSettings.body?.data?.settings?.background_color?.length,
      2
    );

    const badColor = await api("PATCH", "/tenant/settings", {
      headers: tenantHeaders,
      body: { color: ["not-a-color"] },
    });
    eq("invalid tenant color -> 400", badColor.status, 400);

    const logoForm = new FormData();
    logoForm.append("image", new Blob([png], { type: "image/png" }), "logo.png");
    const logoUpload = await fetch(`${base}/tenant/settings/logo`, {
      method: "POST",
      headers: tenantHeaders,
      body: logoForm,
    });
    const logoBody: any = await logoUpload.json();
    eq("tenant logo upload -> 200", logoUpload.status, 200);
    check(
      "tenant logo saved as a local url",
      String(logoBody?.data?.settings?.logo ?? "").startsWith("/uploads/")
    );
    fs.rmSync(
      path.join(uploadsDir, String(logoBody?.data?.settings?.logo ?? "").replace("/uploads/", "")),
      { force: true }
    );

    console.log("\n▶ Tenant admins & roles");
    const coachAdmin = await api("POST", "/tenant/admins", {
      headers: tenantHeaders,
      body: {
        name: "Coach One",
        email: "coach@smoke-tenant.com",
        password: "Coach@123456",
        role: "coach",
      },
    });
    eq("create coach admin -> 201", coachAdmin.status, 201);
    const coachId: string = coachAdmin.body?.data?.admin?._id;

    const duplicateAdminEmail = await api("POST", "/tenant/admins", {
      headers: tenantHeaders,
      body: {
        name: "Duplicate",
        email: "coach@smoke-tenant.com",
        password: "Coach@123456",
        role: "coach",
      },
    });
    eq("duplicate tenant admin email -> 409", duplicateAdminEmail.status, 409);

    const shortAdminPassword = await api("POST", "/tenant/admins", {
      headers: tenantHeaders,
      body: { name: "Short", email: "short@smoke-tenant.com", password: "123", role: "coach" },
    });
    eq("tenant admin password shorter than 6 -> 400", shortAdminPassword.status, 400);

    const adminList = await api("GET", "/tenant/admins", { headers: tenantHeaders });
    eq("list tenant admins -> 200", adminList.status, 200);
    eq("tenant admin list has 2 accounts", adminList.body?.data?.pagination?.total, 2);

    const coachLogin = await api("POST", "/tenant/auth/login", {
      headers: { "x-subdomain": "smoke-tenant" },
      body: { email: "coach@smoke-tenant.com", password: "Coach@123456" },
    });
    eq("coach login -> 200", coachLogin.status, 200);
    const coachToken: string = coachLogin.body?.data?.token;
    const coachHeaders = { "x-subdomain": "smoke-tenant", Authorization: `Bearer ${coachToken}` };

    const coachReadsTeams = await api("GET", "/tenant/teams", { headers: coachHeaders });
    eq("coach can read teams -> 200", coachReadsTeams.status, 200);

    const coachCreatesTeam = await api("POST", "/tenant/teams", {
      headers: coachHeaders,
      body: { name: "Coach Team", game_id: basketballId },
    });
    eq("coach can create a team -> 201", coachCreatesTeam.status, 201);
    const coachTeamId: string = coachCreatesTeam.body?.data?.team?._id;

    const coachDeletesTeam = await api("DELETE", `/tenant/teams/${coachTeamId}`, {
      headers: coachHeaders,
    });
    eq("coach can delete its team -> 200", coachDeletesTeam.status, 200);

    const coachReadsAdmins = await api("GET", "/tenant/admins", { headers: coachHeaders });
    eq("coach cannot manage admins -> 403", coachReadsAdmins.status, 403);

    const coachUpdatesSettings = await api("PATCH", "/tenant/settings", {
      headers: coachHeaders,
      body: { color: ["#111111"] },
    });
    eq("coach cannot change settings -> 403", coachUpdatesSettings.status, 403);

    const viewerAdmin = await api("POST", "/tenant/admins", {
      headers: tenantHeaders,
      body: {
        name: "Viewer One",
        email: "viewer@smoke-tenant.com",
        password: "Viewer@123456",
        role: "viewer",
      },
    });
    eq("create viewer admin -> 201", viewerAdmin.status, 201);

    const viewerLogin = await api("POST", "/tenant/auth/login", {
      headers: { "x-subdomain": "smoke-tenant" },
      body: { email: "viewer@smoke-tenant.com", password: "Viewer@123456" },
    });
    eq("viewer login -> 200", viewerLogin.status, 200);
    const viewerToken: string = viewerLogin.body?.data?.token;
    const viewerHeaders = { "x-subdomain": "smoke-tenant", Authorization: `Bearer ${viewerToken}` };

    const viewerReadsTeams = await api("GET", "/tenant/teams", { headers: viewerHeaders });
    eq("viewer can read teams -> 200", viewerReadsTeams.status, 200);

    const viewerWritesTeam = await api("POST", "/tenant/teams", {
      headers: viewerHeaders,
      body: { name: "Viewer Team", game_id: basketballId },
    });
    eq("viewer cannot create a team -> 403", viewerWritesTeam.status, 403);

    const viewerCart = await api("GET", "/tenant/cart", { headers: viewerHeaders });
    eq("viewer cannot access billing -> 403", viewerCart.status, 403);

    const demoteSelf = await api("PATCH", `/tenant/admins/${tenantAdminId}`, {
      headers: tenantHeaders,
      body: { role: "coach" },
    });
    eq("admin cannot demote itself -> 400", demoteSelf.status, 400);

    const deleteSelf = await api("DELETE", `/tenant/admins/${tenantAdminId}`, {
      headers: tenantHeaders,
    });
    eq("admin cannot delete itself -> 400", deleteSelf.status, 400);

    const updateCoach = await api("PATCH", `/tenant/admins/${coachId}`, {
      headers: tenantHeaders,
      body: { name: "Coach Renamed" },
    });
    eq("update tenant admin -> 200", updateCoach.status, 200);
    eq("tenant admin name updated", updateCoach.body?.data?.admin?.name, "Coach Renamed");

    console.log("\n▶ Tenant password change");
    const wrongCurrent = await api("PUT", "/tenant/auth/change-password", {
      headers: tenantHeaders,
      body: { current_password: "nope", new_password: "NewPass@123456" },
    });
    eq("change password with wrong current -> 400", wrongCurrent.status, 400);

    const samePassword = await api("PUT", "/tenant/auth/change-password", {
      headers: tenantHeaders,
      body: { current_password: TENANT_PASSWORD, new_password: TENANT_PASSWORD },
    });
    eq("new password equal to current -> 400", samePassword.status, 400);

    const shortNewPassword = await api("PUT", "/tenant/auth/change-password", {
      headers: tenantHeaders,
      body: { current_password: TENANT_PASSWORD, new_password: "123" },
    });
    eq("new password shorter than 6 -> 400", shortNewPassword.status, 400);

    const tenantPasswordChanged = await api("PUT", "/tenant/auth/change-password", {
      headers: tenantHeaders,
      body: { current_password: TENANT_PASSWORD, new_password: "NewPass@123456" },
    });
    eq("change password -> 200", tenantPasswordChanged.status, 200);

    const oldPasswordLogin = await api("POST", "/tenant/auth/login", {
      headers: { "x-subdomain": "smoke-tenant" },
      body: { email: "admin@smoke-tenant.com", password: TENANT_PASSWORD },
    });
    eq("old password no longer works -> 401", oldPasswordLogin.status, 401);

    const newPasswordLogin = await api("POST", "/tenant/auth/login", {
      headers: { "x-subdomain": "smoke-tenant" },
      body: { email: "admin@smoke-tenant.com", password: "NewPass@123456" },
    });
    eq("new password works -> 200", newPasswordLogin.status, 200);
    tenantHeaders.Authorization = `Bearer ${newPasswordLogin.body?.data?.token}`;

    console.log("\n▶ Tenant teams, players & matches");
    const team1 = await api("POST", "/tenant/teams", {
      headers: tenantHeaders,
      body: { name: "First Team", game_id: basketballId },
    });
    eq("create tenant team -> 201", team1.status, 201);
    const team1Id: string = team1.body?.data?.team?._id;

    const team2 = await api("POST", "/tenant/teams", {
      headers: tenantHeaders,
      body: { name: "U18", game_id: basketballId },
    });
    eq("create second tenant team -> 201", team2.status, 201);
    const team2Id: string = team2.body?.data?.team?._id;

    const duplicateTeam = await api("POST", "/tenant/teams", {
      headers: tenantHeaders,
      body: { name: "First Team", game_id: basketballId },
    });
    eq("duplicate team name in the same game -> 409", duplicateTeam.status, 409);

    const missingGame = await api("POST", "/tenant/teams", {
      headers: tenantHeaders,
      body: { name: "Ghost", game_id: "0123456789abcdef01234567" },
    });
    eq("team with unknown game -> 404", missingGame.status, 404);

    const player = await api("POST", "/tenant/players", {
      headers: tenantHeaders,
      body: { team_id: team1Id, name: "Ahmed Hassan", height: 192, weight: 85, age: 21 },
    });
    eq("create tenant player -> 201", player.status, 201);
    const playerId: string = player.body?.data?.player?._id;
    eq("player inherits the team game", String(player.body?.data?.player?.game_id), basketballId);

    const badHeight = await api("POST", "/tenant/players", {
      headers: tenantHeaders,
      body: { team_id: team1Id, name: "Too Short", height: 10, weight: 80, age: 20 },
    });
    eq("invalid player height -> 400", badHeight.status, 400);

    const teamAfterPlayer = await api("GET", `/tenant/teams/${team1Id}`, {
      headers: tenantHeaders,
    });
    eq("team players counter is synced", teamAfterPlayer.body?.data?.team?.players, 1);

    const otherPlayer = await api("POST", "/tenant/players", {
      headers: tenantHeaders,
      body: { team_id: team2Id, name: "Omar Khaled", height: 188, weight: 80, age: 20 },
    });
    const otherPlayerId: string = otherPlayer.body?.data?.player?._id;

    const singleMatch = await api("POST", "/tenant/matches", {
      headers: tenantHeaders,
      body: {
        name: "Friendly",
        date: new Date().toISOString(),
        team_id: team1Id,
        opponent_name: "Cairo Stars",
      },
    });
    eq("create single-team match -> 201", singleMatch.status, 201);
    const singleMatchId: string = singleMatch.body?.data?.match?._id;
    eq(
      "single-team match keeps opponent_name",
      singleMatch.body?.data?.match?.opponent_name,
      "Cairo Stars"
    );

    const pairMatch = await api("POST", "/tenant/matches", {
      headers: tenantHeaders,
      body: {
        name: "League",
        date: new Date().toISOString(),
        team1_id: team1Id,
        team2_id: team2Id,
      },
    });
    eq("create two-team match -> 201", pairMatch.status, 201);
    check(
      "two-team match keeps team1_id and team2_id",
      Boolean(pairMatch.body?.data?.match?.team1_id) &&
        Boolean(pairMatch.body?.data?.match?.team2_id)
    );

    const mixedMatch = await api("POST", "/tenant/matches", {
      headers: tenantHeaders,
      body: {
        name: "Mixed",
        date: new Date().toISOString(),
        team_id: team1Id,
        team1_id: team1Id,
        team2_id: team2Id,
      },
    });
    eq("match with team_id + team1/team2 -> 400", mixedMatch.status, 400);

    const incompletePair = await api("POST", "/tenant/matches", {
      headers: tenantHeaders,
      body: { name: "Incomplete", date: new Date().toISOString(), team1_id: team1Id },
    });
    eq("match with only team1_id -> 400", incompletePair.status, 400);

    console.log("\n▶ Tenant player progress");
    const allGames = await api("GET", "/games?limit=100", { token });
    const footballGameId = allGames.body.data.items.find(
      (game: any) => game.name === "Football"
    )._id;

    const basketballActionId = (
      await api("POST", "/actions", {
        token,
        body: { game_id: basketballId, name: "Tenant Rebound" },
      })
    ).body.data.action._id;
    const footballActionId = (
      await api("GET", `/actions?game_id=${footballGameId}`, { token })
    ).body.data.items[0]._id;

    const progress = await api("POST", "/tenant/player-progress", {
      headers: tenantHeaders,
      body: {
        match_id: singleMatchId,
        action_id: basketballActionId,
        player_id: playerId,
      },
    });
    eq("create player progress -> 201", progress.status, 201);
    const progressId: string = progress.body?.data?.progress?._id;

    const wrongGame = await api("POST", "/tenant/player-progress", {
      headers: tenantHeaders,
      body: {
        match_id: singleMatchId,
        action_id: footballActionId,
        player_id: playerId,
      },
    });
    eq("action from another game -> 400", wrongGame.status, 400);

    const notInMatch = await api("POST", "/tenant/player-progress", {
      headers: tenantHeaders,
      body: {
        match_id: singleMatchId,
        action_id: basketballActionId,
        player_id: otherPlayerId,
      },
    });
    eq("player whose team did not play -> 400", notInMatch.status, 400);

    const progressList = await api(
      "GET",
      `/tenant/player-progress?match_id=${singleMatchId}`,
      { headers: tenantHeaders }
    );
    eq("list player progress -> 200", progressList.status, 200);
    eq("progress is filtered by match", progressList.body?.data?.items?.length, 1);
    check(
      "progress is enriched with the action name",
      Boolean(progressList.body?.data?.items?.[0]?.action?.name)
    );
    check(
      "progress is enriched with the player name",
      Boolean(progressList.body?.data?.items?.[0]?.player?.name)
    );

    console.log("\n▶ Tenant delete guards");
    const deleteTeamWithPlayers = await api("DELETE", `/tenant/teams/${team1Id}`, {
      headers: tenantHeaders,
    });
    eq("delete team with players/matches -> 409", deleteTeamWithPlayers.status, 409);

    const deletePlayerWithProgress = await api("DELETE", `/tenant/players/${playerId}`, {
      headers: tenantHeaders,
    });
    eq("delete player with progress -> 409", deletePlayerWithProgress.status, 409);

    const deleteProgress = await api("DELETE", `/tenant/player-progress/${progressId}`, {
      headers: tenantHeaders,
    });
    eq("delete player progress -> 200", deleteProgress.status, 200);

    const deletePlayerNow = await api("DELETE", `/tenant/players/${playerId}`, {
      headers: tenantHeaders,
    });
    eq("delete player after progress -> 200", deletePlayerNow.status, 200);

    const teamAfterDelete = await api("GET", `/tenant/teams/${team1Id}`, {
      headers: tenantHeaders,
    });
    eq("team players counter is decremented", teamAfterDelete.body?.data?.team?.players, 0);

    console.log("\n▶ Tenant cart & checkout");
    const cart = await api("POST", "/tenant/cart", {
      headers: tenantHeaders,
      body: { package_id: packageId, cycle_id: cycleId },
    });
    eq("create cart item -> 201", cart.status, 201);
    const cartId: string = cart.body?.data?.cart?._id;
    eq(
      "cart final price = price - discount",
      cart.body?.data?.cart?.final_price,
      cart.body?.data?.cart?.price - cart.body?.data?.cart?.discount
    );
    check("cart stores the duration in months", cart.body?.data?.cart?.months >= 1);

    const checkout = await api("POST", `/tenant/cart/${cartId}/checkout`, {
      headers: tenantHeaders,
      body: { payment_method_id: paymentMethodId },
    });
    eq("checkout -> 201", checkout.status, 201);
    eq("checkout creates a pending order", checkout.body?.data?.order?.status, "pending");
    check(
      "checkout order has an order number",
      String(checkout.body?.data?.order?.order_number).startsWith("ORD-")
    );
    eq("cart is marked as checked out", checkout.body?.data?.cart?.status, "checked_out");

    const checkoutAgain = await api("POST", `/tenant/cart/${cartId}/checkout`, {
      headers: tenantHeaders,
      body: { payment_method_id: paymentMethodId },
    });
    eq("checkout twice -> 409", checkoutAgain.status, 409);

    const tenantProofForm = new FormData();
    tenantProofForm.append("image", new Blob([png], { type: "image/png" }), "club-proof.png");
    const tenantProof = await fetch(`${base}/tenant/cart/${cartId}/payment-proof`, {
      method: "POST",
      headers: tenantHeaders,
      body: tenantProofForm,
    });
    const tenantProofBody: any = await tenantProof.json();
    eq("tenant payment proof upload -> 200", tenantProof.status, 200);
    check(
      "tenant payment proof saved as a local url",
      String(tenantProofBody?.data?.order?.payment_proof ?? "").startsWith("/uploads/")
    );
    fs.rmSync(
      path.join(
        uploadsDir,
        String(tenantProofBody?.data?.order?.payment_proof ?? "").replace("/uploads/", "")
      ),
      { force: true }
    );

    console.log("\n▶ Tenant packages, orders, direct purchase & invoices");
    const tenantPackages = await api("GET", "/tenant/packages", {
      headers: tenantHeaders,
    });
    eq("tenant list packages -> 200", tenantPackages.status, 200);
    check("tenant receives package list", Array.isArray(tenantPackages.body?.data?.packages));
    check("packages have cycles with final_price", tenantPackages.body?.data?.packages?.[0]?.cycles?.[0]?.final_price !== undefined);

    const singlePkg = await api("GET", `/tenant/packages/${packageId}`, {
      headers: tenantHeaders,
    });
    eq("tenant get package -> 200", singlePkg.status, 200);
    eq("tenant package id matches", singlePkg.body?.data?.package?._id, packageId);

    const tenantPaymentMethods = await api("GET", "/tenant/payment-methods", {
      headers: tenantHeaders,
    });
    eq("tenant list payment methods -> 200", tenantPaymentMethods.status, 200);
    check(
      "tenant receives active payment methods",
      Array.isArray(tenantPaymentMethods.body?.data?.payment_methods) &&
        tenantPaymentMethods.body?.data?.payment_methods.length > 0
    );

    // Direct package purchase (Instant Buy)
    const directPurchase = await api("POST", "/tenant/orders", {
      headers: tenantHeaders,
      body: {
        package_id: packageId,
        cycle_id: cycleId,
        payment_method_id: paymentMethodId,
        payment_reference: "INSTAPAY-TXN-9876",
        notes: "Direct checkout from tenant portal",
      },
    });
    eq("tenant direct purchase -> 201", directPurchase.status, 201);
    const directOrderId: string = directPurchase.body?.data?.order?._id;
    eq("direct order is pending", directPurchase.body?.data?.order?.status, "pending");
    check(
      "direct order has valid order number",
      String(directPurchase.body?.data?.order?.order_number).startsWith("ORD-")
    );
    eq(
      "direct order created matching cart record",
      directPurchase.body?.data?.cart?.status,
      "checked_out"
    );

    const tenantOrdersList = await api("GET", "/tenant/orders", {
      headers: tenantHeaders,
    });
    eq("tenant list orders -> 200", tenantOrdersList.status, 200);
    check(
      "tenant orders list includes direct order",
      tenantOrdersList.body?.data?.items?.some(
        (o: any) => o._id === directOrderId
      )
    );

    const tenantSingleOrder = await api("GET", `/tenant/orders/${directOrderId}`, {
      headers: tenantHeaders,
    });
    eq("tenant get order -> 200", tenantSingleOrder.status, 200);
    eq("tenant order id matches", tenantSingleOrder.body?.data?.order?._id, directOrderId);

    // Upload payment proof directly on order
    const orderProofForm = new FormData();
    orderProofForm.append("image", new Blob([png], { type: "image/png" }), "order-proof.png");
    const orderProofRes = await fetch(`${base}/tenant/orders/${directOrderId}/payment-proof`, {
      method: "POST",
      headers: tenantHeaders,
      body: orderProofForm,
    });
    const orderProofBody: any = await orderProofRes.json();
    eq("tenant upload payment proof to order -> 200", orderProofRes.status, 200);
    check(
      "order payment proof set",
      String(orderProofBody?.data?.order?.payment_proof ?? "").startsWith("/uploads/")
    );
    fs.rmSync(
      path.join(
        uploadsDir,
        String(orderProofBody?.data?.order?.payment_proof ?? "").replace("/uploads/", "")
      ),
      { force: true }
    );

    // Tenant JSON invoice
    const tenantInvoiceRes = await api("GET", `/tenant/orders/${directOrderId}/invoice`, {
      headers: tenantHeaders,
    });
    eq("tenant get invoice JSON -> 200", tenantInvoiceRes.status, 200);
    eq(
      "invoice number matches order",
      tenantInvoiceRes.body?.data?.invoice?.invoice_number,
      `INV-${directPurchase.body?.data?.order?.order_number}`
    );
    eq(
      "invoice total equals order final price",
      tenantInvoiceRes.body?.data?.invoice?.pricing?.total,
      directPurchase.body?.data?.order?.final_price
    );

    // Tenant HTML printable invoice
    const tenantInvoiceHtmlRes = await fetch(
      `${base}/tenant/orders/${directOrderId}/invoice/html`,
      { headers: tenantHeaders }
    );
    eq("tenant get invoice HTML -> 200", tenantInvoiceHtmlRes.status, 200);
    const invoiceHtml = await tenantInvoiceHtmlRes.text();
    check("invoice HTML contains doctype", invoiceHtml.includes("<!DOCTYPE html>"));
    check("invoice HTML contains INVOICE", invoiceHtml.includes("INVOICE"));
    check("invoice HTML contains Billed To", invoiceHtml.includes("Billed To"));

    // Super Admin can also view the order invoice
    const adminInvoiceRes = await api("GET", `/orders/${directOrderId}/invoice`, {
      token,
    });
    eq("super admin get invoice JSON -> 200", adminInvoiceRes.status, 200);
    eq(
      "admin invoice number matches",
      adminInvoiceRes.body?.data?.invoice?.invoice_number,
      `INV-${directPurchase.body?.data?.order?.order_number}`
    );

    const adminInvoiceHtmlRes = await fetch(
      `${base}/orders/${directOrderId}/invoice/html`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    eq("super admin get invoice HTML -> 200", adminInvoiceHtmlRes.status, 200);

    console.log("\n▶ Tenant isolation & subscription gate");
    const secondTenant = await api("POST", "/clubs", {
      token,
      body: {
        name: "Smoke Tenant B",
        subdomain: "smoke-tenant-b",
        start_date: new Date(Date.now() - 5 * DAY).toISOString(),
        end_date: new Date(Date.now() + 100 * DAY).toISOString(),
      },
    });
    eq("create second tenant club -> 201", secondTenant.status, 201);

    const tenantBLogin = await api("POST", "/tenant/auth/login", {
      headers: { "x-subdomain": "smoke-tenant-b" },
      body: { email: "admin@smoke-tenant-b.com", password: TENANT_PASSWORD },
    });
    eq("second tenant login -> 200", tenantBLogin.status, 200);
    const tenantBToken: string = tenantBLogin.body?.data?.token;
    const tenantBHeaders = {
      "x-subdomain": "smoke-tenant-b",
      Authorization: `Bearer ${tenantBToken}`,
    };

    const tenantBTeams = await api("GET", "/tenant/teams", { headers: tenantBHeaders });
    eq("a new tenant has its own empty database", tenantBTeams.body?.data?.pagination?.total, 0);

    const crossTenant = await api("GET", "/tenant/teams", {
      headers: { "x-subdomain": "smoke-tenant-b", Authorization: `Bearer ${tenantToken}` },
    });
    eq("a token from another club -> 403", crossTenant.status, 403);

    const crossOrder = await api("GET", `/tenant/orders/${directOrderId}`, {
      headers: tenantBHeaders,
    });
    eq("another club cannot read this order -> 403", crossOrder.status, 403);

    const crossInvoice = await api("GET", `/tenant/orders/${directOrderId}/invoice`, {
      headers: tenantBHeaders,
    });
    eq("another club cannot read this invoice -> 403", crossInvoice.status, 403);

    console.log("\n▶ Super admin password reset (club admin forgot the password)");
    const secondTenantId: string = secondTenant.body?.data?.club?._id;

    const resetNoAuth = await api("POST", `/clubs/${secondTenantId}/tenant/reset-admin`, {
      body: {},
    });
    eq("reset without a super admin token -> 401", resetNoAuth.status, 401);

    const resetGenerated = await api("POST", `/clubs/${secondTenantId}/tenant/reset-admin`, {
      token,
      body: {},
    });
    eq("reset tenant admin password -> 200", resetGenerated.status, 200);
    eq("reset targets the default club admin", resetGenerated.body?.data?.admin?.email, "admin@smoke-tenant-b.com");
    eq("reset did not create a new account", resetGenerated.body?.data?.created, false);
    eq("reset generates a password when none is sent", resetGenerated.body?.data?.generated, true);
    check(
      "generated password is at least 6 characters",
      String(resetGenerated.body?.data?.password ?? "").length >= 6
    );

    const revokedToken = await api("GET", "/tenant/teams", { headers: tenantBHeaders });
    eq("tokens issued before the reset are revoked -> 401", revokedToken.status, 401);

    const loginAfterReset = await api("POST", "/tenant/auth/login", {
      headers: { "x-subdomain": "smoke-tenant-b" },
      body: {
        email: "admin@smoke-tenant-b.com",
        password: resetGenerated.body?.data?.password,
      },
    });
    eq("login with the generated password -> 200", loginAfterReset.status, 200);

    const resetCustom = await api("POST", `/clubs/${secondTenantId}/tenant/reset-admin`, {
      token,
      body: { email: "admin@smoke-tenant-b.com", password: "ResetB@123456" },
    });
    eq("reset with a chosen password -> 200", resetCustom.status, 200);
    eq("chosen password is not marked as generated", resetCustom.body?.data?.generated, false);
    eq("reset returns the chosen password", resetCustom.body?.data?.password, "ResetB@123456");

    const loginCustom = await api("POST", "/tenant/auth/login", {
      headers: { "x-subdomain": "smoke-tenant-b" },
      body: { email: "admin@smoke-tenant-b.com", password: "ResetB@123456" },
    });
    eq("login with the chosen password -> 200", loginCustom.status, 200);

    const resetShort = await api("POST", `/clubs/${secondTenantId}/tenant/reset-admin`, {
      token,
      body: { password: "123" },
    });
    eq("reset with a password shorter than 6 -> 400", resetShort.status, 400);

    const resetAmbiguous = await api("POST", `/clubs/${secondTenantId}/tenant/reset-admin`, {
      token,
      body: { admin_id: "0123456789abcdef01234567", email: "admin@smoke-tenant-b.com" },
    });
    eq("reset with admin_id and email together -> 400", resetAmbiguous.status, 400);

    const resetUnknown = await api("POST", `/clubs/${secondTenantId}/tenant/reset-admin`, {
      token,
      body: { admin_id: "0123456789abcdef01234567" },
    });
    eq("reset unknown tenant admin -> 404", resetUnknown.status, 404);

    const expiredLogin = await api("POST", "/tenant/auth/login", {
      headers: { "x-subdomain": "expired-club" },
      body: { email: "admin@expired-club.com", password: TENANT_PASSWORD },
    });
    eq("expired club can still log in -> 200", expiredLogin.status, 200);
    const expiredToken: string = expiredLogin.body?.data?.token;
    const expiredHeaders = {
      "x-subdomain": "expired-club",
      Authorization: `Bearer ${expiredToken}`,
    };

    const expiredInfo = await api("GET", "/tenant/info", { headers: expiredHeaders });
    eq("expired club can read its info -> 200", expiredInfo.status, 200);
    eq(
      "expired club info reports the expired status",
      expiredInfo.body?.data?.subscription?.status,
      "expired"
    );

    const expiredTeams = await api("GET", "/tenant/teams", { headers: expiredHeaders });
    eq("expired club cannot open the scouting workspace -> 403", expiredTeams.status, 403);
    check(
      "expired club response lists renewal packages",
      Array.isArray(expiredTeams.body?.error?.details?.packages)
    );

    const expiredCart = await api("GET", "/tenant/cart", { headers: expiredHeaders });
    eq("expired club can still open its cart to renew -> 200", expiredCart.status, 200);

    const disabledClub = await api("POST", "/clubs", {
      token,
      body: {
        name: "Disabled Club",
        subdomain: "disabled-club",
        status: false,
        start_date: new Date(Date.now() - 5 * DAY).toISOString(),
        end_date: new Date(Date.now() + 100 * DAY).toISOString(),
      },
    });
    eq("create disabled club -> 201", disabledClub.status, 201);

    const disabledLogin = await api("POST", "/tenant/auth/login", {
      headers: { "x-subdomain": "disabled-club" },
      body: { email: "admin@disabled-club.com", password: TENANT_PASSWORD },
    });
    eq("disabled club is blocked before login -> 403", disabledLogin.status, 403);

    const disabledTenant = await api("GET", "/tenant/info", {
      headers: { "x-subdomain": "disabled-club" },
    });
    eq("disabled tenant -> 403", disabledTenant.status, 403);

    const tenantStatsResponse = await api("GET", `/clubs/${tenantClubId}/tenant`, {
      token,
    });
    eq("club tenant stats -> 200", tenantStatsResponse.status, 200);
    eq("tenant stats reports the database", tenantStatsResponse.body?.data?.database, "smoke-tenant");
    eq("tenant stats counts the teams collection", tenantStatsResponse.body?.data?.collections?.team, 2);
    eq(
      "tenant stats counts the team-players collection",
      tenantStatsResponse.body?.data?.collections?.["team-players"],
      1
    );

    const initTenant = await api("POST", `/clubs/${tenantClubId}/tenant/init`, { token });
    eq("init tenant database -> 200", initTenant.status, 200);
    check("init returns the tenant settings", Boolean(initTenant.body?.data?.settings?.key));

    console.log("\n▶ Not found");
    const missing = await api("GET", "/games/0123456789abcdef01234567", { token });
    eq("unknown game -> 404", missing.status, 404);

    const unknownRoute = await api("GET", "/does-not-exist", { token });
    eq("unknown route -> 404", unknownRoute.status, 404);
  } finally {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    await disconnectDB();
    await mongod.stop();
    fs.rmSync(dbPath, { recursive: true, force: true });
  }

  console.log(`\n────────────────────────────────────────`);
  console.log(`PASSED: ${passed} | FAILED: ${failed}`);
  if (failed > 0) {
    console.error("Failed checks:", failures.join(", "));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Smoke test crashed:", error);
  process.exitCode = 1;
});
