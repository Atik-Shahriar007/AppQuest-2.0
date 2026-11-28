/**
 * CaaS micro-purchases. AppLink charging is two calls, and only the charging notification is
 * authoritative (AppLink skill, references/05-caas.md):
 *
 *   PENDING --debit P1003--> OTP_SENT --verify--> VERIFYING --notification S1000--> CHARGED
 *
 * Rules enforced here:
 * - the ledger row (with our externalTrxId) is written BEFORE the AppLink call;
 * - a timeout is UNKNOWN and is never retried by starting a new charge;
 * - a wrong OTP retries against the SAME requestCorrelator;
 * - access is granted only by the notification, with the paid amount checked in poisha.
 */
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { charges, consents, phoneLinks } from "../db/schema";
import { ApplinkError, confirmCharge, generateExternalTrxId, startCharge, toTelAddress } from "../applink/client";
import { ApplinkNotConfiguredError } from "../applink/config";
import { getAccess, grantForCharge } from "./access";
import { SKUS, toPoisha, type Sku } from "./catalog";

export const MAX_OTP_ATTEMPTS = 3;
const MAX_OPEN_CHARGES_PER_HOUR = 5;

export class PurchaseError extends Error {
  constructor(
    readonly code:
      | "not_configured"
      | "invalid_number"
      | "already_premium"
      | "too_many_attempts"
      | "not_found"
      | "wrong_state"
      | "number_linked_elsewhere"
      | "applink_error",
    message: string,
    readonly applinkCode?: string,
  ) {
    super(message);
    this.name = "PurchaseError";
  }
}

/** Banglalink numbers only (AppLink runs on Banglalink): 019 and 014 prefixes. */
export function normaliseBanglalinkNumber(input: string): string {
  let addr: string;
  try {
    addr = toTelAddress(input);
  } catch {
    throw new PurchaseError("invalid_number", "Enter a Banglalink mobile number.");
  }
  if (!/^tel:8801[49]\d{8}$/.test(addr)) {
    throw new PurchaseError("invalid_number", "Enter a Banglalink number starting with 019 or 014.");
  }
  return addr;
}

export type PurchaseView = {
  id: string;
  sku: Sku;
  amountBdt: string;
  status: string;
  message: string;
  otpAttemptsLeft: number;
};

function view(row: typeof charges.$inferSelect): PurchaseView {
  const messages: Record<string, string> = {
    PENDING: "Starting payment...",
    OTP_SENT: "Enter the payment code sent to your phone by SMS.",
    VERIFYING: "Confirming your payment with Banglalink...",
    CHARGED: "Payment confirmed. Your pass is active.",
    FAILED: row.statusCode === "E1326" ? "Not enough balance. Please recharge and try again." : "The payment did not go through. You were not charged.",
    EXPIRED: "The payment code expired. You were not charged. Start again if you still want the pass.",
    UNKNOWN: "We are waiting for Banglalink to confirm this payment. Do not pay again. We will update this automatically.",
    PARTIAL: "Banglalink reported a partial payment. Our team will review it.",
  };
  return {
    id: row.externalTrxId,
    sku: row.sku as Sku,
    amountBdt: row.amountBdt,
    status: row.status,
    message: messages[row.status] ?? row.status,
    otpAttemptsLeft: Math.max(0, MAX_OTP_ATTEMPTS - row.otpAttempts),
  };
}

