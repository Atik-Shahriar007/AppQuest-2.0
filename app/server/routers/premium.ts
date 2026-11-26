import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { capabilities } from "../applink/config";
import { consents, phoneLinks, profiles } from "../db/schema";
import { getAccess, startTrial } from "../premium/access";
import { PREMIUM_MONTHLY_BDT, SKUS, SMS_ALERTS_DISCLOSURE, SUBSCRIPTION_DISCLOSURE, TRIAL_DAYS } from "../premium/catalog";
import { confirmPurchase, getPurchase, listPurchases, PurchaseError, startPurchase } from "../premium/charges";
import { cancelSubscription, requestSubscription, verifySubscription } from "../premium/subscription";
import { protectedProcedure, publicProcedure, router } from "../trpc";

function asTrpc(err: unknown): never {
  if (err instanceof PurchaseError) {
    const code = err.code === "not_found" ? "NOT_FOUND" : err.code === "too_many_attempts" ? "TOO_MANY_REQUESTS" : "BAD_REQUEST";
    throw new TRPCError({ code, message: err.message, cause: err });
  }
  throw err;
}

export const premiumRouter = router({
  /** Offers and which AppLink features are live. The app disables payment buttons when they are not. */
  offers: publicProcedure.query(() => ({
    capabilities: capabilities(),
    trialDays: TRIAL_DAYS,
    subscription: { amountBdt: PREMIUM_MONTHLY_BDT, frequency: "monthly", disclosure: SUBSCRIPTION_DISCLOSURE },
    passes: Object.values(SKUS),
    smsAlertsDisclosure: SMS_ALERTS_DISCLOSURE,
  })),

  access: protectedProcedure.query(({ ctx }) => getAccess(ctx.db, ctx.user.id)),

  startTrial: protectedProcedure.mutation(({ ctx }) => startTrial(ctx.db, ctx.user.id)),

  purchase: router({
    start: protectedProcedure
      .input(z.object({ sku: z.enum(["compare_pass", "nouri_pass", "day_pass"]), msisdn: z.string().max(20), acceptedDisclosure: z.literal(true) }))
      .mutation(({ ctx, input }) => startPurchase(ctx.db, ctx.user.id, input.sku, input.msisdn).catch(asTrpc)),
    confirm: protectedProcedure
      .input(z.object({ id: z.string().max(64), otp: z.string().max(10) }))
      .mutation(({ ctx, input }) => confirmPurchase(ctx.db, ctx.user.id, input.id, input.otp).catch(asTrpc)),
    get: protectedProcedure
      .input(z.object({ id: z.string().max(64) }))
      .query(({ ctx, input }) => getPurchase(ctx.db, ctx.user.id, input.id).catch(asTrpc)),
    list: protectedProcedure.query(({ ctx }) => listPurchases(ctx.db, ctx.user.id)),
  }),

  subscription: router({
    request: protectedProcedure
      .input(z.object({ msisdn: z.string().max(20), acceptedDisclosure: z.literal(true) }))
      .mutation(({ ctx, input }) => requestSubscription(ctx.db, ctx.user.id, input.msisdn, ctx.ip).catch(asTrpc)),
    verify: protectedProcedure
      .input(z.object({ requestId: z.string().uuid(), otp: z.string().max(10) }))
      .mutation(({ ctx, input }) => verifySubscription(ctx.db, ctx.user.id, input.requestId, input.otp)),
    cancel: protectedProcedure.mutation(async ({ ctx }) => {
      const [link] = await ctx.db.select().from(phoneLinks).where(eq(phoneLinks.userId, ctx.user.id));
      if (!link) throw new TRPCError({ code: "BAD_REQUEST", message: "No subscription on this account." });
      return cancelSubscription(ctx.db, link.subscriberId, "app");
    }),
  }),

  smsAlerts: router({
    status: protectedProcedure.query(async ({ ctx }) => {
      const [p] = await ctx.db.select().from(profiles).where(eq(profiles.userId, ctx.user.id));
      const [link] = await ctx.db.select().from(phoneLinks).where(eq(phoneLinks.userId, ctx.user.id));
      return { enabled: Boolean(p?.smsAlertsOptIn), hasLinkedNumber: Boolean(link), disclosure: SMS_ALERTS_DISCLOSURE };
    }),
    /** Strict opt-in: requires a linked number and explicit acceptance of the BDT 2 per SMS charge. */
    enable: protectedProcedure.input(z.object({ acceptedDisclosure: z.literal(true) })).mutation(async ({ ctx }) => {
      const [link] = await ctx.db.select().from(phoneLinks).where(eq(phoneLinks.userId, ctx.user.id));
      if (!link) throw new TRPCError({ code: "BAD_REQUEST", message: "Link a Banglalink number first." });
      const now = new Date();
      await ctx.db
        .insert(profiles)
        .values({ userId: ctx.user.id, smsAlertsOptIn: true, smsAlertsOptInAt: now })
        .onConflictDoUpdate({ target: profiles.userId, set: { smsAlertsOptIn: true, smsAlertsOptInAt: now, updatedAt: now } });
      await ctx.db.insert(consents).values({ userId: ctx.user.id, kind: "sms_alerts", textShown: SMS_ALERTS_DISCLOSURE, amountBdt: "2.00", channel: "app" });
      return { enabled: true };
    }),
    disable: protectedProcedure.mutation(async ({ ctx }) => {
      await ctx.db.update(profiles).set({ smsAlertsOptIn: false, updatedAt: new Date() }).where(eq(profiles.userId, ctx.user.id));
      return { enabled: false };
    }),
  }),
});
