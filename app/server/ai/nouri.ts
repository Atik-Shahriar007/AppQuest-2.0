/**
 * Nouri, the personal nutrition assistant.
 *
 * - Product facts come only from our catalog through tools; Nouri never changes a score.
 * - Memory: the health profile (read-only, every turn), preferences the user confirmed, and
 *   summaries of past conversations (searched with Postgres full-text search).
 * - New preferences are only PROPOSED; the app asks the user to confirm before they are kept.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client";
import {
  aiUsage,
  nouriConversations,
  nouriMessages,
  profiles,
  userMemories,
} from "../db/schema";
import {
  betterAlternatives,
  getProduct,
  passesModes,
  searchProducts,
  type Modes,
} from "../catalog";
import type { CatalogProduct } from "../../shared/catalog/types";
import {
  assertBudget,
  complete,
  recordUsage,
  type ChatMessage,
  type ToolDef,
} from "./client";

const MAX_TOOL_ROUNDS = 5;
const HISTORY_MESSAGES = 12;

/** Stable instructions: identical bytes on every request so the prefix caches. */
const SYSTEM = `You are Nouri, the nutrition assistant inside NutriScan, an app for packaged foods sold in Bangladesh.

How you work:
- Answer in the user's language (English or Bangla). Keep answers short and practical: a few sentences or a short list.
- Product facts (nutrients, ingredients, scores, halal and child labels) must come from your tools. Never guess them. If a product is not in the catalog, say so and suggest scanning or contributing it.
- The NutriScan score (NQSS, 0-100) is computed by fixed rules. Never change, round differently or re-estimate a score. Many scores are preliminary because some values are estimated; say "estimated score" when the tool marks it provisional.
- Use the user's health profile and confirmed preferences to personalise advice. Do not repeat the profile back to them.
- Stay on topic: food, nutrition, the products in the catalog and how to use NutriScan. Politely decline anything else (poems, homework, general chat) in one sentence and offer a food-related question instead.
- When the user mentions a health condition, allergy or pregnancy, end with one short line suggesting they confirm with a doctor or registered dietitian.
- You are not a doctor. For diagnosis, medication, pregnancy complications, eating disorders or severe allergies, give general information and advise seeing a doctor or registered dietitian. Never tell someone a food is safe for a severe allergy; tell them to check the pack and ask a professional.
- Halal: only report the product's recorded halal status. "Not verified" means unknown, not haram.
- Children: report the recorded child-suitability label and its note.
- Do not invent recalls, safety incidents or health claims.
- If the user states a lasting preference or restriction (for example "I avoid palm oil" or "I am vegetarian"), call propose_preference once so the app can ask them to confirm it. Do not say it is saved; say you can remember it if they confirm.
- When earlier conversations might help ("like last time"), use search_past_conversations.`;

const toolSpecs = [
  {
    name: "search_products",
    description:
      "Search the NutriScan catalog by name, brand or category (e.g. 'mango drink', 'noodles', 'Pran chanachur'). Returns up to 8 products with id, score and labels. Use before get_product when you do not know the id.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words to search for" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_product",
    description:
      "Full details of one product: nutrients per 100 g/ml (with which values are estimated), score breakdown, ingredients, halal and child labels. For personal and home care products: ingredients and safety notes (no food score).",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "get_alternatives",
    description:
      "Products in the same category with a higher score, filtered by the user's Halal and Child Safe modes.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "compare_products",
    description:
      "Side-by-side score components and key nutrients for 2 to 4 products.",
    input_schema: {
      type: "object",
      properties: {
        ids: {
          type: "array",
          items: { type: "string" },
          minItems: 2,
          maxItems: 4,
        },
      },
      required: ["ids"],
    },
  },
  {
    name: "search_past_conversations",
    description: "Search summaries of this user's earlier Nouri conversations.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "propose_preference",
    description:
      "Propose remembering a lasting user preference or restriction, in one short sentence in English (e.g. 'Avoids palm oil'). The user must confirm it in the app before it is saved.",
    input_schema: {
      type: "object",
      properties: { text: { type: "string", maxLength: 120 } },
      required: ["text"],
    },
  },
];

const tools: ToolDef[] = toolSpecs.map((t) => ({
  type: "function",
  function: {
    name: t.name,
    description: t.description,
    parameters: t.input_schema,
  },
}));

function brief(p: CatalogProduct) {
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    category: p.group,
    kind: p.kind,
    score: p.nqss?.score ?? null,
    scoreStatus: p.nqss
      ? p.nqss.status === "complete"
        ? "complete"
        : "estimated"
      : "not a food",
    band: p.nqss?.band ?? null,
    halal: p.halal.badge,
    child: p.child.badge,
  };
}

