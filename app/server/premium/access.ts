/**
 * Entitlements: who may use which Premium feature right now. Answered from our own database
 * only, never from a live AppLink call (AppLink skill, "Identity and sessions").
 *
 * Combination rule (Plan v2 section 6): an active trial, subscription or 24-hour pass covers
 * everything, so single-use passes are not consumed while one is active.
 */
import { and, count, eq, gt, gte, inArray, isNull, or, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { aiUsage, entitlements, phoneLinks, profiles, subscriptions } from "../db/schema";
import { NOURI_DAILY_LIMIT, SKUS, TRIAL_DAYS, type Sku } from "./catalog";

export type PremiumSource = "trial" | "subscription" | "day_pass" | null;

export type Access = {
  premium: boolean;
  premiumSource: PremiumSource;
  premiumEndsAt: string | null;
  trialAvailable: boolean;
  subscriptionStatus: string | null;
  comparePassUses: number;
  nouriPassUses: number;
  nouriUsedToday: number;
  nouriDailyLimit: number;
};

const ACTIVE_SUB = new Set(["REGISTERED", "TRIAL"]);

function activeFilter(now: Date) {
  return or(isNull(entitlements.endsAt), gt(entitlements.endsAt, now));
}

export async function getAccess(db: Db, userId: string, now = new Date()): Promise<Access> {
  const rows = await db
    .select()
    .from(entitlements)
    .where(and(eq(entitlements.userId, userId), activeFilter(now)));

  const [link] = await db.select().from(phoneLinks).where(eq(phoneLinks.userId, userId));
  const [sub] = link
    ? await db.select().from(subscriptions).where(eq(subscriptions.subscriberId, link.subscriberId))
    : [];
  const [trialEver] = await db
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(eq(entitlements.sourceRef, `trial:${userId}`));

  let premiumSource: PremiumSource = null;
  let premiumEndsAt: Date | null = null;
  if (sub && ACTIVE_SUB.has(sub.status)) premiumSource = "subscription";
  for (const r of rows) {
    if (r.kind === "trial" || r.kind === "day_pass") {
      if (!premiumSource) premiumSource = r.kind;
      if (r.endsAt && (!premiumEndsAt || r.endsAt > premiumEndsAt)) premiumEndsAt = r.endsAt;
    }
  }
  const premium = premiumSource !== null;

  const usesOf = (kind: string) =>
    rows.filter((r) => r.kind === kind).reduce((s, r) => s + Math.max(0, r.usesLeft ?? 0), 0);

  const nouriUsedToday = await countNouriToday(db, userId, now);

  return {
    premium,
    premiumSource,
    premiumEndsAt: premiumSource === "subscription" ? null : (premiumEndsAt?.toISOString() ?? null),
    trialAvailable: !trialEver,
    subscriptionStatus: sub?.status ?? null,
    comparePassUses: usesOf("compare_pass"),
    nouriPassUses: usesOf("nouri_pass"),
    nouriUsedToday,
    nouriDailyLimit: premium ? NOURI_DAILY_LIMIT.premium : NOURI_DAILY_LIMIT.free,
  };
}

/** Start of the current day in Bangladesh (UTC+6, no DST). */
export function startOfDhakaDay(now: Date): Date {
  const offsetMs = 6 * 3600_000;
  const local = new Date(now.getTime() + offsetMs);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offsetMs);
}

async function countNouriToday(db: Db, userId: string, now: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), eq(aiUsage.feature, "nouri_message"), gte(aiUsage.createdAt, startOfDhakaDay(now))));
  return Number(row?.n ?? 0);
}

/** One free 30-day trial per account, granted by our backend. Nothing is charged. */
export async function startTrial(db: Db, userId: string, now = new Date()): Promise<{ started: boolean }> {
  const ends = new Date(now.getTime() + TRIAL_DAYS * 24 * 3600_000);
  const inserted = await db
    .insert(entitlements)
    .values({ userId, kind: "trial", startsAt: now, endsAt: ends, sourceRef: `trial:${userId}` })
    .onConflictDoNothing({ target: entitlements.sourceRef })
    .returning({ id: entitlements.id });
  if (inserted.length > 0) {
    await db
      .insert(profiles)
      .values({ userId, trialStartedAt: now })
      .onConflictDoUpdate({ target: profiles.userId, set: { trialStartedAt: now } });
  }
  return { started: inserted.length > 0 };
}

/**
 * Atomically use one unit of a pass. Returns false if none is left.
 * The UPDATE ... WHERE uses_left > 0 makes two parallel requests unable to spend the same unit.
 */
export async function consumePass(db: Db, userId: string, kind: "compare_pass" | "nouri_pass", now = new Date()) {
  const result = await db.execute(sql`
    UPDATE ${entitlements} SET uses_left = uses_left - 1
    WHERE id = (
      SELECT id FROM ${entitlements}
      WHERE user_id = ${userId} AND kind = ${kind} AND uses_left > 0
        AND (ends_at IS NULL OR ends_at > ${now.toISOString()}::timestamptz)
      ORDER BY ends_at ASC NULLS LAST
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`);
  return (result as unknown as unknown[]).length > 0;
}

export type Gate = { allowed: true; usedPass: boolean } | { allowed: false; reason: "premium_required" | "daily_limit" };

/** Advanced comparison: Premium, or one Comparison Pass use. Basic comparison is always free. */
export async function gateAdvancedCompare(db: Db, userId: string, now = new Date()): Promise<Gate> {
  const access = await getAccess(db, userId, now);
  if (access.premium) return { allowed: true, usedPass: false };
  if (await consumePass(db, userId, "compare_pass", now)) return { allowed: true, usedPass: true };
  return { allowed: false, reason: "premium_required" };
}

/** Nouri: the daily allowance first (5 free, 20 Premium), then Nouri Pass messages. */
export async function gateNouriMessage(db: Db, userId: string, now = new Date()): Promise<Gate> {
  const access = await getAccess(db, userId, now);
  if (access.nouriUsedToday < access.nouriDailyLimit) return { allowed: true, usedPass: false };
  if (await consumePass(db, userId, "nouri_pass", now)) return { allowed: true, usedPass: true };
  return { allowed: false, reason: "daily_limit" };
}

/** Grant the entitlement a confirmed charge paid for. Idempotent on the charge id. */
export async function grantForCharge(db: Db, userId: string, sku: Sku, externalTrxId: string, now = new Date()) {
  const def = SKUS[sku];
  await db
    .insert(entitlements)
    .values({
      userId,
      kind: sku,
      startsAt: now,
      endsAt: new Date(now.getTime() + def.durationHours * 3600_000),
      usesTotal: def.uses,
      usesLeft: def.uses,
      sourceRef: `charge:${externalTrxId}`,
    })
    .onConflictDoNothing({ target: entitlements.sourceRef });
}

export async function usersWithSubscriber(db: Db, subscriberIds: string[]) {
  if (subscriberIds.length === 0) return [];
  return db.select().from(phoneLinks).where(inArray(phoneLinks.subscriberId, subscriberIds));
}
