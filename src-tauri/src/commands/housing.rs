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

const LIHTC_PAGE: usize = 1000;
const LIHTC_MAX: usize = 5000;

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

        if n < LIHTC_PAGE || all_features.len() >= LIHTC_MAX {
            break;
        }
        offset += LIHTC_PAGE;
    }

    Ok(HousingCollection {
        collection_type: "FeatureCollection".into(),
        features: all_features,
    })
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
