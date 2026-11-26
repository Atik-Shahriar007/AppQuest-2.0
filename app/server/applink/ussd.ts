/**
 * USSD feature-phone lookup. Each keypress arrives on our callback; we answer with /ussd/send,
 * echoing the platform's sessionId. Plain ASCII only, about 160 characters per screen, no AI,
 * no outside calls: one in-memory catalog read per lookup.
 */
import { and, desc, eq, lt } from "drizzle-orm";
import type { Db } from "../db/client";
import { phoneLinks, profiles, recalls, ussdSessions } from "../db/schema";
import { findByBarcode } from "../catalog";
import { sendUssd } from "./client";

const SESSION_TTL_MS = 2 * 60_000;

export type UssdInbound = {
  sessionId: string;
  sourceAddress: string;
  message: string;
  ussdOperation: string;
};

export type UssdReply = { message: string; operation: "mt-cont" | "mt-fin" };

const MENU = "NutriScan\n1 Check a product\n2 Food safety news\n3 Stop SMS alerts\n0 Exit";
const BAND_WORD: Record<string, string> = { excellent: "Excellent", good: "Good", moderate: "Moderate", low: "Low" };
const CHILD_WORD: Record<string, string> = { suitable: "OK", caution: "caution", not_suitable: "no", not_assessed: "n/a" };

/** Force plain printable ASCII and the screen limit. */
export function asciiScreen(s: string, max = 160): string {
  const clean = s
    .normalize("NFKD")
    .replace(/[^\x20-\x7e\n]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
  return clean.length > max ? clean.slice(0, max) : clean;
}

/** Product result screen, shared with tests. */
export function productScreen(barcode: string): string {
  const p = findByBarcode(barcode);
  if (!p) return "Not in NutriScan yet. Add it from the NutriScan app. Thank you!";
  if (p.kind !== "food" || p.nqss?.score == null) {
    return `${p.asciiName}\n${p.kind === "food" ? "No score yet" : "Not a food: no food score"}\nSee details in the NutriScan app.`;
  }
  const s = p.nqss;
  const halal = p.halal.badge === "halal" ? "yes" : "not verified";
  return [
    p.asciiName,
    `Score ${Math.round(s.score!)}/100 ${BAND_WORD[s.band!]}${s.status === "complete" ? "" : " (est.)"}`,
    `Halal: ${halal}  Kids: ${CHILD_WORD[p.child.badge]}`,
    "Not medical advice.",
  ].join("\n");
}

async function latestRecallText(db: Db): Promise<string> {
  const [r] = await db
    .select()
    .from(recalls)
    .where(and(eq(recalls.status, "approved"), eq(recalls.isTest, false)))
    .orderBy(desc(recalls.approvedAt))
    .limit(1);
  return r ? `Latest verified alert:\n${r.shortText}` : "No active food recalls in NutriScan right now.";
}

async function stopSmsAlerts(db: Db, sourceAddress: string): Promise<string> {
  const [link] = await db.select().from(phoneLinks).where(eq(phoneLinks.subscriberId, sourceAddress));
  if (!link) return "This number has no NutriScan SMS alerts.";
  await db.update(profiles).set({ smsAlertsOptIn: false, updatedAt: new Date() }).where(eq(profiles.userId, link.userId));
  return "SMS alerts are now off for this number.";
}

/** Pure-ish state machine: decides the next screen and the new session state. */
export async function nextScreen(db: Db, screen: string, input: string, sourceAddress: string): Promise<{ reply: UssdReply; screen: string | null }> {
  const text = input.trim();
  if (screen === "menu") {
    if (text === "1") return { reply: { message: "Enter the barcode number on the pack (8 to 13 digits):", operation: "mt-cont" }, screen: "barcode" };
    if (text === "2") return { reply: { message: await latestRecallText(db), operation: "mt-fin" }, screen: null };
    if (text === "3") return { reply: { message: await stopSmsAlerts(db, sourceAddress), operation: "mt-fin" }, screen: null };
    if (text === "0") return { reply: { message: "Thank you for using NutriScan.", operation: "mt-fin" }, screen: null };
    return { reply: { message: `Invalid option\n${MENU}`, operation: "mt-cont" }, screen: "menu" };
  }
  if (screen === "barcode") {
    const digits = text.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 14) {
      return { reply: { message: "Please enter only the 8 to 13 digit barcode number:", operation: "mt-cont" }, screen: "barcode" };
    }
    return { reply: { message: productScreen(digits), operation: "mt-fin" }, screen: null };
  }
  return { reply: { message: MENU, operation: "mt-cont" }, screen: "menu" };
}

export async function handleUssd(db: Db, inb: UssdInbound): Promise<UssdReply> {
  const now = new Date();
  // Opportunistic cleanup keeps the table small without a separate job.
  await db.delete(ussdSessions).where(lt(ussdSessions.expiresAt, now));

  let reply: UssdReply;
  if (inb.ussdOperation === "mo-init") {
    reply = { message: MENU, operation: "mt-cont" };
    await db
      .insert(ussdSessions)
      .values({ sessionId: inb.sessionId, screen: "menu", expiresAt: new Date(now.getTime() + SESSION_TTL_MS) })
      .onConflictDoUpdate({ target: ussdSessions.sessionId, set: { screen: "menu", expiresAt: new Date(now.getTime() + SESSION_TTL_MS) } });
  } else {
    const [session] = await db.select().from(ussdSessions).where(eq(ussdSessions.sessionId, inb.sessionId));
    const next = await nextScreen(db, session?.screen ?? "start", inb.message, inb.sourceAddress);
    reply = next.reply;
    if (next.screen) {
      await db
        .insert(ussdSessions)
        .values({ sessionId: inb.sessionId, screen: next.screen, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) })
        .onConflictDoUpdate({ target: ussdSessions.sessionId, set: { screen: next.screen, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) } });
    } else {
      await db.delete(ussdSessions).where(eq(ussdSessions.sessionId, inb.sessionId));
    }
  }

  const message = asciiScreen(reply.message);
  await sendUssd({ sessionId: inb.sessionId, destinationAddress: inb.sourceAddress, message, operation: reply.operation });
  return { ...reply, message };
}
