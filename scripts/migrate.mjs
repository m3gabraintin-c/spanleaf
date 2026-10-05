// Applies supabase/migrations/*.sql in order. Each file runs in one transaction and is recorded in
// public._migrations, so running it twice does nothing. Usage:
//   DATABASE_URL=postgres://... node scripts/migrate.mjs
// Add --stub to load db/test/supabase-stub.sql first. That is for a throwaway test database only.
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  process.exit(2);
}
const useStub = process.argv.includes("--stub");
const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  if (useStub) {
    await sql.unsafe(fs.readFileSync("db/test/supabase-stub.sql", "utf8"));
    console.log("loaded test stub");
  }
  await sql`create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now())`;
  const dir = "supabase/migrations";
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const done = new Set((await sql`select name from public._migrations`).map((r) => r.name));
  let ran = 0;
  for (const f of files) {
    if (done.has(f)) continue;
    const body = fs.readFileSync(path.join(dir, f), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into public._migrations (name) values (${f})`;
    });
    console.log("applied", f);
    ran++;
  }
  console.log(ran ? `done, ${ran} applied` : "up to date");
} catch (e) {
  console.error("migration failed:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
