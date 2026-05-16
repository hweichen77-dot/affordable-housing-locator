use serde::{Deserialize, Serialize};
use std::f64::consts::PI;

const SJ_URL: &str =
    "https://geo.sanjoseca.gov/server/rest/services/HSG/HSG_HousingMapLayers/MapServer/1/query";

const LIHTC_URL: &str =
    "https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/LIHTC/FeatureServer/0/query";

const NOMINATIM_URL: &str = "https://nominatim.openstreetmap.org/search";

const LIHTC_FIELDS: &str =
    "OBJECTID,PROJECT,PROJ_ADD,PROJ_CTY,PROJ_ST,PROJ_ZIP,N_UNITS,LI_UNITS,\
     N_0BR,N_1BR,N_2BR,N_3BR,N_4BR,INC_CEIL,LOW_CEIL,TRGT_FAM,TRGT_ELD,\
     TRGT_DIS,TRGT_HML,RENTASSIST,NON_PROF,YR_PIS,CO_TEL,COMPANY,LAT,LON";

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
    pub bbox: [f64; 4], // south, north, west, east
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

fn make_client() -> Result<reqwest::Client, HousingError> {
    reqwest::Client::builder()
        .user_agent("housing-locator/1.0")
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| HousingError::Network(e.to_string()))
}

async fn fetch_geojson(client: &reqwest::Client, url: &str, params: &[(&str, &str)]) -> Result<HousingCollection, HousingError> {
    let body = client
        .get(url)
        .query(params)
        .send()
        .await
        .map_err(|e| HousingError::Network(e.to_string()))?
        .bytes()
        .await
        .map_err(|e| HousingError::Network(format!("body read: {}", e)))?;

    serde_json::from_slice::<HousingCollection>(&body)
        .map_err(|e| HousingError::Parse(format!("{} (len={})", e, body.len())))
}

/// Geocode a city, ZIP, or address via Nominatim (OpenStreetMap).
#[tauri::command]
pub async fn geocode(query: String) -> Result<GeoLocation, HousingError> {
    let client = make_client()?;
    let body = client
        .get(NOMINATIM_URL)
        .query(&[
            ("q", query.as_str()),
            ("format", "json"),
            ("limit", "1"),
            ("countrycodes", "us"),
            ("addressdetails", "0"),
        ])
        .send()
        .await
        .map_err(|e| HousingError::Network(e.to_string()))?
        .bytes()
        .await
        .map_err(|e| HousingError::Network(format!("body: {}", e)))?;

    let results: Vec<NominatimResult> = serde_json::from_slice(&body)
        .map_err(|e| HousingError::Parse(e.to_string()))?;

    let r = results.into_iter().next()
        .ok_or_else(|| HousingError::NotFound(format!("No results for '{}'", query)))?;

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
#[tauri::command]
pub async fn fetch_lihtc(lat: f64, lng: f64, radius_km: f64) -> Result<HousingCollection, HousingError> {
    let client = make_client()?;

    let d_lat = radius_km / 111.0;
    let d_lng = radius_km / (111.0 * (lat * PI / 180.0).cos());

    let bbox = serde_json::json!({
        "xmin": lng - d_lng,
        "ymin": lat - d_lat,
        "xmax": lng + d_lng,
        "ymax": lat + d_lat,
    }).to_string();

    fetch_geojson(&client, LIHTC_URL, &[
        ("geometry", bbox.as_str()),
        ("geometryType", "esriGeometryEnvelope"),
        ("inSR", "4326"),
        ("outFields", LIHTC_FIELDS),
        ("returnGeometry", "true"),
        ("f", "geojson"),
        ("resultRecordCount", "1000"),
    ]).await
}

/// Fetch San Jose local affordable housing (detailed local dataset).
#[tauri::command]
pub async fn fetch_housing() -> Result<HousingCollection, HousingError> {
    let client = make_client()?;

    let body = client
        .get(SJ_URL)
        .header("Accept", "application/json")
        .query(&[
            ("where", "1=1"),
            ("outFields", "*"),
            ("returnGeometry", "true"),
            ("f", "geojson"),
            ("resultRecordCount", "2000"),
        ])
        .send()
        .await
        .map_err(|e| HousingError::Network(e.to_string()))?
        .bytes()
        .await
        .map_err(|e| HousingError::Network(format!("body read: {}", e)))?;

    serde_json::from_slice::<HousingCollection>(&body)
        .map_err(|e| HousingError::Parse(format!("{} (body len={})", e, body.len())))
}
