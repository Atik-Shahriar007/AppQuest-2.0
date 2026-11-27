/**
 * Real catalog -> the prototype's Product shape, so every existing screen shows real data.
 * The full CatalogProduct rides along as `product.catalog` for screens that need more.
 * Scores come from the bundled snapshot (same numbers as the API, USSD and Nouri).
 */
import snapshotJson from "../shared/catalog/catalog.snapshot.json";
import type {
  CatalogProduct,
  CatalogSnapshot,
  NutrientField,
} from "../shared/catalog/types";
import type { ComponentKey, NutrientValue } from "../shared/nqss/engine";
import { placeholderImage, productImages } from "./product-images";
import draftsJson from "../shared/catalog/ingredients.draft.json";
import {
  ingredientKey,
  type IngredientDraft,
} from "../shared/catalog/ingredients";

const drafts = draftsJson as unknown as Record<string, IngredientDraft>;
/** Explanation for one ingredient line, labelled while it is an unreviewed AI draft. */
function explain(raw: string): Localized {
  const d = drafts[ingredientKey(raw)];
  if (!d) return L("", "");
  const tagEn = d.reviewed ? "" : " (AI draft, pending team review)";
  const tagBn = d.reviewed ? "" : " (এআই খসড়া, টিম পর্যালোচনার অপেক্ষায়)";
  return L(
    `${d.purposeEn}. ${d.detailsEn}${tagEn}`,
    `${d.purposeBn}। ${d.detailsBn}${tagBn}`,
  );
}
import type {
  Category,
  Localized,
  NutritionItem,
  Product,
} from "./nutriscan-data";

export const snapshot = snapshotJson as unknown as CatalogSnapshot;

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
const bnNum = (s: string) => s.replace(/\d/g, (d) => BN_DIGITS[Number(d)]);
const same = (s: string): Localized => ({ en: s, bn: s });
const L = (en: string, bn: string): Localized => ({ en, bn });

const KIND_TO_CATEGORY: Record<CatalogProduct["kind"], Category> = {
  food: "food",
  personal_care: "personalCare",
  home_care: "household",
};

const COMPONENT_LABEL: Record<ComponentKey, Localized> = {
  freeSugar: L("Free sugar", "ফ্রি সুগার"),
  sodium: L("Sodium", "সোডিয়াম"),
  saturatedFat: L("Saturated fat", "স্যাচুরেটেড ফ্যাট"),
  transFat: L("Trans fat", "ট্রান্স ফ্যাট"),
  energy: L("Energy density", "শক্তির ঘনত্ব"),
  fibre: L("Dietary fibre", "খাদ্যআঁশ"),
  protein: L("Protein", "প্রোটিন"),
  wholeFood: L("Whole-food ingredients", "পূর্ণ খাদ্য উপাদান"),
};

const BAND_LABEL = {
  excellent: L("Excellent nutritional profile", "চমৎকার পুষ্টি প্রোফাইল"),
  good: L("Good nutritional profile", "ভালো পুষ্টি প্রোফাইল"),
  moderate: L("Moderate nutritional profile", "মাঝারি পুষ্টি প্রোফাইল"),
  low: L("Low nutritional profile", "কম পুষ্টি প্রোফাইল"),
} as const;

type ItemSpec = {
  field: NutrientField;
  label: Localized;
  unit: "g" | "mg" | "kcal";
  icon: NutritionItem["icon"];
  component?: ComponentKey;
  /** Higher is better (protein, fibre). */
  beneficial?: boolean;
};

const ITEMS: ItemSpec[] = [
  {
    field: "energy_kcal",
    label: L("Energy", "শক্তি"),
    unit: "kcal",
    icon: "fire",
    component: "energy",
  },
  {
    field: "free_sugar_g",
    label: L("Free sugar", "ফ্রি সুগার"),
    unit: "g",
    icon: "cube-outline",
    component: "freeSugar",
  },
  {
    field: "sodium_mg",
    label: L("Sodium", "সোডিয়াম"),
    unit: "mg",
    icon: "shaker-outline",
    component: "sodium",
  },
  {
    field: "saturated_fat_g",
    label: L("Saturated fat", "স্যাচুরেটেড ফ্যাট"),
    unit: "g",
    icon: "water-outline",
    component: "saturatedFat",
  },
  {
    field: "trans_fat_g",
    label: L("Trans fat", "ট্রান্স ফ্যাট"),
    unit: "g",
    icon: "flask-outline",
    component: "transFat",
  },
  {
    field: "protein_g",
    label: L("Protein", "প্রোটিন"),
    unit: "g",
    icon: "fish",
    component: "protein",
    beneficial: true,
  },
  {
    field: "fibre_g",
    label: L("Dietary fibre", "খাদ্যআঁশ"),
    unit: "g",
    icon: "leaf",
    component: "fibre",
    beneficial: true,
  },
  {
    field: "total_fat_g",
    label: L("Total fat", "মোট ফ্যাট"),
    unit: "g",
    icon: "water-outline",
  },
  {
    field: "total_carbohydrate_g",
    label: L("Carbohydrate", "শর্করা"),
    unit: "g",
    icon: "food-apple-outline",
  },
  {
    field: "total_sugar_g",
    label: L("Total sugar", "মোট চিনি"),
    unit: "g",
    icon: "cube-outline",
  },
];