export async function startPurchase(db: Db, userId: string, sku: Sku, msisdn: string): Promise<PurchaseView> {
  const def = SKUS[sku];
  if (!def) throw new PurchaseError("not_found", "Unknown pass.");
  const subscriberId = normaliseBanglalinkNumber(msisdn);

  // A number already linked to another account cannot be charged for this one.
  const [owner] = await db.select().from(phoneLinks).where(eq(phoneLinks.subscriberId, subscriberId));
  if (owner && owner.userId !== userId) {
    throw new PurchaseError("number_linked_elsewhere", "This number is linked to another NutriScan account.");
  }

  // Do not sell what the user already has.
  const access = await getAccess(db, userId);
  if (access.premium) {
    throw new PurchaseError("already_premium", "You already have Premium, which includes this.");
  }

  const hourAgo = new Date(Date.now() - 3600_000);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(charges)
    .where(and(eq(charges.userId, userId), gte(charges.createdAt, hourAgo)));
  if (n >= MAX_OPEN_CHARGES_PER_HOUR) {
    throw new PurchaseError("too_many_attempts", "Too many payment attempts. Please try again in an hour.");
  }

  // 1. Persist the ledger row and the consent BEFORE calling AppLink.
  const externalTrxId = generateExternalTrxId();
  await db.insert(charges).values({ externalTrxId, userId, subscriberId, sku, amountBdt: def.amountBdt, status: "PENDING" });
  await db.insert(consents).values({
    userId,
    kind: "charge",
    textShown: def.disclosure,
    amountBdt: def.amountBdt,
    channel: "app",
    ref: externalTrxId,
  });

  // 2. Step one: AppLink sends the payment OTP. Nothing is charged yet.
  try {
    const res = await startCharge({ subscriberId, amount: def.amountBdt, externalTrxId });
    if (res.statusCode !== "P1003" || res.externalTrxId !== externalTrxId || !res.requestCorrelator) {
      // Anything but a clean P1003 with our id echoed back is not a started charge we can complete.
      const [row] = await db
        .update(charges)
        .set({ status: "UNKNOWN", statusCode: res.statusCode, statusDetail: res.statusDetail, updatedAt: new Date() })
        .where(eq(charges.externalTrxId, externalTrxId))
        .returning();
      return view(row);
    }
    const [row] = await db
      .update(charges)
      .set({
        status: "OTP_SENT",
        requestCorrelator: res.requestCorrelator,
        internalTrxId: res.internalTrxId ?? null,
        statusCode: res.statusCode,
        statusDetail: res.statusDetail,
        updatedAt: new Date(),
      })
      .where(eq(charges.externalTrxId, externalTrxId))
      .returning();
    return view(row);
  } catch (err) {
    if (err instanceof ApplinkNotConfiguredError) {
      await db.update(charges).set({ status: "FAILED", statusDetail: "not configured" }).where(eq(charges.externalTrxId, externalTrxId));
      throw new PurchaseError("not_configured", "Payments are not available yet.");
    }
    if (err instanceof ApplinkError) {
      // E1337: AppLink already has this transaction - settle it from the notification, never re-send.
      const status = err.statusCode === "E1337" ? "UNKNOWN" : "FAILED";
      const [row] = await db
        .update(charges)
        .set({ status, statusCode: err.statusCode, statusDetail: err.statusDetail, updatedAt: new Date() })
        .where(eq(charges.externalTrxId, externalTrxId))
        .returning();
      return view(row);
    }
    // Timeout or network error: the charge may or may not have started. Never re-send.
    const [row] = await db
      .update(charges)
      .set({ status: "UNKNOWN", statusDetail: "no response from AppLink", updatedAt: new Date() })
      .where(eq(charges.externalTrxId, externalTrxId))
      .returning();
    return view(row);
  }
}

export async function confirmPurchase(db: Db, userId: string, id: string, otp: string): Promise<PurchaseView> {
  if (!/^\d{4,8}$/.test(otp.trim())) throw new PurchaseError("wrong_state", "Enter the code from the SMS.");

  // Claim the row: only one confirmation can run at a time.
  const [claimed] = await db
    .update(charges)
    .set({ status: "VERIFYING", otpAttempts: sql`${charges.otpAttempts} + 1`, updatedAt: new Date() })
    .where(
      and(
        eq(charges.externalTrxId, id),
        eq(charges.userId, userId),
        eq(charges.status, "OTP_SENT"),
        sql`${charges.otpAttempts} < ${MAX_OTP_ATTEMPTS}`,
      ),
    )
    .returning();
  if (!claimed) {
    const [row] = await db.select().from(charges).where(and(eq(charges.externalTrxId, id), eq(charges.userId, userId)));
    if (!row) throw new PurchaseError("not_found", "Payment not found.");
    if (row.status === "OTP_SENT") throw new PurchaseError("too_many_attempts", "Too many wrong codes. Start again.");
    return view(row);
  }

  try {
    const res = await confirmCharge({ requestCorrelator: claimed.requestCorrelator!, otp: otp.trim(), subscriberId: claimed.subscriberId });
    // S1000 here means AppLink accepted the OTP. Money is settled by the notification.
    const [row] = await db
      .update(charges)
      .set({ statusCode: res.statusCode, statusDetail: res.statusDetail, updatedAt: new Date() })
      .where(and(eq(charges.externalTrxId, id), eq(charges.status, "VERIFYING")))
      .returning();
    return view(row ?? claimed);
  } catch (err) {
    if (err instanceof ApplinkError) {
      const next =
        err.statusCode === "E1850"
          ? claimed.otpAttempts >= MAX_OTP_ATTEMPTS
            ? "FAILED"
            : "OTP_SENT" // wrong code: retry on the same correlator
          : err.statusCode === "E1851"
            ? "EXPIRED"
            : err.statusCode === "E1337"
              ? "UNKNOWN"
              : "FAILED";
      const [row] = await db
        .update(charges)
        .set({ status: next, statusCode: err.statusCode, statusDetail: err.statusDetail, updatedAt: new Date() })
        .where(and(eq(charges.externalTrxId, id), eq(charges.status, "VERIFYING")))
        .returning();
      return view(row ?? claimed);
    }
    const [row] = await db
      .update(charges)
      .set({ status: "UNKNOWN", statusDetail: "no response from AppLink", updatedAt: new Date() })
      .where(and(eq(charges.externalTrxId, id), eq(charges.status, "VERIFYING")))
      .returning();
    return view(row ?? claimed);
  }
}

