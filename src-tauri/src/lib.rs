mod commands;

use commands::housing::{fetch_housing, fetch_lihtc, geocode};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let client = reqwest::Client::builder()
        .user_agent("HousingLocator/0.2.0 (affordable-housing-locator; open-source)")
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .expect("failed to build HTTP client");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(client)
        .invoke_handler(tauri::generate_handler![fetch_housing, fetch_lihtc, geocode])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
