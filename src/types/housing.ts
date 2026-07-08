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

export interface GeoLocation {
  lat: number;
  lng: number;
  display_name: string;
  bbox: [number, number, number, number];
}

export type DataSource = "sj" | "lihtc" | "public" | "mfassist" | "usda" | "insured";

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
  incomeCeilingPct?: number;
  populationTypes: string[];
  hasRentalAssistance: boolean;
  yearBuilt?: number;
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
  arExpiry?: number;
  lowCeil?: number;
  ceilUnit?: number;
  isLikelyExpired?: boolean;
  waitlistStatus?: "open" | "closed" | "unknown";
  applicationDeadline?: number;
  raw: Record<string, unknown>;
}

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
