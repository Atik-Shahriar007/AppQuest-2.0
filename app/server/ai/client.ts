/**
 * OpenRouter access with cost control (Chat Completions API).
 *
 * - Model lists come from the environment, free models first. OpenRouter's `models` array tries
 *   them in order and falls back on any error (rate limit, downtime).
 * - `provider.require_parameters` routes only to endpoints that support what we send
 *   (tools, json_schema). `provider.data_collection` defaults to "deny": health-profile text
 *   must not go to providers that train on prompts.
 * - Every call's cost (usage.cost, USD credits) is recorded; calls stop at the monthly cap.
 */
import { gte, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { aiUsage } from "../db/schema";
import { env } from "../env";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 60_000;

const list = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export const MODELS = {
  /** Nouri chat, summaries. */
  chat: list(env.OPENROUTER_CHAT_MODELS),
  /** Premium "in depth" Nouri answers. */
  deep: list(env.OPENROUTER_DEEP_MODELS),
  /** Nutrition label reading: must accept images and json_schema. */
  vision: list(env.OPENROUTER_VISION_MODELS),
};
export type ModelTier = keyof typeof MODELS;

// ---- Chat Completions types (the subset we use) ----
export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };
export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | ContentPart[] }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
export type ToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};
export type Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  cost?: number;
  prompt_tokens_details?: { cached_tokens?: number };
};
export type ChatResponse = {
  id: string;
  model: string;
  choices: {
    finish_reason: string | null;
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: ToolCall[];
    };
  }[];
  usage?: Usage;
};

export class AiUnavailableError extends Error {
  constructor(
    readonly reason: "no_key" | "budget" | "rate_limited" | "upstream",
  ) {
    super(
      {
        no_key: "AI is not configured.",
        budget: "AI budget for this month is used up.",
        rate_limited: "Nouri is busy right now. Please try again in a minute.",
        upstream: "Nouri could not answer right now. Please try again.",
      }[reason],
    );
    this.name = "AiUnavailableError";
  }
}

export async function complete(
  tier: ModelTier,
  body: {
    messages: ChatMessage[];
    tools?: ToolDef[];
    max_tokens: number;
    response_format?: Record<string, unknown>;
    temperature?: number;
    /** Offline jobs may wait longer than the 60 s default used for users. */
    timeoutMs?: number;
  },
): Promise<ChatResponse> {
  const { timeoutMs, ...requestBody } = body;
  if (!env.OPENROUTER_API_KEY) throw new AiUnavailableError("no_key");
  const models = MODELS[tier];
  if (models.length === 0) throw new AiUnavailableError("no_key");

  const send = () =>
    fetch(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "content-type": "application/json",
        "HTTP-Referer": env.PUBLIC_API_URL,
        "X-OpenRouter-Title": "NutriScan",
      },
      body: JSON.stringify({
        models,
        ...requestBody,
        ...(body.tools ? { tool_choice: "auto" } : {}),
        provider: {
          require_parameters: true,
          data_collection: env.OPENROUTER_DATA_COLLECTION,
        },
      }),
      signal: AbortSignal.timeout(timeoutMs ?? TIMEOUT_MS),
    });

  let res: Response;
  try {
    res = await send();
  } catch (first) {
    // A dropped connection (no response at all) is retried once; a timeout is not.
    if (first instanceof Error && first.name === "TimeoutError")
      throw new AiUnavailableError("rate_limited");
    try {
      res = await send();
    } catch (err) {
      const cause =
        err instanceof Error && err.cause instanceof Error
          ? ` (${err.cause.message})`
          : "";
      console.error(
        `[ai] OpenRouter request failed: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}${cause}`,
      );
      throw new AiUnavailableError("upstream");
    }
  }

  if (res.status === 429) throw new AiUnavailableError("rate_limited");
  if (res.status === 402) throw new AiUnavailableError("budget"); // out of OpenRouter credits
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    console.error(`[ai] OpenRouter HTTP ${res.status}: ${detail}`);
    throw new AiUnavailableError("upstream");
  }
  const data = (await res.json()) as ChatResponse & {
    error?: { message?: string };
  };
  if (data.error || !data.choices?.length) {
    console.error(
      `[ai] OpenRouter error: ${data.error?.message ?? "no choices"}`,
    );
    throw new AiUnavailableError("upstream");
  }
  return data;
}

let spendCache: { at: number; month: string; usd: number } | null = null;
const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);

export async function monthSpendUsd(db: Db): Promise<number> {
  const month = monthKey();
  if (
    spendCache &&
    spendCache.month === month &&
    Date.now() - spendCache.at < 30_000
  )
    return spendCache.usd;
  const [row] = await db
    .select({ usd: sql<string>`coalesce(sum(${aiUsage.costUsd}), 0)` })
    .from(aiUsage)
    .where(gte(aiUsage.createdAt, new Date(`${month}-01T00:00:00Z`)));
  spendCache = { at: Date.now(), month, usd: Number(row?.usd ?? 0) };
  return spendCache.usd;
}

export async function assertBudget(db: Db) {
  if (!env.OPENROUTER_API_KEY) throw new AiUnavailableError("no_key");
  if ((await monthSpendUsd(db)) >= env.AI_MONTHLY_BUDGET_USD)
    throw new AiUnavailableError("budget");
}

/** Records the call; OpenRouter reports the real cost in usage.cost (USD credits, 0 for free models). */
export async function recordUsage(
  db: Db,
  userId: string | null,
  feature: string,
  res: Pick<ChatResponse, "model" | "usage">,
) {
  const u = res.usage ?? {};
  const cost = Number.isFinite(u.cost) ? Number(u.cost) : 0;
  if (spendCache) spendCache.usd += cost;
  await db.insert(aiUsage).values({
    userId,
    feature,
    model: res.model ?? "unknown",
    inputTokens: u.prompt_tokens ?? 0,
    cacheReadTokens: u.prompt_tokens_details?.cached_tokens ?? 0,
    outputTokens: u.completion_tokens ?? 0,
    costUsd: cost.toFixed(6),
  });
  return cost;
}
