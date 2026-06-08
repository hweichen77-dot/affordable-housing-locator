import { getAmi, adjustedAmi } from "./ami";

export type AmiTier = "ELI" | "VLI" | "LI" | "Moderate" | "AboveAMI";
export type PopType = "Family" | "Elderly" | "Disabled" | "" ;
export type BedroomPref = "" | "0" | "1" | "2" | "3" | "4";

export interface SurveyAnswers {
  householdSize: number;
  annualIncome: number;
  populationType: PopType;
  bedroomPref: BedroomPref;
  locationQuery: string;
}

export interface SurveyResult {
  tier: AmiTier;
  amiPct: number;
  ami4: number;
  adjustedAmi100: number;
  label: string;
  description: string;
  color: string;
}

const TIER_INFO: Record<AmiTier, { label: string; description: string; color: string }> = {
  ELI: {
    label: "Extremely Low Income (≤30% AMI)",
    description: "You qualify for the most deeply subsidized housing, including Emergency Housing Vouchers and public housing programs.",
    color: "var(--tier-eli)",
  },
  VLI: {
    label: "Very Low Income (31–50% AMI)",
    description: "You qualify for most HUD programs including Section 8 / Housing Choice Vouchers and LIHTC properties.",
    color: "var(--tier-vli)",
  },
  LI: {
    label: "Low Income (51–80% AMI)",
    description: "You qualify for LIHTC affordable housing and most city/county affordable programs.",
    color: "var(--tier-li)",
  },
  Moderate: {
    label: "Moderate Income (81–120% AMI)",
    description: "You may qualify for moderate-income affordable housing. Some properties accept up to 120% AMI.",
    color: "var(--tier-mod)",
  },
  AboveAMI: {
    label: "Above Income Limits (>120% AMI)",
    description: "Most subsidized affordable housing has income limits you may exceed, but some workforce housing programs may still apply.",
    color: "var(--text-secondary)",
  },
};

export function computeSurveyResult(
  answers: SurveyAnswers,
  state = "CA",
  cityName?: string,
): SurveyResult {
  const ami4 = getAmi(state, cityName);
  const adjustedAmi100 = adjustedAmi(ami4, answers.householdSize);
  const amiPct = adjustedAmi100 > 0
    ? Math.round((answers.annualIncome / adjustedAmi100) * 100)
    : 0;

  let tier: AmiTier;
  if (amiPct <= 30) tier = "ELI";
  else if (amiPct <= 50) tier = "VLI";
  else if (amiPct <= 80) tier = "LI";
  else if (amiPct <= 120) tier = "Moderate";
  else tier = "AboveAMI";

  return { tier, amiPct, ami4, adjustedAmi100, ...TIER_INFO[tier] };
}

export function tierToFilterValue(tier: AmiTier): "" | "ELI" | "VLI" | "LI" | "Moderate" {
  if (tier === "AboveAMI") return "";
  return tier;
}
