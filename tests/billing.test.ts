import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import Stripe from "stripe";
import { createCheckout, createPortal } from "@/server/billing";
import { getMe, requestAccountDeletion } from "@/server/me";
import { safeReturnTo } from "@/server/schemas";
import { processWebhook, subscriptionIdOf, type StripeEventLike } from "@/server/stripe-webhook";
import { apiCode, FakeStripe, freshDb, mkUser, snap, type TestDb } from "./helpers";

const SECRET = "whsec_unit_test_secret_not_real";
// A client built with a placeholder key. Signature checking is local and never calls Stripe.
const lib = new Stripe("sk_test_unit_test_placeholder");
const verify = (raw: string, sig: string) => lib.webhooks.constructEvent(raw, sig, SECRET) as unknown as StripeEventLike;
const sign = (raw: string) => lib.webhooks.generateTestHeaderString({ payload: raw, secret: SECRET });

let t: TestDb;
let stripe: FakeStripe;
const billing = () => ({ db: t.db, stripe, appUrl: "https://app.example.test/", priceId: "price_test" });

let n = 0;
const event = (type: string, object: Record<string, unknown>): { raw: string; id: string } => {
  const id = `evt_${++n}`;
  return { id, raw: JSON.stringify({ id, object: "event", type, data: { object } }) };
};
const deliver = (e: { raw: string }, sig = sign(e.raw)) => processWebhook({ db: t.db, stripe, verify }, e.raw, sig);
const subRow = async (user: string) => (await t.sql`select * from subscriptions where user_id = ${user}`)[0];

before(async () => {
  t = await freshDb("billing");
});
after(() => t.close());

describe("returnTo (open redirect guard)", () => {
  it("allows plain same-site paths", () => {
    assert.equal(safeReturnTo("/app/project/123"), "/app/project/123");
    assert.equal(safeReturnTo(undefined), "/app");
  });
  it("falls back to /app for anything that could leave the site", () => {
    for (const bad of ["https://evil.test", "//evil.test", "/\\evil.test", "javascript:alert(1)", "/app?x=<script>", "evil", "/a b"]) {
      assert.equal(safeReturnTo(bad), "/app", bad);
    }
  });
});

describe("checkout", () => {
  it("creates one Stripe customer per user, however many times it's called", async () => {
    stripe = new FakeStripe();
    const bob = await mkUser(t.sql, "bob@example.test");
    await createCheckout(billing(), { id: bob, email: "bob@example.test" }, {});
    await createCheckout(billing(), { id: bob, email: "bob@example.test" }, {});
    assert.equal(stripe.customers.length, 1);
    assert.equal((await t.sql`select count(*)::int as n from subscriptions where user_id = ${bob}`)[0].n, 1);
  });
  it("two simultaneous first checkouts still end with exactly one subscription row", async () => {
    stripe = new FakeStripe();
    const carol = await mkUser(t.sql, "carol@example.test");
    await Promise.all([createCheckout(billing(), { id: carol, email: "c@example.test" }, {}), createCheckout(billing(), { id: carol, email: "c@example.test" }, {})]);
    assert.equal((await t.sql`select count(*)::int as n from subscriptions where user_id = ${carol}`)[0].n, 1);
  });
  it("offers a 7 day trial once, and not again after it has been used", async () => {
    stripe = new FakeStripe();
    const dave = await mkUser(t.sql, "dave@example.test");
    await createCheckout(billing(), { id: dave, email: "d@example.test" }, {});
    assert.equal(stripe.checkouts[0].trialDays, 7);
    await t.sql`update subscriptions set has_used_trial = true where user_id = ${dave}`;
    await createCheckout(billing(), { id: dave, email: "d@example.test" }, {});
    assert.equal(stripe.checkouts[1].trialDays, undefined);
  });
  it("the first trial asks for no card, and a later checkout (no trial) does", async () => {
    stripe = new FakeStripe();
    const kim = await mkUser(t.sql, "kim@example.test");
    await createCheckout(billing(), { id: kim, email: "k@example.test" }, {});
    assert.equal(stripe.checkouts[0].trialDays, 7);
    assert.equal(stripe.checkouts[0].trialWithoutCard, true);
    await t.sql`update subscriptions set has_used_trial = true, status = 'canceled' where user_id = ${kim}`;
    await createCheckout(billing(), { id: kim, email: "k@example.test" }, {});
    assert.equal(stripe.checkouts[1].trialDays, undefined, "no trial the second time, so the card is collected as usual");
  });
  it("sends the user back to a safe address, built from APP_URL, with a result flag", async () => {
    stripe = new FakeStripe();
    const erin = await mkUser(t.sql, "erin@example.test");
    await createCheckout(billing(), { id: erin, email: "e@example.test" }, { returnTo: "/app/project/abc" });
    assert.equal(stripe.checkouts[0].successUrl, "https://app.example.test/app/project/abc?checkout=success");
    assert.equal(stripe.checkouts[0].cancelUrl, "https://app.example.test/app/project/abc?checkout=cancelled");
    await createCheckout(billing(), { id: erin, email: "e@example.test" }, { returnTo: "https://evil.test/steal" });
    assert.ok(stripe.checkouts[1].successUrl.startsWith("https://app.example.test/app?"));
  });
  it("passes the user id along so the webhook can find them", async () => {
    stripe = new FakeStripe();
    const fay = await mkUser(t.sql, "fay@example.test");
    await createCheckout(billing(), { id: fay, email: "f@example.test" }, {});
    assert.equal(stripe.checkouts[0].userId, fay);
    assert.equal(stripe.checkouts[0].priceId, "price_test");
  });
  it("refuses a second subscription, pointing at the portal instead", async () => {
    stripe = new FakeStripe();
    const gus = await mkUser(t.sql, "gus@example.test");
    await createCheckout(billing(), { id: gus, email: "g@example.test" }, {});
    await t.sql`update subscriptions set status = 'active' where user_id = ${gus}`;
    assert.equal(await apiCode(createCheckout(billing(), { id: gus, email: "g@example.test" }, {})), "ALREADY_SUBSCRIBED");
    assert.equal(stripe.checkouts.length, 1);
  });
  it("lets someone whose subscription ended subscribe again", async () => {
    stripe = new FakeStripe();
    const hal = await mkUser(t.sql, "hal@example.test");
    await createCheckout(billing(), { id: hal, email: "h@example.test" }, {});
    await t.sql`update subscriptions set status = 'canceled' where user_id = ${hal}`;
    assert.equal(await apiCode(createCheckout(billing(), { id: hal, email: "h@example.test" }, {})), null);
  });
  it("needs an email address", async () => {
    stripe = new FakeStripe();
    const ivy = await mkUser(t.sql, "ivy@example.test");
    assert.equal(await apiCode(createCheckout(billing(), { id: ivy }, {})), "INVALID");
  });
});

