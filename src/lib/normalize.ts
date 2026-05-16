import type { HousingFeature, DisplayProperty, BedroomCounts, DataSource } from "../types/housing";

function str(v: unknown): string { return v != null ? String(v) : ""; }
function num(v: unknown): number { return typeof v === "number" ? v : 0; }
function flag(v: unknown): boolean { return v === "Y" || v === 1 || v === true || v === "Yes"; }

function emptyBedrooms(): BedroomCounts {
  return { studio: 0, br1: 0, br2: 0, br3: 0, br4plus: 0 };
}

// ─── SJ local dataset (HSG_HousingMapLayers) ─────────────────────────────────

function normalizeSJ(feature: HousingFeature): DisplayProperty | null {
  const p = feature.properties;
  if (!p) return null;
  const coords = feature.geometry?.coordinates;
  const total = num(p.ELIUNITS) + num(p.VLIUNITS) + num(p.LIUNITS) + num(p.MODERATEUNITS);

  const popTypes: string[] = [];
  const pop = str(p.POPULATIONTYPE);
  if (pop.toLowerCase().includes("family")) popTypes.push("Family");
  if (pop.toLowerCase().includes("senior")) popTypes.push("Elderly");
  if (pop.toLowerCase().includes("special")) popTypes.push("Disabled");
  if (pop.toLowerCase().includes("homeless") || pop.toLowerCase().includes("homeless")) popTypes.push("Homeless");
  if (popTypes.length === 0 && pop) popTypes.push(pop.replace(/;$/, "").replace(/;/g, " · "));

  return {
    id: `sj-${str(p.OBJECTID) || String(Math.random())}`,
    source: "sj" as DataSource,
    name: str(p.DEVELOPMENTNAME) || "Unknown Project",
    address: str(p.ADDRESS),
    city: str(p.CITY) || "San Jose",
    state: "CA",
    zip: str(p.ZIP),
    lat: coords ? coords[1] : null,
    lng: coords ? coords[0] : null,
    phone: str(p.PHONE) || undefined,
    website: str(p.WEBSITE) || undefined,
    developer: str(p.DEVELOPER) || undefined,
    isNonProfit: str(p.DEVTYPE) === "Non-Profit",
    totalUnits: num(p.TOTALAFFUNITS) || total,
    affordableUnits: num(p.TOTALAFFUNITS) || total,
    bedrooms: emptyBedrooms(),
    incomeCeilingPct: undefined,
    populationTypes: popTypes,
    hasRentalAssistance: false,
    yearBuilt: undefined,
    arstatus: str(p.ARSTATUS) || undefined,
    projdevstage: str(p.PROJDEVSTAGE) || undefined,
    tenuretype: str(p.TENURETYPE) || undefined,
    projecttype: str(p.PROJECTTYPE) || undefined,
    councildistrict: num(p.COUNCILDISTRICT) || undefined,
    inclusionary: str(p.INCLUSIONARY) || undefined,
    eliunits: num(p.ELIUNITS),
    vliunits: num(p.VLIUNITS),
    liunits: num(p.LIUNITS),
    moderateunits: num(p.MODERATEUNITS),
    raw: p,
  };
}

// ─── HUD LIHTC (nationwide) ───────────────────────────────────────────────────

function normalizeLIHTC(feature: HousingFeature): DisplayProperty | null {
  const p = feature.properties;
  if (!p) return null;
  const coords = feature.geometry?.coordinates;

  const popTypes: string[] = [];
  if (flag(p.TRGT_FAM)) popTypes.push("Family");
  if (flag(p.TRGT_ELD)) popTypes.push("Elderly");
  if (flag(p.TRGT_DIS)) popTypes.push("Disabled");
  if (flag(p.TRGT_HML)) popTypes.push("Homeless");
  if (flag(p.TRGT_OTHER) && popTypes.length === 0) popTypes.push("Other");

  const yr = num(p.YR_PIS);
  const yearBuilt = yr > 0 && yr < 9000 ? yr : undefined;

  const zip = str(p.PROJ_ZIP);

  const lat = coords ? coords[1] : (typeof p.LAT === "number" ? p.LAT : null);
  const lng = coords ? coords[0] : (typeof p.LON === "number" ? p.LON : null);

  return {
    id: `lihtc-${str(p.OBJECTID) || String(Math.random())}`,
    source: "lihtc" as DataSource,
    name: str(p.PROJECT) || "Unknown Project",
    address: str(p.PROJ_ADD),
    city: str(p.PROJ_CTY),
    state: str(p.PROJ_ST),
    zip: zip.length > 5 ? zip.slice(0, 5) : zip,
    lat,
    lng,
    phone: str(p.CO_TEL) || undefined,
    website: undefined,
    developer: str(p.COMPANY) || undefined,
    isNonProfit: flag(p.NON_PROF),
    totalUnits: num(p.N_UNITS),
    affordableUnits: num(p.LI_UNITS) || num(p.N_UNITS),
    bedrooms: {
      studio: num(p.N_0BR),
      br1: num(p.N_1BR),
      br2: num(p.N_2BR),
      br3: num(p.N_3BR),
      br4plus: num(p.N_4BR),
    },
    incomeCeilingPct: num(p.INC_CEIL) || undefined,
    populationTypes: popTypes,
    hasRentalAssistance: flag(p.RENTASSIST),
    yearBuilt,
    raw: p,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function normalizeFeatures(features: HousingFeature[], source: DataSource): DisplayProperty[] {
  const results: DisplayProperty[] = [];
  for (const f of features) {
    const norm = source === "sj" ? normalizeSJ(f) : normalizeLIHTC(f);
    if (norm && (norm.lat !== null || norm.address)) results.push(norm);
  }
  return results;
}

export function hasBedroomType(p: DisplayProperty, size: "" | "0" | "1" | "2" | "3" | "4"): boolean {
  if (!size) return true;
  const b = p.bedrooms;
  // If no bedroom data (SJ source), always match
  const hasAny = b.studio + b.br1 + b.br2 + b.br3 + b.br4plus > 0;
  if (!hasAny) return true;
  if (size === "0") return b.studio > 0;
  if (size === "1") return b.br1 > 0;
  if (size === "2") return b.br2 > 0;
  if (size === "3") return b.br3 > 0;
  if (size === "4") return b.br4plus > 0;
  return true;
}

export function popMatches(p: DisplayProperty, filter: string): boolean {
  if (!filter) return true;
  return p.populationTypes.some(t => t.toLowerCase().includes(filter.toLowerCase()))
    || (filter.toLowerCase() === "family" && p.populationTypes.length === 0);
}

export function qualifiesForIncome(p: DisplayProperty, annualIncome: number, persons: number, stateAmi: number): boolean {
  if (!annualIncome) return true;
  if (!p.incomeCeilingPct) return true; // unknown ceiling, always show
  const adjAmi = adjustAmi(stateAmi, persons);
  const maxIncome = adjAmi * (p.incomeCeilingPct / 100);
  return annualIncome <= maxIncome;
}

// HUD household size adjustment factors
const SIZE_FACTOR: Record<number, number> = {
  1: 0.70, 2: 0.80, 3: 0.90, 4: 1.00,
  5: 1.08, 6: 1.16, 7: 1.24, 8: 1.32,
};

export function adjustAmi(ami4person: number, persons: number): number {
  const factor = SIZE_FACTOR[Math.min(Math.max(persons, 1), 8)] ?? 1.0;
  return ami4person * factor;
}
