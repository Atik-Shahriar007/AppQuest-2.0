import type { NqssResult, NutrientValue } from "../nqss/engine";
import type { ChildLabel, HalalLabel } from "../nqss/labels";

export type ProductKind = "food" | "personal_care" | "home_care";

export type ScoringCategory =
  | "Bakery"
  | "Beverages"
  | "Dairy"
  | "Snacks"
  | "Instant Food"
  | "Other Food";

export type NutrientField =
  | "energy_kcal"
  | "total_fat_g"
  | "saturated_fat_g"
  | "trans_fat_g"
  | "cholesterol_mg"
  | "sodium_mg"
  | "total_carbohydrate_g"
  | "total_sugar_g"
  | "free_sugar_g"
  | "added_sugar_g"
  | "fibre_g"
  | "protein_g";

export type Nutrition = {
  basis: "per_100g" | "per_100ml";
  values: Record<NutrientField, NutrientValue | null>;
  /** Display-only serving size, e.g. "250 ml (1 pack)". */
  servingSize: { text: string; provenance: "declared" | "estimated" } | null;
};

export type CareIngredient = { name: string; purpose: string | null };

export type CareDetails = {
  description: string | null;
  productInformation: Record<string, unknown> | null;
  safetyInformation: Record<string, unknown> | null;
  chemicalInformation: Record<string, unknown> | null;
  manufacturer: string | null;
  countryOfOrigin: string | null;
};

export type CatalogProduct = {
  id: string;
  barcode: string;
  name: string;
  /** Plain ASCII, at most 40 characters, for USSD screens. */
  asciiName: string;
  brand: string;
  kind: ProductKind;
  /** Folder name in the product database, e.g. "Juice". Used for Better Alternatives. */
  group: string;
  rawCategory: string;
  scoringCategory: ScoringCategory | null;
  subcategory: string | null;
  netQuantity: string | null;
  ingredientsText: string;
  ingredients: string[];
  careIngredients: CareIngredient[] | null;
  imageKey: string;
  halal: HalalLabel;
  child: ChildLabel;
  nutrition: Nutrition | null;
  nqss: NqssResult | null;
  care: CareDetails | null;
  /** Data-quality warnings for the team. Never shown to consumers, never blocks scoring. */
  validation: string[];
};

export type CatalogSnapshot = {
  generatedAt: string;
  algorithmVersion: string;
  ruleSetVersion: string;
  products: CatalogProduct[];
};

/** Team corrections, keyed by barcode. Values become provenance "corrected". */
export type CatalogOverrides = Record<
  string,
  {
    note: string;
    nutrition?: Partial<Record<NutrientField, number | string | null>>;
    halal_status?: string;
    child_suitability?: string;
    name?: string;
  }
>;
