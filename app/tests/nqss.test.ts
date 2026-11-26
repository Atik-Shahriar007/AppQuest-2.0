import { describe, expect, it } from "vitest";
import { buildProduct } from "../shared/catalog/build";
import snapshot from "../shared/catalog/catalog.snapshot.json";
import type { CatalogSnapshot } from "../shared/catalog/types";
import { roundHalfUp1, scoreNqss, type NqssInput, type NutrientValue } from "../shared/nqss/engine";
import { assessWholeFood, estimateEnergyKcal, estimateFreeSugar, parseLabelValue } from "../shared/nqss/estimate";
import { childLabel, halalLabel } from "../shared/nqss/labels";

const d = (value: number, operator: "=" | "<" = "="): NutrientValue => ({ value, operator, provenance: "declared" });

const base = (over: Partial<NqssInput>): NqssInput => ({
  form: "solid",
  sweetenedBeverage: false,
  energyKcal: d(0),
  freeSugarG: d(0),
  sodiumMg: d(0),
  saturatedFatG: d(0),
  transFatG: d(0),
  fibreG: d(0),
  proteinG: d(0),
  wholeFood: { level: "none", points: 0, matched: [], provenance: "declared" },
  ...over,
});

describe("NQSS methodology worked examples (section 6)", () => {
  it("6.4 sweetened beverage scores 56", () => {
    const r = scoreNqss(
      base({ form: "liquid", sweetenedBeverage: true, freeSugarG: d(10), sodiumMg: d(15), energyKcal: d(40) }),
    );
    expect(r.score).toBe(56);
    expect(r.status).toBe("complete");
  });

  it("6.5 high-fibre cereal scores 76", () => {
    const r = scoreNqss(
      base({
        freeSugarG: d(6),
        sodiumMg: d(220),
        saturatedFatG: d(1.5),
        energyKcal: d(370),
        fibreG: d(7),
        proteinG: d(12),
        wholeFood: { level: "B", points: 8, matched: ["oats", "nuts"], provenance: "declared" },
      }),
    );
    expect(r.score).toBe(76);
  });

  it("6.6 noodles with missing trans fat and fibre score 38.7 provisional", () => {
    const r = scoreNqss(
      base({
        freeSugarG: d(1),
        sodiumMg: d(1600),
        saturatedFatG: d(8),
        transFatG: null,
        energyKcal: d(460),
        fibreG: null,
        proteinG: d(9),
      }),
    );
    expect(r.score).toBe(38.7);
    expect(r.status).toBe("provisional");
    expect(r.availableWeight).toBe(75);
  });
});

describe("bands and rules", () => {
  it.each([
    [2.5, 20],
    [2.6, 16],
    [5, 16],
    [10, 11],
    [15, 6],
    [22.5, 2],
    [22.6, 0],
  ])("free sugar %s g -> %s points", (g, pts) => {
    const r = scoreNqss(base({ freeSugarG: d(g) }));
    expect(r.components.find((c) => c.key === "freeSugar")!.points).toBe(pts);
  });

  it.each([
    [1, 0],
    [1.1, 4],
    [2.5, 4],
    [2.6, 8],
    [10, 13],
    [10.1, 15],
  ])("fibre %s g -> %s points", (g, pts) => {
    const r = scoreNqss(base({ fibreG: d(g) }));
    expect(r.components.find((c) => c.key === "fibre")!.points).toBe(pts);
  });

  it("sugar-sweetened beverage above 10 g/100 ml gets 0 sugar points", () => {
    const r = scoreNqss(base({ form: "liquid", sweetenedBeverage: true, freeSugarG: d(12) }));
    expect(r.components.find((c) => c.key === "freeSugar")!.points).toBe(0);
    expect(r.flags).toContain("sugar_sweetened_beverage");
  });

  it("harmful '<x' bound scores at the upper bound and marks the score provisional", () => {
    const r = scoreNqss(base({ transFatG: d(0.1, "<") }));
    expect(r.components.find((c) => c.key === "transFat")!.points).toBe(8);
    expect(r.status).toBe("provisional");
  });

  it("beneficial '<x' bound scores as zero", () => {
    const r = scoreNqss(base({ fibreG: d(0.5, "<") }));
    expect(r.components.find((c) => c.key === "fibre")!.points).toBe(0);
  });

  it("missing is never zero: unavailable components are excluded from the weight", () => {
    const r = scoreNqss(base({ fibreG: null }));
    expect(r.availableWeight).toBe(85);
    expect(r.components.find((c) => c.key === "fibre")!.points).toBeNull();
  });

  it("withholds when fewer than 3 components are available", () => {
    const r = scoreNqss({
      form: "solid",
      sweetenedBeverage: false,
      energyKcal: null,
      freeSugarG: null,
      sodiumMg: d(100),
      saturatedFatG: null,
      transFatG: null,
      fibreG: null,
      proteinG: d(3),
      wholeFood: null,
    });
    expect(r.status).toBe("withheld");
    expect(r.score).toBeNull();
  });

  it("lower sodium never earns fewer points (monotonic)", () => {
    let last = Infinity;
    for (let mg = 0; mg <= 1500; mg += 10) {
      const p = scoreNqss(base({ sodiumMg: d(mg) })).components.find((c) => c.key === "sodium")!.points!;
      expect(p).toBeLessThanOrEqual(last);
      last = p;
    }
  });

  it("rounds half up", () => {
    expect(roundHalfUp1(72.25)).toBe(72.3);
    expect(roundHalfUp1(38.666)).toBe(38.7);
    expect(roundHalfUp1(0.05)).toBe(0.1);
  });
});