describe("portal", () => {
  it("NOT_FOUND for someone who never subscribed, a link for someone who did", async () => {
    stripe = new FakeStripe();
    const jo = await mkUser(t.sql, "jo@example.test");
    assert.equal(await apiCode(createPortal(billing(), jo, {})), "NOT_FOUND");
    await createCheckout(billing(), { id: jo, email: "jo@example.test" }, {});
    const p = await createPortal(billing(), jo, { returnTo: "/app" });
    assert.equal(p.url, "https://portal.test/session");
    assert.equal(stripe.portals[0].customerId, stripe.customers[0].id);
  });
});

describe("webhook: signatures", () => {
  it("rejects a missing, wrong, or tampered signature, and writes nothing", async () => {
    stripe = new FakeStripe();
    const e = event("customer.subscription.updated", { id: "sub_x", customer: "cus_x" });
    const before = (await t.sql`select count(*)::int as n from stripe_events`)[0].n;
    assert.equal((await processWebhook({ db: t.db, stripe, verify }, e.raw, null)).status, 400);
    assert.equal((await deliver(e, "t=1,v1=deadbeef")).status, 400);
    assert.equal((await deliver({ raw: e.raw + " " }, sign(e.raw))).status, 400, "a body changed after signing is refused");
    const stale = lib.webhooks.generateTestHeaderString({ payload: e.raw, secret: "whsec_a_different_secret", timestamp: Math.floor(Date.now() / 1000) });
    assert.equal((await deliver(e, stale)).status, 400);
    const old = lib.webhooks.generateTestHeaderString({ payload: e.raw, secret: SECRET, timestamp: Math.floor(Date.now() / 1000) - 3600 });
    assert.equal((await deliver(e, old)).status, 400, "an old signature (replay) is refused");
    assert.equal((await t.sql`select count(*)::int as n from stripe_events`)[0].n, before);
    assert.equal(stripe.retrieveCalls, 0);
  });
});

