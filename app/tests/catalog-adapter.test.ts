import { describe, expect, it, vi } from "vitest";

// React Native image requires resolve to numbers in the app; in Node they are stubbed.
vi.mock("../lib/product-images", () => ({
  productImages: new Proxy({}, { get: () => 1 }),
  placeholderImage: 1,
}));

describe("catalog adapter", async () => {
  const data = await import("../lib/nutriscan-data");

  it("serves all 67 real products with real scores", () => {
    expect(data.products).toHaveLength(67);
    const food = data.products.filter((p) => p.category === "food");
    expect(food).toHaveLength(65);
    expect(food.every((p) => typeof p.score === "number")).toBe(true);
    expect(
      data.products
        .filter((p) => p.category !== "food")
        .every((p) => p.score === undefined),
    ).toBe(true);
  });

  it("finds products by barcode, tolerating a leading zero", () => {
    expect(data.productByBarcode("8941154036281")?.id).toBe(
      "bombay-sweets-nachoz-raw-mango-tangy-tamarind",
    );
    expect(data.productByBarcode("788792870949")?.id).toBe(
      "kurkure-kurkure-spicy-chicken-flavour",
    );
  });

  it("Halal Mode keeps only halal products; Child Safe hides only not-suitable", () => {
    const halal = data.filterProductsByHalal(data.products, true);
    expect(halal.length).toBe(12);
    const childSafe = data.filterProductsByChildSafe(data.products, true);
    expect(childSafe.some((p) => p.catalog?.child.badge === "caution")).toBe(
      true,
    );
    expect(
      childSafe.some((p) => p.catalog?.child.badge === "not_suitable"),
    ).toBe(false);
  });

  it("better alternatives are same group and strictly higher scored", () => {
    const cup = data.productById("mr-noodles-pran-mr-noodles-cup-noodles")!;
    const alts = data.betterAlternatives(cup);
    expect(alts.length).toBeGreaterThan(0);
    expect(
      alts.every(
        (a) =>
          a.comparisonFamily === "Noodles" && (a.score ?? 0) > (cup.score ?? 0),
      ),
    ).toBe(true);
  });

  it("marks estimated values and never shows a missing fibre as zero", () => {
    const p = data.productById("mr-noodles-pran-mr-noodles-cup-noodles")!;
    const energy = p.nutrition!.items.find((i) => i.label.en === "Energy")!;
    expect(energy.amount.en).toContain("(est.)");
    expect(
      p.nutrition!.items.find((i) => i.label.en === "Dietary fibre")!.amount.en,
    ).toBe("Not declared");
    expect(p.gradeLabel?.en).toContain("(estimated)");
  });
});
