/**
 * Monthly Premium through AppLink Subscription.
 *
 * AppLink's /otp/verify ACTIVATES the subscription (official docs), so the OTP flow here is the
 * subscribe flow, entered only after the price disclosure (teammate decision 2). Login never
 * uses it.
 */
import { createHash } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { consents, otpRequests, phoneLinks, subscriptions } from "../db/schema";
import { ApplinkError, requestOtp, unregister, verifyOtp } from "../applink/client";
import { ApplinkNotConfiguredError } from "../applink/config";
import { SUBSCRIPTION_DISCLOSURE } from "./catalog";
import { normaliseBanglalinkNumber, PurchaseError } from "./charges";

const OTP_TTL_MS = 5 * 60_000; // AppLink OTPs are valid for five minutes
const MAX_VERIFY_ATTEMPTS = 3;
const LIMITS = { perNumberMinute: 1, perNumberDay: 5, perIpHour: 10, perUserDay: 5 };

export function hashMsisdn(addr: string): string {
  return createHash("sha256").update(`nutriscan:${addr}`).digest("hex");
}

async function countSince(db: Db, column: "msisdn" | "ip" | "user", value: string, since: Date): Promise<number> {
  const col = column === "msisdn" ? otpRequests.msisdnHash : column === "ip" ? otpRequests.ip : otpRequests.userId;
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(otpRequests)
    .where(and(eq(col, value), gte(otpRequests.createdAt, since)));
  return n;
}

export async function requestSubscription(db: Db, userId: string, msisdn: string, ip: string | null) {
  const addr = normaliseBanglalinkNumber(msisdn);
  const msisdnHash = hashMsisdn(addr);
  const now = Date.now();

  const [owner] = await db.select().from(phoneLinks).where(eq(phoneLinks.subscriberId, addr));
  if (owner && owner.userId !== userId) {
    throw new PurchaseError("number_linked_elsewhere", "This number is linked to another NutriScan account.");
  }

  // Every OTP is a real SMS: rate-limit per number, per IP and per account.
  if (
    (await countSince(db, "msisdn", msisdnHash, new Date(now - 60_000))) >= LIMITS.perNumberMinute ||
    (await countSince(db, "msisdn", msisdnHash, new Date(now - 86_400_000))) >= LIMITS.perNumberDay ||
    (ip && (await countSince(db, "ip", ip, new Date(now - 3_600_000))) >= LIMITS.perIpHour) ||
    (await countSince(db, "user", userId, new Date(now - 86_400_000))) >= LIMITS.perUserDay
  ) {
    throw new PurchaseError("too_many_attempts", "Too many codes requested. Please wait and try again.");
  }

  const [row] = await db
    .insert(otpRequests)
    .values({ userId, msisdnHash, purpose: "subscribe", ip, expiresAt: new Date(now + OTP_TTL_MS) })
    .returning();
  await db.insert(consents).values({
    userId,
    kind: "subscription",
    textShown: SUBSCRIPTION_DISCLOSURE,
    amountBdt: "29.00",
    channel: "app",
    ref: row.id,
  });

  try {
    const res = await requestOtp({
      subscriberId: addr,
      metaData: { client: "MOBILEAPP", device: "unknown", os: "unknown", appCode: "nutriscan" },
    });
    await db.update(otpRequests).set({ referenceNo: res.referenceNo }).where(eq(otpRequests.id, row.id));
  } catch (err) {
    await db.update(otpRequests).set({ status: "failed" }).where(eq(otpRequests.id, row.id));
    if (err instanceof ApplinkNotConfiguredError) throw new PurchaseError("not_configured", "Premium sign-up is not available yet.");
    if (err instanceof ApplinkError) {
      throw new PurchaseError("applink_error", "We could not send the code. Please try again later.", err.statusCode);
    }
    throw new PurchaseError("applink_error", "We could not reach Banglalink. Please try again.");
  }
  // The referenceNo never leaves the server; the app only gets our request id.
  return { requestId: row.id, expiresAt: row.expiresAt.toISOString() };
}

export type VerifyResult =
  | { ok: true; status: string }
  | { ok: false; reason: "wrong_code" | "expired" | "too_many_attempts" | "failed"; attemptsLeft: number };

