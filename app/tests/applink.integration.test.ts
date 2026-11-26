/**
 * End-to-end checks of the money and messaging flows against a real Postgres and a scriptable
 * AppLink double. Run with a local database:
 *   TEST_DATABASE_URL=postgres://postgres:nutriscan@127.0.0.1:54329/nutriscan_test pnpm test
 * Skipped when TEST_DATABASE_URL is not set.
 */
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startFakeApplink } from "./helpers/fake-applink";

const TEST_DB = process.env.TEST_DATABASE_URL;
const suite = TEST_DB ? describe : describe.skip;

type Fake = Awaited<ReturnType<typeof startFakeApplink>>;

suite("AppLink flows (integration)", () => {
  let fake: Fake;
  // Modules are imported after the environment is set, because env.ts validates at import.
  let m: {
    db: typeof import("../server/db/client")["db"];
    rawSql: typeof import("../server/db/client")["rawSql"];
    charges: typeof import("../server/premium/charges");
    access: typeof import("../server/premium/access");
    sub: typeof import("../server/premium/subscription");
    ussd: typeof import("../server/applink/ussd");
    alerts: typeof import("../server/alerts");
    callbacks: typeof import("../server/applink/callbacks");
    schema: typeof import("../server/db/schema");
  };
  const user = () => randomUUID();

  beforeAll(async () => {
    fake = await startFakeApplink();
    Object.assign(process.env, {
      NODE_ENV: "test",
      DATABASE_URL: TEST_DB,
      APPLINK_APP_ID: "APP_000001",
      APPLINK_PASSWORD: "test-password",
      APPLINK_CAAS_DEBIT_URL: fake.url("/caas/direct/debit"),
      APPLINK_CAAS_OTP_VERIFY_URL: fake.url("/caas/otp/verify"),
      APPLINK_OTP_REQUEST_URL: fake.url("/otp/request"),
      APPLINK_OTP_VERIFY_URL: fake.url("/otp/verify"),
      APPLINK_SUBSCRIPTION_SEND_URL: fake.url("/subscription/send"),
      APPLINK_SMS_SEND_URL: fake.url("/sms/send"),
      APPLINK_USSD_SEND_URL: fake.url("/ussd/send"),
    });
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const postgres = (await import("postgres")).default;
    const admin = postgres(TEST_DB!.replace(/\/[^/]+$/, "/postgres"), { max: 1 });
    const dbName = TEST_DB!.split("/").pop()!;
    const exists = await admin`select 1 from pg_database where datname = ${dbName}`;
    if (exists.length === 0) await admin.unsafe(`create database "${dbName}"`);
    await admin.end();
    const mig = postgres(TEST_DB!, { max: 1, onnotice: () => {} });
    await migrate(drizzle(mig), { migrationsFolder: "server/db/migrations" });
    await mig.end();

    const client = await import("../server/db/client");
    m = {
      db: client.db,
      rawSql: client.rawSql,
      charges: await import("../server/premium/charges"),
      access: await import("../server/premium/access"),
      sub: await import("../server/premium/subscription"),
      ussd: await import("../server/applink/ussd"),
      alerts: await import("../server/alerts"),
      callbacks: await import("../server/applink/callbacks"),
      schema: client.schema,
    };
  }, 60_000);

  beforeEach(async () => {
    fake.reset();
    await m.rawSql.unsafe(
      "truncate charges, entitlements, consents, phone_links, subscriptions, otp_requests, applink_events, ussd_sessions, profiles, history, favorites, recalls, alert_sends, notifications, ai_usage restart identity",
    );
  });

  afterAll(async () => {
    await m?.rawSql.end();
    await fake?.close();
  });

  const notify = (id: string, over: Record<string, string> = {}) =>
    m.charges.applyChargingNotification(m.db, {
      externalTrxId: id,
      statusCode: "S1000",
      paidAmount: "5.00",
      balanceDue: "0",
      currency: "BDT",
      ...over,
    });

  it("sends request bodies that pass the official AppLink validator", async () => {
    const u = user();
    const p = await m.charges.startPurchase(m.db, u, "compare_pass", "01912345678");
    await m.charges.confirmPurchase(m.db, u, p.id, "123456");
    if (fake.hasValidator) {
      for (const r of fake.recorded) expect(r.problems, r.path).toEqual([]);
    }
    const debit = fake.recorded.find((r) => r.path === "/caas/direct/debit")!.body;
    expect(debit).toMatchObject({ amount: "5.00", Currency: "BDT", subscriberId: "tel:8801912345678" });
  });

  it("CaaS: P1003 and a verified OTP grant nothing; only the notification grants, once", async () => {
    const u = user();
    const p = await m.charges.startPurchase(m.db, u, "compare_pass", "01912345678");
    expect(p.status).toBe("OTP_SENT");
    expect((await m.access.getAccess(m.db, u)).comparePassUses).toBe(0);

    const c = await m.charges.confirmPurchase(m.db, u, p.id, "123456");
    expect(c.status).toBe("VERIFYING");
    expect((await m.access.getAccess(m.db, u)).comparePassUses).toBe(0);

    expect(await notify(p.id)).toBe("granted");
    expect(await notify(p.id)).toBe("ignored"); // redelivery
    const a = await m.access.getAccess(m.db, u);
    expect(a.comparePassUses).toBe(5);
    const rows = await m.db.select().from(m.schema.entitlements);
    expect(rows).toHaveLength(1);
  });

  it("CaaS: a wrong OTP retries against the same correlator, never a new charge", async () => {
    const u = user();
    const p = await m.charges.startPurchase(m.db, u, "nouri_pass", "01912345678");
    fake.next("/caas/otp/verify", () => ({ statusCode: "E1850", statusDetail: "Invalid OTP" }));
    const wrong = await m.charges.confirmPurchase(m.db, u, p.id, "000000");
    expect(wrong.status).toBe("OTP_SENT");
    expect(wrong.otpAttemptsLeft).toBe(2);
    await m.charges.confirmPurchase(m.db, u, p.id, "123456");
    const verifies = fake.recorded.filter((r) => r.path === "/caas/otp/verify").map((r) => r.body.referenceNo);
    expect(new Set(verifies).size).toBe(1);
    expect(fake.recorded.filter((r) => r.path === "/caas/direct/debit")).toHaveLength(1);
  });

  it("CaaS: a timeout is UNKNOWN and is not retried", async () => {
    const u = user();
    fake.next("/caas/direct/debit", () => "timeout");
    const p = await m.charges.startPurchase(m.db, u, "day_pass", "01412345678");
    expect(p.status).toBe("UNKNOWN");
    expect(fake.recorded.filter((r) => r.path === "/caas/direct/debit")).toHaveLength(1);
  }, 30_000);

  it("CaaS: an underpaid or failed notification grants nothing", async () => {
    const u = user();
    const p1 = await m.charges.startPurchase(m.db, u, "compare_pass", "01912345678");
    expect(await notify(p1.id, { paidAmount: "4.00", balanceDue: "1.00" })).toBe("partial");
    const p2 = await m.charges.startPurchase(m.db, u, "compare_pass", "01912345678");
    expect(await notify(p2.id, { statusCode: "E1326", statusDetail: "Insufficient balance" })).toBe("failed");
    expect((await m.access.getAccess(m.db, u)).comparePassUses).toBe(0);
  });

  it("does not sell a pass to a Premium user, and rejects non-Banglalink numbers", async () => {
    const u = user();
    await m.access.startTrial(m.db, u);
    await expect(m.charges.startPurchase(m.db, u, "compare_pass", "01912345678")).rejects.toMatchObject({ code: "already_premium" });
    const v = user();
    await expect(m.charges.startPurchase(m.db, v, "compare_pass", "01712345678")).rejects.toMatchObject({ code: "invalid_number" });
  });

  it("trial is granted once per account", async () => {
    const u = user();
    expect((await m.access.startTrial(m.db, u)).started).toBe(true);
    expect((await m.access.startTrial(m.db, u)).started).toBe(false);
    const a = await m.access.getAccess(m.db, u);
    expect(a.premium).toBe(true);
    expect(a.premiumSource).toBe("trial");
    expect(a.nouriDailyLimit).toBe(20);
  });

  it("passes cannot be double-spent by parallel requests", async () => {
    const u = user();
    await m.access.grantForCharge(m.db, u, "compare_pass", "x1");
    const results = await Promise.all(Array.from({ length: 8 }, () => m.access.consumePass(m.db, u, "compare_pass")));
    expect(results.filter(Boolean)).toHaveLength(5);
  });

  it("subscription: OTP verify links the number and the notification is the authority", async () => {
    const u = user();
    const { requestId } = await m.sub.requestSubscription(m.db, u, "01912345678", "10.0.0.1");
    expect(JSON.stringify(await m.db.select().from(m.schema.consents))).toContain("BDT 29.00 per month");
    const v = await m.sub.verifySubscription(m.db, u, requestId, "123456");
    expect(v.ok).toBe(true);
    let a = await m.access.getAccess(m.db, u);
    expect(a.premium).toBe(true);
    expect(a.premiumSource).toBe("subscription");

    await m.sub.applySubscriptionNotification(m.db, { subscriberId: "tel:8801912345678", status: "UNREGISTERED", frequency: "monthly" });
    a = await m.access.getAccess(m.db, u);
    expect(a.premium).toBe(false);
  });

  it("subscription: rate-limits codes to one per number per minute", async () => {
    const u = user();
    await m.sub.requestSubscription(m.db, u, "01912345678", "10.0.0.2");
    await expect(m.sub.requestSubscription(m.db, u, "01912345678", "10.0.0.2")).rejects.toMatchObject({ code: "too_many_attempts" });
  });

  it("subscription: expired and wrong codes are handled", async () => {
    const u = user();
    const { requestId } = await m.sub.requestSubscription(m.db, u, "01912345678", null);
    fake.next("/otp/verify", () => ({ statusCode: "E1850", statusDetail: "Invalid OTP" }));
    expect(await m.sub.verifySubscription(m.db, u, requestId, "1")).toMatchObject({ ok: false, reason: "wrong_code", attemptsLeft: 2 });
    fake.next("/otp/verify", () => ({ statusCode: "E1851", statusDetail: "OTP expired" }));
    expect(await m.sub.verifySubscription(m.db, u, requestId, "2")).toMatchObject({ ok: false, reason: "expired" });
  });

  it("callbacks: password is redacted and redelivery is ignored", () => {
    const body = { applicationId: "APP_000001", password: "secret", subscriberId: "tel:1", status: "REGISTERED", timeStamp: "1" };
    expect(m.callbacks.redact(body).password).toBe("[redacted]");
    expect(m.callbacks.dedupeKey("subscription_notify", body)).toBe("tel:1|REGISTERED|1");
    expect(m.callbacks.dedupeKey("caas_notify", { externalTrxId: "a", statusCode: "S1000" })).toBe("a|S1000");
  });

  it("callbacks: the HTTP route stores, acknowledges and processes a charging notification", async () => {
    const express = (await import("express")).default;
    const app = express();
    app.use("/applink", m.callbacks.applinkCallbackRouter());
    const srv = app.listen(0);
    const port = (srv.address() as AddressInfo).port;
    try {
      const u = user();
      const p = await m.charges.startPurchase(m.db, u, "compare_pass", "01912345678");
      const send = () =>
        fetch(`http://127.0.0.1:${port}/applink/caas/notify`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ externalTrxId: p.id, statusCode: "S1000", paidAmount: "5.00", balanceDue: "0", currency: "BDT", TotalAmount: "5.00" }),
        }).then((r) => r.json());
      expect(await send()).toEqual({ statusCode: "S1000", statusDetail: "Success" });
      expect(await send()).toEqual({ statusCode: "S1000", statusDetail: "Success" });
      await new Promise((r) => setTimeout(r, 300));
      expect((await m.access.getAccess(m.db, u)).comparePassUses).toBe(5);
      expect(await m.db.select().from(m.schema.applinkEvents)).toHaveLength(1);
    } finally {
      srv.close();
    }
  });

  it("USSD: menu, barcode prompt, product result in plain ASCII under 160 characters", async () => {
    const s = { sessionId: "S1", sourceAddress: "tel:8801912345678" };
    const r1 = await m.ussd.handleUssd(m.db, { ...s, message: "*213#", ussdOperation: "mo-init" });
    expect(r1.operation).toBe("mt-cont");
    expect(r1.message).toContain("1 Check a product");
    const r2 = await m.ussd.handleUssd(m.db, { ...s, message: "1", ussdOperation: "mo-cont" });
    expect(r2.message).toContain("barcode");
    const r3 = await m.ussd.handleUssd(m.db, { ...s, message: "8941154036281", ussdOperation: "mo-cont" });
    expect(r3.operation).toBe("mt-fin");
    expect(r3.message).toMatch(/Score \d+\/100/);
    expect(r3.message.length).toBeLessThanOrEqual(160);
    expect(/^[\x20-\x7e\n]*$/.test(r3.message)).toBe(true);
    const sends = fake.recorded.filter((r) => r.path === "/ussd/send");
    expect(sends.every((x) => x.body.sessionId === "S1")).toBe(true);
    expect(sends.at(-1)!.body.ussdOperation).toBe("mt-fin");
  });

  it("USSD: unknown barcodes and bad input are handled", async () => {
    const s = { sessionId: "S2", sourceAddress: "tel:8801912345678" };
    await m.ussd.handleUssd(m.db, { ...s, message: "*213#", ussdOperation: "mo-init" });
    expect((await m.ussd.handleUssd(m.db, { ...s, message: "9", ussdOperation: "mo-cont" })).message).toContain("Invalid option");
    await m.ussd.handleUssd(m.db, { ...s, message: "1", ussdOperation: "mo-cont" });
    expect((await m.ussd.handleUssd(m.db, { ...s, message: "abc", ussdOperation: "mo-cont" })).operation).toBe("mt-cont");
    expect((await m.ussd.handleUssd(m.db, { ...s, message: "12345678", ussdOperation: "mo-cont" })).message).toContain("Not in NutriScan");
  });

  it("alerts: recall needs a second approver; SMS only reaches opted-in users", async () => {
    const creator = user();
    const approver = user();
    const optedIn = user();
    const notOpted = user();
    const pid = (await import("../server/catalog")).allProducts().find((p) => p.kind === "food")!.id;
    for (const u of [optedIn, notOpted]) await m.db.insert(m.schema.history).values({ userId: u, productId: pid, source: "scan" });
    await m.db.insert(m.schema.phoneLinks).values({ userId: optedIn, subscriberId: "tel:8801911111111" });
    await m.db.insert(m.schema.profiles).values({ userId: optedIn, smsAlertsOptIn: true });

    const r = await m.alerts.createRecall(m.db, creator, {
      title: "Recall of batch 42",
      body: "The manufacturer recalled batch 42.",
      shortText: "Batch 42 recalled by the maker.",
      sourceUrl: "https://example.org/notice",
      productIds: [pid],
      isTest: false,
    });
    await expect(m.alerts.approveRecall(m.db, r.id, creator)).rejects.toThrow(/different team member/);
    const out = await m.alerts.approveRecall(m.db, r.id, approver);
    expect(out.inapp).toBe(2);
    expect(out.sms).toBe(1);
    expect(fake.recorded.filter((x) => x.path === "/sms/send").every((x) => (x.body.destinationAddresses as string[])[0] !== "tel:all")).toBe(true);

    expect(await m.alerts.applyIncomingSms(m.db, { sourceAddress: "tel:8801911111111", message: "stop" })).toBe("stopped");
  });
});
