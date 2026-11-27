import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { AlertError, approveRecall, createRecall } from "../alerts";
import { getProduct } from "../catalog";
import {
  contributionPhotos,
  contributions,
  profiles,
  recalls,
} from "../db/schema";
import {
  adminProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "../trpc";

const labelValues = z.record(
  z.string().max(40),
  z.union([z.number(), z.string().max(20), z.null()]),
);

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
        category: z.enum(["food", "personalCare", "household"]).default("food"),
        /** Front and back package photos, base64 JPEG/PNG/WebP, about 1.5 MB each at most. */
        photos: z
          .array(
            z.object({
              side: z.enum(["front", "back"]),
              mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
              base64: z.string().max(2_000_000),
            }),
          )
          .max(2)
          .default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const recent = await ctx.db
        .select({ n: sql<number>`count(*)::int` })
        .from(contributions)
        .where(
          and(
            eq(contributions.userId, ctx.user.id),
            sql`${contributions.createdAt} > now() - interval '1 day'`,
          ),
        );
      if ((recent[0]?.n ?? 0) >= 20)
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Daily contribution limit reached.",
        });
      const { barcode, name, brand, photos, ...payload } = input;
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(contributions)
          .values({
            userId: ctx.user.id,
            barcode,
            name,
            brand,
            payload: { ...payload, photoSides: photos.map((p) => p.side) },
          })
          .returning();
        for (const p of photos) {
          await tx
            .insert(contributionPhotos)
            .values({
              contributionId: row.id,
              side: p.side,
              mimeType: p.mimeType,
              data: Buffer.from(p.base64, "base64"),
            });
        }
        return row;
      });
    }),
  myContributions: protectedProcedure.query(({ ctx }) =>
    ctx.db
      .select()
      .from(contributions)
      .where(eq(contributions.userId, ctx.user.id))
      .orderBy(desc(contributions.createdAt)),
  ),
  /** Points: 10 per approved contribution. Points never change scores or rankings of products. */
  myPoints: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({
        approved: sql<number>`count(*) filter (where ${contributions.status} = 'approved')::int`,
        pending: sql<number>`count(*) filter (where ${contributions.status} in ('submitted','in_review'))::int`,
      })
      .from(contributions)
      .where(eq(contributions.userId, ctx.user.id));
    return { points: (row?.approved ?? 0) * 10, approved: row?.approved ?? 0, pending: row?.pending ?? 0 };
  }),
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
    return rows
      .filter((r) => r.approved > 0)
      .map((r, i) => ({
        rank: i + 1,
        name: r.name ?? "NutriScan member",
        approved: r.approved,
        points: r.approved * 10,
      }));
  }),

  activeRecalls: publicProcedure.query(({ ctx }) =>
    ctx.db
      .select({
        id: recalls.id,
        title: recalls.title,
        body: recalls.body,
        sourceUrl: recalls.sourceUrl,
        productIds: recalls.productIds,
        approvedAt: recalls.approvedAt,
      })
      .from(recalls)
      .where(and(eq(recalls.status, "approved"), eq(recalls.isTest, false)))
      .orderBy(desc(recalls.approvedAt)),
  ),

  admin: router({
    contributions: adminProcedure
      .input(
        z
          .object({
            status: z
              .enum(["submitted", "in_review", "approved", "rejected"])
              .optional(),
          })
          .default({}),
      )
      .query(({ ctx, input }) =>
        ctx.db
          .select()
          .from(contributions)
          .where(
            input.status ? eq(contributions.status, input.status) : undefined,
          )
          .orderBy(desc(contributions.createdAt))
          .limit(100),
      ),
    contributionPhoto: adminProcedure
      .input(
        z.object({ id: z.number().int(), side: z.enum(["front", "back"]) }),
      )
      .query(async ({ ctx, input }) => {
        const [p] = await ctx.db
          .select()
          .from(contributionPhotos)
          .where(
            and(
              eq(contributionPhotos.contributionId, input.id),
              eq(contributionPhotos.side, input.side),
            ),
          );
        return p
          ? { mimeType: p.mimeType, base64: p.data.toString("base64") }
          : null;
      }),
    reviewContribution: adminProcedure
      .input(
        z.object({
          id: z.number().int(),
          status: z.enum(["in_review", "approved", "rejected"]),
          note: z.string().max(500).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const [row] = await ctx.db
          .update(contributions)
          .set({
            status: input.status,
            reviewerNote: input.note ?? null,
            updatedAt: new Date(),
          })
          .where(eq(contributions.id, input.id))
          .returning();
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        return row;
      }),
    recalls: adminProcedure.query(({ ctx }) =>
      ctx.db.select().from(recalls).orderBy(desc(recalls.createdAt)),
    ),
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
        if (input.productIds.some((id) => !getProduct(id)))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Unknown product.",
          });
        try {
          return await createRecall(ctx.db, ctx.user.id, input);
        } catch (e) {
          if (e instanceof AlertError)
            throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
          throw e;
        }
      }),
    approveRecall: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await approveRecall(ctx.db, input.id, ctx.user.id);
        } catch (e) {
          if (e instanceof AlertError)
            throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
          throw e;
        }
      }),
  }),
});
