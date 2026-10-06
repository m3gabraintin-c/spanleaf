// Smoke test for a real database. Run it right after migrating a Supabase project:
//   DATABASE_URL=postgres://... node scripts/check-rls.mjs
// It checks that the server's role can read through row level security, and that the browser roles can't.
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(2);
}
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
const claims = JSON.stringify({ sub: "00000000-0000-0000-0000-000000000000", role: "authenticated" });
let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
  if (!pass) failed++;
};
async function as(role, query) {
  try {
    await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${claims}, true), set_config('role', ${role}, true)`;
      await tx.unsafe(query);
    });
    return null;
  } catch (e) {
    return e.code ?? e.message;
  }
}
try {
  ok("app_user can read projects through row level security", (await as("app_user", "select count(*) from projects")) === null);
  ok("app_user can read its own media", (await as("app_user", "select count(*) from media")) === null);
  for (const role of ["anon", "authenticated"]) {
    ok(`${role} is refused on projects`, (await as(role, "select count(*) from projects")) === "42501");
    ok(`${role} is refused on media`, (await as(role, "select count(*) from media")) === "42501");
  }
  const [{ n }] = await sql`select count(*)::int as n from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon','authenticated')`;
  ok("anon and authenticated hold no table grants in public", n === 0, `${n} found`);
} finally {
  await sql.end();
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
