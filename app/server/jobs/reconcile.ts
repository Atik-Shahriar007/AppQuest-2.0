/**
 * Reconciliation (AppLink skill: "a scheduled sweep of getSubscriberChargingInfo" and
 * "charges stuck in UNKNOWN are resolved from the notification or by support, never re-sent").
 */
import { and, asc, eq, lt, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { otpRequests, subscriptions } from "../db/schema";
import { getSubscriberChargingInfo } from "../applink/client";
import { isEnabled } from "../applink/config";
import { staleCharges } from "../premium/charges";

/** Re-check mirrored subscriptions not confirmed in the last day, at most 10 per call. */
export async function sweepSubscriptions(db: Db, maxBatches = 5) {
  if (!isEnabled("subscriptionChargingInfo")) return { checked: 0, changed: 0 };
  const cutoff = new Date(Date.now() - 24 * 3600_000);
  let checked = 0;
  let changed = 0;
  for (let b = 0; b < maxBatches; b++) {
    const rows = await db
      .select()
      .from(subscriptions)
      .where(lt(subscriptions.lastConfirmedAt, cutoff))
      .orderBy(asc(subscriptions.lastConfirmedAt))
      .limit(10);
    if (rows.length === 0) break;
    const res = await getSubscriberChargingInfo(rows.map((r) => r.subscriberId));
    const seen = new Set<string>();
    for (const d of res.destinationResponses ?? []) {
      if (!d.subscriberId || d.statusCode !== "S1000" || !d.subscriptionStatus) continue;
      seen.add(d.subscriberId);
      const row = rows.find((r) => r.subscriberId === d.subscriberId);
      const status = d.subscriptionStatus.replace(/\.$/, "").toUpperCase();
      if (row && row.status !== status) changed++;
      await db
        .update(subscriptions)
        .set({ status, lastConfirmedAt: new Date(), confirmedBy: "sweep" })
        .where(eq(subscriptions.subscriberId, d.subscriberId));
    }
    // Rows AppLink did not answer for: push their timestamp so the sweep moves on.
    for (const r of rows) {
      if (!seen.has(r.subscriberId)) {
        await db.update(subscriptions).set({ lastConfirmedAt: sql`now() - interval '23 hours'` }).where(eq(subscriptions.subscriberId, r.subscriberId));
      }
    }
    checked += rows.length;
  }
  return { checked, changed };
}

/** Charges with no outcome after an hour: flag for support. Never re-sent automatically. */
export async function flagStaleCharges(db: Db) {
  const rows = await staleCharges(db, 60);
  for (const r of rows) {
    console.warn(
      `[reconcile] charge ${r.externalTrxId} (${r.sku}, BDT ${r.amountBdt}) is ${r.status} since ${r.updatedAt.toISOString()}; ` +
        `resolve from the charging notification or contact AppLink support with internalTrxId ${r.internalTrxId ?? "unknown"}`,
    );
  }
  return rows.length;
}

/** Mark expired OTP requests so they can never be verified late. */
export async function expireOtpRequests(db: Db) {
  const rows = await db
    .update(otpRequests)
    .set({ status: "expired" })
    .where(and(eq(otpRequests.status, "pending"), lt(otpRequests.expiresAt, new Date())))
    .returning({ id: otpRequests.id });
  return rows.length;
}
