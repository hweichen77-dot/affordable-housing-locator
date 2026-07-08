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

  const name = str(p.PROJECT_NAME) || "Public Housing";
  const addr = str(p.STD_ADDR).trim();
  const lat = coords ? coords[1] : (typeof p.LAT === "number" ? p.LAT : null);
  const lng = coords ? coords[0] : (typeof p.LON === "number" ? p.LON : null);
  const objectId = str(p.OBJECTID);

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
    developer: str(p.FORMAL_PARTICIPANT_NAME) || undefined,
    isNonProfit: false,
    totalUnits: num(p.TOTAL_UNITS),
    affordableUnits: num(p.TOTAL_DWELLING_UNITS) || num(p.TOTAL_UNITS),
    bedrooms: emptyBedrooms(),
    incomeCeilingPct: 30,
    populationTypes: [],
    hasRentalAssistance: true,
    yearBuilt: undefined,
    waitlistStatus,
    raw: p,
  };
}

function populationFromClientGroup(v: unknown): string[] {
  const s = str(v).toLowerCase();
  if (!s) return [];
  const types: string[] = [];
  if (s.includes("famil")) types.push("Family");
  if (s.includes("elder") || s.includes("senior") || s.includes("62")) types.push("Elderly");
  if (s.includes("disab") || s.includes("handicap")) types.push("Disabled");
  if (s.includes("homeless")) types.push("Homeless");
  if (types.length === 0) types.push(str(v).replace(/;$/, "").replace(/;/g, " · "));
  return types;
}

function normalizeMultifamily(feature: HousingFeature, source: "mfassist" | "insured"): DisplayProperty | null {
  const p = feature.properties;
  if (!p) return null;
  const coords = feature.geometry?.coordinates;

  const name = str(p.PROPERTY_NAME_TEXT) || "Assisted Housing";
  const addr = str(p.ADDRESS_LINE1_TEXT).trim();
  const lat = coords ? coords[1] : (typeof p.LAT === "number" ? p.LAT : null);
  const lng = coords ? coords[0] : (typeof p.LON === "number" ? p.LON : null);
  const objectId = str(p.OBJECTID);
  const prefix = source === "insured" ? "ins" : "mfa";

  return {
    id: `${prefix}-${objectId || stableSlug(name, addr)}`,
    source: source as DataSource,
    name,
    address: addr,
    city: str(p.STD_CITY).trim(),
    state: str(p.STD_ST).trim(),
    zip: str(p.STD_ZIP5).trim(),
    lat,
    lng,
    phone: str(p.PROPERTY_ON_SITE_PHONE_NUMBER) || undefined,
    website: undefined,
    developer: undefined,
    isNonProfit: false,
    totalUnits: num(p.TOTAL_UNIT_COUNT),
    affordableUnits: num(p.TOTAL_ASSISTED_UNIT_COUNT),
    bedrooms: {
      studio: num(p.BD0_CNT1),
      br1: num(p.BD1_CNT1),
      br2: num(p.BD2_CNT1),
      br3: num(p.BD3_CNT1),
      br4plus: num(p.BD4_CNT1),
    },
    incomeCeilingPct: 50,
    populationTypes: populationFromClientGroup(p.CLIENT_GROUP_NAME),
    hasRentalAssistance: flag(p.IS_SEC8_IND) || flag(p.IS_SUBSIDIZED_IND),
    yearBuilt: undefined,
    raw: p,
  };
}

