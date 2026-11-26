import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { AlertError, approveRecall, createRecall } from "../alerts";
import { getProduct } from "../catalog";
import { contributions, profiles, recalls } from "../db/schema";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "../trpc";

const labelValues = z.record(z.string().max(40), z.union([z.number(), z.string().max(20), z.null()]));

export const communityRouter = router({
  submitContribution: protectedProcedure
    .input(
      z.object({
        barcode: z.string().regex(/^\d{8,14}$/),
        name: z.string().min(2).max(120),
        brand: z.string().max(80).optional(),
        ingredients: z.string().max(4000).optional(),
        nutritionPer100: labelValues.optional(),
        basis: z.enum(["per_100g", "per_100ml"]).optional(),
        /** True when the values came from label OCR and the user reviewed them. */
        fromOcr: z.boolean().default(false),
        imagePath: z.string().max(300).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const recent = await ctx.db
        .select({ n: sql<number>`count(*)::int` })
        .from(contributions)
        .where(and(eq(contributions.userId, ctx.user.id), sql`${contributions.createdAt} > now() - interval '1 day'`));
      if ((recent[0]?.n ?? 0) >= 20) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Daily contribution limit reached." });
      const { barcode, name, brand, ...payload } = input;
      const [row] = await ctx.db.insert(contributions).values({ userId: ctx.user.id, barcode, name, brand, payload }).returning();
      return row;
    }),
  myContributions: protectedProcedure.query(({ ctx }) =>
    ctx.db.select().from(contributions).where(eq(contributions.userId, ctx.user.id)).orderBy(desc(contributions.createdAt)),
  ),
  leaderboard: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        userId: contributions.userId,
        approved: sql<number>`count(*) filter (where ${contributions.status} = 'approved')::int`,
        total: sql<number>`count(*)::int`,
        name: profiles.displayName,
      })
      .from(contributions)
      .leftJoin(profiles, eq(profiles.userId, contributions.userId))
      .groupBy(contributions.userId, profiles.displayName)
      .orderBy(sql`2 desc, 3 desc`)
      .limit(20);
    // Never expose user ids publicly.
    return rows.map((r, i) => ({ rank: i + 1, name: r.name ?? "NutriScan member", approved: r.approved, total: r.total }));
  }),

  activeRecalls: publicProcedure.query(({ ctx }) =>
    ctx.db
      .select({ id: recalls.id, title: recalls.title, body: recalls.body, sourceUrl: recalls.sourceUrl, productIds: recalls.productIds, approvedAt: recalls.approvedAt })
      .from(recalls)
      .where(and(eq(recalls.status, "approved"), eq(recalls.isTest, false)))
      .orderBy(desc(recalls.approvedAt)),
  ),

  admin: router({
    contributions: adminProcedure
      .input(z.object({ status: z.enum(["submitted", "in_review", "approved", "rejected"]).optional() }).default({}))
      .query(({ ctx, input }) =>
        ctx.db
          .select()
          .from(contributions)
          .where(input.status ? eq(contributions.status, input.status) : undefined)
          .orderBy(desc(contributions.createdAt))
          .limit(100),
      ),
    reviewContribution: adminProcedure
      .input(z.object({ id: z.number().int(), status: z.enum(["in_review", "approved", "rejected"]), note: z.string().max(500).optional() }))
      .mutation(async ({ ctx, input }) => {
        const [row] = await ctx.db
          .update(contributions)
          .set({ status: input.status, reviewerNote: input.note ?? null, updatedAt: new Date() })
          .where(eq(contributions.id, input.id))
          .returning();
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        return row;
      }),
    recalls: adminProcedure.query(({ ctx }) => ctx.db.select().from(recalls).orderBy(desc(recalls.createdAt))),
    createRecall: adminProcedure
      .input(
        z.object({
          title: z.string().min(5).max(120),
          body: z.string().min(10).max(2000),
          shortText: z.string().min(10).max(140),
          sourceUrl: z.string().url().max(500),
          productIds: z.array(z.string().max(80)).min(1).max(20),
          isTest: z.boolean().default(false),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (input.productIds.some((id) => !getProduct(id))) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown product." });
        try {
          return await createRecall(ctx.db, ctx.user.id, input);
        } catch (e) {
          if (e instanceof AlertError) throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
          throw e;
        }
      }),
    approveRecall: adminProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
      try {
        return await approveRecall(ctx.db, input.id, ctx.user.id);
      } catch (e) {
        if (e instanceof AlertError) throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
        throw e;
      }
    }),
  }),
});
