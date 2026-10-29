/**
 * Live check against the database configured in .env.
 * Bootstraps the super admin/settings if missing (idempotent), then calls the API.
 * It also uploads a tiny image to verify the multer/static-file setup, and
 * deletes it right after.
 *
 * Run with: npm run test:live
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { connectDB, disconnectDB } from "../src/config/db";
import { env } from "../src/config/env";
import { createApp } from "../src/app";
import { UPLOAD_DIR } from "../src/config/upload";
import { ensureInitialSuperAdmin, ensureSettings } from "../src/services/bootstrap.service";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function main(): Promise<void> {
  if (!env.SUPER_ADMIN_EMAIL || !env.SUPER_ADMIN_PASSWORD) {
    throw new Error("SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD are missing in .env");
  }

  await connectDB();
  await ensureInitialSuperAdmin();
  await ensureSettings();

  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const base = `http://127.0.0.1:${port}/api`;

  try {
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    const healthBody: any = await health.json();
    console.log(`health            ${health.status}  (${healthBody?.data?.database})`);

    const loginResponse = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: env.SUPER_ADMIN_EMAIL,
        password: env.SUPER_ADMIN_PASSWORD,
      }),
    });
    const loginBody: any = await loginResponse.json();
    console.log(`login             ${loginResponse.status}`);
    if (!loginResponse.ok) throw new Error(JSON.stringify(loginBody));

    const token: string = loginBody.data.token;
    const authHeaders = { Authorization: `Bearer ${token}` };

    const endpoints: Array<[string, string]> = [
      ["auth/me", "GET"],
      ["games", "GET"],
      ["actions", "GET"],
      ["packages", "GET"],
      ["clubs", "GET"],
      ["orders", "GET"],
      ["payment-methods", "GET"],
      ["settings", "GET"],
      ["dashboard", "GET"],
    ];

    for (const [path, method] of endpoints) {
      const response = await fetch(`${base}/${path}`, {
        method,
        headers: authHeaders,
      });
      const body: any = await response.json();
      const count = body?.data?.pagination?.total ?? body?.data?.items?.length ?? "";
      console.log(`${path.padEnd(18)}${response.status}${count !== "" ? `  (${count})` : ""}`);
      if (!response.ok) throw new Error(`${path}: ${JSON.stringify(body)}`);
    }

    // Sample data
    const clubsResponse = await fetch(`${base}/clubs?limit=3&sort_by=name&order=asc`, {
      headers: authHeaders,
    });
    const clubsBody: any = await clubsResponse.json();
    console.log("\nClubs (sample)");
    for (const club of clubsBody?.data?.items ?? []) {
      console.log(
        `  ${String(club.subdomain).padEnd(18)} ${String(club.subscription_status).padEnd(8)} end=${String(club.end_date).slice(0, 10)}`
      );
    }

    const ordersResponse = await fetch(`${base}/orders?limit=3`, { headers: authHeaders });
    const ordersBody: any = await ordersResponse.json();
    console.log("\nOrders (latest)");
    for (const order of ordersBody?.data?.items ?? []) {
      console.log(
        `  ${String(order.order_number).padEnd(16)} ${String(order.status).padEnd(8)} ${String(order.club_id?.name ?? "").padEnd(26)} final=${order.final_price}`
      );
    }

    const dashboardResponse = await fetch(`${base}/dashboard`, { headers: authHeaders });
    const dashboardBody: any = await dashboardResponse.json();
    const summary = dashboardBody?.data?.summary;

    console.log("\nDashboard");
    console.log(
      `  clubs    active=${summary?.clubs_by_status?.active} grace=${summary?.clubs_by_status?.grace} expired=${summary?.clubs_by_status?.expired} pending=${summary?.clubs_by_status?.pending} inactive=${summary?.clubs_by_status?.inactive}`
    );
    console.log(
      `  orders   pending=${summary?.orders_by_status?.pending} paid=${summary?.orders_by_status?.paid} rejected=${summary?.orders_by_status?.rejected} refunded=${summary?.orders_by_status?.refunded}`
    );
    console.log(
      `  revenue  total=${summary?.revenue?.total} this_month=${summary?.revenue?.this_month} pending=${summary?.revenue?.pending}`
    );
    console.log(
      `  months   ${(dashboardBody?.data?.monthly_revenue ?? [])
        .map((row: any) => `${row.month}:${row.revenue}`)
        .join("  ")}`
    );
    console.log(
      `  top      ${(dashboardBody?.data?.top_packages ?? [])
        .map((row: any) => `${row.name}(${row.revenue})`)
        .join(", ")}`
    );
    console.log(
      `  expiring ${(dashboardBody?.data?.upcoming_expirations ?? []).length} club(s) in the next 7 days`
    );

    // Upload check (multipart -> local disk -> static serving)
    const form = new FormData();
    form.append("image", new Blob([PNG], { type: "image/png" }), "live-check.png");
    const uploadResponse = await fetch(`${base}/uploads`, {
      method: "POST",
      headers: authHeaders,
      body: form,
    });
    const uploadBody: any = await uploadResponse.json();
    if (!uploadResponse.ok) throw new Error(JSON.stringify(uploadBody));

    const fileUrl: string = uploadBody.data.file.url;
    const staticResponse = await fetch(`http://127.0.0.1:${port}${fileUrl}`);
    console.log(`\nupload            ${uploadResponse.status}  ${fileUrl} (served ${staticResponse.status})`);
    if (staticResponse.status !== 200) throw new Error("Uploaded file is not served");

    fs.rmSync(path.join(UPLOAD_DIR, uploadBody.data.file.filename), { force: true });

    // Tenant databases (wildcard subdomain -> one database per club)
    console.log("\nTenant databases (x-subdomain header + club admin login)");
    const tenantSubdomains = ["ahly", "zamalek", "cairo-basketball"];

    for (const subdomain of tenantSubdomains) {
      const loginResponse = await fetch(`${base}/tenant/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-subdomain": subdomain },
        body: JSON.stringify({
          email: `admin@${subdomain}.com`,
          password: env.TENANT_DEFAULT_PASSWORD,
        }),
      });
      const loginBody: any = await loginResponse.json();

      if (!loginResponse.ok) {
        throw new Error(`tenant ${subdomain} login: ${JSON.stringify(loginBody)}`);
      }

      const tenantHeaders = {
        "x-subdomain": subdomain,
        Authorization: `Bearer ${loginBody.data.token}`,
      };

      const infoResponse = await fetch(`${base}/tenant/info`, { headers: tenantHeaders });
      const infoBody: any = await infoResponse.json();

      if (!infoResponse.ok) throw new Error(`tenant ${subdomain}: ${JSON.stringify(infoBody)}`);

      const counts = infoBody?.data?.counts ?? {};
      console.log(
        `  ${subdomain.padEnd(18)} db=${String(infoBody?.data?.database).padEnd(18)} sub=${String(
          infoBody?.data?.subscription?.status
        ).padEnd(8)} admin=${String(infoBody?.data?.admin?.role).padEnd(6)} teams=${counts.teams} players=${counts.players} matches=${counts.matches} progress=${counts.player_progress} admins=${counts.admins}`
      );

      for (const collection of ["teams", "players", "matches", "player-progress", "cart", "settings", "admins"]) {
        const response = await fetch(`${base}/tenant/${collection}`, { headers: tenantHeaders });
        const body: any = await response.json();
        if (!response.ok) throw new Error(`tenant ${subdomain}/${collection}: ${JSON.stringify(body)}`);
      }
    }

    const tenantClub = clubsBody?.data?.items?.find((club: any) => club.subdomain === "ahly");
    if (tenantClub?._id) {
      const statsResponse = await fetch(`${base}/clubs/${tenantClub._id}/tenant`, {
        headers: authHeaders,
      });
      const statsBody: any = await statsResponse.json();
      if (!statsResponse.ok) throw new Error(JSON.stringify(statsBody));

      console.log(
        `  super admin view   database=${statsBody?.data?.database} documents=${statsBody?.data?.documents}`
      );
    }

    console.log("\n✅ Live API check OK");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectDB();
  }
}

main().catch((error) => {
  console.error("❌ Live check failed:", error);
  process.exitCode = 1;
});