const UNIT_BN = { g: "গ্রাম", mg: "মি.গ্রা.", kcal: "কিলোক্যালরি" } as const;

function amount(
  v: NutrientValue,
  unit: ItemSpec["unit"],
  factor = 1,
): Localized {
  const n = `${v.operator === "<" ? "<" : ""}${Number((v.value * factor).toFixed(factor === 1 ? 2 : 1))}`;
  const est = v.provenance === "estimated" || factor !== 1;
  return L(
    `${n} ${unit}${est ? " (est.)" : ""}`,
    `${bnNum(n)} ${UNIT_BN[unit]}${est ? " (আনুমানিক)" : ""}`,
  );
}

const METHOD_NOTE: Record<string, Localized> = {
  atwater_9_4_4: L(
    "Estimated from fat, carbohydrate and protein.",
    "ফ্যাট, শর্করা ও প্রোটিন থেকে আনুমানিক হিসাব।",
  ),
  total_sugar_as_free_sugar: L(
    "All sugar on the label is counted as free sugar.",
    "লেবেলের সব চিনিকে ফ্রি সুগার ধরা হয়েছে।",
  ),
  sweetened_dairy_minus_lactose: L(
    "Total sugar minus the natural milk sugar.",
    "মোট চিনি থেকে দুধের প্রাকৃতিক চিনি বাদ দিয়ে।",
  ),
  plain_dairy_lactose_only: L(
    "Only natural milk sugar, no added sugar listed.",
    "শুধু দুধের প্রাকৃতিক চিনি; যোগ করা চিনি নেই।",
  ),
  carbohydrate_upper_bound_sugar_declared_zero: L(
    "The label says 0 g sugar but lists sugar, so carbohydrate is used as an upper estimate.",
    "লেবেলে ০ গ্রাম চিনি লেখা কিন্তু উপাদানে চিনি আছে, তাই শর্করাকে সর্বোচ্চ অনুমান ধরা হয়েছে।",
  ),
};

function nutritionItems(p: CatalogProduct, factor = 1): NutritionItem[] {
  const n = p.nutrition!;
  const out: NutritionItem[] = [];
  for (const spec of ITEMS) {
    const v = n.values[spec.field];
    const comp = spec.component
      ? p.nqss?.components.find((c) => c.key === spec.component)
      : undefined;
    if (!v) {
      if (spec.field === "fibre_g") {
        out.push({
          label: spec.label,
          amount: L("Not declared", "উল্লেখ নেই"),
          icon: spec.icon,
          tone: "neutral",
          note: L(
            "Not on the label, so it is left out of the score.",
            "লেবেলে নেই, তাই স্কোরে ধরা হয়নি।",
          ),
          detail: L(
            "Missing values are never counted as zero.",
            "অনুপস্থিত মানকে কখনো শূন্য ধরা হয় না।",
          ),
        });
      }
      continue;
    }
    const ratio = comp && comp.points !== null ? comp.points / comp.max : null;
    const tone: NutritionItem["tone"] =
      ratio === null
        ? "neutral"
        : ratio >= 0.7
          ? "positive"
          : ratio <= 0.3
            ? "caution"
            : "neutral";
    out.push({
      label: spec.label,
      amount: amount(v, spec.unit, factor),
      icon: spec.icon,
      tone,
      note:
        comp && comp.points !== null
          ? L(
              `${comp.points} of ${comp.max} score points`,
              `স্কোরে ${bnNum(String(comp.max))} এর মধ্যে ${bnNum(String(comp.points))}`,
            )
          : L(
              "Shown for reference; not scored separately.",
              "তথ্যের জন্য দেখানো; আলাদাভাবে স্কোর হয় না।",
            ),
      detail:
        (v.method && METHOD_NOTE[v.method]) ||
        L("From the product label.", "পণ্যের লেবেল থেকে।"),
    });
  }
  return out;
}