describe("estimates", () => {
  it("parses label qualifiers", () => {
    expect(parseLabelValue("<0.003")).toEqual({ value: 0.003, operator: "<" });
    expect(parseLabelValue("0.0")).toEqual({ value: 0, operator: "=" });
    expect(parseLabelValue("n/a")).toBeNull();
    expect(parseLabelValue(-1)).toBeNull();
  });

  it("estimates energy with Atwater factors only when all macros exist", () => {
    expect(estimateEnergyKcal(10, 50, 5)?.value).toBe(310);
    expect(estimateEnergyKcal(10, null, 5)).toBeNull();
  });

  it("free sugar: plain milk 0, sweetened milk minus lactose, others all sugar", () => {
    expect(estimateFreeSugar(4.6, { isDairy: true, ingredients: "Cow's Milk" })?.value).toBe(0);
    expect(estimateFreeSugar(13.12, { isDairy: true, ingredients: "Cow's Milk, Water, Refined Sugar" })?.value).toBe(8.4);
    expect(estimateFreeSugar(12, { isDairy: false, ingredients: "Water, Sugar" })?.value).toBe(12);
  });

  it("repairs a 0 g sugar label when sugar is an ingredient", () => {
    const v = estimateFreeSugar(0, { isDairy: false, ingredients: "Sugar, Water", totalCarbohydrateG: 11 });
    expect(v?.value).toBe(11);
    expect(v?.method).toBe("carbohydrate_upper_bound_sugar_declared_zero");
  });

  it("whole-food dictionary ignores potato and rewards lentils first", () => {
    expect(assessWholeFood("Potato, Oil, Salt", false).points).toBe(0);
    expect(assessWholeFood("Lentil, Oil, Salt", false).points).toBe(4);
    expect(assessWholeFood("Rice, Oil, Salt, Peanut", false).points).toBe(2);
    expect(assessWholeFood("Cow's Milk", true).points).toBe(6);
  });
});

describe("labels", () => {
  it("maps child suitability to 4 badges without hiding caution", () => {
    expect(childLabel("suitable_with_caution").badge).toBe("caution");
    expect(childLabel("not_suitable_for_children_under_3_years").badge).toBe("caution");
    expect(childLabel("not_recommended").badge).toBe("not_suitable");
    expect(childLabel(undefined).badge).toBe("not_assessed");
  });
  it("maps halal status", () => {
    expect(halalLabel("halal").badge).toBe("halal");
    expect(halalLabel("not_specified").badge).toBe("not_verified");
  });
});

describe("catalog", () => {
  const snap = snapshot as unknown as CatalogSnapshot;
  it("every food product has a score and no care product has one", () => {
    for (const p of snap.products) {
      if (p.kind === "food") expect(p.nqss?.score, p.name).toBeTypeOf("number");
      else expect(p.nqss).toBeNull();
    }
  });
  it("estimated values are marked as estimated", () => {
    for (const p of snap.products.filter((x) => x.kind === "food")) {
      expect(p.nutrition!.values.energy_kcal?.provenance).toBe("estimated");
      expect(p.nutrition!.values.fibre_g).toBeNull();
    }
  });
  it("applies a team override as a corrected value", () => {
    const p = buildProduct(
      { product_name: "X", barcode: "12345678", nutrition_per_100g: { sodium_mg: 2000 } },
      { kindDir: "food", group: "Bun", imageKey: "", overrides: { "12345678": { note: "typo", nutrition: { sodium_mg: 200 } } } },
    );
    expect(p.nutrition!.values.sodium_mg).toMatchObject({ value: 200, provenance: "corrected" });
  });
});