export async function verifySubscription(db: Db, userId: string, requestId: string, otp: string): Promise<VerifyResult> {
  const [req] = await db
    .update(otpRequests)
    .set({ attempts: sql`${otpRequests.attempts} + 1` })
    .where(
      and(
        eq(otpRequests.id, requestId),
        eq(otpRequests.userId, userId),
        eq(otpRequests.status, "pending"),
        sql`${otpRequests.attempts} < ${MAX_VERIFY_ATTEMPTS}`,
      ),
    )
    .returning();
  if (!req || !req.referenceNo) return { ok: false, reason: "too_many_attempts", attemptsLeft: 0 };
  if (req.expiresAt.getTime() < Date.now()) {
    await db.update(otpRequests).set({ status: "expired" }).where(eq(otpRequests.id, req.id));
    return { ok: false, reason: "expired", attemptsLeft: 0 };
  }
  const attemptsLeft = MAX_VERIFY_ATTEMPTS - req.attempts;

  try {
    const res = await verifyOtp({ referenceNo: req.referenceNo, otp: otp.trim() });
    const subscriberId = res.subscriberId;
    if (!subscriberId) return { ok: false, reason: "failed", attemptsLeft };
    await db.transaction(async (tx) => {
      await tx.update(otpRequests).set({ status: "verified" }).where(eq(otpRequests.id, req.id));
      await tx.insert(phoneLinks).values({ userId, subscriberId }).onConflictDoUpdate({
        target: phoneLinks.userId,
        set: { subscriberId, linkedAt: new Date() },
      });
      const status = (res.subscriptionStatus ?? "REG_PENDING").replace(/\.$/, "").toUpperCase();
      await tx
        .insert(subscriptions)
        .values({ subscriberId, userId, status, confirmedBy: "api_response" })
        .onConflictDoUpdate({
          target: subscriptions.subscriberId,
          set: { userId, status, lastConfirmedAt: new Date(), confirmedBy: "api_response" },
        });
    });
    return { ok: true, status: res.subscriptionStatus ?? "REG_PENDING" };
  } catch (err) {
    if (err instanceof ApplinkError) {
      if (err.statusCode === "E1850") {
        if (attemptsLeft <= 0) await db.update(otpRequests).set({ status: "failed" }).where(eq(otpRequests.id, req.id));
        return { ok: false, reason: attemptsLeft > 0 ? "wrong_code" : "too_many_attempts", attemptsLeft };
      }
      if (err.statusCode === "E1851") {
        await db.update(otpRequests).set({ status: "expired" }).where(eq(otpRequests.id, req.id));
        return { ok: false, reason: "expired", attemptsLeft: 0 };
      }
    }
    await db.update(otpRequests).set({ status: "failed" }).where(eq(otpRequests.id, req.id));
    return { ok: false, reason: "failed", attemptsLeft: 0 };
  }
}

/** Cancel: same function for the app button, USSD option and the STOP SMS keyword. */
export async function cancelSubscription(db: Db, subscriberId: string, channel: "app" | "ussd" | "sms") {
  const res = await unregister(subscriberId);
  const status = (res.subscriptionStatus ?? "UNREGISTERED").replace(/\.$/, "").toUpperCase();
  await db
    .update(subscriptions)
    .set({ status: status.startsWith("UNREGISTERED") ? "UNREGISTERED" : status, lastConfirmedAt: new Date(), confirmedBy: "api_response" })
    .where(eq(subscriptions.subscriberId, subscriberId));
  const [link] = await db.select().from(phoneLinks).where(eq(phoneLinks.subscriberId, subscriberId));
  if (link) {
    await db.insert(consents).values({ userId: link.userId, kind: "unsubscribe", textShown: "Cancelled NutriScan Premium", channel });
  }
  return { status };
}

/** Subscriber notification: the authority on subscription state. */
export async function applySubscriptionNotification(
  db: Db,
  n: { subscriberId?: string; status?: string; frequency?: string },
) {
  if (!n.subscriberId || !n.status) return "ignored";
  const status = n.status.replace(/\.$/, "").toUpperCase();
  const [link] = await db.select().from(phoneLinks).where(eq(phoneLinks.subscriberId, n.subscriberId));
  await db
    .insert(subscriptions)
    .values({
      subscriberId: n.subscriberId,
      userId: link?.userId ?? null,
      status,
      frequency: n.frequency ?? null,
      confirmedBy: "notification",
    })
    .onConflictDoUpdate({
      target: subscriptions.subscriberId,
      set: { status, frequency: n.frequency ?? null, lastConfirmedAt: new Date(), confirmedBy: "notification" },
    });
  return "applied";
}