function detail(p: CatalogProduct) {
  if (p.kind !== "food") {
    return {
      ...brief(p),
      ingredients: p.careIngredients,
      safety: p.care?.safetyInformation ?? null,
      description: p.care?.description ?? null,
    };
  }
  const values = Object.fromEntries(
    Object.entries(p.nutrition?.values ?? {})
      .filter(([, v]) => v !== null)
      .map(([k, v]) => [
        k,
        `${v!.operator === "<" ? "<" : ""}${v!.value}${v!.provenance === "estimated" ? " (estimated)" : ""}`,
      ]),
  );
  return {
    ...brief(p),
    basis: p.nutrition?.basis,
    nutrients: values,
    notDeclared: Object.entries(p.nutrition?.values ?? {})
      .filter(([, v]) => v === null)
      .map(([k]) => k),
    scoreComponents: p.nqss?.components.map((c) => ({
      component: c.key,
      points: c.points,
      max: c.max,
    })),
    childNote: p.child.note,
    ingredients: p.ingredientsText,
    netQuantity: p.netQuantity,
  };
}

type ToolCtx = { db: Db; userId: string; modes: Modes; proposed: string[] };

const ToolInputs = {
  search_products: z.object({ query: z.string().max(100) }),
  get_product: z.object({ id: z.string().max(80) }),
  get_alternatives: z.object({ id: z.string().max(80) }),
  compare_products: z.object({
    ids: z.array(z.string().max(80)).min(2).max(4),
  }),
  search_past_conversations: z.object({ query: z.string().max(200) }),
  propose_preference: z.object({ text: z.string().min(3).max(120) }),
};

export async function runTool(
  ctx: ToolCtx,
  name: string,
  input: unknown,
): Promise<string> {
  const schema = ToolInputs[name as keyof typeof ToolInputs];
  if (!schema) return JSON.stringify({ error: `Unknown tool ${name}` });
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    return JSON.stringify({
      error: "Invalid input",
      issues: parsed.error.issues.map((i) => i.message),
    });
  const a = parsed.data as Record<string, unknown>;

  switch (name) {
    case "search_products": {
      const found = searchProducts(String(a.query), { limit: 8 });
      return JSON.stringify(
        found.length
          ? found.map(brief)
          : { result: "No matching products in the NutriScan catalog." },
      );
    }
    case "get_product": {
      const p = getProduct(String(a.id));
      return JSON.stringify(
        p
          ? detail(p)
          : { error: "No product with that id. Use search_products." },
      );
    }
    case "get_alternatives": {
      const alts = betterAlternatives(String(a.id), ctx.modes);
      return JSON.stringify(
        alts.length
          ? alts.map(brief)
          : {
              result:
                "No higher-scoring product in the same category matches the user's modes.",
            },
      );
    }
    case "compare_products": {
      const ps = (a.ids as string[])
        .map((id) => getProduct(id))
        .filter((p): p is CatalogProduct => Boolean(p));
      return JSON.stringify(
        ps.map((p) => ({
          ...detail(p),
          passesUserModes: passesModes(p, ctx.modes),
        })),
      );
    }
    case "search_past_conversations": {
      const rows = await ctx.db
        .select({
          summary: nouriConversations.summary,
          updatedAt: nouriConversations.updatedAt,
        })
        .from(nouriConversations)
        .where(
          and(
            eq(nouriConversations.userId, ctx.userId),
            sql`to_tsvector('simple', coalesce(${nouriConversations.summary}, '')) @@ plainto_tsquery('simple', ${String(a.query)})`,
          ),
        )
        .orderBy(desc(nouriConversations.updatedAt))
        .limit(3);
      return JSON.stringify(
        rows.length
          ? rows.map((r) => ({
              when: r.updatedAt.toISOString().slice(0, 10),
              summary: r.summary,
            }))
          : { result: "Nothing relevant found." },
      );
    }
    case "propose_preference": {
      const text = String(a.text).trim();
      if (ctx.proposed.length < 2) {
        await ctx.db
          .insert(userMemories)
          .values({ userId: ctx.userId, text, status: "proposed" });
        ctx.proposed.push(text);
      }
      return JSON.stringify({
        result: "Proposed. The app will ask the user to confirm.",
      });
    }
  }
  return JSON.stringify({ error: "Unhandled tool" });
}

async function userContext(db: Db, userId: string) {
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId));
  const memories = await db
    .select({ text: userMemories.text })
    .from(userMemories)
    .where(
      and(
        eq(userMemories.userId, userId),
        eq(userMemories.status, "confirmed"),
      ),
    )
    .limit(20);
  const modes = (profile?.modes ?? {}) as Modes;
  const context = [
    `User language: ${profile?.language === "bn" ? "Bangla" : "English"}.`,
    `Active modes: Halal ${modes.halalMode ? "on" : "off"}, Child Safe ${modes.childSafeMode ? "on" : "off"}.`,
    `Health profile (from the app, may be empty): ${JSON.stringify(profile?.health ?? {})}`,
    `Goals: ${JSON.stringify(profile?.goals ?? {})}`,
    `Confirmed preferences: ${memories.length ? memories.map((m) => `- ${m.text}`).join("\n") : "none"}`,
  ].join("\n");
  return { context, modes };
}

