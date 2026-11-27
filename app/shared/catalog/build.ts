/**
 * Turns one raw product record from NutriScan-Product-Database into a scored CatalogProduct.
 * Pure function: the ingest script handles files, this handles rules.
 */
import { scoreNqss, type NutrientValue } from "../nqss/engine";
import { assessWholeFood, declared, estimateEnergyKcal, estimateFreeSugar } from "../nqss/estimate";
import { childLabel, halalLabel } from "../nqss/labels";
import type {
  CareIngredient,
  CatalogOverrides,
  CatalogProduct,
  Nutrition,
  NutrientField,
  ProductKind,
  ScoringCategory,
} from "./types";

type GroupRule = { category: ScoringCategory; subcategory: string; form: "solid" | "liquid" };

/** Folder name -> scoring category (methodology section 5.1). */
const GROUPS: Record<string, GroupRule> = {
  Bun: { category: "Bakery", subcategory: "Bread", form: "solid" },
  Cake: { category: "Bakery", subcategory: "Cake", form: "solid" },
  Chanachur: { category: "Snacks", subcategory: "Chanachur", form: "solid" },
  Chips: { category: "Snacks", subcategory: "Chips", form: "solid" },
  "Chocolate-Biscuit": { category: "Bakery", subcategory: "Biscuit", form: "solid" },
  "Classic-Buicuit": { category: "Bakery", subcategory: "Biscuit", form: "solid" },
  "Cold-Drink": { category: "Beverages", subcategory: "Soft Drink", form: "liquid" },
  Dairy: { category: "Dairy", subcategory: "Milk", form: "liquid" },
  "Energy-Drink": { category: "Beverages", subcategory: "Energy Drink", form: "liquid" },
  Juice: { category: "Beverages", subcategory: "Juice", form: "liquid" },
  Noodles: { category: "Instant Food", subcategory: "Instant Noodles", form: "solid" },
};

const SWEETENER_RE = /sugar|syrup|honey|dextrose|glucose|fructose|sucrose|jaggery|molasses/i;
const VALID_BARCODE_LENGTHS = new Set([8, 12, 13, 14]);

export type RawRecord = Record<string, unknown>;

export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function toAscii(s: string, max = 40): string {
  const ascii = s
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return ascii.length > max ? `${ascii.slice(0, max - 1).trimEnd()}.` : ascii;
}

/** Split an ingredients sentence on commas that are not inside brackets. */
export function splitIngredients(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim().replace(/\.$/, ""));
  return out;
}

/** "30g" -> {amount: 30, unit: "g"}; "1 L" -> {amount: 1000, unit: "ml"}. */
export function parseQuantity(s: unknown): { amount: number; unit: "g" | "ml" } | null {
  if (typeof s !== "string") return null;
  const m = /(\d+(?:\.\d+)?)\s*(kg|g|gm|ml|l|ltr|litre|liter)\b/i.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  const u = m[2].toLowerCase();
  if (u === "kg") return { amount: n * 1000, unit: "g" };
  if (u === "g" || u === "gm") return { amount: n, unit: "g" };
  if (u === "ml") return { amount: n, unit: "ml" };
  return { amount: n * 1000, unit: "ml" };
}

function estimateServing(net: unknown, form: "solid" | "liquid"): Nutrition["servingSize"] {
  const q = parseQuantity(net);
  if (!q) return null;
  if (form === "liquid") {
    return q.amount <= 500
      ? { text: `${q.amount} ml (1 pack)`, provenance: "estimated" }
      : { text: "250 ml (1 glass)", provenance: "estimated" };
  }
  return q.amount <= 80
    ? { text: `${q.amount} g (1 pack)`, provenance: "estimated" }
    : { text: "30 g", provenance: "estimated" };
}

function num(v: NutrientValue | null): number | null {
  return v ? v.value : null;
}

export type BuildContext = {
  kindDir: string; // "food" | "personal-care" | "home-care"
  group: string; // folder under the kind dir
  imageKey: string;
  overrides: CatalogOverrides;
};