describe("webhook: handling", () => {
  const setup = async (name: string, status = "active", extra: Partial<Parameters<typeof snap>[0]> = {}) => {
    stripe = new FakeStripe();
    const user = await mkUser(t.sql, `${name}@example.test`);
    await t.sql`insert into subscriptions (user_id, stripe_customer_id) values (${user}, ${"cus_" + name})`;
    stripe.subs.set("sub_" + name, snap({ id: "sub_" + name, customerId: "cus_" + name, status, userId: user, ...extra }));
    return user;
  };

  it("checkout completed on a trial makes the user premium and records that the trial was used", async () => {
    const u = await setup("trial", "trialing", { trialEnd: new Date(Date.now() + 7 * 864e5) });
    const e = event("checkout.session.completed", { mode: "subscription", subscription: "sub_trial", customer: "cus_trial" });
    assert.equal((await deliver(e)).status, 200);
    const row = await subRow(u);
    assert.equal(row.status, "trialing");
    assert.equal(row.has_used_trial, true);
    assert.equal((await getMe(t.db, { id: u, email: "x" })).premium, true);
  });
  it("the same event delivered twice is processed once", async () => {
    const u = await setup("dup");
    const e = event("customer.subscription.updated", { id: "sub_dup", customer: "cus_dup" });
    assert.equal((await deliver(e)).body.result, "processed");
    assert.equal((await deliver(e)).body.result, "duplicate");
    assert.equal((await deliver(e)).body.result, "duplicate");
    assert.equal(stripe.retrieveCalls, 1);
    assert.equal((await t.sql`select count(*)::int as n from stripe_events where id = ${e.id}`)[0].n, 1);
    assert.equal((await subRow(u)).status, "active");
  });
  it("events arriving out of order still end on Stripe's current state", async () => {
    const u = await setup("order", "canceled"); // Stripe's truth now: canceled
    const deleted = event("customer.subscription.deleted", { id: "sub_order", customer: "cus_order" });
    const created = event("customer.subscription.created", { id: "sub_order", customer: "cus_order" });
    await deliver(deleted); // the newer event first
    await deliver(created); // the older event arrives late
    assert.equal((await subRow(u)).status, "canceled", "an old 'created' event must not bring the subscription back");
    assert.equal((await getMe(t.db, { id: u, email: "x" })).premium, false);
  });
  it("payment failure moves the user to past_due, which is not premium", async () => {
    const u = await setup("fail", "past_due");
    const e = event("invoice.payment_failed", { id: "in_1", subscription: "sub_fail", customer: "cus_fail" });
    await deliver(e);
    assert.equal((await subRow(u)).status, "past_due");
    assert.equal((await getMe(t.db, { id: u, email: "x" })).premium, false);
  });
  it("finds the subscription in either place Stripe puts it on invoices", () => {
    assert.equal(subscriptionIdOf({ id: "1", type: "invoice.paid", data: { object: { subscription: "sub_a" } } }), "sub_a");
    assert.equal(subscriptionIdOf({ id: "1", type: "invoice.paid", data: { object: { parent: { subscription_details: { subscription: "sub_b" } } } } }), "sub_b");
    assert.equal(subscriptionIdOf({ id: "1", type: "checkout.session.completed", data: { object: { mode: "payment", subscription: "sub_c" } } }), null);
  });
  it("records cancel-at-period-end and the period end", async () => {
    const end = new Date(Date.now() + 10 * 864e5);
    const u = await setup("cancel", "active", { cancelAtPeriodEnd: true, currentPeriodEnd: end });
    await deliver(event("customer.subscription.updated", { id: "sub_cancel", customer: "cus_cancel" }));
    const row = await subRow(u);
    assert.equal(row.cancel_at_period_end, true);
    assert.ok(Math.abs(new Date(row.current_period_end).getTime() - end.getTime()) < 1000);
    const me = await getMe(t.db, { id: u, email: "x" });
    assert.equal(me.cancelsAtPeriodEnd, true);
    assert.equal(me.premium, true, "they keep Premium until the period ends");
  });
  it("a crash mid-way returns 500 so Stripe retries, and the retry then succeeds", async () => {
    const u = await setup("crash");
    stripe.failRetrieve = 1;
    const e = event("customer.subscription.updated", { id: "sub_crash", customer: "cus_crash" });
    assert.equal((await deliver(e)).status, 500);
    assert.equal((await t.sql`select processed_at from stripe_events where id = ${e.id}`)[0].processed_at, null);
    const second = await deliver(e);
    assert.equal(second.status, 200);
    assert.equal(second.body.result, "processed");
    assert.equal((await subRow(u)).status, "active");
  });
  it("an event for a deleted account is acknowledged, not retried forever", async () => {
    const u = await setup("gone");
    await t.sql`delete from auth.users where id = ${u}`;
    stripe.subs.set("sub_gone", snap({ id: "sub_gone", customerId: "cus_unknown_now", userId: u }));
    const out = await deliver(event("customer.subscription.updated", { id: "sub_gone", customer: "cus_unknown_now" }));
    assert.equal(out.status, 200);
  });
  it("an unknown user with no metadata fails loudly so someone looks", async () => {
    stripe = new FakeStripe();
    stripe.subs.set("sub_orphan", snap({ id: "sub_orphan", customerId: "cus_nobody" }));
    assert.equal((await deliver(event("customer.subscription.updated", { id: "sub_orphan", customer: "cus_nobody" }))).status, 500);
  });
  it("event types we don't use are recorded and ignored", async () => {
    stripe = new FakeStripe();
    const e = event("customer.created", { id: "cus_zzz" });
    assert.equal((await deliver(e)).status, 200);
    assert.equal(stripe.retrieveCalls, 0);
    assert.ok((await t.sql`select processed_at from stripe_events where id = ${e.id}`)[0].processed_at);
  });
  it("an unrecognised Stripe status is stored as incomplete, never as premium", async () => {
    const u = await setup("weird", "some_new_status");
    await deliver(event("customer.subscription.updated", { id: "sub_weird", customer: "cus_weird" }));
    assert.equal((await subRow(u)).status, "incomplete");
  });
  it("has_used_trial never goes back to false", async () => {
    const u = await setup("keep", "active", { trialEnd: new Date(Date.now() - 864e5) });
    await deliver(event("customer.subscription.updated", { id: "sub_keep", customer: "cus_keep" }));
    stripe.subs.set("sub_keep", snap({ id: "sub_keep", customerId: "cus_keep", trialEnd: null, userId: u }));
    await deliver(event("customer.subscription.updated", { id: "sub_keep", customer: "cus_keep" }));
    assert.equal((await subRow(u)).has_used_trial, true);
  });
});

