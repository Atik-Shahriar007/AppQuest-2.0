import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getProduct } from "../catalog";
import { favorites, history, notifications, profiles, pushTokens, reactions, reminders } from "../db/schema";
import { protectedProcedure, router } from "../trpc";

const productId = z.string().max(80).refine((id) => getProduct(id) !== undefined, "Unknown product");

const profilePatch = z.object({
  displayName: z.string().max(60).nullable().optional(),
  language: z.enum(["en", "bn"]).optional(),
  theme: z.enum(["system", "light", "dark"]).optional(),
  health: z.record(z.string(), z.unknown()).optional(),
  goals: z.record(z.string(), z.unknown()).optional(),
  modes: z.object({ halalMode: z.boolean().optional(), childSafeMode: z.boolean().optional() }).optional(),
});

export const meRouter = router({
  profile: protectedProcedure.query(async ({ ctx }) => {
    const [p] = await ctx.db.select().from(profiles).where(eq(profiles.userId, ctx.user.id));
    if (p) return p;
    const [created] = await ctx.db.insert(profiles).values({ userId: ctx.user.id }).onConflictDoNothing().returning();
    return created ?? (await ctx.db.select().from(profiles).where(eq(profiles.userId, ctx.user.id)))[0];
  }),
  updateProfile: protectedProcedure.input(profilePatch).mutation(async ({ ctx, input }) => {
    if (JSON.stringify(input).length > 20_000) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE" });
    const now = new Date();
    const [p] = await ctx.db
      .insert(profiles)
      .values({ userId: ctx.user.id, ...input })
      .onConflictDoUpdate({ target: profiles.userId, set: { ...input, updatedAt: now } })
      .returning();
    return p;
  }),

  history: protectedProcedure.query(({ ctx }) =>
    ctx.db.select().from(history).where(eq(history.userId, ctx.user.id)).orderBy(desc(history.createdAt)).limit(200),
  ),
  addHistory: protectedProcedure
    .input(z.object({ productId, source: z.enum(["scan", "search", "view"]) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.insert(history).values({ userId: ctx.user.id, ...input });
      return { ok: true };
    }),
  clearHistory: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.delete(history).where(eq(history.userId, ctx.user.id));
    return { ok: true };
  }),

  favorites: protectedProcedure.query(({ ctx }) =>
    ctx.db.select().from(favorites).where(eq(favorites.userId, ctx.user.id)).orderBy(desc(favorites.createdAt)),
  ),
  setFavorite: protectedProcedure.input(z.object({ productId, on: z.boolean() })).mutation(async ({ ctx, input }) => {
    if (input.on) await ctx.db.insert(favorites).values({ userId: ctx.user.id, productId: input.productId }).onConflictDoNothing();
    else await ctx.db.delete(favorites).where(and(eq(favorites.userId, ctx.user.id), eq(favorites.productId, input.productId)));
    return { ok: true };
  }),

  setReaction: protectedProcedure
    .input(z.object({ productId, value: z.union([z.literal(1), z.literal(-1), z.literal(0)]) }))
    .mutation(async ({ ctx, input }) => {
      const where = and(eq(reactions.userId, ctx.user.id), eq(reactions.productId, input.productId));
      if (input.value === 0) await ctx.db.delete(reactions).where(where);
      else
        await ctx.db
          .insert(reactions)
          .values({ userId: ctx.user.id, productId: input.productId, value: input.value })
          .onConflictDoUpdate({ target: [reactions.userId, reactions.productId], set: { value: input.value } });
      return { ok: true };
    }),

  reminders: protectedProcedure.query(({ ctx }) =>
    ctx.db.select().from(reminders).where(eq(reminders.userId, ctx.user.id)).orderBy(reminders.expiresOn),
  ),
  addReminder: protectedProcedure
    .input(
      z.object({
        label: z.string().min(1).max(80),
        productId: productId.nullable().optional(),
        expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        notifyDaysBefore: z.number().int().min(0).max(30).default(2),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [r] = await ctx.db.insert(reminders).values({ userId: ctx.user.id, ...input, productId: input.productId ?? null }).returning();
      return r;
    }),
  deleteReminder: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    await ctx.db.delete(reminders).where(and(eq(reminders.id, input.id), eq(reminders.userId, ctx.user.id)));
    return { ok: true };
  }),

  notifications: protectedProcedure.query(({ ctx }) =>
    ctx.db.select().from(notifications).where(eq(notifications.userId, ctx.user.id)).orderBy(desc(notifications.createdAt)).limit(100),
  ),
  markNotificationsRead: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, ctx.user.id), isNull(notifications.readAt)));
    return { ok: true };
  }),

  registerPushToken: protectedProcedure
    .input(z.object({ token: z.string().regex(/^ExponentPushToken\[.+\]$/).max(200) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(pushTokens)
        .values({ token: input.token, userId: ctx.user.id })
        .onConflictDoUpdate({ target: pushTokens.token, set: { userId: ctx.user.id } });
      return { ok: true };
    }),
});
