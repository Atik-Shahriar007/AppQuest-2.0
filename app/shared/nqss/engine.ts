/**
 * NutriScan Nutritional Quality Scoring Standard (NQSS) v1.0 - deterministic engine.
 *
 * Implements NutriScan-Product-Database/benchmark/food-scoring-methodology.md:
 * - 8 components with the published bands (section 4)
 * - available-weight rescaling for unavailable components (section 6.2)
 * - conservative bound handling for "<x" qualifiers (section 7.6)
 * - round half up to one decimal (section 6.1)
 *
 * Pure TypeScript, no I/O. The language model never computes or changes these numbers.
 */

export const ALGORITHM = "NutriScan NQSS";
export const ALGORITHM_VERSION = "1.0.0";
/** Bumped whenever an estimation rule (not a band) changes. */
export const RULE_SET_VERSION = "2026.11-showcase.1";

export type Provenance = "declared" | "estimated" | "corrected";

/** One nutrient value. `operator: "<"` means the label printed an upper bound such as "<0.1". */
export type NutrientValue = {
  value: number;
  operator?: "=" | "<";
  provenance: Provenance;
  method?: string;
};

export type ComponentKey =
  | "freeSugar"
  | "sodium"
  | "saturatedFat"
  | "transFat"
  | "energy"
  | "fibre"
  | "protein"
  | "wholeFood";

export type WholeFoodEvidence = {
  level: "none" | "C" | "B" | "identity";
  points: 0 | 2 | 4 | 6 | 8 | 10;
  matched: string[];
  provenance: Provenance;
};

export type NqssInput = {
  form: "solid" | "liquid";
  /** Soft drinks, energy drinks, fruit drinks, flavoured milks: anything sweetened that is drunk. */
  sweetenedBeverage: boolean;
  energyKcal: NutrientValue | null;
  freeSugarG: NutrientValue | null;
  sodiumMg: NutrientValue | null;
  saturatedFatG: NutrientValue | null;
  transFatG: NutrientValue | null;
  fibreG: NutrientValue | null;
  proteinG: NutrientValue | null;
  wholeFood: WholeFoodEvidence | null;
};

export type ComponentResult = {
  key: ComponentKey;
  max: number;
  points: number | null; // null = unavailable
  input: number | null;
  bounded: boolean;
  provenance: Provenance | null;
};

export type NqssStatus = "complete" | "provisional" | "withheld";
export type NqssBand = "excellent" | "good" | "moderate" | "low";

export type NqssResult = {
  algorithm: typeof ALGORITHM;
  algorithmVersion: string;
  ruleSetVersion: string;
  status: NqssStatus;
  score: number | null;
  unroundedScore: number | null;
  band: NqssBand | null;
  availableWeight: number;
  components: ComponentResult[];
  flags: string[];
  withheldReason?: string;
};

export const MAX_POINTS: Record<ComponentKey, number> = {
  freeSugar: 20,
  sodium: 15,
  saturatedFat: 15,
  transFat: 10,
  energy: 5,
  fibre: 15,
  protein: 10,
  wholeFood: 10,
};

const LIMITING: ComponentKey[] = ["freeSugar", "sodium", "saturatedFat", "transFat", "energy"];

/** [upper bound inclusive, points]; the last entry applies above every bound. */
type Bands = readonly (readonly [number, number])[];

// Section 4.1 - lower is better
const SUGAR_BANDS: Bands = [[2.5, 20], [5, 16], [10, 11], [15, 6], [22.5, 2], [Infinity, 0]];
// Section 4.2
const SODIUM_BANDS: Bands = [[120, 15], [300, 12], [600, 8], [900, 4], [1200, 1], [Infinity, 0]];
// Section 4.3
const SATFAT_BANDS: Bands = [[1.5, 15], [3, 12], [5, 8], [7.5, 4], [10, 1], [Infinity, 0]];
// Section 4.4 (0 handled separately: only an exact declared/measured zero earns 10)
const TRANS_BANDS: Bands = [[0.2, 8], [0.5, 5], [1, 2], [Infinity, 0]];
// Section 4.5
const ENERGY_BANDS: Bands = [[100, 5], [200, 4], [300, 3], [400, 2], [500, 1], [Infinity, 0]];
// Section 4.6 - higher is better: [lower bound exclusive, points], checked from the top
const FIBRE_BANDS: Bands = [[10, 15], [7.5, 13], [5, 11], [2.5, 8], [1, 4], [-Infinity, 0]];
// Section 4.7
const PROTEIN_BANDS: Bands = [[20, 10], [12, 9], [8, 7], [5, 5], [2, 3], [-Infinity, 0]];

function lowerIsBetter(value: number, bands: Bands): number {
  for (const [upper, points] of bands) if (value <= upper) return points;
  return 0;
}

function higherIsBetter(value: number, bands: Bands): number {
  for (const [lowerExclusive, points] of bands) if (value > lowerExclusive) return points;
  return 0;
}

/** Round half up to one decimal: 72.25 -> 72.3, never banker's rounding. */
export function roundHalfUp1(x: number): number {
  return Math.floor(x * 10 + 0.5 + 1e-9) / 10;
}

