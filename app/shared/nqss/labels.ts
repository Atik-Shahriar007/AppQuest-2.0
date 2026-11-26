/**
 * Halal and Child Safe labels. The product JSON is the source of truth (teammate decision 4);
 * these functions only map raw values to the badges the app shows.
 */

export type ChildBadge = "suitable" | "caution" | "not_suitable" | "not_assessed";
export type HalalBadge = "halal" | "caution" | "not_verified";

export type ChildLabel = { badge: ChildBadge; raw: string | null; note: string | null };

const CHILD_MAP: Record<string, { badge: ChildBadge; note: string | null }> = {
  suitable: { badge: "suitable", note: null },
  suitable_with_caution: { badge: "caution", note: "Suitable in moderation. Check sugar, salt and portion size." },
  limited: { badge: "caution", note: "Limit how often children have this." },
  not_suitable_for_children_under_3_years: { badge: "caution", note: "Not for children under 3 years." },
  not_recommended_for_infants_below_12_months: { badge: "caution", note: "Not for infants under 12 months." },
  not_suitable_for_infants: { badge: "caution", note: "Not for infants." },
  not_recommended: { badge: "not_suitable", note: "Not recommended for children." },
  not_suitable: { badge: "not_suitable", note: "Not suitable for children." },
  not_assessed: { badge: "not_assessed", note: null },
};

export function childLabel(raw: unknown): ChildLabel {
  if (typeof raw !== "string" || !(raw in CHILD_MAP)) {
    return { badge: "not_assessed", raw: typeof raw === "string" ? raw : null, note: null };
  }
  return { ...CHILD_MAP[raw], raw };
}

export type HalalLabel = { badge: HalalBadge; raw: string | null };

export function halalLabel(raw: unknown): HalalLabel {
  if (raw === "halal") return { badge: "halal", raw };
  if (raw === "suitable_with_caution") return { badge: "caution", raw };
  return { badge: "not_verified", raw: typeof raw === "string" ? raw : null };
}
