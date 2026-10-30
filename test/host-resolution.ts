/**
 * Host -> tenant resolution checks (no database needed).
 *
 * Run with: npm run test:host
 */
import type { Request } from "express";
import { extractSubdomain, tenantFromHost } from "../src/middlewares/tenant";
import { env } from "../src/config/env";

let failed = 0;

function eq(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) {
    console.log(`  OK   ${label} -> "${actual}"`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label} -> "${actual}" (expected "${expected}")`);
  }
}

console.log(`APP_DOMAIN=${env.APP_DOMAIN}`);
console.log(`SUPER_ADMIN_SUBDOMAINS=${env.SUPER_ADMIN_SUBDOMAINS.join(",")}\n`);

console.log("tenantFromHost()");
eq("apex", tenantFromHost("sportego.org"), "");
eq("apex with port", tenantFromHost("sportego.org:4000"), "");
eq("www", tenantFromHost("www.sportego.org"), "");
eq("admin", tenantFromHost("admin.sportego.org"), "");
eq("api", tenantFromHost("api.sportego.org"), "");
eq("tenant", tenantFromHost("ahly.sportego.org"), "ahly");
eq("tenant with port", tenantFromHost("ahly.sportego.org:4000"), "ahly");
eq("tenant uppercase", tenantFromHost("AHly.Sportego.ORG"), "ahly");
eq("tenant trailing dot", tenantFromHost("ahly.sportego.org."), "ahly");
eq("nested tenant", tenantFromHost("ahly.club.example.com"), "ahly");
eq(
  "unknown 3-label domain is a tenant host",
  tenantFromHost("club.example.com"),
  "club"
);
eq("tenant on localhost", tenantFromHost("ahly.localhost"), "ahly");
eq("tenant on localhost with port", tenantFromHost("ahly.localhost:4000"), "ahly");
eq("localhost", tenantFromHost("localhost:4000"), "");
eq("ipv4", tenantFromHost("127.0.0.1:4000"), "");
eq("public ip", tenantFromHost("144.91.84.160"), "");
eq("empty", tenantFromHost(""), "");

function fakeRequest(headers: Record<string, string>, query: Record<string, unknown> = {}) {
  return { headers, query } as unknown as Request;
}

console.log("\nextractSubdomain()");
eq(
  "x-subdomain wins",
  extractSubdomain(fakeRequest({ host: "sportego.org", "x-subdomain": "Ahly" })),
  "ahly"
);
eq(
  "?subdomain= wins",
  extractSubdomain(fakeRequest({ host: "sportego.org" }, { subdomain: "zamalek" })),
  "zamalek"
);
eq(
  "host fallback",
  extractSubdomain(fakeRequest({ host: "ahly.sportego.org" })),
  "ahly"
);
eq(
  "x-forwarded-host is preferred",
  extractSubdomain(fakeRequest({ host: "127.0.0.1:4000", "x-forwarded-host": "ahly.sportego.org" })),
  "ahly"
);
eq(
  "apex host -> no tenant",
  extractSubdomain(fakeRequest({ host: "sportego.org" })),
  ""
);
eq(
  "admin host -> no tenant",
  extractSubdomain(fakeRequest({ host: "admin.sportego.org" })),
  ""
);

console.log(`\n${failed === 0 ? "ALL CHECKS PASSED" : `${failed} CHECK(S) FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
