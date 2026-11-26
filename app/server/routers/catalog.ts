import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { allProducts, betterAlternatives, catalogVersion, findByBarcode, getProduct, groups, searchProducts } from "../catalog";
import { gateAdvancedCompare } from "../premium/access";
import { protectedProcedure, publicProcedure, router } from "../trpc";

const modes = z.object({ halalMode: z.boolean().optional(), childSafeMode: z.boolean().optional() }).default({});

export const catalogRouter = router({
  version: publicProcedure.query(() => catalogVersion),
  groups: publicProcedure.query(() => groups()),
  list: publicProcedure
    .input(z.object({ group: z.string().optional(), kind: z.enum(["food", "personal_care", "home_care"]).optional() }).default({}))
    .query(({ input }) => allProducts().filter((p) => (!input.group || p.group === input.group) && (!input.kind || p.kind === input.kind))),
  search: publicProcedure
    .input(z.object({ q: z.string().max(100), limit: z.number().int().min(1).max(50).optional() }))
    .query(({ input }) => searchProducts(input.q, { limit: input.limit })),
  get: publicProcedure.input(z.object({ id: z.string().max(80) })).query(({ input }) => {
    const p = getProduct(input.id);
    if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found." });
    return p;
  }),
  byBarcode: publicProcedure
    .input(z.object({ code: z.string().max(20) }))
    .query(({ input }) => findByBarcode(input.code) ?? null),
  alternatives: publicProcedure
    .input(z.object({ id: z.string().max(80), modes }))
    .query(({ input }) => betterAlternatives(input.id, input.modes)),

  /**
   * Advanced comparison: full component breakdown and per-nutrient winners. Free users spend
   * one Comparison Pass use; Premium users spend nothing. Basic comparison runs on the client
   * from public product data.
   */
  advancedCompare: protectedProcedure
    .input(z.object({ ids: z.array(z.string().max(80)).min(2).max(4) }))
    .mutation(async ({ ctx, input }) => {
      const products = input.ids.map((id) => getProduct(id)).filter((p) => p !== undefined);
      if (products.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "Pick at least two products." });
      const gate = await gateAdvancedCompare(ctx.db, ctx.user.id);
      if (!gate.allowed) throw new TRPCError({ code: "FORBIDDEN", message: "premium_required" });
      const keys = ["freeSugar", "sodium", "saturatedFat", "transFat", "energy", "fibre", "protein", "wholeFood"] as const;
      const rows = keys.map((key) => {
        const cells = products.map((p) => {
          const c = p.nqss?.components.find((x) => x.key === key);
          return { id: p.id, points: c?.points ?? null, max: c?.max ?? null, input: c?.input ?? null, provenance: c?.provenance ?? null };
        });
        const best = Math.max(...cells.map((c) => c.points ?? -1));
        return { key, cells, winners: best < 0 ? [] : cells.filter((c) => c.points === best).map((c) => c.id) };
      });
      return { usedPass: gate.usedPass, rows };
    }),
});
