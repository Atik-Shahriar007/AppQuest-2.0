import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { AiUnavailableError } from "../ai/client";
import { chat } from "../ai/nouri";
import { previewScore, readLabel } from "../ai/ocr";
import { aiUsage, nouriConversations, nouriMessages, userMemories } from "../db/schema";
import { gateNouriMessage, getAccess, startOfDhakaDay } from "../premium/access";
import { protectedProcedure, router } from "../trpc";

const DEEP_PER_DAY = 3;
const OCR_PER_DAY = 10;

function aiError(err: unknown): never {
  if (err instanceof AiUnavailableError) {
    const message = { budget: "ai_budget", no_key: "ai_unavailable", rate_limited: "ai_busy", upstream: "ai_unavailable" }[err.reason];
    throw new TRPCError({ code: err.reason === "rate_limited" ? "TOO_MANY_REQUESTS" : "SERVICE_UNAVAILABLE", message });
  }
  throw err;
}

async function usedToday(ctx: { db: import("../db/client").Db; user: { id: string } }, feature: string, model?: string) {
  const [row] = await ctx.db
    .select({ n: count() })
    .from(aiUsage)
    .where(
      and(
        eq(aiUsage.userId, ctx.user.id),
        eq(aiUsage.feature, feature),
        gte(aiUsage.createdAt, startOfDhakaDay(new Date())),
        ...(model ? [eq(aiUsage.model, model)] : []),
      ),
    );
  return Number(row?.n ?? 0);
}

export const nouriRouter = router({
  send: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().uuid().optional(),
        message: z.string().trim().min(1).max(1500),
        deep: z.boolean().default(false),
        productId: z.string().max(80).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.deep) {
        const access = await getAccess(ctx.db, ctx.user.id);
        if (!access.premium) throw new TRPCError({ code: "FORBIDDEN", message: "premium_required" });
        if ((await usedToday(ctx, "nouri_message", "deep")) >= DEEP_PER_DAY) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "deep_limit" });
        }
      }
      const gate = await gateNouriMessage(ctx.db, ctx.user.id);
      if (!gate.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "daily_limit" });
      const reply = await chat(ctx.db, ctx.user.id, input).catch(aiError);
      return { ...reply, usedPass: gate.usedPass };
    }),

  conversations: protectedProcedure.query(({ ctx }) =>
    ctx.db
      .select({ id: nouriConversations.id, title: nouriConversations.title, updatedAt: nouriConversations.updatedAt })
      .from(nouriConversations)
      .where(eq(nouriConversations.userId, ctx.user.id))
      .orderBy(desc(nouriConversations.updatedAt))
      .limit(30),
  ),
  messages: protectedProcedure.input(z.object({ conversationId: z.string().uuid() })).query(async ({ ctx, input }) => {
    const [c] = await ctx.db
      .select()
      .from(nouriConversations)
      .where(and(eq(nouriConversations.id, input.conversationId), eq(nouriConversations.userId, ctx.user.id)));
    if (!c) throw new TRPCError({ code: "NOT_FOUND" });
    return ctx.db.select().from(nouriMessages).where(eq(nouriMessages.conversationId, c.id)).orderBy(nouriMessages.id);
  }),
  deleteConversation: protectedProcedure.input(z.object({ conversationId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const [c] = await ctx.db
      .delete(nouriConversations)
      .where(and(eq(nouriConversations.id, input.conversationId), eq(nouriConversations.userId, ctx.user.id)))
      .returning();
    if (c) await ctx.db.delete(nouriMessages).where(eq(nouriMessages.conversationId, c.id));
    return { ok: true };
  }),

  /** Preferences Nouri proposed and confirmed ones. Only confirmed ones reach Nouri. */
  memories: protectedProcedure.query(({ ctx }) =>
    ctx.db.select().from(userMemories).where(eq(userMemories.userId, ctx.user.id)).orderBy(desc(userMemories.createdAt)),
  ),
  setMemory: protectedProcedure
    .input(z.object({ id: z.number().int(), status: z.enum(["confirmed", "rejected"]) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(userMemories)
        .set({ status: input.status })
        .where(and(eq(userMemories.id, input.id), eq(userMemories.userId, ctx.user.id)));
      return { ok: true };
    }),
  deleteMemory: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    await ctx.db.delete(userMemories).where(and(eq(userMemories.id, input.id), eq(userMemories.userId, ctx.user.id)));
    return { ok: true };
  }),

  readLabel: protectedProcedure
    .input(
      z.object({
        // About 6 MB of base64; the app resizes photos to ~1600 px first.
        base64: z.string().max(8_000_000),
        mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if ((await usedToday(ctx, "ocr")) >= OCR_PER_DAY) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "ocr_limit" });
      return readLabel(ctx.db, ctx.user.id, input).catch(aiError);
    }),
  previewScore: protectedProcedure
    .input(
      z.object({
        name: z.string().max(120),
        ingredients: z.string().max(4000),
        basis: z.enum(["per_100g", "per_100ml"]),
        group: z.string().max(40),
        values: z.record(z.string().max(30), z.union([z.string().max(20), z.number(), z.null()])),
      }),
    )
    .query(({ input }) => previewScore(input)),
});
