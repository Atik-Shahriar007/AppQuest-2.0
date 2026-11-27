/**
 * One-off bulk job: draft plain-language explanations for every ingredient in the catalog,
 * in English and Bangla, with a free model through OpenRouter.
 *
 *   pnpm tsx scripts/draft-ingredients.ts
 *
 * Output: shared/catalog/ingredients.draft.json. Every entry is marked `ai_draft` and
 * `reviewed: false`; the app labels them "AI draft, pending team review" until a team member
 * reviews them. Re-running only drafts ingredients that are not in the file yet.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { complete } from "../server/ai/client";
import { rawSql } from "../server/db/client";
import snapshotJson from "../shared/catalog/catalog.snapshot.json";
import type { CatalogSnapshot } from "../shared/catalog/types";
import {
  ingredientKey,
  type IngredientDraft,
} from "../shared/catalog/ingredients";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(appRoot, "shared", "catalog", "ingredients.draft.json");
const BATCH = Number(process.env.BATCH) || 5;

const Entry = z.object({
  key: z.string(),
  nameEn: z.string(),
  nameBn: z.string(),
  purposeEn: z.string(),
  purposeBn: z.string(),
  detailsEn: z.string(),
  detailsBn: z.string(),
  attention: z.enum(["none", "low", "moderate", "high"]),
  allergen: z.boolean(),
  allergenNoteEn: z.string().nullable(),
  allergenNoteBn: z.string().nullable(),
});
const Batch = z.object({ items: z.array(Entry) });

const EXAMPLE = {
  key: "salt",
  nameEn: "Salt",
  nameBn: "লবণ",
  purposeEn: "Flavour and preservation",
  purposeBn: "স্বাদ ও সংরক্ষণ",
  detailsEn:
    "Common salt (sodium chloride) is the main source of sodium in packaged foods. WHO advises adults to eat less than 5 g of salt a day.",
  detailsBn:
    "সাধারণ লবণ (সোডিয়াম ক্লোরাইড) প্যাকেটজাত খাবারে সোডিয়ামের প্রধান উৎস। WHO প্রাপ্তবয়স্কদের দিনে ৫ গ্রামের কম লবণ খাওয়ার পরামর্শ দেয়।",
  attention: "moderate",
  allergen: false,
  allergenNoteEn: null,
  allergenNoteBn: null,
};

const SYSTEM = `You write short ingredient explanations for NutriScan, a packaged-food guide for Bangladesh.
For each ingredient key you get, return one item with the same key:
- nameEn: a clean English name. nameBn: the Bangla name as commonly written in Bangladesh.
- purposeEn/purposeBn: its technological or nutritional role in a packaged food, a few words.
- detailsEn/detailsBn: 1-2 plain sentences: what it is and, where relevant, the nutrition point (e.g. "adds free sugar", "adds sodium"). Mention an official limit only for well-established WHO guidance (free sugar, sodium/salt, saturated fat, trans fat).
- attention: "none" for ordinary ingredients, "low" or "moderate" when the nutrition point matters (sugar, salt, saturated fat, sweeteners), "high" only for partially hydrogenated oil (industrial trans fat).
- allergen: true only for major allergens (wheat/gluten, milk, egg, peanut, tree nuts, soy, sesame, fish, shellfish, mustard). Give a one-sentence note in both languages, else null.
Rules: an approved additive is not "harmful"; never write "carcinogenic", "toxic" or "unsafe". Do not give halal rulings. Do not invent amounts. Bangla must be natural Bangla script, not transliteration.`;

async function main() {
  const snap = snapshotJson as unknown as CatalogSnapshot;
  const existing: Record<string, IngredientDraft> = existsSync(outPath)
    ? JSON.parse(readFileSync(outPath, "utf8"))
    : {};
  const keys = new Set<string>();
  for (const p of snap.products) {
    if (p.kind !== "food") continue;
    for (const i of p.ingredients) {
      const k = ingredientKey(i);
      if (k && !existing[k]) keys.add(k);
    }
  }
  const todo = [...keys];
  console.log(
    `${Object.keys(existing).length} drafted already, ${todo.length} to draft`,
  );

  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    try {
      const res = await complete("chat", {
        max_tokens: 8000,
        timeoutMs: 180_000,
        temperature: 0.2,
        // Plain JSON mode: free models reason first, and strict schemas route to fewer endpoints.
        // The shape is still validated with zod below.
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `${SYSTEM}\n\nReturn JSON exactly like: ${JSON.stringify({ items: [EXAMPLE] })}`,
          },
          { role: "user", content: JSON.stringify({ keys: batch }) },
        ],
      });
      const text = (res.choices[0].message.content ?? "").replace(
        /^```(?:json)?\s*|\s*```$/g,
        "",
      );
      const parsed = Batch.safeParse(JSON.parse(text));
      if (!parsed.success) {
        console.warn(`batch ${i / BATCH + 1}: invalid JSON shape, skipped`);
        continue;
      }
      let added = 0;
      for (const e of parsed.data.items) {
        if (!batch.includes(e.key)) continue; // never accept keys we did not ask for
        existing[e.key] = {
          ...e,
          provenance: "ai_draft",
          reviewed: false,
          model: res.model,
        };
        added++;
      }
      writeFileSync(outPath, `${JSON.stringify(existing, null, 1)}\n`);
      console.log(
        `batch ${i / BATCH + 1}/${Math.ceil(todo.length / BATCH)}: ${added}/${batch.length} (${res.model})`,
      );
    } catch (e) {
      console.warn(
        `batch ${i / BATCH + 1} failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
  console.log(`done: ${Object.keys(existing).length} entries`);
  await rawSql.end();
}

main().catch(async (e) => {
  console.error(e);
  await rawSql.end();
  process.exit(1);
});
