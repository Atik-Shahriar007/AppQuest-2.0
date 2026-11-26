/**
 * Claude access with cost control. Every call is priced from its usage and recorded in
 * ai_usage; calls stop once the month's spend reaches AI_MONTHLY_BUDGET_USD.
 */
import Anthropic from "@anthropic-ai/sdk";
import { gte, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { aiUsage } from "../db/schema";
import { env } from "../env";

export const MODELS = {
  /** Default for chat, summaries and bulk jobs (teammate decision 6). */
  fast: "claude-haiku-5-5",
  /** Label OCR and Premium "in depth" Nouri answers only. */
  deep: "claude-opus-5-5",
} as const;
export type ModelId = (typeof MODELS)[keyof typeof MODELS];

/** USD per million tokens (Anthropic list prices, Nov 2026). Cache write = 5-minute TTL. */
const PRICES: Record<ModelId, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};

export class AiUnavailableError extends Error {
  constructor(readonly reason: "no_key" | "budget") {
    super(reason === "budget" ? "AI budget for this month is used up." : "AI is not configured.");
    this.name = "AiUnavailableError";
  }
}

let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) throw new AiUnavailableError("no_key");
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 60_000 });
  return client;
}

export function costUsd(model: ModelId, u: Anthropic.Usage): number {
  const p = PRICES[model];
  return (
    ((u.input_tokens ?? 0) * p.input +
      (u.output_tokens ?? 0) * p.output +
      (u.cache_read_input_tokens ?? 0) * p.cacheRead +
      (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) /
    1_000_000
  );
}

let spendCache: { at: number; month: string; usd: number } | null = null;

function monthKey(d = new Date()) {
  return d.toISOString().slice(0, 7);
}

export async function monthSpendUsd(db: Db): Promise<number> {
  const month = monthKey();
  if (spendCache && spendCache.month === month && Date.now() - spendCache.at < 30_000) return spendCache.usd;
  const start = new Date(`${month}-01T00:00:00Z`);
  const [row] = await db
    .select({ usd: sql<string>`coalesce(sum(${aiUsage.costUsd}), 0)` })
    .from(aiUsage)
    .where(gte(aiUsage.createdAt, start));
  spendCache = { at: Date.now(), month, usd: Number(row?.usd ?? 0) };
  return spendCache.usd;
}

export async function assertBudget(db: Db) {
  if (!env.ANTHROPIC_API_KEY) throw new AiUnavailableError("no_key");
  if ((await monthSpendUsd(db)) >= env.AI_MONTHLY_BUDGET_USD) throw new AiUnavailableError("budget");
}

export async function recordUsage(db: Db, userId: string | null, feature: string, model: ModelId, u: Anthropic.Usage) {
  const cost = costUsd(model, u);
  if (spendCache) spendCache.usd += cost;
  await db.insert(aiUsage).values({
    userId,
    feature,
    model,
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
    costUsd: cost.toFixed(6),
  });
  return cost;
}
