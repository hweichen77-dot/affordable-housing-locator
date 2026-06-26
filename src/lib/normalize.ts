import type { HousingFeature, DisplayProperty, BedroomCounts, DataSource } from "../types/housing";
import { adjustedAmi } from "./ami";

function str(v: unknown): string { return v != null ? String(v) : ""; }
function num(v: unknown): number { return typeof v === "number" ? v : 0; }
function flag(v: unknown): boolean { return v === "Y" || v === 1 || v === true || v === "Yes"; }
function stableSlug(...parts: string[]): string {
  return parts.filter(Boolean).join("-").replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 48);
}

function emptyBedrooms(): BedroomCounts {
  return { studio: 0, br1: 0, br2: 0, br3: 0, br4plus: 0 };
}

function decodeIncCeil(v: unknown): number | undefined {
  const s = String(v);
  if (s === "1") return 50;
  if (s === "2") return 60;
  return undefined;
}


function normalizeSJ(feature: HousingFeature): DisplayProperty | null {
  const p = feature.properties;
  if (!p) return null;
  const coords = feature.geometry?.coordinates;
  const total = num(p.ELIUNITS) + num(p.VLIUNITS) + num(p.LIUNITS) + num(p.MODERATEUNITS);

  const popTypes: string[] = [];
  const pop = str(p.POPULATIONTYPE).toLowerCase();
  if (pop.includes("family")) popTypes.push("Family");
  if (pop.includes("senior")) popTypes.push("Elderly");
  if (pop.includes("special")) popTypes.push("Disabled");
  if (pop.includes("homeless")) popTypes.push("Homeless");
  if (popTypes.length === 0 && pop) popTypes.push(str(p.POPULATIONTYPE).replace(/;$/, "").replace(/;/g, " · "));

  const objectId = str(p.OBJECTID);
  const arExpRaw = p.AREXP;
  const arExpiry = typeof arExpRaw === "number" && arExpRaw > 0 ? arExpRaw : undefined;

  const eli = num(p.ELIUNITS);
  const vli = num(p.VLIUNITS);
  const li  = num(p.LIUNITS);
  const mod = num(p.MODERATEUNITS);
  const sjIncomeCeilingPct: number | undefined =
    eli > 0 ? 30 : vli > 0 ? 50 : li > 0 ? 80 : mod > 0 ? 120 : undefined;

  return {
    id: `sj-${objectId || stableSlug(str(p.DEVELOPMENTNAME), str(p.ADDRESS))}`,
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
    totalUnits: 0,
    affordableUnits: num(p.TOTALAFFUNITS) || total,
    bedrooms: emptyBedrooms(),
    incomeCeilingPct: sjIncomeCeilingPct,
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
    propertyManager: str(p.PROPERTYMANAGER) || undefined,
    arExpiry,
    raw: p,
  };
}


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
  const currentYear = new Date().getFullYear();
  const isLikelyExpired = yearBuilt != null && (yearBuilt + 30) < currentYear;

  const zip = str(p.PROJ_ZIP);
  const lat = coords ? coords[1] : (typeof p.LAT === "number" ? p.LAT : null);
  const lng = coords ? coords[0] : (typeof p.LON === "number" ? p.LON : null);

  const objectId = str(p.OBJECTID);
  const incomeCeilingPct = decodeIncCeil(p.INC_CEIL);
  const lowCeil = decodeIncCeil(p.LOW_CEIL);
  const ceilUnitVal = num(p.CEILUNIT);

  return {
    id: `lihtc-${objectId || stableSlug(str(p.PROJECT), str(p.PROJ_ADD))}`,
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
    incomeCeilingPct,
    lowCeil: lowCeil !== incomeCeilingPct ? lowCeil : undefined,
    ceilUnit: ceilUnitVal > 0 ? ceilUnitVal : undefined,
    populationTypes: popTypes,
    hasRentalAssistance: flag(p.RENTASSIST),
    yearBuilt,
    isLikelyExpired: isLikelyExpired || undefined,
    raw: p,
  };
}


function mapWaitlistStatus(v: unknown): "open" | "closed" | "unknown" | undefined {
  if (v == null || v === "") return undefined;
  const s = str(v).toLowerCase().trim();
  if (s === "open") return "open";
  if (s === "closed" || s === "temporarily closed" || s === "temporary closed") return "closed";
  return "unknown";
}

function normalizePublicHousing(feature: HousingFeature): DisplayProperty | null {
  const p = feature.properties;
  if (!p) return null;
  const coords = feature.geometry?.coordinates;

  const name = str(p.PROJECT_NAME) || str(p.BUILDING_NAME) || "Public Housing";
  const addr = str(p.STD_ADDR).trim();
  const lat = coords ? coords[1] : (typeof p.LAT === "number" ? p.LAT : null);
  const lng = coords ? coords[0] : (typeof p.LON === "number" ? p.LON : null);
  const objectId = str(p.OBJECTID);
  const units = num(p.ACC_UNITS) || num(p.TOTAL_DWELLING_UNITS);

  const waitlistRaw = p.WAITLSTSTATUS ?? p.WAITLIST_STATUS ?? p.WTLST_STATUS ?? p.waitlistStatus;
  const waitlistStatus = mapWaitlistStatus(waitlistRaw);

  return {
    id: `pub-${objectId || stableSlug(name, addr)}`,
    source: "public" as DataSource,
    name,
    address: addr,
    city: str(p.STD_CITY).trim(),
    state: str(p.STD_ST).trim(),
    zip: str(p.STD_ZIP5).trim(),
    lat,
    lng,
    phone: str(p.HA_PHN_NUM) || undefined,
    website: undefined,
    developer: undefined,
    isNonProfit: false,
    totalUnits: num(p.TOTAL_DWELLING_UNITS),
    affordableUnits: units,
    bedrooms: emptyBedrooms(),
    incomeCeilingPct: 30,
    populationTypes: [],
    hasRentalAssistance: true,
    yearBuilt: undefined,
    waitlistStatus,
    raw: p,
  };
}


export function normalizeFeatures(features: HousingFeature[], source: DataSource): DisplayProperty[] {
  const results: DisplayProperty[] = [];
  for (const f of features) {
    let norm: DisplayProperty | null = null;
    if (source === "sj") norm = normalizeSJ(f);
    else if (source === "public") norm = normalizePublicHousing(f);
    else norm = normalizeLIHTC(f);
    if (norm && (norm.lat !== null || norm.address)) results.push(norm);
  }
  return results;
}

export function hasBedroomType(p: DisplayProperty, size: "" | "0" | "1" | "2" | "3" | "4"): boolean {
  if (!size) return true;
  const b = p.bedrooms;
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

export function qualifiesForIncome(p: DisplayProperty, annualIncome: number, persons: number, ami4: number): boolean {
  if (!annualIncome) return true;
  if (!p.incomeCeilingPct) return true;
  const adjAmi = adjustedAmi(ami4, persons);
  return annualIncome <= adjAmi * (p.incomeCeilingPct / 100);
}
