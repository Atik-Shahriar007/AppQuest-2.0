/**
 * Nutrition label OCR. Claude only READS the label into structured fields; the user reviews and
 * corrects every value before anything is saved, and the score is computed by our engine.
 * OCR output is never authoritative (methodology section 7.8).
 */
import { z } from "zod";
import type { Db } from "../db/client";
import { buildProduct } from "../../shared/catalog/build";
import { AiUnavailableError, assertBudget, complete, recordUsage } from "./client";

/** Values are strings exactly as printed ("12", "<0.1", "0.5") or null when not on the label. */
const Value = z.string().nullable();

export const LabelSchema = z.object({
  readable: z.boolean().describe("False if the nutrition panel is missing, blurred or cut off"),
  productName: z.string().nullable(),
  brand: z.string().nullable(),
  basis: z.enum(["per_100g", "per_100ml", "per_serving", "unknown"]),
  servingSize: z.string().nullable().describe("As printed, e.g. '30 g' or '250 ml'"),
  energyKcal: Value,
  energyKj: Value,
  totalFatG: Value,
  saturatedFatG: Value,
  transFatG: Value,
  cholesterolMg: Value,
  sodiumMg: Value,
  saltG: Value,
  totalCarbohydrateG: Value,
  totalSugarG: Value,
  addedSugarG: Value,
  fibreG: Value,
  proteinG: Value,
  ingredients: z.string().nullable(),
  uncertainFields: z.array(z.string()).describe("Field names whose digits or units you are not sure about"),
});
export type LabelReading = z.infer<typeof LabelSchema>;

const PROMPT = `Read the nutrition facts panel and ingredient list in this photo of a packaged food sold in Bangladesh.
Rules:
- Copy each number exactly as printed, keeping qualifiers like "<". Use null when a value is not printed. Never estimate or calculate a value.
- Convert only units: report sodium in mg and other nutrients in g. If only salt is printed, fill saltG and leave sodiumMg null.
- Say which basis the panel uses. If it shows both per 100 g/ml and per serving, report the per 100 values.
- List any field you are unsure about in uncertainFields (e.g. a smudged decimal point).
- Labels may be in English and/or Bangla. Report text fields in English where printed, otherwise as printed.`;

const labelJsonSchema = (() => {
  const schema = z.toJSONSchema(LabelSchema) as Record<string, unknown>;
  delete schema.$schema;
  return { ...schema, additionalProperties: false };
})();

export async function readLabel(db: Db, userId: string, image: { base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" }) {
  await assertBudget(db);
  const res = await complete("vision", {
    max_tokens: 1500,
    temperature: 0,
    response_format: { type: "json_schema", json_schema: { name: "nutrition_label", strict: true, schema: labelJsonSchema } },
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${image.mediaType};base64,${image.base64}` } },
          { type: "text", text: PROMPT },
        ],
      },
    ],
  });
  await recordUsage(db, userId, "ocr", res);
  // Some providers treat the schema as a hint: validate before anything reaches the user.
  const text = (res.choices[0].message.content ?? "").replace(/^```(?:json)?\s*|\s*```$/g, "");
  try {
    const parsed = LabelSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    if (!text) throw new AiUnavailableError("upstream");
    return null;
  }
}

/** Score preview from values the user reviewed, using the same engine as the catalog. */
export function previewScore(input: {
  name: string;
  ingredients: string;
  basis: "per_100g" | "per_100ml";
  group: string;
  values: Record<string, string | number | null>;
}) {
  const n: Record<string, unknown> = {};
  const map: Record<string, string> = {
    energyKcal: "energy_kcal",
    totalFatG: "total_fat_g",
    saturatedFatG: "saturated_fat_g",
    transFatG: "trans_fat_g",
    cholesterolMg: "cholesterol_mg",
    sodiumMg: "sodium_mg",
    totalCarbohydrateG: "total_carbohydrate_g",
    totalSugarG: "total_sugar_g",
    addedSugarG: "added_sugar_g",
    fibreG: "fibre_g",
    proteinG: "protein_g",
  };
  for (const [k, v] of Object.entries(input.values)) if (map[k] && v !== null && v !== "") n[map[k]] = v;
  // Section 3.4: salt-only labels convert at 400 mg sodium per g of salt.
  if (n.sodium_mg === undefined && input.values.saltG) n.sodium_mg = Math.round(Number(input.values.saltG) * 400);
  const p = buildProduct(
    { product_name: input.name, barcode: "00000000", ingredients: input.ingredients, nutrition_per_100g: n },
    { kindDir: "food", group: input.group, imageKey: "", overrides: {} },
  );
  return { nqss: p.nqss, nutrition: p.nutrition };
}
