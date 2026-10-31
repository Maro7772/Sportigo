/**
 * OpenAPI consistency checks (no database needed).
 *
 * 1. Every spec file parses and every `$ref` resolves.
 * 2. Every operation has at least one response.
 * 3. The documented paths match the Express routers 1:1.
 *
 * Run with: npm run test:openapi
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
let failed = 0;

function fail(message: string) {
  failed += 1;
  console.log(`  FAIL ${message}`);
}

function ok(message: string) {
  console.log(`  OK   ${message}`);
}

// ---------------------------------------------------------------------------
// 1. Load the generated specs
// ---------------------------------------------------------------------------
const SPEC_FILES = ["openapi.json", "openapi-superadmin.json", "openapi-tenant.json"];
const specs: Record<string, any> = {};

for (const file of SPEC_FILES) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) {
    fail(`${file} is missing (run \`npm run openapi\`)`);
    continue;
  }

  try {
    specs[file] = JSON.parse(fs.readFileSync(full, "utf8"));
    ok(`${file} parses as JSON`);
  } catch (error) {
    fail(`${file} is not valid JSON: ${(error as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// 2. Every $ref resolves
// ---------------------------------------------------------------------------
function resolvePointer(spec: any, pointer: string): boolean {
  const parts = pointer.replace(/^#\//, "").split("/");
  let node: any = spec;

  for (const raw of parts) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (node === null || typeof node !== "object" || !(key in node)) return false;
    node = node[key];
  }

  return true;
}

for (const [file, spec] of Object.entries(specs)) {
  const missing = new Set<string>();

  const walk = (node: any) => {
    if (!node || typeof node !== "object") return;

    if (typeof node.$ref === "string" && node.$ref.startsWith("#/")) {
      if (!resolvePointer(spec, node.$ref)) missing.add(node.$ref);
      return;
    }

    for (const value of Object.values(node)) walk(value);
  };

  walk(spec);

  if (missing.size) {
    fail(`${file} has unresolved $refs: ${[...missing].join(", ")}`);
  } else {
    ok(`${file} has no broken $refs`);
  }
}

// ---------------------------------------------------------------------------
// 3. Operations must have responses and a tag
// ---------------------------------------------------------------------------
const METHODS = ["get", "post", "put", "patch", "delete"];

for (const [file, spec] of Object.entries(specs)) {
  let operations = 0;
  const problems: string[] = [];

  for (const [routePath, item] of Object.entries<any>(spec.paths ?? {})) {
    for (const method of METHODS) {
      const operation = item?.[method];
      if (!operation) continue;

      operations += 1;

      if (!operation.responses || !Object.keys(operation.responses).length) {
        problems.push(`${method.toUpperCase()} ${routePath} has no responses`);
      }

      if (!Array.isArray(operation.tags) || operation.tags.length === 0) {
        problems.push(`${method.toUpperCase()} ${routePath} has no tag`);
      }
    }
  }

  if (problems.length) {
    fail(`${file}: ${problems.join("; ")}`);
  } else {
    ok(`${file}: ${operations} operations are complete`);
  }
}

// ---------------------------------------------------------------------------
// 4. Compare documented paths with the Express routers
// ---------------------------------------------------------------------------
const PREFIXES: Record<string, string> = {
  "src/routes/auth.routes.ts": "/api/auth",
  "src/routes/game.routes.ts": "/api/games",
  "src/routes/action.routes.ts": "/api/actions",
  "src/routes/package.routes.ts": "/api/packages",
  "src/routes/club.routes.ts": "/api/clubs",
  "src/routes/order.routes.ts": "/api/orders",
  "src/routes/paymentMethod.routes.ts": "/api/payment-methods",
  "src/routes/settings.routes.ts": "/api/settings",
  "src/routes/dashboard.routes.ts": "/api/dashboard",
  "src/routes/upload.routes.ts": "/api/uploads",
  "src/routes/tenant/action.routes.ts": "/api/tenant/actions",
  "src/routes/tenant/admin.routes.ts": "/api/tenant/admins",
  "src/routes/tenant/auth.routes.ts": "/api/tenant/auth",
  "src/routes/tenant/game.routes.ts": "/api/tenant/games",
  "src/routes/tenant/cart.routes.ts": "/api/tenant/cart",
  "src/routes/tenant/match.routes.ts": "/api/tenant/matches",
  "src/routes/tenant/order.routes.ts": "/api/tenant/orders",
  "src/routes/tenant/package.routes.ts": "/api/tenant/packages",
  "src/routes/tenant/paymentMethod.routes.ts": "/api/tenant/payment-methods",
  "src/routes/tenant/player.routes.ts": "/api/tenant/players",
  "src/routes/tenant/progress.routes.ts": "/api/tenant/player-progress",
  "src/routes/tenant/settings.routes.ts": "/api/tenant/settings",
  "src/routes/tenant/team.routes.ts": "/api/tenant/teams",
  "src/routes/tenant/upload.routes.ts": "/api/tenant/uploads",
};

function normalize(routePath: string): string {
  const joined = routePath.replace(/\/+$/, "");
  const normalized = (joined.startsWith("/") ? joined : `/${joined}`)
    .replace(/\/:([A-Za-z_][A-Za-z0-9_]*)/g, "/{$1}")
    .replace(/\/+/g, "/");

  return normalized === "" ? "/" : normalized;
}

const routeMethods = new Set<string>();

for (const [file, prefix] of Object.entries(PREFIXES)) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) {
    fail(`${file} does not exist`);
    continue;
  }

  const source = fs.readFileSync(full, "utf8");
  const matcher = /router\.(get|post|put|patch|delete)\(\s*"([^"]*)"/g;

  for (const match of source.matchAll(matcher)) {
    const [, method, routePath] = match;
    const fullPath = normalize(`${prefix}${routePath === "/" ? "" : routePath}`);
    routeMethods.add(`${method.toUpperCase()} ${fullPath}`);
  }
}

// Routes declared directly in the tenant router / app.
const tenantIndex = fs.readFileSync(path.join(ROOT, "src/routes/tenant/index.ts"), "utf8");
for (const match of tenantIndex.matchAll(/router\.(get|post|put|patch|delete)\(\s*"([^"]*)"/g)) {
  const [, method, routePath] = match;
  routeMethods.add(`${method.toUpperCase()} ${normalize(`/api/tenant${routePath}`)}`);
}
routeMethods.add("GET /health");

const specMethods = new Set<string>();
for (const [routePath, item] of Object.entries<any>(specs["openapi.json"]?.paths ?? {})) {
  for (const method of METHODS) {
    if (item?.[method]) specMethods.add(`${method.toUpperCase()} ${routePath}`);
  }
}

const undocumented = [...routeMethods].filter((entry) => !specMethods.has(entry)).sort();
const ghost = [...specMethods].filter((entry) => !routeMethods.has(entry)).sort();

if (undocumented.length) {
  fail(`routes missing from openapi.json (${undocumented.length}):\n    ${undocumented.join("\n    ")}`);
} else {
  ok(`all ${routeMethods.size} routes are documented`);
}

if (ghost.length) {
  fail(`openapi.json documents routes that do not exist (${ghost.length}):\n    ${ghost.join("\n    ")}`);
} else {
  ok("no ghost routes in openapi.json");
}

console.log(`\n${failed === 0 ? "ALL CHECKS PASSED" : `${failed} CHECK(S) FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