export async function getPurchase(db: Db, userId: string, id: string): Promise<PurchaseView> {
  const [row] = await db.select().from(charges).where(and(eq(charges.externalTrxId, id), eq(charges.userId, userId)));
  if (!row) throw new PurchaseError("not_found", "Payment not found.");
  return view(row);
}

export async function listPurchases(db: Db, userId: string) {
  const rows = await db.select().from(charges).where(eq(charges.userId, userId)).orderBy(sql`${charges.createdAt} desc`).limit(50);
  return rows.map((r) => ({ ...view(r), createdAt: r.createdAt.toISOString() }));
}

export type ChargingNotification = {
  externalTrxId?: string;
  statusCode?: string;
  statusDetail?: string;
  paidAmount?: string;
  TotalAmount?: string;
  balanceDue?: string;
  internalTrxId?: string;
  currency?: string;
};

/**
 * The authoritative outcome. Idempotent: a repeated notification changes nothing, and the
 * entitlement insert is unique on the charge id.
 */
export async function applyChargingNotification(db: Db, n: ChargingNotification): Promise<"granted" | "failed" | "ignored" | "partial"> {
  if (!n.externalTrxId) return "ignored";
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(charges).where(eq(charges.externalTrxId, n.externalTrxId!)).for("update");
    if (!row) return "ignored";
    if (row.status === "CHARGED") return "ignored";

    if (n.statusCode !== "S1000") {
      await tx
        .update(charges)
        .set({ status: "FAILED", statusCode: n.statusCode ?? null, statusDetail: n.statusDetail ?? null, updatedAt: new Date() })
        .where(eq(charges.externalTrxId, row.externalTrxId));
      return "failed";
    }

    let paid: number;
    let due: number;
    try {
      paid = toPoisha(n.paidAmount ?? "0");
      due = toPoisha(n.balanceDue ?? "0");
    } catch {
      paid = -1;
      due = -1;
    }
    const fullyPaid = paid === toPoisha(row.amountBdt) && due === 0 && (n.currency ?? "BDT") === "BDT";
    await tx
      .update(charges)
      .set({
        status: fullyPaid ? "CHARGED" : "PARTIAL",
        paidAmountBdt: n.paidAmount ?? null,
        statusCode: n.statusCode,
        statusDetail: n.statusDetail ?? null,
        internalTrxId: row.internalTrxId ?? n.internalTrxId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(charges.externalTrxId, row.externalTrxId));
    if (!fullyPaid) return "partial";

    await grantForCharge(tx as unknown as Db, row.userId, row.sku as Sku, row.externalTrxId);
    // A completed CaaS charge proves the user controls this number: link it if not linked yet.
    await tx.insert(phoneLinks).values({ userId: row.userId, subscriberId: row.subscriberId }).onConflictDoNothing();
    return "granted";
  });
}

/** Charges stuck without an outcome, for the reconciliation job and support. */
export async function staleCharges(db: Db, olderThanMinutes = 60) {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  return db
    .select()
    .from(charges)
    .where(and(inArray(charges.status, ["UNKNOWN", "VERIFYING"]), sql`${charges.updatedAt} < ${cutoff.toISOString()}::timestamptz`));
}