function normalizeUSDA(feature: HousingFeature): DisplayProperty | null {
  const p = feature.properties;
  if (!p) return null;
  const coords = feature.geometry?.coordinates;

  const name = str(p.PROJECT_NAME) || "Rural Housing";
  const addr = str(p.PRJ_ADDRESS_LINE1).trim();
  const lat = coords ? coords[1] : (typeof p.LAT === "number" ? p.LAT : null);
  const lng = coords ? coords[0] : (typeof p.LON === "number" ? p.LON : null);
  const objectId = str(p.OBJECTID);
  const raUnits = num(p.RA_UNITS);
  const zip = str(p.PRJ_ADDRESS_ZIP).trim();

  return {
    id: `usda-${objectId || stableSlug(name, addr)}`,
    source: "usda" as DataSource,
    name,
    address: addr,
    city: str(p.PRJ_ADDRESS_CITY).trim(),
    state: str(p.PRJ_ADDRESS_STATE).trim(),
    zip: zip.length > 5 ? zip.slice(0, 5) : zip,
    lat,
    lng,
    phone: str(p.MGMT_AGENT_PH_NBR) || undefined,
    website: undefined,
    developer: str(p.MGMT_AGENT_NAME) || undefined,
    isNonProfit: false,
    totalUnits: num(p.TOTAL_UNITS),
    affordableUnits: raUnits || num(p.TOTAL_UNITS),
    bedrooms: {
      studio: num(p.STUDIO_COUNT),
      br1: num(p.BEDROOM1_COUNT),
      br2: num(p.BEDROOM2_COUNT),
      br3: num(p.BEDROOM3_COUNT),
      br4plus: num(p.BEDROOM4_COUNT) + num(p.BEDROOM5_COUNT),
    },
    incomeCeilingPct: 50,
    populationTypes: [],
    hasRentalAssistance: raUnits > 0,
    yearBuilt: undefined,
    raw: p,
  };
}

export function normalizeFeatures(features: HousingFeature[], source: DataSource): DisplayProperty[] {
  const results: DisplayProperty[] = [];
  for (const f of features) {
    let norm: DisplayProperty | null = null;
    if (source === "sj") norm = normalizeSJ(f);
    else if (source === "public") norm = normalizePublicHousing(f);
    else if (source === "mfassist") norm = normalizeMultifamily(f, "mfassist");
    else if (source === "insured") norm = normalizeMultifamily(f, "insured");
    else if (source === "usda") norm = normalizeUSDA(f);
    else norm = normalizeLIHTC(f);
    if (norm && (norm.lat !== null || norm.address)) results.push(norm);
  }
  return results;
}

const SOURCE_TRUST: DataSource[] = ["sj", "lihtc", "mfassist", "public", "usda", "insured"];
function sourceRank(s: DataSource): number {
  const i = SOURCE_TRUST.indexOf(s);
  return i === -1 ? SOURCE_TRUST.length : i;
}

function bedroomTotal(b: BedroomCounts): number {
  return b.studio + b.br1 + b.br2 + b.br3 + b.br4plus;
}

function richness(p: DisplayProperty): number {
  let n = 0;
  if (p.name) n++;
  if (p.address) n++;
  if (p.city) n++;
  if (p.state) n++;
  if (p.zip) n++;
  if (p.phone) n++;
  if (p.website) n++;
  if (p.developer) n++;
  if (p.totalUnits) n++;
  if (p.affordableUnits) n++;
  if (p.incomeCeilingPct != null) n++;
  if (p.populationTypes.length) n++;
  if (bedroomTotal(p.bedrooms) > 0) n += 2;
  return n;
}

function dedupKey(p: DisplayProperty): string {
  const lat = p.lat;
  const lng = p.lng;
  if (lat != null && lng != null && lat !== 0 && lng !== 0) {
    return `geo:${lat.toFixed(4)},${lng.toFixed(4)}`;
  }
  const addr = p.address.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  return `addr:${addr}|${p.zip}`;
}

export function dedupeProperties(props: DisplayProperty[]): DisplayProperty[] {
  const byKey = new Map<string, DisplayProperty>();
  for (const p of props) {
    const key = dedupKey(p);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, p);
      continue;
    }

    const pIsBetter =
      richness(p) > richness(existing) ||
      (richness(p) === richness(existing) && sourceRank(p.source) < sourceRank(existing.source));
    const base = pIsBetter ? p : existing;
    const other = pIsBetter ? existing : p;

    const merged: DisplayProperty = {
      ...base,
      populationTypes: Array.from(new Set([...base.populationTypes, ...other.populationTypes])),
      hasRentalAssistance: base.hasRentalAssistance || other.hasRentalAssistance,
      affordableUnits: Math.max(base.affordableUnits, other.affordableUnits),
      totalUnits: Math.max(base.totalUnits, other.totalUnits),
      bedrooms: bedroomTotal(base.bedrooms) >= bedroomTotal(other.bedrooms) ? base.bedrooms : other.bedrooms,
      phone: base.phone || other.phone,
      website: base.website || other.website,
      developer: base.developer || other.developer,
      incomeCeilingPct: base.incomeCeilingPct ?? other.incomeCeilingPct,
    };
    byKey.set(key, merged);
  }
  return Array.from(byKey.values());
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