export function bandFor(score: number): NqssBand {
  if (score >= 80) return "excellent";
  if (score >= 60) return "good";
  if (score >= 40) return "moderate";
  return "low";
}

/**
 * Value used for scoring. Section 7.6: for a harmful nutrient "<x" scores as x (upper bound);
 * for a beneficial nutrient "<x" scores as 0 (lower bound).
 */
function scoringValue(v: NutrientValue, harmful: boolean): number {
  if (v.operator === "<") return harmful ? v.value : 0;
  return v.value;
}

function isValid(v: NutrientValue | null): v is NutrientValue {
  return v !== null && Number.isFinite(v.value) && v.value >= 0;
}

function harmfulComponent(key: ComponentKey, v: NutrientValue | null, bands: Bands): ComponentResult {
  if (!isValid(v)) return { key, max: MAX_POINTS[key], points: null, input: null, bounded: false, provenance: null };
  const x = scoringValue(v, true);
  return {
    key,
    max: MAX_POINTS[key],
    points: lowerIsBetter(x, bands),
    input: x,
    bounded: v.operator === "<",
    provenance: v.provenance,
  };
}

function beneficialComponent(key: ComponentKey, v: NutrientValue | null, bands: Bands): ComponentResult {
  if (!isValid(v)) return { key, max: MAX_POINTS[key], points: null, input: null, bounded: false, provenance: null };
  const x = scoringValue(v, false);
  return {
    key,
    max: MAX_POINTS[key],
    points: higherIsBetter(x, bands),
    input: x,
    bounded: v.operator === "<",
    provenance: v.provenance,
  };
}

function transFatComponent(v: NutrientValue | null): ComponentResult {
  const key: ComponentKey = "transFat";
  if (!isValid(v)) return { key, max: 10, points: null, input: null, bounded: false, provenance: null };
  const bounded = v.operator === "<";
  // Exact zero earns 10. A "<x" bound is scored at its upper bound (we do not know the
  // Bangladeshi label convention for the limit, so we do not award the zero band).
  const x = bounded ? v.value : v.value;
  const points = !bounded && x === 0 ? 10 : lowerIsBetter(x, TRANS_BANDS);
  return { key, max: 10, points, input: x, bounded, provenance: v.provenance };
}

export function scoreNqss(input: NqssInput): NqssResult {
  const flags: string[] = [];

  const sugar = harmfulComponent("freeSugar", input.freeSugarG, SUGAR_BANDS);
  // Section 4.1 beverage rule: sugar-sweetened beverage above 10 g/100 ml gets 0 sugar points.
  if (input.form === "liquid" && input.sweetenedBeverage && sugar.input !== null && sugar.input > 10) {
    sugar.points = 0;
    flags.push("sugar_sweetened_beverage");
  }

  const components: ComponentResult[] = [
    sugar,
    harmfulComponent("sodium", input.sodiumMg, SODIUM_BANDS),
    harmfulComponent("saturatedFat", input.saturatedFatG, SATFAT_BANDS),
    transFatComponent(input.transFatG),
    harmfulComponent("energy", input.energyKcal, ENERGY_BANDS),
    beneficialComponent("fibre", input.fibreG, FIBRE_BANDS),
    beneficialComponent("protein", input.proteinG, PROTEIN_BANDS),
    input.wholeFood
      ? {
          key: "wholeFood",
          max: 10,
          points: input.wholeFood.points,
          input: null,
          bounded: false,
          provenance: input.wholeFood.provenance,
        }
      : { key: "wholeFood", max: 10, points: null, input: null, bounded: false, provenance: null },
  ];

  const available = components.filter((c) => c.points !== null);
  const availableWeight = available.reduce((s, c) => s + c.max, 0);
  const availablePoints = available.reduce((s, c) => s + (c.points ?? 0), 0);

  // Section 6.2 minimum: at least 3 components, at least one limiting nutrient.
  const hasLimiting = available.some((c) => LIMITING.includes(c.key));
  if (available.length < 3 || !hasLimiting) {
    return {
      algorithm: ALGORITHM,
      algorithmVersion: ALGORITHM_VERSION,
      ruleSetVersion: RULE_SET_VERSION,
      status: "withheld",
      score: null,
      unroundedScore: null,
      band: null,
      availableWeight,
      components,
      flags,
      withheldReason: "Not enough nutrition information to produce a meaningful score.",
    };
  }

  const unrounded = Math.min(100, Math.max(0, (100 * availablePoints) / availableWeight));
  const score = roundHalfUp1(unrounded);

  const allAvailable = available.length === components.length;
  const anyEstimatedOrBounded = available.some((c) => c.bounded || c.provenance === "estimated");
  const status: NqssStatus = allAvailable && !anyEstimatedOrBounded ? "complete" : "provisional";

  for (const c of components) {
    if (c.points === null) flags.push(`unavailable:${c.key}`);
    else if (c.provenance === "estimated") flags.push(`estimated:${c.key}`);
    if (c.bounded) flags.push(`bounded:${c.key}`);
  }

  return {
    algorithm: ALGORITHM,
    algorithmVersion: ALGORITHM_VERSION,
    ruleSetVersion: RULE_SET_VERSION,
    status,
    score,
    unroundedScore: unrounded,
    band: bandFor(score),
    availableWeight,
    components,
    flags,
  };
}