export type NouriReply = {
  conversationId: string;
  text: string;
  proposedPreferences: string[];
  model: string;
};

export async function chat(
  db: Db,
  userId: string,
  input: {
    conversationId?: string;
    message: string;
    deep: boolean;
    productId?: string;
  },
): Promise<NouriReply> {
  await assertBudget(db);
  const tier = input.deep ? "deep" : "chat";

  let conversationId = input.conversationId;
  if (conversationId) {
    const [c] = await db
      .select()
      .from(nouriConversations)
      .where(
        and(
          eq(nouriConversations.id, conversationId),
          eq(nouriConversations.userId, userId),
        ),
      );
    if (!c) conversationId = undefined;
  }
  if (!conversationId) {
    const [c] = await db
      .insert(nouriConversations)
      .values({ userId, title: input.message.slice(0, 60) })
      .returning();
    conversationId = c.id;
  }

  const previous = await db
    .select()
    .from(nouriMessages)
    .where(eq(nouriMessages.conversationId, conversationId))
    .orderBy(desc(nouriMessages.id))
    .limit(HISTORY_MESSAGES);
  const history: ChatMessage[] = previous
    .reverse()
    .map((m) =>
      m.role === "user"
        ? { role: "user" as const, content: m.text }
        : { role: "assistant" as const, content: m.text },
    );
  while (history.length && history[0].role !== "user") history.shift();

  const { context, modes } = await userContext(db, userId);
  const productHint =
    input.productId && getProduct(input.productId)
      ? `\n\n(The user is looking at product id "${input.productId}".)`
      : "";
  const messages: ChatMessage[] = [
    // Stable instructions first so providers that cache prefixes can reuse them.
    { role: "system", content: `${SYSTEM}\n\nAbout this user:\n${context}` },
    ...history,
    { role: "user", content: input.message + productHint },
  ];

  const ctx: ToolCtx = { db, userId, modes, proposed: [] };
  let finalText = "";
  let model = "";

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    // On the last round, withhold tools so the model must answer in text.
    const response = await complete(tier, {
      messages,
      tools: round < MAX_TOOL_ROUNDS ? tools : undefined,
      max_tokens: input.deep ? 2500 : 1200,
      temperature: 0.3,
    });
    await recordUsage(db, userId, "nouri", response);
    model = response.model;
    const choice = response.choices[0];
    const msg = choice.message;
    const calls = msg.tool_calls ?? [];

    if (calls.length === 0) {
      finalText =
        (msg.content ?? "").trim() ||
        "Sorry, I could not answer that. Please try asking another way.";
      break;
    }
    messages.push({
      role: "assistant",
      content: msg.content ?? null,
      tool_calls: calls,
    });
    for (const call of calls) {
      let args: unknown = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ error: "Arguments were not valid JSON." }),
        });
        continue;
      }
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: await runTool(ctx, call.function.name, args),
      });
    }
  }

  await db.insert(nouriMessages).values([
    { conversationId, role: "user", text: input.message },
    { conversationId, role: "assistant", text: finalText },
  ]);
  await db
    .update(nouriConversations)
    .set({ updatedAt: new Date() })
    .where(eq(nouriConversations.id, conversationId));
  // One row per user message: this is what the daily limit counts.
  await db
    .insert(aiUsage)
    .values({ userId, feature: "nouri_message", model: tier, costUsd: "0" });

  // Refresh the conversation summary every 3 exchanges, in the background.
  const count = previous.length + 2;
  if (count % 6 === 0)
    void summarise(db, userId, conversationId).catch(() => {});

  return {
    conversationId,
    text: finalText,
    proposedPreferences: ctx.proposed,
    model,
  };
}

export async function summarise(
  db: Db,
  userId: string,
  conversationId: string,
) {
  await assertBudget(db);
  const rows = await db
    .select()
    .from(nouriMessages)
    .where(eq(nouriMessages.conversationId, conversationId))
    .orderBy(nouriMessages.id)
    .limit(60);
  if (rows.length < 2) return;
  const transcript = rows
    .map((r) => `${r.role === "user" ? "User" : "Nouri"}: ${r.text}`)
    .join("\n")
    .slice(-12_000);
  const res = await complete("chat", {
    max_tokens: 250,
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "Summarise this nutrition-assistant conversation in at most 3 short English sentences for later recall: products discussed, the user's concerns, and conclusions. No greetings.",
      },
      { role: "user", content: transcript },
    ],
  });
  await recordUsage(db, userId, "summary", res);
  const summary = (res.choices[0].message.content ?? "").trim();
  if (summary)
    await db
      .update(nouriConversations)
      .set({ summary })
      .where(eq(nouriConversations.id, conversationId));
}
