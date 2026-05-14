export interface HousingProperties {
  OBJECTID?: number;
  PROJECT_NAME?: string;
  ADDRESS?: string;
  TOTAL_UNITS?: number;
  AFFORDABLE_UNITS?: number;
  PROJECT_STATUS?: string;
  DEVELOPER?: string;
  TENURE?: string;
  AFFORDABILITY_LEVEL?: string;
  [key: string]: unknown;
}

export interface HousingFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  } | null;
  properties: HousingProperties | null;
}

export interface HousingCollection {
  type: "FeatureCollection";
  features: HousingFeature[];
}
