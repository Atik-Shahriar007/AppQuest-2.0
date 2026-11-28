/**
 * The five AppLink callbacks. AppLink signs nothing, so each request is:
 *   1. checked against the AppLink source-IP allow list,
 *   2. stripped of `password` before anything can log it,
 *   3. checked for our applicationId (constant time) where the payload carries one,
 *   4. stored with a unique dedupe key (redelivery becomes a no-op),
 *   5. acknowledged with S1000 at once, then processed from the stored row.
 * Unprocessed rows are retried by `processPendingEvents`, so a crash after the ACK loses nothing.
 */
import { timingSafeEqual } from "node:crypto";
import express, { type Request, type Response, type Router } from "express";
import { and, asc, eq, isNull, lt } from "drizzle-orm";
import { db } from "../db/client";
import { applinkEvents } from "../db/schema";
import { env } from "../env";
import { applyDeliveryReport, applyIncomingSms } from "../alerts";
import { applyChargingNotification } from "../premium/charges";
import { applySubscriptionNotification } from "../premium/subscription";
import { handleUssd } from "./ussd";

export type EventKind = "caas_notify" | "subscription_notify" | "sms_report" | "sms_receive" | "ussd_receive";

const ACK = { statusCode: "S1000", statusDetail: "Success" };
const allowedIps = new Set(
  env.APPLINK_CALLBACK_ALLOWED_IPS.split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

export function redact(body: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...body };
  if ("password" in copy) copy.password = "[redacted]";
  return copy;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function dedupeKey(kind: EventKind, b: Record<string, unknown>): string | null {
  switch (kind) {
    case "caas_notify":
      return b.externalTrxId ? `${str(b.externalTrxId)}|${str(b.statusCode)}` : null;
    case "subscription_notify":
      return b.subscriberId ? `${str(b.subscriberId)}|${str(b.status)}|${str(b.timeStamp)}` : null;
    case "sms_report":
      return b.requestId ? `${str(b.requestId)}|${str(b.deliveryStatus)}` : null;
    case "sms_receive":
    case "ussd_receive":
      return b.requestId ? str(b.requestId) : null;
  }
}

async function process(kind: EventKind, body: Record<string, unknown>) {
  switch (kind) {
    case "caas_notify":
      return applyChargingNotification(db, body);
    case "subscription_notify":
      return applySubscriptionNotification(db, body);
    case "sms_report":
      return applyDeliveryReport(db, body);
    case "sms_receive":
      return applyIncomingSms(db, body);
    case "ussd_receive":
      return handleUssd(db, {
        sessionId: str(body.sessionId),
        sourceAddress: str(body.sourceAddress),
        message: str(body.message),
        ussdOperation: str(body.ussdOperation),
      });
  }
}

async function runEvent(id: number, kind: EventKind, body: Record<string, unknown>) {
  try {
    await process(kind, body);
    await db.update(applinkEvents).set({ processedAt: new Date(), error: null }).where(eq(applinkEvents.id, id));
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 500) : "unknown error";
    await db.update(applinkEvents).set({ error: message }).where(eq(applinkEvents.id, id));
    console.error(`[applink] ${kind} event ${id} failed: ${message}`);
  }
}

function handler(kind: EventKind) {
  return async (req: Request, res: Response) => {
    const ip = req.ip ?? "";
    // Always answer S1000: an error status makes AppLink retry, and a rejection needs no retry.
    if (allowedIps.size > 0 && !allowedIps.has(ip.replace(/^::ffff:/, ""))) {
      console.warn(`[applink] ${kind} from non-allow-listed address rejected`);
      res.json(ACK);
      return;
    }
    const raw = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
    const appId = typeof raw.applicationId === "string" ? raw.applicationId : null;
    if (appId !== null && env.APPLINK_APP_ID && !safeEqual(appId, env.APPLINK_APP_ID)) {
      console.warn(`[applink] ${kind} with a foreign applicationId rejected`);
      res.json(ACK);
      return;
    }
    if (kind === "subscription_notify" && typeof raw.password === "string" && env.APPLINK_PASSWORD) {
      if (!safeEqual(raw.password, env.APPLINK_PASSWORD)) {
        console.warn("[applink] subscription notification with a wrong password rejected");
        res.json(ACK);
        return;
      }
    }
    const body = redact(raw);
    const key = dedupeKey(kind, body);
    if (!key) {
      res.json(ACK);
      return;
    }
    const inserted = await db
      .insert(applinkEvents)
      .values({ kind, dedupeKey: key, body, sourceIp: ip })
      .onConflictDoNothing()
      .returning({ id: applinkEvents.id });
    res.json(ACK);
    if (inserted.length > 0) void runEvent(inserted[0].id, kind, body);
  };
}

export function applinkCallbackRouter(): Router {
  const r = express.Router();
  r.use(express.json({ limit: "64kb" }));
  r.post("/caas/notify", handler("caas_notify"));
  r.post("/subscription/notify", handler("subscription_notify"));
  r.post("/sms/report", handler("sms_report"));
  r.post("/sms/receive", handler("sms_receive"));
  r.post("/ussd/receive", handler("ussd_receive"));
  return r;
}

/** Retry events that were stored but not processed (crash, deploy, transient DB error). */
export async function processPendingEvents(limit = 50) {
  const cutoff = new Date(Date.now() - 15_000);
  const rows = await db
    .select()
    .from(applinkEvents)
    .where(and(isNull(applinkEvents.processedAt), lt(applinkEvents.receivedAt, cutoff)))
    .orderBy(asc(applinkEvents.id))
    .limit(limit);
  for (const row of rows) {
    // A USSD keypress older than its session is useless to replay.
    if (row.kind === "ussd_receive") {
      await db.update(applinkEvents).set({ processedAt: new Date(), error: "expired, not replayed" }).where(eq(applinkEvents.id, row.id));
      continue;
    }
    await runEvent(row.id, row.kind as EventKind, row.body);
  }
}
