import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { createDb, type Db } from "@/server/db";
import type { AuthAdmin, Storage } from "@/server/storage";
import type { StripeApi, SubSnapshot } from "@/server/stripe";

const ADMIN_URL = process.env.TEST_ADMIN_URL ?? "postgres://tester:tester@localhost:5432/postgres";
const urlFor = (name: string) => ADMIN_URL.replace(/\/[^/]*$/, `/${name}`);

export interface TestDb {
  sql: postgres.Sql;
  db: Db;
  close: () => Promise<void>;
}

/** A brand new database with the Supabase stand-in and every migration applied. */
export async function freshDb(name: string): Promise<TestDb> {
  const dbName = `carousel_t_${name}`;
  const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {} });
  await admin.unsafe(`drop database if exists ${dbName} with (force)`);
  await admin.unsafe(`create database ${dbName}`);
  await admin.end();

  const sql = postgres(urlFor(dbName), { max: 5, prepare: false, onnotice: () => {} });
  await sql.unsafe(fs.readFileSync("db/test/supabase-stub.sql", "utf8"));
  const dir = "supabase/migrations";
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    await sql.unsafe(fs.readFileSync(path.join(dir, f), "utf8"));
  }
  return { sql, db: createDb(sql), close: () => sql.end() };
}

export async function mkUser(sql: postgres.Sql, email: string): Promise<string> {
  const [u] = await sql<{ id: string }[]>`insert into auth.users (email) values (${email}) returning id`;
  return u.id;
}

export async function makePremium(sql: postgres.Sql, userId: string, status = "active", daysLeft = 30) {
  await sql`
    insert into subscriptions (user_id, stripe_customer_id, stripe_subscription_id, status, current_period_end)
    values (${userId}, ${"cus_" + userId.slice(0, 8)}, ${"sub_" + userId.slice(0, 8)}, ${status}, now() + ${daysLeft + " days"}::interval)
    on conflict (user_id) do update set status = excluded.status, current_period_end = excluded.current_period_end`;
}

/** Run SQL the way a given database role would, with the caller's id in the JWT claims. */
export async function as<T>(sql: postgres.Sql, role: "anon" | "authenticated" | "app_user", userId: string | null, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify(userId ? { sub: userId } : {})}, true), set_config('role', ${role}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

/** Catches an error and returns its Postgres code, or null if it didn't fail. */
export async function pgCode(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? "unknown";
  }
}

export async function apiCode(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? "unknown";
  }
}

export class FakeStorage implements Storage {
  files = new Map<string, { size: number; mimeType: string }>();
  failRemove = false;
  failSign = false;
  removed: string[] = [];
  put(bucket: string, p: string, size = 1000, mimeType = "image/png") {
    this.files.set(`${bucket}/${p}`, { size, mimeType });
  }
  async createSignedUploadUrl(bucket: string, p: string) {
    if (this.failSign) throw new Error("storage down");
    return { path: p, token: "tok-" + p, signedUrl: `https://storage.test/upload/${bucket}/${p}` };
  }
  async createSignedUrls(bucket: string, paths: string[]) {
    return Object.fromEntries(paths.map((p) => [p, `https://storage.test/sign/${bucket}/${p}?exp=3600`]));
  }
  async stat(bucket: string, p: string) {
    return this.files.get(`${bucket}/${p}`) ?? null;
  }
  async remove(bucket: string, paths: string[]) {
    if (this.failRemove) throw new Error("storage down");
    for (const p of paths) {
      this.files.delete(`${bucket}/${p}`);
      this.removed.push(`${bucket}/${p}`);
    }
  }
  async listFolder(bucket: string, folder: string) {
    return [...this.files.keys()].filter((k) => k.startsWith(`${bucket}/${folder}/`)).map((k) => k.slice(bucket.length + 1));
  }
}

export class FakeAuthAdmin implements AuthAdmin {
  failFor = new Set<string>();
  constructor(private sql: postgres.Sql) {}
  async deleteUser(id: string) {
    if (this.failFor.has(id)) throw new Error("auth down");
    await this.sql`delete from auth.users where id = ${id}`;
  }
}

let customerSeq = 0; // Stripe customer ids are unique across the whole account, so the fake keeps counting across tests

export class FakeStripe implements StripeApi {
  customers: { id: string; email: string; userId: string }[] = [];
  subs = new Map<string, SubSnapshot>();
  checkouts: Parameters<StripeApi["createCheckoutSession"]>[0][] = [];
  portals: Parameters<StripeApi["createPortalSession"]>[0][] = [];
  cancelled: string[] = [];
  retrieveCalls = 0;
  failRetrieve = 0; // number of upcoming retrieve calls that should throw
  failCancel = false;
  async createCustomer(p: { email: string; userId: string }) {
    const c = { id: `cus_fake_${++customerSeq}`, ...p };
    this.customers.push(c);
    return { id: c.id };
  }
  async createCheckoutSession(p: Parameters<StripeApi["createCheckoutSession"]>[0]) {
    this.checkouts.push(p);
    return { url: "https://checkout.test/session" };
  }
  async createPortalSession(p: Parameters<StripeApi["createPortalSession"]>[0]) {
    this.portals.push(p);
    return { url: "https://portal.test/session" };
  }
  async retrieveSubscription(id: string) {
    this.retrieveCalls++;
    if (this.failRetrieve > 0) {
      this.failRetrieve--;
      throw new Error("stripe down");
    }
    const s = this.subs.get(id);
    if (!s) throw new Error("no such subscription");
    return s;
  }
  async cancelSubscription(id: string) {
    if (this.failCancel) throw new Error("stripe down");
    this.cancelled.push(id);
    const s = this.subs.get(id);
    if (s) this.subs.set(id, { ...s, status: "canceled" });
  }
}

export const snap = (over: Partial<SubSnapshot> & { id: string; customerId: string }): SubSnapshot => ({
  status: "active",
  priceId: "price_test",
  trialEnd: null,
  currentPeriodEnd: new Date(Date.now() + 30 * 864e5),
  cancelAtPeriodEnd: false,
  userId: null,
  ...over,
});
