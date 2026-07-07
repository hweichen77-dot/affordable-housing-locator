use serde::{Deserialize, Serialize};
use std::f64::consts::PI;

pub struct AppConfig {
    pub hud_token: Option<String>,
    pub census_key: String,
    pub rentcast_key: Option<String>,
}

impl AppConfig {
    pub fn from_env() -> Self {
        Self {
            hud_token: std::env::var("HUD_API_TOKEN").ok().filter(|s| !s.is_empty()),
            census_key: std::env::var("CENSUS_API_KEY")
                .unwrap_or_else(|_| "DEMO_KEY".into()),
            rentcast_key: std::env::var("RENTCAST_API_KEY").ok().filter(|s| !s.is_empty()),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FmrData {
    pub zip: String,
    pub area_name: String,
    pub efficiency: u32,
    pub one_br: u32,
    pub two_br: u32,
    pub three_br: u32,
    pub four_br: u32,
    pub year: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AcsRentData {
    pub zcta: String,
    pub median_all: Option<i64>,
    pub studio: Option<i64>,
    pub one_br: Option<i64>,
    pub two_br: Option<i64>,
    pub three_br: Option<i64>,
    pub four_br_plus: Option<i64>,
}


/// Pre-computed LIHTC max rents by bedroom size at a given AMI tier.
/// Formula: income_limit[occupancy] × 30% / 12
/// Occupancy: studio→1p, 1BR→1.5p, 2BR→3p, 3BR→4.5p, 4BR→6p
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BrRents {
    pub studio: u32,
    pub one_br: u32,
    pub two_br: u32,
    pub three_br: u32,
    pub four_br: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct IlData {
    pub zip: String,
    pub area_name: String,
    pub year: u32,
    pub median_income: u32,
    pub pct30: BrRents,
    pub pct50: BrRents,
    pub pct60: BrRents,
    pub pct80: BrRents,
}

#[derive(Deserialize)]
struct FmrItem {
    #[serde(rename = "Efficiency")]
    efficiency: Option<serde_json::Value>,
    #[serde(rename = "One-Bedroom")]
    one_br: Option<serde_json::Value>,
    #[serde(rename = "Two-Bedroom")]
    two_br: Option<serde_json::Value>,
    #[serde(rename = "Three-Bedroom")]
    three_br: Option<serde_json::Value>,
    #[serde(rename = "Four-Bedroom")]
    four_br: Option<serde_json::Value>,
    area_name: Option<String>,
    year: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct FmrDataWrapper { basicdata: Vec<FmrItem> }

#[derive(Deserialize)]
struct FmrApiResponse { data: FmrDataWrapper }

const SJ_URL: &str =
    "https://geo.sanjoseca.gov/server/rest/services/HSG/HSG_HousingMapLayers/MapServer/1/query";

const LIHTC_URL: &str =
    "https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/LIHTC/FeatureServer/0/query";

// HUD Public Housing — switched to grouped Developments layer (6,223 projects)
// from the building-level layer, and now paginates the full result set.
const PUBLIC_HOUSING_URL: &str =
    "https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Public_Housing_Developments/FeatureServer/0/query";

// HUD Multifamily Assisted properties (Section 8 / project-based, 23,781 recs).
const MULTIFAMILY_ASSISTED_URL: &str =
    "https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Multifamily_Properties_Assisted/FeatureServer/0/query";

// USDA Rural Development multifamily housing assets (13,262 recs).
const USDA_RURAL_URL: &str =
    "https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/USDA_Rural_Housing_Assets/FeatureServer/0/query";

// HUD FHA-insured multifamily properties (17,324 recs; filtered to subsidized).
const INSURED_MULTIFAMILY_URL: &str =
    "https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/HUD_Insured_Multifamily_Properties/FeatureServer/0/query";

const NOMINATIM_URL: &str = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_REVERSE_URL: &str = "https://nominatim.openstreetmap.org/reverse";

const LIHTC_FIELDS: &str =
    "OBJECTID,PROJECT,PROJ_ADD,PROJ_CTY,PROJ_ST,PROJ_ZIP,N_UNITS,LI_UNITS,\
     N_0BR,N_1BR,N_2BR,N_3BR,N_4BR,INC_CEIL,LOW_CEIL,CEILUNIT,TRGT_FAM,TRGT_ELD,\
     TRGT_DIS,TRGT_HML,RENTASSIST,NON_PROF,YR_PIS,CO_TEL,COMPANY,LAT,LON";

const PUBLIC_HOUSING_FIELDS: &str =
    "PROJECT_NAME,STD_ADDR,STD_CITY,STD_ST,STD_ZIP5,LAT,LON,\
     TOTAL_UNITS,TOTAL_DWELLING_UNITS,HA_PHN_NUM,FORMAL_PARTICIPANT_NAME";

// Shared field set for both Multifamily Assisted and FHA-Insured (same schema).
const MULTIFAMILY_FIELDS: &str =
    "PROPERTY_NAME_TEXT,ADDRESS_LINE1_TEXT,STD_CITY,STD_ST,STD_ZIP5,LAT,LON,\
     TOTAL_UNIT_COUNT,TOTAL_ASSISTED_UNIT_COUNT,PROPERTY_ON_SITE_PHONE_NUMBER,\
     CLIENT_GROUP_NAME,BD0_CNT1,BD1_CNT1,BD2_CNT1,BD3_CNT1,BD4_CNT1,\
     IS_SEC8_IND,IS_SUBSIDIZED_IND";

const USDA_FIELDS: &str =
    "PROJECT_NAME,PRJ_ADDRESS_LINE1,PRJ_ADDRESS_CITY,PRJ_ADDRESS_STATE,PRJ_ADDRESS_ZIP,\
     LAT,LON,TOTAL_UNITS,RA_UNITS,STUDIO_COUNT,BEDROOM1_COUNT,BEDROOM2_COUNT,\
     BEDROOM3_COUNT,BEDROOM4_COUNT,BEDROOM5_COUNT,MGMT_AGENT_NAME,MGMT_AGENT_PH_NBR";

// Keep only subsidized / Section 8 stock, dropping market-rate FHA loans.
const INSURED_WHERE: &str = "IS_SUBSIDIZED_IND='Y' OR IS_SEC8_IND='Y'";

const LIHTC_PAGE: usize = 1000;
const MULTIFAMILY_PAGE: usize = 2000;
const USDA_PAGE: usize = 16000;
const INSURED_PAGE: usize = 2000;
const PUBLIC_HOUSING_PAGE: usize = 10000;

#[derive(Debug, Serialize, Deserialize)]
pub struct HousingFeature {
    #[serde(rename = "type")]
    pub feature_type: String,
    pub id: Option<serde_json::Value>,
    pub geometry: Option<serde_json::Value>,
    pub properties: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HousingCollection {
    #[serde(rename = "type")]
    pub collection_type: String,
    pub features: Vec<HousingFeature>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GeoLocation {
    pub lat: f64,
    pub lng: f64,
    pub display_name: String,
    pub bbox: [f64; 4],
}

#[derive(Debug, Serialize, Deserialize)]
struct NominatimResult {
    lat: String,
    lon: String,
    display_name: String,
    boundingbox: Vec<String>,
}

#[derive(Debug, thiserror::Error, Serialize)]
pub enum HousingError {
    #[error("Network error: {0}")]
    Network(String),
    #[error("Parse error: {0}")]
    Parse(String),
    #[error("Not found: {0}")]
    NotFound(String),
}

async fn get_bytes(
    client: &reqwest::Client,
    url: &str,
    params: &[(&str, &str)],
) -> Result<Vec<u8>, HousingError> {
    let resp = client
        .get(url)
        .query(params)
        .send()
        .await
        .map_err(|e| HousingError::Network(e.to_string()))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(HousingError::Network(format!("HTTP {status}")));
    }

    resp.bytes()
        .await
        .map(|b| b.to_vec())
        .map_err(|e| HousingError::Network(format!("body read: {e}")))
}

async fn fetch_geojson(
    client: &reqwest::Client,
    url: &str,
    params: &[(&str, &str)],
) -> Result<HousingCollection, HousingError> {
    let body: Vec<u8> = get_bytes(client, url, params).await?;
    let len = body.len();
    serde_json::from_slice::<HousingCollection>(&body)
        .map_err(|e| HousingError::Parse(format!("{e} (len={len})")))
}

/// Fetch an ArcGIS FeatureServer layer within radius_km of lat/lng, paginating
/// the full result set (loops until a page returns fewer than `page` records).
async fn fetch_arcgis_paginated(
    client: &reqwest::Client,
    url: &str,
    fields: &str,
    where_clause: Option<&str>,
    page: usize,
    lat: f64,
    lng: f64,
    radius_km: f64,
) -> Result<HousingCollection, HousingError> {
    let d_lat = radius_km / 111.0;
    let d_lng = radius_km / (111.0 * (lat * PI / 180.0).cos());

    let bbox = serde_json::json!({
        "xmin": lng - d_lng,
        "ymin": lat - d_lat,
        "xmax": lng + d_lng,
        "ymax": lat + d_lat,
    })
    .to_string();

    let mut base_params: Vec<(&str, String)> = vec![
        ("geometry", bbox),
        ("geometryType", "esriGeometryEnvelope".into()),
        ("inSR", "4326".into()),
        ("outFields", fields.into()),
        ("returnGeometry", "true".into()),
        ("f", "geojson".into()),
    ];
    if let Some(w) = where_clause {
        base_params.push(("where", w.into()));
    }

    let mut all_features: Vec<HousingFeature> = Vec::new();
    let mut offset = 0usize;

    loop {
        let count_str = page.to_string();
        let offset_str = offset.to_string();

        let mut params: Vec<(&str, &str)> = base_params
            .iter()
            .map(|(k, v)| (*k, v.as_str()))
            .collect();
        params.push(("resultRecordCount", &count_str));
        params.push(("resultOffset", &offset_str));

        let pg = fetch_geojson(client, url, &params).await?;
        let n = pg.features.len();
        all_features.extend(pg.features);

        if n < page {
            break;
        }
        offset += page;
    }

    Ok(HousingCollection {
        collection_type: "FeatureCollection".into(),
        features: all_features,
    })
}

/// Geocode a city, ZIP, or address via Nominatim (OpenStreetMap).
#[tauri::command]
pub async fn geocode(
    client: tauri::State<'_, reqwest::Client>,
    query: String,
) -> Result<GeoLocation, HousingError> {
    let body = get_bytes(
        &client,
        NOMINATIM_URL,
        &[
            ("q", query.as_str()),
            ("format", "json"),
            ("limit", "1"),
            ("countrycodes", "us"),
            ("addressdetails", "0"),
        ],
    )
    .await?;

    let results: Vec<NominatimResult> = serde_json::from_slice(&body)
        .map_err(|e| HousingError::Parse(e.to_string()))?;

    let r = results
        .into_iter()
        .next()
        .ok_or_else(|| HousingError::NotFound(format!("No results for '{query}'")))?;

    let lat: f64 = r.lat.parse().map_err(|_| HousingError::Parse("bad lat".into()))?;
    let lng: f64 = r.lon.parse().map_err(|_| HousingError::Parse("bad lon".into()))?;

    let bbox = if r.boundingbox.len() == 4 {
        [
            r.boundingbox[0].parse().unwrap_or(lat - 0.1),
            r.boundingbox[1].parse().unwrap_or(lat + 0.1),
            r.boundingbox[2].parse().unwrap_or(lng - 0.1),
            r.boundingbox[3].parse().unwrap_or(lng + 0.1),
        ]
    } else {
        [lat - 0.1, lat + 0.1, lng - 0.1, lng + 0.1]
    };

    Ok(GeoLocation { lat, lng, display_name: r.display_name, bbox })
}

/// Fetch LIHTC affordable housing within radius_km of lat/lng (nationwide).
/// Paginates until no more results or LIHTC_MAX features reached.
#[tauri::command]
pub async fn fetch_lihtc(
    client: tauri::State<'_, reqwest::Client>,
    lat: f64,
    lng: f64,
    radius_km: f64,
) -> Result<HousingCollection, HousingError> {
    let d_lat = radius_km / 111.0;
    let d_lng = radius_km / (111.0 * (lat * PI / 180.0).cos());

    let bbox = serde_json::json!({
        "xmin": lng - d_lng,
        "ymin": lat - d_lat,
        "xmax": lng + d_lng,
        "ymax": lat + d_lat,
    })
    .to_string();

    let base_params: Vec<(&str, String)> = vec![
        ("geometry", bbox.clone()),
        ("geometryType", "esriGeometryEnvelope".into()),
        ("inSR", "4326".into()),
        ("outFields", LIHTC_FIELDS.into()),
        ("returnGeometry", "true".into()),
        ("f", "geojson".into()),
    ];

    let mut all_features: Vec<HousingFeature> = Vec::new();
    let mut offset = 0usize;

    loop {
        let count_str = LIHTC_PAGE.to_string();
        let offset_str = offset.to_string();

        let mut params: Vec<(&str, &str)> = base_params
            .iter()
            .map(|(k, v)| (*k, v.as_str()))
            .collect();
        params.push(("resultRecordCount", &count_str));
        params.push(("resultOffset", &offset_str));

        let page = fetch_geojson(&client, LIHTC_URL, &params).await?;
        let n = page.features.len();
        all_features.extend(page.features);

        if n < LIHTC_PAGE {
            break;
        }
        offset += LIHTC_PAGE;
    }

    Ok(HousingCollection {
        collection_type: "FeatureCollection".into(),
        features: all_features,
    })
}

/// Fetch HUD Public Housing developments within radius_km of lat/lng.
/// Source: HUD Public Housing Developments ArcGIS service (no API key required).
/// Grouped project-level layer; paginates the full result set.
#[tauri::command]
pub async fn fetch_public_housing(
    client: tauri::State<'_, reqwest::Client>,
    lat: f64,
    lng: f64,
    radius_km: f64,
) -> Result<HousingCollection, HousingError> {
    fetch_arcgis_paginated(
        &client, PUBLIC_HOUSING_URL, PUBLIC_HOUSING_FIELDS, None,
        PUBLIC_HOUSING_PAGE, lat, lng, radius_km,
    )
    .await
}

/// Fetch HUD Multifamily Assisted (project-based Section 8) properties
/// within radius_km of lat/lng. No API key required.
#[tauri::command]
pub async fn fetch_multifamily_assisted(
    client: tauri::State<'_, reqwest::Client>,
    lat: f64,
    lng: f64,
    radius_km: f64,
) -> Result<HousingCollection, HousingError> {
    fetch_arcgis_paginated(
        &client, MULTIFAMILY_ASSISTED_URL, MULTIFAMILY_FIELDS, None,
        MULTIFAMILY_PAGE, lat, lng, radius_km,
    )
    .await
}

/// Fetch USDA Rural Development multifamily housing assets within radius_km.
/// No API key required.
#[tauri::command]
pub async fn fetch_usda_rural(
    client: tauri::State<'_, reqwest::Client>,
    lat: f64,
    lng: f64,
    radius_km: f64,
) -> Result<HousingCollection, HousingError> {
    fetch_arcgis_paginated(
        &client, USDA_RURAL_URL, USDA_FIELDS, None,
        USDA_PAGE, lat, lng, radius_km,
    )
    .await
}

/// Fetch HUD FHA-Insured Multifamily properties within radius_km, filtered to
/// subsidized / Section 8 stock only (drops market-rate FHA loans). No API key.
#[tauri::command]
pub async fn fetch_insured_multifamily(
    client: tauri::State<'_, reqwest::Client>,
    lat: f64,
    lng: f64,
    radius_km: f64,
) -> Result<HousingCollection, HousingError> {
    fetch_arcgis_paginated(
        &client, INSURED_MULTIFAMILY_URL, MULTIFAMILY_FIELDS, Some(INSURED_WHERE),
        INSURED_PAGE, lat, lng, radius_km,
    )
    .await
}

/// Reverse geocode lat/lng to a location display name via Nominatim.
#[tauri::command]
pub async fn reverse_geocode(
    client: tauri::State<'_, reqwest::Client>,
    lat: f64,
    lng: f64,
) -> Result<GeoLocation, HousingError> {
    let lat_s = format!("{lat}");
    let lng_s = format!("{lng}");
    let body = get_bytes(
        &client,
        NOMINATIM_REVERSE_URL,
        &[
            ("lat", lat_s.as_str()),
            ("lon", lng_s.as_str()),
            ("format", "json"),
            ("zoom", "10"),
        ],
    )
    .await?;

    let r: NominatimResult = serde_json::from_slice(&body)
        .map_err(|e| HousingError::Parse(e.to_string()))?;

    let lat_f: f64 = r.lat.parse().map_err(|_| HousingError::Parse("bad lat".into()))?;
    let lng_f: f64 = r.lon.parse().map_err(|_| HousingError::Parse("bad lon".into()))?;

    let bbox = if r.boundingbox.len() == 4 {
        [
            r.boundingbox[0].parse().unwrap_or(lat_f - 0.1),
            r.boundingbox[1].parse().unwrap_or(lat_f + 0.1),
            r.boundingbox[2].parse().unwrap_or(lng_f - 0.1),
            r.boundingbox[3].parse().unwrap_or(lng_f + 0.1),
        ]
    } else {
        [lat_f - 0.1, lat_f + 0.1, lng_f - 0.1, lng_f + 0.1]
    };

    Ok(GeoLocation { lat: lat_f, lng: lng_f, display_name: r.display_name, bbox })
}

/// Fetch San Jose local affordable housing (detailed local dataset).
#[tauri::command]
pub async fn fetch_housing(
    client: tauri::State<'_, reqwest::Client>,
) -> Result<HousingCollection, HousingError> {
    let body = get_bytes(
        &client,
        SJ_URL,
        &[
            ("where", "1=1"),
            ("outFields", "*"),
            ("returnGeometry", "true"),
            ("f", "geojson"),
            ("resultRecordCount", "2000"),
        ],
    )
    .await?;

    let len = body.len();
    serde_json::from_slice::<HousingCollection>(&body)
        .map_err(|e| HousingError::Parse(format!("{e} (body len={len})")))
}

/// Fetch HUD Fair Market Rents for a ZIP code (requires HUD_API_TOKEN env var).
/// Returns None if no token configured or ZIP not found.
#[tauri::command]
pub async fn fetch_fmr(
    client: tauri::State<'_, reqwest::Client>,
    config: tauri::State<'_, AppConfig>,
    zip: String,
) -> Result<Option<FmrData>, HousingError> {
    let token = match &config.hud_token {
        Some(t) if !t.is_empty() => t.clone(),
        _ => return Ok(None),
    };

    let zip5: String = zip.chars().filter(|c| c.is_ascii_digit()).take(5).collect();
    if zip5.len() != 5 {
        return Ok(None);
    }

    let url = format!(
        "https://www.huduser.gov/hudapi/public/fmr/listFMRsByZip?zip={}&year=2025",
        zip5
    );

    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| HousingError::Network(e.to_string()))?;

    if !resp.status().is_success() {
        return Ok(None);
    }

    let body = resp
        .bytes()
        .await
        .map_err(|e| HousingError::Network(e.to_string()))?;

    let parsed: FmrApiResponse = serde_json::from_slice(&body)
        .map_err(|e| HousingError::Parse(e.to_string()))?;

    let item = match parsed.data.basicdata.into_iter().next() {
        Some(i) => i,
        None => return Ok(None),
    };

    fn to_u32(v: &Option<serde_json::Value>) -> u32 {
        v.as_ref().and_then(|x| x.as_u64()).unwrap_or(0) as u32
    }

    Ok(Some(FmrData {
        zip: zip5,
        area_name: item.area_name.unwrap_or_default(),
        efficiency: to_u32(&item.efficiency),
        one_br: to_u32(&item.one_br),
        two_br: to_u32(&item.two_br),
        three_br: to_u32(&item.three_br),
        four_br: to_u32(&item.four_br),
        year: item.year.as_ref().and_then(|x| x.as_u64()).unwrap_or(2025) as u32,
    }))
}

/// Fetch Census ACS median gross rent by bedroom for a ZIP/ZCTA.
/// Uses DEMO_KEY if CENSUS_API_KEY env var is unset (rate-limited but functional).
#[tauri::command]
pub async fn fetch_acs_rent(
    client: tauri::State<'_, reqwest::Client>,
    config: tauri::State<'_, AppConfig>,
    zip: String,
) -> Result<Option<AcsRentData>, HousingError> {
    let zip5: String = zip.chars().filter(|c| c.is_ascii_digit()).take(5).collect();
    if zip5.len() != 5 {
        return Ok(None);
    }

    // B25031: Median Gross Rent by Bedrooms
    // _001E=all, _002E=studio, _003E=1BR, _004E=2BR, _005E=3BR, _006E=4BR+
    let fields = "B25031_001E,B25031_002E,B25031_003E,B25031_004E,B25031_005E,B25031_006E";
    let url = format!(
        "https://api.census.gov/data/2023/acs/acs5?get={}&for=zip%20code%20tabulation%20area:{}&key={}",
        fields, zip5, config.census_key
    );

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| HousingError::Network(e.to_string()))?;

    if !resp.status().is_success() {
        return Ok(None);
    }

    let body = resp
        .bytes()
        .await
        .map_err(|e| HousingError::Network(e.to_string()))?;

    // Response: [[header0,...,headerN], [val0,...,valN]]
    let rows: Vec<Vec<serde_json::Value>> = serde_json::from_slice(&body)
        .map_err(|e| HousingError::Parse(e.to_string()))?;

    let data_row = match rows.get(1) {
        Some(r) => r,
        None => return Ok(None),
    };

    fn parse_rent(v: &serde_json::Value) -> Option<i64> {
        let n = match v {
            serde_json::Value::String(s) => s.parse::<i64>().ok()?,
            serde_json::Value::Number(n) => n.as_i64()?,
            _ => return None,
        };
        if n > 0 { Some(n) } else { None }
    }

    Ok(Some(AcsRentData {
        zcta: zip5,
        median_all:  data_row.get(0).and_then(parse_rent),
        studio:      data_row.get(1).and_then(parse_rent),
        one_br:      data_row.get(2).and_then(parse_rent),
        two_br:      data_row.get(3).and_then(parse_rent),
        three_br:    data_row.get(4).and_then(parse_rent),
        four_br_plus: data_row.get(5).and_then(parse_rent),
    }))
}

/// Fetch HUD Income Limits for a ZIP, compute exact LIHTC max rents per bedroom.
/// Uses the same HUD_API_TOKEN as fetch_fmr. Returns None if no token or ZIP unknown.
///
/// HUD formula: max_rent = income_limit[occupancy] × 30% / 12
/// Occupancy mapping: studio→1p, 1BR→avg(1p+2p), 2BR→3p, 3BR→avg(4p+5p), 4BR→6p
#[tauri::command]
pub async fn fetch_il(
    client: tauri::State<'_, reqwest::Client>,
    config: tauri::State<'_, AppConfig>,
    zip: String,
) -> Result<Option<IlData>, HousingError> {
    let token = match &config.hud_token {
        Some(t) if !t.is_empty() => t.clone(),
        _ => return Ok(None),
    };

    let zip5: String = zip.chars().filter(|c| c.is_ascii_digit()).take(5).collect();
    if zip5.len() != 5 {
        return Ok(None);
    }

    let url = format!(
        "https://www.huduser.gov/hudapi/public/il/listILsByZip?zip={}&year=2024",
        zip5
    );

    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| HousingError::Network(e.to_string()))?;

    if !resp.status().is_success() {
        return Ok(None);
    }

    let body = resp
        .bytes()
        .await
        .map_err(|e| HousingError::Network(e.to_string()))?;

    // Parse as generic JSON — HUD IL response has varied field naming across years.
    // We extract income limits by household size at various AMI percentages.
    let v: serde_json::Value = serde_json::from_slice(&body)
        .map_err(|e| HousingError::Parse(e.to_string()))?;

    // Navigate to data array: try several known response shapes
    let item = v.get("data")
        .and_then(|d| d.get("basicdata").or_else(|| d.get("data")))
        .and_then(|arr| arr.as_array())
        .and_then(|a| a.first())
        .or_else(|| v.get("data").and_then(|d| d.as_object().map(|_| d)))
        .cloned();

    let item = match item {
        Some(i) => i,
        None => return Ok(None),
    };

    // Extract area metadata
    let area_name = item.get("area_name")
        .or_else(|| item.get("areaname"))
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown area")
        .to_string();

    let year = item.get("year")
        .and_then(|v| v.as_u64())
        .unwrap_or(2024) as u32;

    let median_income = extract_il_field(&item, &["median_income", "MedInc", "median"]) as u32;

    // Extract income limits by person size at each AMI percentage.
    // HUD field names vary: "l50_1" / "lim50_1" / "50Pct_1" / "il50_p1"
    // We try multiple patterns; first non-zero wins.
    fn il(item: &serde_json::Value, pct: u32, size: u32) -> u64 {
        let pct_s = pct.to_string();
        let sz_s = size.to_string();
        let patterns = [
            format!("l{pct_s}_{sz_s}"),
            format!("lim{pct_s}_{sz_s}"),
            format!("{pct_s}Pct_{sz_s}"),
            format!("il{pct_s}_p{sz_s}"),
            format!("p{pct_s}_{sz_s}"),
        ];
        for p in &patterns {
            if let Some(v) = item.get(p).and_then(|v| v.as_u64()).filter(|&n| n > 0) {
                return v;
            }
        }
        0
    }

    // Build per-size income limit arrays [1..8 persons] for each tier
    let limits = |pct: u32| -> [u64; 8] {
        [
            il(&item, pct, 1), il(&item, pct, 2), il(&item, pct, 3), il(&item, pct, 4),
            il(&item, pct, 5), il(&item, pct, 6), il(&item, pct, 7), il(&item, pct, 8),
        ]
    };

    // If we got no data (all zeros), try deriving from median income
    // HUD publishes 50%/80% of median; 30%=60%ofVLI, 60%=120%ofVLI
    let l50 = limits(50);
    let l80 = limits(80);

    // Fallback: if all zeros, derive from median_income using HUD standard factors
    let l50 = if l50.iter().all(|&x| x == 0) && median_income > 0 {
        let m = median_income as f64;
        // HUD 50% AMI family-size adjustments (approximate)
        let factors = [0.70, 0.80, 0.90, 1.00, 1.08, 1.16, 1.24, 1.32];
        std::array::from_fn(|i| (m * 0.50 * factors[i]) as u64)
    } else { l50 };

    let l80 = if l80.iter().all(|&x| x == 0) && median_income > 0 {
        let m = median_income as f64;
        let factors = [0.70, 0.80, 0.90, 1.00, 1.08, 1.16, 1.24, 1.32];
        std::array::from_fn(|i| (m * 0.80 * factors[i]) as u64)
    } else { l80 };

    // Derive other tiers from 50% baseline (standard HUD ratios)
    let derive = |base: &[u64; 8], ratio: f64| -> [u64; 8] {
        std::array::from_fn(|i| (base[i] as f64 * ratio) as u64)
    };

    let l30 = limits(30);
    let l30 = if l30.iter().all(|&x| x == 0) { derive(&l50, 0.60) } else { l30 };
    let l60 = limits(60);
    let l60 = if l60.iter().all(|&x| x == 0) { derive(&l50, 1.20) } else { l60 };

    // LIHTC rent formula: income_limit[occupancy] × 30% / 12
    // Occupancy: 0BR=1p, 1BR=avg(1+2), 2BR=3p, 3BR=avg(4+5), 4BR=6p
    fn br_rents(lims: &[u64; 8]) -> BrRents {
        fn rent(lims: &[u64; 8], idx_a: usize, idx_b: Option<usize>) -> u32 {
            let limit = match idx_b {
                Some(b) => (lims[idx_a] + lims[b]) / 2,
                None => lims[idx_a],
            };
            ((limit as f64 * 0.30) / 12.0).round() as u32
        }
        BrRents {
            studio:  rent(lims, 0, None),
            one_br:  rent(lims, 0, Some(1)),
            two_br:  rent(lims, 2, None),
            three_br: rent(lims, 3, Some(4)),
            four_br: rent(lims, 5, None),
        }
    }

    // If all derived rents are zero, the API didn't return usable data
    let pct50 = br_rents(&l50);
    if pct50.studio == 0 && pct50.one_br == 0 {
        return Ok(None);
    }

    Ok(Some(IlData {
        zip: zip5,
        area_name,
        year,
        median_income,
        pct30: br_rents(&l30),
        pct50,
        pct60: br_rents(&l60),
        pct80: br_rents(&l80),
    }))
}

fn extract_il_field(item: &serde_json::Value, keys: &[&str]) -> u64 {
    for k in keys {
        if let Some(v) = item.get(*k).and_then(|v| v.as_u64()).filter(|&n| n > 0) {
            return v;
        }
    }
    0
}


#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RentcastListing {
    pub address: String,
    pub bedrooms: u32,
    pub bathrooms: f64,
    pub price: u32,
    pub square_footage: Option<u32>,
    pub property_type: String,
    pub days_on_market: Option<u32>,
}

/// Fetch active rental listings within 0.5 miles of lat/lng via Rentcast API.
/// Returns empty vec if RENTCAST_API_KEY env var not set (graceful degradation).
/// Free tier: 50 calls/month — results are cached per property in the frontend.
#[tauri::command]
pub async fn fetch_nearby_rentals(
    client: tauri::State<'_, reqwest::Client>,
    config: tauri::State<'_, AppConfig>,
    lat: f64,
    lng: f64,
) -> Result<Vec<RentcastListing>, HousingError> {
    let key = match &config.rentcast_key {
        Some(k) if !k.is_empty() => k.clone(),
        _ => return Ok(vec![]),
    };

    let url = format!(
        "https://api.rentcast.io/v1/listings/rental/long-term\
         ?latitude={lat:.6}&longitude={lng:.6}&radius=0.5&status=Active&limit=20"
    );

    let resp = client
        .get(&url)
        .header("X-Api-Key", &key)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| HousingError::Network(e.to_string()))?;

    if !resp.status().is_success() {
        return Ok(vec![]);
    }

    let body = resp.bytes().await
        .map_err(|e| HousingError::Network(e.to_string()))?;

    let raw: Vec<serde_json::Value> = serde_json::from_slice(&body)
        .map_err(|e| HousingError::Parse(e.to_string()))?;

    fn str_field(v: &serde_json::Value, key: &str) -> String {
        v.get(key).and_then(|x| x.as_str()).unwrap_or("").to_string()
    }
    fn u32_field(v: &serde_json::Value, key: &str) -> u32 {
        v.get(key).and_then(|x| x.as_u64()).unwrap_or(0) as u32
    }
    fn f64_field(v: &serde_json::Value, key: &str) -> f64 {
        v.get(key).and_then(|x| x.as_f64()).unwrap_or(0.0)
    }
    fn opt_u32(v: &serde_json::Value, key: &str) -> Option<u32> {
        v.get(key).and_then(|x| x.as_u64()).map(|n| n as u32).filter(|&n| n > 0)
    }

    let mut listings: Vec<RentcastListing> = raw
        .iter()
        .filter_map(|item| {
            let price = u32_field(item, "price");
            if price == 0 { return None; }
            let address = str_field(item, "formattedAddress");
            if address.is_empty() { return None; }
            Some(RentcastListing {
                address,
                bedrooms:   u32_field(item, "bedrooms"),
                bathrooms:  f64_field(item, "bathrooms"),
                price,
                square_footage: opt_u32(item, "squareFootage"),
                property_type:  str_field(item, "propertyType"),
                days_on_market: opt_u32(item, "daysOnMarket"),
            })
        })
        .collect();

    listings.sort_by(|a, b| a.bedrooms.cmp(&b.bedrooms).then(a.price.cmp(&b.price)));
    Ok(listings)
}
