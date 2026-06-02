// Raw GeoJSON shapes returned from the API
export interface HousingFeature {
  type: "Feature";
  id?: number | string;
  geometry: { type: "Point"; coordinates: [number, number] } | null;
  properties: Record<string, unknown> | null;
}

export interface HousingCollection {
  type: "FeatureCollection";
  features: HousingFeature[];
}

// Geocode result from Nominatim via Rust backend
export interface GeoLocation {
  lat: number;
  lng: number;
  display_name: string;
  bbox: [number, number, number, number]; // south, north, west, east
}

// Unified display model — source-agnostic
export type DataSource = "sj" | "lihtc";

export interface BedroomCounts {
  studio: number;
  br1: number;
  br2: number;
  br3: number;
  br4plus: number;
}

export interface DisplayProperty {
  id: string;
  source: DataSource;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  phone?: string;
  website?: string;
  developer?: string;
  isNonProfit: boolean;
  totalUnits: number;
  affordableUnits: number;
  bedrooms: BedroomCounts;
  incomeCeilingPct?: number;     // e.g. 50 = 50% AMI ceiling
  populationTypes: string[];     // ['Family', 'Elderly', 'Disabled', ...]
  hasRentalAssistance: boolean;
  yearBuilt?: number;
  // SJ-specific
  arstatus?: string;
  projdevstage?: string;
  tenuretype?: string;
  projecttype?: string;
  councildistrict?: number;
  inclusionary?: string;
  eliunits?: number;
  vliunits?: number;
  liunits?: number;
  moderateunits?: number;
  propertyManager?: string;
  arExpiry?: number;          // Unix epoch ms — SJ affordability restriction expiry
  // LIHTC-specific
  lowCeil?: number;           // decoded lower AMI tier % (50 or 60) for mixed-tier properties
  ceilUnit?: number;          // units at lower AMI tier
  raw: Record<string, unknown>;
}

// ── Market data (HUD FMR + Census ACS) ───────────────────────────────────────

export interface FmrData {
  zip: string;
  area_name: string;
  efficiency: number;
  one_br: number;
  two_br: number;
  three_br: number;
  four_br: number;
  year: number;
}

export interface AcsRentData {
  zcta: string;
  median_all: number | null;
  studio: number | null;
  one_br: number | null;
  two_br: number | null;
  three_br: number | null;
  four_br_plus: number | null;
}

export interface BrRents {
  studio: number;
  one_br: number;
  two_br: number;
  three_br: number;
  four_br: number;
}

export interface IlData {
  zip: string;
  area_name: string;
  year: number;
  median_income: number;
  pct30: BrRents;
  pct50: BrRents;
  pct60: BrRents;
  pct80: BrRents;
}

export interface RentcastListing {
  address: string;
  bedrooms: number;
  bathrooms: number;
  price: number;
  square_footage: number | null;
  property_type: string;
  days_on_market: number | null;
}

export interface MarketData {
  fmr: FmrData | null;
  acs: AcsRentData | null;
  il: IlData | null;
  nearby: RentcastListing[];
}
