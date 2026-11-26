/** Expiry reminders: one in-app notification and one free push per reminder when it falls due. */
import { and, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { notifications, pushTokens, reminders } from "../db/schema";
import { sendExpoPush } from "../alerts";

export async function runDueReminders(db: Db) {
  const due = await db
    .update(reminders)
    .set({ notifiedAt: new Date() })
    .where(
      and(
        isNull(reminders.notifiedAt),
        sql`${reminders.expiresOn} - ${reminders.notifyDaysBefore} <= (now() at time zone 'Asia/Dhaka')::date`,
      ),
    )
    .returning();
  for (const r of due) {
    const title = "Expiry reminder";
    const body = `${r.label} expires on ${r.expiresOn}.`;
    await db.insert(notifications).values({ userId: r.userId, kind: "expiry", title, body, data: { reminderId: r.id } });
    const tokens = await db.select().from(pushTokens).where(inArray(pushTokens.userId, [r.userId]));
    if (tokens.length) await sendExpoPush(tokens.map((t) => t.token), title, body, { reminderId: r.id });
  }
  return due.length;
}
