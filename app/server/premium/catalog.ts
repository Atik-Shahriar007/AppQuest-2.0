/**
 * What can be bought. Prices are the team's approved prices and sit inside AppLink's published
 * limits: Subscription bills daily or monthly at BDT 1-70, a CaaS charge is BDT 2-10.
 * Amounts are decimal strings, never floats.
 */

export const PREMIUM_MONTHLY_BDT = "29.00";
export const TRIAL_DAYS = 30;

export const NOURI_DAILY_LIMIT = { free: 5, premium: 20 } as const;

export type Sku = "compare_pass" | "nouri_pass" | "day_pass";

export type SkuDef = {
  sku: Sku;
  amountBdt: string;
  name: string;
  /** Exact words shown before the charge; stored with the consent record. */
  disclosure: string;
  uses: number | null;
  durationHours: number;
};

export const SKUS: Record<Sku, SkuDef> = {
  compare_pass: {
    sku: "compare_pass",
    amountBdt: "5.00",
    name: "Food Comparison Pass",
    disclosure:
      "Food Comparison Pass: BDT 5.00, charged once to your Banglalink balance. Gives 5 advanced comparisons, valid for 7 days.",
    uses: 5,
    durationHours: 7 * 24,
  },
  nouri_pass: {
    sku: "nouri_pass",
    amountBdt: "5.00",
    name: "Nouri Chat Pass",
    disclosure:
      "Nouri Chat Pass: BDT 5.00, charged once to your Banglalink balance. Gives 10 extra Nouri messages, valid for 7 days.",
    uses: 10,
    durationHours: 7 * 24,
  },
  day_pass: {
    sku: "day_pass",
    amountBdt: "9.00",
    name: "24-hour Premium Pass",
    disclosure:
      "24-hour Premium Pass: BDT 9.00, charged once to your Banglalink balance. Unlocks every Premium feature for 24 hours.",
    uses: null,
    durationHours: 24,
  },
};

export const SUBSCRIPTION_DISCLOSURE =
  "NutriScan Premium: BDT 29.00 per month, charged to your Banglalink balance and renewed monthly until you cancel. Cancel anytime in Settings, by USSD, or by SMS. Taxes may apply.";

export const SMS_ALERTS_DISCLOSURE =
  "Food safety SMS alerts: each alert SMS costs BDT 2.00, charged to your Banglalink balance. Alerts are sent only for verified recalls of products you scanned or saved. Turn off anytime in Settings or reply STOP.";

/** "5.00" -> 500. Throws on anything that is not a plain decimal with at most 2 places. */
export function toPoisha(amount: string): number {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(amount).trim());
  if (!m) throw new Error(`Invalid amount: ${amount}`);
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}
