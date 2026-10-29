/**
 * Live end-to-end check of the super-admin password reset against a running
 * server (real MongoDB). Not part of `npm test` - run manually:
 *   node test/reset-live.mjs
 */
const BASE = process.env.BASE_URL ?? "http://localhost:4000";
const SUPER_EMAIL = process.env.SUPER_EMAIL ?? "admin@gmail.com";
const SUPER_PASSWORD = process.env.SUPER_PASSWORD ?? "123456";
const CLUB_SUBDOMAIN = process.env.CLUB_SUBDOMAIN ?? "ahly";
const DEFAULT_TENANT_PASSWORD = process.env.TENANT_DEFAULT_PASSWORD ?? "123456";

let failures = 0;
function check(label, condition, extra = "") {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label} ${extra}`);
  }
}

async function api(method, path, { token, body, subdomain } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (subdomain) headers["x-subdomain"] = subdomain;

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, body: json };
}

const login = await api("POST", "/api/auth/login", {
  body: { email: SUPER_EMAIL, password: SUPER_PASSWORD },
});
check("super admin login -> 200", login.status === 200, `(${login.status})`);
const token = login.body?.data?.token;
if (!token) {
  console.log("\nCannot continue without a super admin token.");
  process.exit(1);
}

const clubs = await api("GET", "/api/clubs?limit=100", { token });
check("list clubs -> 200", clubs.status === 200, `(${clubs.status})`);
const clubList = clubs.body?.data?.items ?? clubs.body?.data ?? [];
const club = clubList.find((item) => item.subdomain === CLUB_SUBDOMAIN);
check(`club "${CLUB_SUBDOMAIN}" exists`, Boolean(club));
if (!club) process.exit(1);

const tenantEmail = `admin@${club.subdomain}.com`;

console.log("\n1) reset with a generated password");
const reset = await api("POST", `/api/clubs/${club._id}/tenant/reset-admin`, {
  token,
  body: {},
});
check("reset -> 200", reset.status === 200, `(${reset.status})`);
check("targets the default club admin", reset.body?.data?.admin?.email === tenantEmail);
check("generated password returned", typeof reset.body?.data?.password === "string" && reset.body.data.password.length >= 6);

const generated = reset.body?.data?.password;

const loginNew = await api("POST", "/api/tenant/auth/login", {
  subdomain: club.subdomain,
  body: { email: tenantEmail, password: generated },
});
check("tenant login with the new password -> 200", loginNew.status === 200, `(${loginNew.status})`);
const tenantToken = loginNew.body?.data?.token;

const me = await api("GET", "/api/tenant/auth/me", { token: tenantToken, subdomain: club.subdomain });
check("tenant /me works with the new token -> 200", me.status === 200, `(${me.status})`);

console.log("\n2) restore the documented default password");
const restore = await api("POST", `/api/clubs/${club._id}/tenant/reset-admin`, {
  token,
  body: { email: tenantEmail, password: DEFAULT_TENANT_PASSWORD },
});
check("restore -> 200", restore.status === 200, `(${restore.status})`);

const revoked = await api("GET", "/api/tenant/auth/me", { token: tenantToken, subdomain: club.subdomain });
check("token issued before the reset is revoked -> 401", revoked.status === 401, `(${revoked.status})`);

const loginDefault = await api("POST", "/api/tenant/auth/login", {
  subdomain: club.subdomain,
  body: { email: tenantEmail, password: DEFAULT_TENANT_PASSWORD },
});
check("login with the restored password -> 200", loginDefault.status === 200, `(${loginDefault.status})`);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
