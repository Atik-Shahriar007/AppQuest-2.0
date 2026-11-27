/**
 * Live check of Nouri against OpenRouter with the models in .env.
 *   pnpm tsx scripts/nouri-smoke.ts "Which noodles have the least salt?"
 * Uses a throwaway user id with a sample health profile in the dev database.
 */
import { randomUUID } from "node:crypto";
import { chat } from "../server/ai/nouri";
import { db, rawSql } from "../server/db/client";
import { aiUsage, profiles } from "../server/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const userId = randomUUID();
  await db.insert(profiles).values({
    userId,
    language: process.argv.includes("--bn") ? "bn" : "en",
    health: {
      conditions: ["high blood pressure"],
      allergies: [],
      ageGroup: "adult",
    },
    modes: { halalMode: false, childSafeMode: false },
  });
  const questions = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  let conversationId: string | undefined;
  for (const q of questions.length
    ? questions
    : [
        "Which instant noodles are best for someone with high blood pressure?",
      ]) {
    const t = Date.now();
    const r = await chat(db, userId, {
      conversationId,
      message: q,
      deep: false,
    });
    conversationId = r.conversationId;
    console.log(
      `\nQ: ${q}\nmodel: ${r.model}  (${((Date.now() - t) / 1000).toFixed(1)} s)\nA: ${r.text}`,
    );
    if (r.proposedPreferences.length)
      console.log(`proposed: ${r.proposedPreferences.join("; ")}`);
  }
  const calls = await db
    .select()
    .from(aiUsage)
    .where(eq(aiUsage.userId, userId));
  const cost = calls.reduce((s, c) => s + Number(c.costUsd), 0);
  console.log(
    `\n${calls.filter((c) => c.feature === "nouri").length} model calls, cost $${cost.toFixed(6)}`,
  );
  await rawSql.end();
}

main().catch(async (e) => {
  console.error(e);
  await rawSql.end();
  process.exit(1);
});
