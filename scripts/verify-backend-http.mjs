// Checks the real Next.js server over HTTP, with no Supabase or Stripe account behind it.
// What it can prove: unauthenticated callers are refused everywhere, cron and webhook endpoints
// authenticate correctly, and nothing secret is in the browser bundle. What it can't: anything that
// needs a live Supabase session or a live Stripe. See docs/production-setup.md for the manual checks.
//   Start the server with the dummy env from this repo's README, then: node scripts/verify-backend-http.mjs
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import Stripe from "stripe";

const BASE = process.env.BASE_URL || "http://localhost:3200";
const SECRETS = (process.env.SECRET_VALUES || "").split("|").filter(Boolean);
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const CRON_SECRET = process.env.CRON_SECRET;
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
const stripe = new Stripe("sk_test_unit_test_placeholder");

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
  ["GET", "/api/templates"], ["GET", "/api/assets?kind=sticker"],
  ["POST", "/api/billing/checkout"], ["POST", "/api/billing/portal"],
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
for (const job of ["media-cleanup", "trash-purge", "stripe-reconcile", "account-deletion"]) {
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

// ---- stripe webhook
const evt = JSON.stringify({ id: "evt_http_1", object: "event", type: "customer.created", data: { object: { id: "cus_http" } } });
const headers = (sig) => ({ "content-type": "application/json", ...(sig ? { "stripe-signature": sig } : {}) });
check("webhook without a signature is 400", (await req("POST", "/api/webhooks/stripe", { headers: headers(), body: evt })).status === 400);
check("webhook with a bad signature is 400", (await req("POST", "/api/webhooks/stripe", { headers: headers("t=1,v1=bad"), body: evt })).status === 400);
const good = stripe.webhooks.generateTestHeaderString({ payload: evt, secret: WEBHOOK_SECRET });
const tampered = await req("POST", "/api/webhooks/stripe", { headers: headers(good), body: evt.replace("cus_http", "cus_evil") });
check("webhook whose body changed after signing is 400", tampered.status === 400);
const accepted = await req("POST", "/api/webhooks/stripe", { headers: headers(good), body: evt });
check("a correctly signed webhook is accepted and recorded", accepted.status === 200 && (await sql`select processed_at from stripe_events where id = 'evt_http_1'`)[0]?.processed_at != null);
const again = await req("POST", "/api/webhooks/stripe", { headers: headers(good), body: evt });
const dupBody = await again.json().catch(() => ({}));
check("the same webhook delivered again is a duplicate, not a second row", dupBody.result === "duplicate" && (await sql`select count(*)::int as n from stripe_events where id = 'evt_http_1'`)[0].n === 1);
check("GET on the webhook is 405", (await req("GET", "/api/webhooks/stripe")).status === 405);

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
for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "CRON_SECRET", "DATABASE_URL"]) {
  check(`variable name ${name} is not in the browser bundle`, !blob.includes(name));
}
check("the public anon key IS in the bundle (so sign-in can work)", blob.includes(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY));
check("no server-only module leaked into the bundle", !blob.includes("rate_limits") && !blob.includes("stripe_events") && !blob.includes("app_user"));

await sql.end();
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
