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

export const METRO_AMI_OVERRIDES: Record<string, number> = {
  "san jose": 169600,
  "san francisco": 164000,
  "oakland": 164000,
  "san diego": 115700,
  "los angeles": 91050,
  "long beach": 91050,
  "anaheim": 106700,
  "santa ana": 106700,
  "irvine": 106700,
  "riverside": 87000,
  "san bernardino": 87000,
  "sacramento": 98400,
  "fresno": 78200,
  "bakersfield": 78900,
  "oxnard": 95900,
  "ventura": 95900,
  "santa barbara": 98900,
  "stockton": 82600,
  "modesto": 77500,
  "salinas": 89500,
  "santa cruz": 118300,
  "santa rosa": 112400,
  "vallejo": 102400,
  "napa": 117100,
  "chico": 76000,
  "visalia": 74100,
  "seattle": 135300,
  "tacoma": 115700,
  "bellevue": 135300,
  "portland": 103700,
  "spokane": 77800,
  "boise": 92400,
  "denver": 109200,
  "boulder": 126600,
  "fort collins": 101700,
  "colorado springs": 91600,
  "salt lake city": 101300,
  "provo": 95800,
  "phoenix": 88800,
  "tucson": 74500,
  "albuquerque": 76800,
  "las vegas": 74000,
  "austin": 108700,
  "dallas": 96900,
  "fort worth": 96900,
  "houston": 89700,
  "san antonio": 76900,
  "el paso": 65900,
  "chicago": 101000,
  "minneapolis": 112300,
  "milwaukee": 88100,
  "detroit": 77200,
  "columbus": 93400,
  "cleveland": 74900,
  "cincinnati": 89100,
  "indianapolis": 90700,
  "kansas city": 91600,
  "st. louis": 91100,
  "omaha": 89200,
  "des moines": 91100,
  "madison": 102900,
  "grand rapids": 86600,
  "atlanta": 97200,
  "nashville": 100100,
  "charlotte": 89100,
  "raleigh": 99100,
  "richmond": 97500,
  "virginia beach": 94700,
  "baltimore": 117600,
  "washington": 141300,
  "miami": 71900,
  "orlando": 78500,
  "tampa": 81800,
  "jacksonville": 80700,
  "memphis": 71500,
  "louisville": 84700,
  "new orleans": 72600,
  "birmingham": 77400,
  "oklahoma city": 77200,
  "tulsa": 78800,
  "little rock": 78000,
  "columbia": 85200,
  "greenville": 82500,
  "new york": 128500,
  "boston": 143000,
  "philadelphia": 100300,
  "pittsburgh": 84900,
  "providence": 100900,
  "hartford": 104700,
  "new haven": 99100,
  "stamford": 135500,
  "bridgeport": 116200,
  "worcester": 109200,
  "springfield": 82700,
  "buffalo": 76400,
  "rochester": 78600,
  "albany": 92700,
  "manchester": 97800,
  "portland me": 105000,
  "burlington": 97200,
  "honolulu": 118500,
  "anchorage": 101900,
};

const SIZE_FACTOR: Record<number, number> = {
  1: 0.70, 2: 0.80, 3: 0.90, 4: 1.00,
  5: 1.08, 6: 1.16, 7: 1.24, 8: 1.32,
};

const METRO_KEYS_BY_LEN = Object.keys(METRO_AMI_OVERRIDES).sort((a, b) => b.length - a.length);

export function getAmi(state: string, cityName?: string): number {
  if (cityName) {
    const city = cityName.toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ").trim();
    for (const key of METRO_KEYS_BY_LEN) {
      if (city.includes(key)) return METRO_AMI_OVERRIDES[key];
    }
  }
  return STATE_AMI_2024[state.toUpperCase()] ?? 97800;
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
    threeBed: Math.round((maxRentFromAmi(tieredAmi, 4) + maxRentFromAmi(tieredAmi, 5)) / 2),
  };
}

export function fmt(n: number): string {
  return `$${n.toLocaleString()}`;
}
