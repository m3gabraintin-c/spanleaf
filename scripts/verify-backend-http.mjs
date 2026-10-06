// Checks the real Next.js server over HTTP, with no Supabase account behind it.
// What it can prove: unauthenticated callers are refused everywhere, cron endpoints
// authenticate correctly, and nothing secret is in the browser bundle. What it can't: anything that
// needs a live Supabase session. See docs/production-setup.md for the manual checks.
//   Start the server with the dummy env from this repo's README, then: node scripts/verify-backend-http.mjs
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const BASE = process.env.BASE_URL || "http://localhost:3200";
const SECRETS = (process.env.SECRET_VALUES || "").split("|").filter(Boolean);
const CRON_SECRET = process.env.CRON_SECRET;
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
  if (!ok) failed++;
};
const req = (method, p, opts = {}) => fetch(BASE + p, { method, redirect: "manual", ...opts });
const uuid = "11111111-1111-4111-8111-111111111111";

// ---- every user route refuses an anonymous caller, with the one error shape
const routes = [
  ["GET", "/api/me"], ["DELETE", "/api/me"], ["POST", "/api/onboarding/complete"],
  ["GET", "/api/projects"], ["POST", "/api/projects"],
  ["GET", `/api/projects/${uuid}`], ["PATCH", `/api/projects/${uuid}`], ["DELETE", `/api/projects/${uuid}`],
  ["POST", `/api/projects/${uuid}/duplicate`], ["POST", `/api/projects/${uuid}/restore`],
  ["POST", "/api/media/upload-url"], ["POST", "/api/media/urls"], ["POST", `/api/media/${uuid}/complete`], ["DELETE", `/api/media/${uuid}`],
  ["POST", "/api/compose"],
];
for (const [m, p] of routes) {
  const r = await req(m, p, { headers: { "content-type": "application/json" }, body: m === "GET" || m === "DELETE" ? undefined : "{}" });
  const body = await r.json().catch(() => null);
  check(`anonymous ${m} ${p.replace(uuid, ":id")} is refused`, r.status === 401 && body?.error?.code === "UNAUTHENTICATED");
}

// ---- a forged session cookie is not accepted either
const forged = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url") + "." +
  Buffer.from(JSON.stringify({ sub: uuid, role: "authenticated", exp: 4102444800, email: "x@example.test" })).toString("base64url") + ".forgedsignature";
const session = JSON.stringify({ access_token: forged, refresh_token: "x", expires_at: 4102444800, expires_in: 999999, token_type: "bearer", user: { id: uuid } });
for (const name of ["sb-localhost-auth-token", "sb-localhost-auth-token.0"]) {
  const r = await req("GET", "/api/projects", { headers: { cookie: `${name}=${encodeURIComponent("base64-" + Buffer.from(session).toString("base64url"))}` } });
  check(`forged session cookie (${name}) is refused`, r.status === 401);
}
const r0 = await req("GET", "/api/projects", { headers: { authorization: `Bearer ${forged}` } });
check("a forged Authorization header is ignored", r0.status === 401);
const r1 = await req("GET", "/api/me", { headers: { "x-user-id": uuid, "x-supabase-user": uuid } });
check("a made-up identity header does nothing", r1.status === 401);

// ---- responses are never cached
const nc = await req("GET", "/api/me");
check("API responses are marked no-store", (nc.headers.get("cache-control") || "").includes("no-store"));

// ---- cron endpoints
for (const job of ["media-cleanup", "trash-purge", "account-deletion"]) {
  const none = await req("GET", `/api/cron/${job}`);
  const wrong = await req("GET", `/api/cron/${job}`, { headers: { authorization: "Bearer not-the-secret-not-the-secret" } });
  const short = await req("GET", `/api/cron/${job}`, { headers: { authorization: "Bearer x" } });
  check(`cron ${job}: no header, wrong secret and a short one are all 401`, [none, wrong, short].every((r) => r.status === 401));
  const before = (await sql`select count(*)::int as n from job_runs where job = ${job}`)[0].n;
  const ok = await req("GET", `/api/cron/${job}`, { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  const body = await ok.json().catch(() => null);
  const after = (await sql`select count(*)::int as n from job_runs where job = ${job}`)[0].n;
  check(`cron ${job}: the right secret runs the job and logs it`, ok.status === 200 && body?.ok === true && after === before + 1, JSON.stringify(body));
}
const post = await req("POST", "/api/cron/trash-purge", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
check("cron endpoints don't answer POST", post.status === 405);

// ---- sign-in callback never trusts a redirect target
const cb = await req("GET", "/auth/callback?next=//evil.test&code=whatever");
const loc = cb.headers.get("location") || "";
check("sign-in callback with a bad code goes to the login error page", cb.status === 307 && loc.endsWith("/login?error=link"), loc);
const cb2 = await req("GET", "/auth/callback?next=https://evil.test");
check("sign-in callback never redirects off-site", !(cb2.headers.get("location") || "").includes("evil.test"));

// ---- secrets in the browser bundle
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    f.isDirectory() ? walk(p) : /\.(js|css|html|json|map|txt)$/.test(f.name) && files.push(p);
  }
})(".next/static");
const blob = files.map((f) => fs.readFileSync(f, "utf8")).join("\n");
check(`scanned ${files.length} client files`, files.length > 5);
for (const s of SECRETS) check(`secret value is not in the browser bundle (${s.slice(0, 6)}...)`, !blob.includes(s));
for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET", "DATABASE_URL"]) {
  check(`variable name ${name} is not in the browser bundle`, !blob.includes(name));
}
check("the public anon key IS in the bundle (so sign-in can work)", blob.includes(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY));
check("no server-only module leaked into the bundle", !blob.includes("rate_limits") && !blob.includes("job_runs") && !blob.includes("app_user"));

await sql.end();
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
