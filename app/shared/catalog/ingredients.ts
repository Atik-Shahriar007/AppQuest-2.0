/** Ingredient explanations: AI drafts until a team member reviews them. Shared by app and server. */

export type IngredientDraft = {
  key: string;
  nameEn: string;
  nameBn: string;
  purposeEn: string;
  purposeBn: string;
  detailsEn: string;
  detailsBn: string;
  attention: "none" | "low" | "moderate" | "high";
  allergen: boolean;
  allergenNoteEn: string | null;
  allergenNoteBn: string | null;
  provenance: "ai_draft" | "team";
  reviewed: boolean;
  model?: string;
};

/** "Preservative: Sodium Benzoate (E-211)." -> "preservative: sodium benzoate" */
export function ingredientKey(raw: string): string {
  return raw
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s.:-]+|[\s.:-]+$/g, "");
}