describe("account deletion request", () => {
  it("cancels billing first, then flags the account", async () => {
    stripe = new FakeStripe();
    const u = await mkUser(t.sql, "leaving@example.test");
    await t.sql`insert into subscriptions (user_id, stripe_customer_id, stripe_subscription_id, status) values (${u}, 'cus_l', 'sub_l', 'active')`;
    stripe.subs.set("sub_l", snap({ id: "sub_l", customerId: "cus_l" }));
    await requestAccountDeletion({ db: t.db, stripe }, u);
    assert.deepEqual(stripe.cancelled, ["sub_l"]);
    assert.ok((await t.sql`select deletion_requested_at from profiles where id = ${u}`)[0].deletion_requested_at);
  });
  it("if Stripe can't cancel, nothing is deleted and the user is told", async () => {
    stripe = new FakeStripe();
    stripe.failCancel = true;
    const u = await mkUser(t.sql, "stuck@example.test");
    await t.sql`insert into subscriptions (user_id, stripe_customer_id, stripe_subscription_id, status) values (${u}, 'cus_s', 'sub_s', 'active')`;
    assert.equal(await apiCode(requestAccountDeletion({ db: t.db, stripe }, u)), "NETWORK");
    assert.equal((await t.sql`select deletion_requested_at from profiles where id = ${u}`)[0].deletion_requested_at, null);
  });
  it("works for someone who never paid, and twice in a row", async () => {
    stripe = new FakeStripe();
    const u = await mkUser(t.sql, "free@example.test");
    await requestAccountDeletion({ db: t.db, stripe }, u);
    const first = (await t.sql`select deletion_requested_at from profiles where id = ${u}`)[0].deletion_requested_at;
    await requestAccountDeletion({ db: t.db, stripe }, u);
    const second = (await t.sql`select deletion_requested_at from profiles where id = ${u}`)[0].deletion_requested_at;
    assert.equal(first.getTime(), second.getTime(), "asking again doesn't restart the clock");
  });
});

describe("me", () => {
  it("a free user: not premium, 10 slides, can start a trial", async () => {
    const u = await mkUser(t.sql, "plain@example.test");
    const me = await getMe(t.db, { id: u, email: "plain@example.test" });
    assert.equal(me.premium, false);
    assert.equal(me.maxSlides, 10);
    assert.equal(me.canStartTrial, true);
    assert.equal(me.onboardingCompleted, false);
  });
  it("a trialing user: premium, 20 slides, trial end shown, can't start another", async () => {
    const u = await mkUser(t.sql, "trialing@example.test");
    await t.sql`insert into subscriptions (user_id, stripe_customer_id, status, trial_end, current_period_end, has_used_trial)
                values (${u}, 'cus_t', 'trialing', now() + interval '5 days', now() + interval '5 days', true)`;
    const me = await getMe(t.db, { id: u, email: "t@example.test" });
    assert.equal(me.premium, true);
    assert.equal(me.maxSlides, 20);
    assert.ok(me.trialEndsAt);
    assert.equal(me.canStartTrial, false);
  });
});

