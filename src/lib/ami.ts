// 2024 HUD Area Median Income (4-person) by state — approximate state median
// Source: HUD FY2024 Income Limits (area-weighted state averages)
// For precise values by county/metro, HUD USER API token needed
export const STATE_AMI_2024: Record<string, number> = {
  AL: 80100,  AK: 99400,  AZ: 85600,  AR: 72800,  CA: 117400,
  CO: 108300, CT: 109600, DE: 97000,  FL: 82300,  GA: 88200,
  HI: 118500, ID: 83700,  IL: 97500,  IN: 82100,  IA: 86200,
  KS: 84000,  KY: 77300,  LA: 74600,  ME: 89700,  MD: 122400,
  MA: 124800, MI: 87200,  MN: 105800, MS: 68900,  MO: 83500,
  MT: 84600,  NE: 90800,  NV: 84700,  NH: 112000, NJ: 120400,
  NM: 75400,  NY: 107000, NC: 84200,  ND: 90500,  OH: 86200,
  OK: 76800,  OR: 97400,  PA: 93800,  RI: 107200, SC: 82100,
  SD: 87200,  TN: 82400,  TX: 90200,  UT: 97600,  VT: 92800,
  VA: 113200, WA: 112400, WV: 71600,  WI: 92200,  WY: 91300,
  DC: 141300,
};

// Major metro overrides (more accurate than state average)
// Key = lowercase city name, value = 4-person AMI
export const METRO_AMI_OVERRIDES: Record<string, number> = {
  "san jose": 169600,
  "san francisco": 164000,
  "oakland": 164000,
  "seattle": 135300,
  "boston": 143000,
  "new york": 128500,
  "washington": 141300,
  "los angeles": 91050,
  "san diego": 115700,
  "denver": 109200,
  "austin": 108700,
  "miami": 71900,
  "chicago": 101000,
  "houston": 89700,
  "dallas": 96900,
  "phoenix": 88800,
  "portland": 103700,
  "minneapolis": 112300,
  "atlanta": 97200,
  "nashville": 100100,
};

// HUD household-size adjustment factors (from HUD's published methodology)
const SIZE_FACTOR: Record<number, number> = {
  1: 0.70, 2: 0.80, 3: 0.90, 4: 1.00,
  5: 1.08, 6: 1.16, 7: 1.24, 8: 1.32,
};

export function getAmi(state: string, cityName?: string): number {
  if (cityName) {
    const city = cityName.toLowerCase().trim();
    for (const [key, val] of Object.entries(METRO_AMI_OVERRIDES)) {
      if (city.includes(key) || key.includes(city.split(",")[0].trim())) return val;
    }
  }
  return STATE_AMI_2024[state.toUpperCase()] ?? 97800; // national median fallback
}

export function adjustedAmi(ami4: number, persons: number): number {
  const factor = SIZE_FACTOR[Math.min(Math.max(persons, 1), 8)] ?? 1.0;
  return Math.round(ami4 * factor);
}

export function maxRentFromAmi(ami4: number, persons: number): number {
  return Math.round((adjustedAmi(ami4, persons) * 0.30) / 12);
}

export interface RentRange {
  studio: number;
  oneBed: number;
  twoBed: number;
  threeBed: number;
}

export function rentRangeForTier(
  tier: "ELI" | "VLI" | "LI" | "Moderate" | number,
  ami4: number
): RentRange {
  const pct = typeof tier === "number" ? tier / 100
    : tier === "ELI" ? 0.30
    : tier === "VLI" ? 0.50
    : tier === "LI"  ? 0.80
    : 1.20;
  const tieredAmi = ami4 * pct;
  return {
    studio:   maxRentFromAmi(tieredAmi, 1),
    oneBed:   Math.round((maxRentFromAmi(tieredAmi, 1) + maxRentFromAmi(tieredAmi, 2)) / 2),
    twoBed:   maxRentFromAmi(tieredAmi, 3),
    threeBed: maxRentFromAmi(tieredAmi, 4),
  };
}

// Backward-compat for SJ detail view (hardcoded SJ AMI)
export const SJ_AMI = 169600;

export const TIER_RENTS = {
  ELI:      rentRangeForTier("ELI",      SJ_AMI),
  VLI:      rentRangeForTier("VLI",      SJ_AMI),
  LI:       rentRangeForTier("LI",       SJ_AMI),
  Moderate: rentRangeForTier("Moderate", SJ_AMI),
};

export function fmt(n: number): string {
  return `$${n.toLocaleString()}`;
}
