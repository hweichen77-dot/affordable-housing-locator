use serde::{Deserialize, Serialize};

const ARCGIS_URL: &str =
    "https://geo.sanjoseca.gov/server/rest/services/PLN/PLN_AffordableHousing/FeatureServer/0/query";

#[derive(Debug, Serialize, Deserialize)]
pub struct HousingFeature {
    #[serde(rename = "type")]
    pub feature_type: String,
    pub geometry: Option<serde_json::Value>,
    pub properties: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HousingCollection {
    #[serde(rename = "type")]
    pub collection_type: String,
    pub features: Vec<HousingFeature>,
}

#[derive(Debug, thiserror::Error, Serialize)]
pub enum HousingError {
    #[error("Network error: {0}")]
    Network(String),
    #[error("Parse error: {0}")]
    Parse(String),
}

#[tauri::command]
pub async fn fetch_housing() -> Result<HousingCollection, HousingError> {
    let client = reqwest::Client::new();

    let data = client
        .get(ARCGIS_URL)
        .header("User-Agent", "sj-housing-locator/1.0")
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
        .json::<HousingCollection>()
        .await
        .map_err(|e| HousingError::Parse(e.to_string()))?;

    Ok(data)
}
