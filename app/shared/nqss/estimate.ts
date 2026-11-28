/**
 * Estimation rules approved for the AppQuest showcase (Plan v2, section 4).
 * Every estimate is marked `provenance: "estimated"` with a method string, so it can be
 * told apart from declared label data and corrected after the showcase.
 *
 * Deliberate choice: dietary fibre is NOT estimated. The methodology (section 7.4) forbids
 * inferring fibre, and every product still gets a full score through available-weight
 * rescaling, labelled "Estimated score".
 */
import type { NutrientValue, WholeFoodEvidence } from "./engine";

/** Parse a label value: 12, "0.0", "<0.1", "<3.0". Returns null for blanks and junk. */
export function parseLabelValue(raw: unknown): { value: number; operator: "=" | "<" } | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? { value: raw, operator: "=" } : null;
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  const m = /^(<)?\s*(\d+(?:\.\d+)?)$/.exec(s);
  if (!m) return null;
  return { value: Number(m[2]), operator: m[1] ? "<" : "=" };
}

export function declared(raw: unknown): NutrientValue | null {
  const p = parseLabelValue(raw);
  return p ? { ...p, provenance: "declared" } : null;
}

/** Section 7.2: Atwater screening estimate, only when fat, carbohydrate and protein are all declared. */
export function estimateEnergyKcal(fatG: unknown, carbG: unknown, proteinG: unknown): NutrientValue | null {
  const f = parseLabelValue(fatG);
  const c = parseLabelValue(carbG);
  const p = parseLabelValue(proteinG);
  if (!f || !c || !p) return null;
  const kcal = 9 * f.value + 4 * c.value + 4 * p.value;
  return { value: Math.round(kcal), operator: "=", provenance: "estimated", method: "atwater_9_4_4" };
}

const SUGAR_SOURCES = [
  "sugar",
  "syrup",
  "honey",
  "juice",
  "concentrate",
  "dextrose",
  "glucose",
  "fructose",
  "sucrose",
  "maltodextrin",
  "jaggery",
  "molasses",
  "pulp",
  "puree",
];
const MILK_BASES = ["milk", "yoghurt", "yogurt", "curd"];
/** Typical lactose in milk, g per 100 ml. */
const LACTOSE_G = 4.7;

export type SugarContext = {
  isDairy: boolean;
  ingredients: string;
  /** Declared total carbohydrate, used only to repair an impossible "0 g sugar" label on a drink. */
  totalCarbohydrateG?: unknown;
  /** The repair applies to liquids only: in a drink carbohydrate is essentially sugar, in a snack it is mostly starch. */
  form?: "solid" | "liquid";
};

function firstIngredient(ingredients: string): string {
  return (ingredients.split(/[,.(]/)[0] ?? "").toLowerCase().trim();
}

/**
 * Simple three-rule free-sugar estimate (Plan v2):
 * 1. Plain dairy with no sugar source in the ingredients: 0 g (lactose only).
 * 2. Sweetened dairy whose first ingredient is milk or yoghurt: total sugar minus 4.7 g lactose.
 * 3. Everything else: all sugar is treated as free sugar (conservative upper bound).
 * Repair (drinks only): sugar declared 0 g while a sugar is listed -> carbohydrate as the upper bound.
 */
export function estimateFreeSugar(totalSugar: unknown, ctx: SugarContext): NutrientValue | null {
  const t = parseLabelValue(totalSugar);
  if (!t) return null;
  const ing = ctx.ingredients.toLowerCase();
  const hasSugarSource = SUGAR_SOURCES.some((s) => ing.includes(s));
  // Label says 0 g sugar but sugar is an ingredient: the label is wrong. Use carbohydrate as a
  // conservative upper bound rather than rewarding the product for a data-entry error.
  const carb = parseLabelValue(ctx.totalCarbohydrateG);
  if (ctx.form === "liquid" && t.value === 0 && hasSugarSource && /sugar|syrup|honey|dextrose|glucose|fructose|sucrose/.test(ing) && carb && carb.value > 0) {
    return { value: carb.value, operator: "=", provenance: "estimated", method: "carbohydrate_upper_bound_sugar_declared_zero" };
  }
  if (ctx.isDairy && !hasSugarSource) {
    return { value: 0, operator: "=", provenance: "estimated", method: "plain_dairy_lactose_only" };
  }
  if (ctx.isDairy && MILK_BASES.some((m) => firstIngredient(ctx.ingredients).includes(m))) {
    const v = Math.max(0, Math.round((t.value - LACTOSE_G) * 10) / 10);
    return { value: v, operator: t.operator, provenance: "estimated", method: "sweetened_dairy_minus_lactose" };
  }
  return { value: t.value, operator: t.operator, provenance: "estimated", method: "total_sugar_as_free_sugar" };
}

/** Controlled whole-food dictionary (section 4.8). Potato, flavours and "multigrain" do not qualify. */
const WHOLE_FOOD_TERMS: { term: RegExp; label: string }[] = [
  { term: /whole\s*(wheat|grain|meal)|atta/, label: "whole grain" },
  { term: /\boats?\b|oatmeal/, label: "oats" },
  { term: /brown rice/, label: "brown rice" },
  { term: /lentil|\bdal\b|\bdaal\b|masoor|mung|moong/, label: "lentils" },
  { term: /chick\s?pea|gram flour|besan|\bgram\b|chola|chana/, label: "chickpea" },
  { term: /\bbeans?\b|\bpeas?\b/, label: "pulses" },
  { term: /peanut|groundnut|almond|cashew|walnut|pistachio|\bnuts?\b/, label: "nuts" },
  { term: /sesame|basil seed|chia|flax|sunflower seed|pumpkin seed/, label: "seeds" },
];

const MILK_IDENTITY = /^(cow'?s\s+)?(full cream\s+)?milk$/;

/**
 * Ingredient-dictionary evidence. Without declared percentages the dictionary can reach level B
 * (4 points) at most; the 8 and 10 bands need a documented product rule and are not used.
 */
export function assessWholeFood(ingredients: string, isPlainDairy: boolean): WholeFoodEvidence {
  const lower = ingredients.toLowerCase();
  const parts = lower.split(/,/).map((p) => p.trim()).filter(Boolean);
  if (isPlainDairy && parts.length <= 2 && MILK_IDENTITY.test(parts[0]?.replace(/[.]/g, "") ?? "")) {
    return { level: "identity", points: 6, matched: ["milk"], provenance: "estimated" };
  }
  const matchedTop: string[] = [];
  const matchedAny: string[] = [];
  parts.forEach((p, i) => {
    for (const { term, label } of WHOLE_FOOD_TERMS) {
      if (term.test(p)) {
        if (i < 2) matchedTop.push(label);
        matchedAny.push(label);
      }
    }
  });
  if (matchedTop.length > 0) return { level: "B", points: 4, matched: [...new Set(matchedTop)], provenance: "estimated" };
  if (matchedAny.length > 0) return { level: "C", points: 2, matched: [...new Set(matchedAny)], provenance: "estimated" };
  return { level: "none", points: 0, matched: [], provenance: "estimated" };
}
