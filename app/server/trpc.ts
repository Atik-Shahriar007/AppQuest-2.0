import { initTRPC, TRPCError } from "@trpc/server";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import superjson from "superjson";
import { authenticate, type AuthUser } from "./auth";
import { db } from "./db/client";

export async function createContext({ req }: CreateExpressContextOptions) {
  const user = await authenticate(req);
  const ip = req.ip ?? null;
  return { db, user, ip };
}
export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in." });
  return next({ ctx: { ...ctx, user: ctx.user as AuthUser } });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.user.isAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "Team members only." });
  return next();
});
