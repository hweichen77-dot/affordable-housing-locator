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
  raw: Record<string, unknown>;
}
