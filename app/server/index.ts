import { createServer } from "node:http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import express from "express";
import { sql } from "drizzle-orm";
import {
  applinkCallbackRouter,
  processPendingEvents,
} from "./applink/callbacks";
import { capabilities } from "./applink/config";
import { catalogVersion } from "./catalog";
import { db } from "./db/client";
import { env } from "./env";
import { runDueReminders } from "./jobs/reminders";
import { expireOtpRequests, flagStaleCharges, sweepSubscriptions } from "./jobs/reconcile";
import { appRouter } from "./routers";
import { createContext } from "./trpc";

const app = express();
// Behind one reverse proxy (Caddy/Nginx on the VPS): use the client IP it forwards.
app.set("trust proxy", 1);
app.disable("x-powered-by");

// The app authenticates with a Bearer token, never cookies, so a wildcard origin is safe.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization, content-type, x-trpc-source",
  );
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.get("/api/health", async (_req, res) => {
  let database = false;
  try {
    await db.execute(sql`select 1`);
    database = true;
  } catch {
    database = false;
  }
  res
    .status(database ? 200 : 503)
    .json({
      ok: database,
      database,
      catalog: catalogVersion,
      applink: capabilities(),
    });
});

// AppLink callbacks: public, no auth middleware, protected by IP allow list + checks inside.
app.use("/applink", applinkCallbackRouter());

app.use(
  "/api/trpc",
  express.json({ limit: "8mb" }),
  createExpressMiddleware({
    router: appRouter,
    createContext,
    onError: ({ path, error }) => {
      // Expected outcomes (signed out, limits, validation) stay quiet; real failures are logged.
      if (
        [
          "UNAUTHORIZED",
          "FORBIDDEN",
          "TOO_MANY_REQUESTS",
          "BAD_REQUEST",
          "NOT_FOUND",
        ].includes(error.code)
      ) {
        if (env.NODE_ENV !== "production")
          console.info(`[trpc] ${path}: ${error.code} ${error.message}`);
        return;
      }
      console.error(`[trpc] ${path}: ${error.code} ${error.message}`);
    },
  }),
);

const server = createServer(app);
server.listen(env.PORT, () => {
  console.log(`[api] listening on :${env.PORT}`);
  console.log(`[api] AppLink callback URLs to provision:`);
  for (const p of [
    "caas/notify",
    "subscription/notify",
    "sms/report",
    "sms/receive",
    "ussd/receive",
  ]) {
    console.log(`        ${env.PUBLIC_API_URL}/applink/${p}`);
  }
});

// Background jobs. One API instance is expected; every job is idempotent if that changes.
const every = (ms: number, name: string, fn: () => Promise<unknown>) =>
  setInterval(() => {
    fn().catch((e) =>
      console.error(
        `[job] ${name} failed:`,
        e instanceof Error ? e.message : e,
      ),
    );
  }, ms).unref();

if (env.NODE_ENV !== "test") {
  every(30_000, "applink-events", () => processPendingEvents());
  every(15 * 60_000, "reminders", () => runDueReminders(db));
  every(10 * 60_000, "otp-expiry", () => expireOtpRequests(db));
  every(30 * 60_000, "stale-charges", () => flagStaleCharges(db));
  every(6 * 3600_000, "subscription-sweep", () => sweepSubscriptions(db));
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
