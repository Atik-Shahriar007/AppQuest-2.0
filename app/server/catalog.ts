/**
 * Read-only product catalog, loaded once from the versioned snapshot produced by `pnpm ingest`.
 * The app, USSD and Nouri all read scores from here, so a product's score is the same everywhere.
 */
import snapshotJson from "../shared/catalog/catalog.snapshot.json";
import type { CatalogProduct, CatalogSnapshot } from "../shared/catalog/types";

const snapshot = snapshotJson as unknown as CatalogSnapshot;
const products = snapshot.products;
const byId = new Map(products.map((p) => [p.id, p]));
const byBarcode = new Map(products.filter((p) => p.barcode).map((p) => [p.barcode, p]));

export const catalogVersion = {
  generatedAt: snapshot.generatedAt,
  algorithmVersion: snapshot.algorithmVersion,
  ruleSetVersion: snapshot.ruleSetVersion,
};

export function allProducts(): CatalogProduct[] {
  return products;
}

export function getProduct(id: string): CatalogProduct | undefined {
  return byId.get(id);
}

/** Exact barcode, tolerating a missing or extra leading zero (UPC-A vs EAN-13). */
export function findByBarcode(raw: string): CatalogProduct | undefined {
  const code = raw.replace(/\D/g, "");
  if (!code) return undefined;
  return byBarcode.get(code) ?? byBarcode.get(`0${code}`) ?? (code.startsWith("0") ? byBarcode.get(code.slice(1)) : undefined);
}

export type Modes = { halalMode?: boolean; childSafeMode?: boolean };

/** Halal Mode keeps only halal-marked products. Child Safe Mode hides only "not suitable". */
export function passesModes(p: CatalogProduct, modes: Modes): boolean {
  if (modes.halalMode && p.halal.badge !== "halal") return false;
  if (modes.childSafeMode && p.child.badge === "not_suitable") return false;
  return true;
}

export function searchProducts(query: string, opts: { kind?: CatalogProduct["kind"]; group?: string; limit?: number } = {}) {
  const q = query.trim().toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  return products
    .filter((p) => (!opts.kind || p.kind === opts.kind) && (!opts.group || p.group === opts.group))
    .map((p) => {
      const hay = `${p.name} ${p.brand} ${p.group} ${p.subcategory ?? ""} ${p.barcode}`.toLowerCase();
      const score = terms.length === 0 ? 1 : terms.filter((t) => hay.includes(t)).length / terms.length;
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.p.nqss?.score ?? -1) - (a.p.nqss?.score ?? -1))
    .slice(0, opts.limit ?? 30)
    .map((x) => x.p);
}

/**
 * Better Alternatives: same group (folder category), strictly higher NQSS, respecting the
 * user's active modes, best first. Food only.
 */
export function betterAlternatives(id: string, modes: Modes = {}, limit = 5): CatalogProduct[] {
  const p = byId.get(id);
  if (!p || p.kind !== "food" || p.nqss?.score == null) return [];
  const base = p.nqss.score;
  return products
    .filter((o) => o.id !== p.id && o.group === p.group && (o.nqss?.score ?? -1) > base && passesModes(o, modes))
    .sort((a, b) => (b.nqss!.score ?? 0) - (a.nqss!.score ?? 0))
    .slice(0, limit);
}

export function groups(): { group: string; kind: CatalogProduct["kind"]; count: number }[] {
  const m = new Map<string, { group: string; kind: CatalogProduct["kind"]; count: number }>();
  for (const p of products) {
    const g = m.get(p.group) ?? { group: p.group, kind: p.kind, count: 0 };
    g.count++;
    m.set(p.group, g);
  }
  return [...m.values()];
}