/** Grams or millilitres in one serving, from the (estimated) serving size text, e.g. "80 g (1 pack)". */
function servingAmount(p: CatalogProduct): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*(g|ml)\b/.exec(
    p.nutrition?.servingSize?.text ?? "",
  );
  return m ? Number(m[1]) : null;
}

function toProduct(p: CatalogProduct): Product {
  const isFood = p.kind === "food";
  const basis =
    p.nutrition?.basis === "per_100ml"
      ? L("Per 100 ml", "প্রতি ১০০ মি.লি.")
      : L("Per 100 g", "প্রতি ১০০ গ্রাম");
  const estimated = p.nqss?.status !== "complete";
  const description = isFood
    ? L(
        `${p.subcategory ?? p.group} by ${p.brand}.`,
        `${p.brand}-এর ${p.subcategory ?? p.group}।`,
      )
    : same(
        p.care?.description?.replace(/\[reference:\d+\]/g, "") ?? p.rawCategory,
      );

  return {
    id: p.id,
    barcode: p.barcode,
    category: KIND_TO_CATEGORY[p.kind],
    comparisonFamily: isFood ? p.group : undefined,
    name: same(p.name),
    brand: same(p.brand),
    size: same(p.netQuantity ?? ""),
    description,
    image: (p.imageKey && productImages[p.imageKey]) || placeholderImage,
    ingredients: p.ingredients.map(same),
    ingredientExplanations: p.careIngredients
      ? p.careIngredients.map((i) => same(i.purpose ?? ""))
      : p.ingredients.map(explain),
    nutrition:
      isFood && p.nutrition
        ? { serving: basis, items: nutritionItems(p) }
        : undefined,
    servingNutrition: (() => {
      const amountPerServing = isFood ? servingAmount(p) : null;
      if (!amountPerServing || !p.nutrition?.servingSize) return undefined;
      const text = p.nutrition.servingSize.text;
      return {
        serving: L(`Per serving: ${text}`, `প্রতি পরিবেশন: ${bnNum(text)}`),
        items: nutritionItems(p, amountPerServing / 100),
      };
    })(),
    demo: false,
    score: p.nqss?.score ?? undefined,
    gradeLabel: p.nqss?.band
      ? L(
          `${BAND_LABEL[p.nqss.band].en}${estimated ? " (estimated)" : ""}`,
          `${BAND_LABEL[p.nqss.band].bn}${estimated ? " (আনুমানিক)" : ""}`,
        )
      : undefined,
    factors: (p.nqss?.components ?? []).map((c) => ({
      label: COMPONENT_LABEL[c.key],
      value: c.points === null ? null : Math.round((c.points / c.max) * 100),
      weight: `${c.max} pts`,
      note:
        c.points === null
          ? L(
              "Not on the label: left out of the score, never counted as zero.",
              "লেবেলে নেই: স্কোরে ধরা হয়নি, শূন্যও ধরা হয়নি।",
            )
          : L(
              `${c.points} of ${c.max} points${c.provenance === "estimated" ? ", estimated" : ""}.`,
              `${bnNum(String(c.max))} এর মধ্যে ${bnNum(String(c.points))} পয়েন্ট${c.provenance === "estimated" ? ", আনুমানিক" : ""}।`,
            ),
    })),
    evidence: [
      {
        label: L("Product database", "পণ্য ডেটাবেস"),
        value: L(
          "NutriScan team record of this package.",
          "এই প্যাকেটের নিউট্রিস্ক্যান টিম রেকর্ড।",
        ),
        status: "recorded" as const,
      },
      ...(estimated && isFood
        ? [
            {
              label: L("Estimated values", "আনুমানিক মান"),
              value: L(
                "Some values were estimated. The score is not a medical assessment.",
                "কিছু মান অনুমান করা হয়েছে। স্কোরটি চিকিৎসা মূল্যায়ন নয়।",
              ),
              status: "estimated" as const,
            },
          ]
        : []),
    ],
    halalEvidence:
      p.halal.badge === "halal"
        ? {
            kind: "package-mark",
            label: L(
              "Recorded as halal in the NutriScan product database.",
              "নিউট্রিস্ক্যান পণ্য ডেটাবেসে হালাল হিসেবে রেকর্ড করা।",
            ),
            sourceTitle: "NutriScan product database",
            sourceUrl: `catalog:${p.id}`,
          }
        : undefined,
    reactionCounts: { likes: 0, dislikes: 0 },
    catalog: p,
  };
}

export const catalogProducts: Product[] = snapshot.products.map(toProduct);