export function buildProduct(raw: RawRecord, ctx: BuildContext): CatalogProduct {
  const kind: ProductKind =
    ctx.kindDir === "food" ? "food" : ctx.kindDir === "personal-care" ? "personal_care" : "home_care";
  const barcode = String(raw.barcode ?? "").replace(/\D/g, "");
  const override = ctx.overrides[barcode];
  const name = String(override?.name ?? raw.product_name ?? "Unnamed product").trim();
  const brand = String(raw.brand ?? "").trim();
  const validation: string[] = [];

  if (!VALID_BARCODE_LENGTHS.has(barcode.length)) validation.push(`barcode_length_${barcode.length}`);

  const halalRaw = override?.halal_status ?? raw.halal_status;
  const childRaw = override?.child_suitability ?? raw.child_suitability;

  const base = {
    id: slugify(`${brand} ${name}`) || barcode,
    barcode,
    name,
    asciiName: toAscii(name),
    brand,
    kind,
    group: ctx.group,
    rawCategory: String(raw.category ?? ""),
    netQuantity: (raw.net_weight ?? raw.quantity ?? null) as string | null,
    imageKey: ctx.imageKey,
    halal: halalLabel(halalRaw),
    child: childLabel(childRaw),
  };

  if (kind !== "food") {
    const careIngredients: CareIngredient[] = Array.isArray(raw.ingredients)
      ? (raw.ingredients as { name?: string; purpose?: string }[]).map((i) => ({
          name: String(i.name ?? "").trim(),
          purpose: i.purpose ? String(i.purpose) : null,
        }))
      : [];
    return {
      ...base,
      scoringCategory: null,
      subcategory: null,
      ingredientsText: careIngredients.map((i) => i.name).join(", "),
      ingredients: careIngredients.map((i) => i.name),
      careIngredients,
      nutrition: null,
      nqss: null, // Methodology scope: personal and home care never get an NQSS.
      care: {
        description: (raw.description as string) ?? null,
        productInformation: (raw.product_information as Record<string, unknown>) ?? null,
        safetyInformation: (raw.safety_information as Record<string, unknown>) ?? null,
        chemicalInformation: (raw.chemical_information as Record<string, unknown>) ?? null,
        manufacturer: (raw.manufacturer as string) ?? null,
        countryOfOrigin: (raw.country_of_origin as string) ?? null,
      },
      validation,
    };
  }

  if (halalRaw === undefined) validation.push("missing_halal_status");
  if (childRaw === undefined) validation.push("missing_child_suitability");
  if (halalRaw === "suitable_with_caution") validation.push("halal_value_looks_like_a_child_value");

  const rule = GROUPS[ctx.group] ?? { category: "Other Food" as const, subcategory: ctx.group, form: "solid" as const };
  const ingredientsText = String(raw.ingredients ?? "");
  const ingredients = splitIngredients(ingredientsText);
  const hasSweetener = SWEETENER_RE.test(ingredientsText);
  const isDairy = rule.category === "Dairy";
  const subcategory = isDairy ? (hasSweetener ? "Flavoured Milk" : "Milk") : rule.subcategory;

  const n = { ...((raw.nutrition_per_100g as Record<string, unknown>) ?? {}) };
  const corrected = new Set<string>();
  for (const [k, v] of Object.entries(override?.nutrition ?? {})) {
    n[k] = v;
    corrected.add(k);
  }
  const dv = (k: string): NutrientValue | null => {
    const v = declared(n[k]);
    return v && corrected.has(k) ? { ...v, provenance: "corrected" } : v;
  };

  const values: Record<NutrientField, NutrientValue | null> = {
    energy_kcal: dv("energy_kcal") ?? estimateEnergyKcal(n.total_fat_g, n.total_carbohydrate_g, n.protein_g),
    total_fat_g: dv("total_fat_g"),
    saturated_fat_g: dv("saturated_fat_g"),
    trans_fat_g: dv("trans_fat_g"),
    cholesterol_mg: dv("cholesterol_mg"),
    sodium_mg: dv("sodium_mg"),
    total_carbohydrate_g: dv("total_carbohydrate_g"),
    total_sugar_g: dv("total_sugar_g"),
    free_sugar_g:
      dv("free_sugar_g") ??
      dv("added_sugar_g") ??
      estimateFreeSugar(n.total_sugar_g, { isDairy, ingredients: ingredientsText, totalCarbohydrateG: n.total_carbohydrate_g, form: rule.form }),
    added_sugar_g: dv("added_sugar_g"),
    fibre_g: dv("fibre_g"),
    protein_g: dv("protein_g"),
  };

  // Data-quality checks (reported, never blocking).
  const fat = num(values.total_fat_g);
  const carb = num(values.total_carbohydrate_g);
  const protein = num(values.protein_g);
  const sugar = num(values.total_sugar_g);
  const sat = num(values.saturated_fat_g);
  const sodium = num(values.sodium_mg);
  if (fat !== null && carb !== null && protein !== null && fat + carb + protein > 100) validation.push("macros_exceed_100g");
  if (sugar !== null && carb !== null && sugar > carb) validation.push("sugar_exceeds_carbohydrate");
  if (sat !== null && fat !== null && sat > fat) validation.push("saturated_fat_exceeds_total_fat");
  const declaredNumbers = Object.values(n).map((v) => declared(v)?.value).filter((v) => v !== undefined);
  if (declaredNumbers.length > 0 && declaredNumbers.every((v) => v === 0)) validation.push("all_values_zero");
  if (rule.form === "liquid" && sugar === 0 && carb !== null && carb > 5) validation.push("sugar_zero_but_carbohydrate_high");
  if (rule.category === "Bakery" && sodium !== null && sodium > 1500) validation.push("sodium_unusually_high");
  // Benchmark comparison (child-suitability-benchmark.md): warnings only, the record's label wins.
  if (sodium !== null && sodium > 400 && base.child.badge !== "not_suitable") validation.push("benchmark_sodium_over_400mg");
  if (/caffeine/i.test(ingredientsText) && base.child.badge !== "not_suitable") validation.push("benchmark_contains_caffeine");

  const nutrition: Nutrition = {
    basis: rule.form === "liquid" ? "per_100ml" : "per_100g",
    values,
    servingSize: estimateServing(raw.net_weight, rule.form),
  };

  const isPlainDairy = isDairy && !hasSweetener;
  const nqss = scoreNqss({
    form: rule.form,
    sweetenedBeverage: rule.form === "liquid" && hasSweetener,
    energyKcal: values.energy_kcal,
    freeSugarG: values.free_sugar_g,
    sodiumMg: values.sodium_mg,
    saturatedFatG: values.saturated_fat_g,
    transFatG: values.trans_fat_g,
    fibreG: values.fibre_g,
    proteinG: values.protein_g,
    wholeFood: assessWholeFood(ingredientsText, isPlainDairy),
  });

  return {
    ...base,
    scoringCategory: rule.category,
    subcategory,
    ingredientsText,
    ingredients,
    careIngredients: null,
    nutrition,
    nqss,
    care: null,
    validation,
  };
}
