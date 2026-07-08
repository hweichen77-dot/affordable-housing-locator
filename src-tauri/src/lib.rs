mod commands;

use commands::housing::{fetch_housing, fetch_lihtc, fetch_public_housing, fetch_multifamily_assisted, fetch_usda_rural, fetch_insured_multifamily, geocode, reverse_geocode, ip_locate, fetch_fmr, fetch_acs_rent, fetch_il, fetch_nearby_rentals, AppConfig};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let client = reqwest::Client::builder()
        .user_agent("AffordableHousingLocator/1.5.0 (affordable-housing-locator; contact: jason.huang317235@gmail.com)")
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .expect("failed to build HTTP client");

    let config = AppConfig::from_env();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(client)
        .manage(config)
        .invoke_handler(tauri::generate_handler![
            fetch_housing, fetch_lihtc, fetch_public_housing, fetch_multifamily_assisted,
            fetch_usda_rural, fetch_insured_multifamily, geocode, reverse_geocode,
            ip_locate, fetch_fmr, fetch_acs_rent, fetch_il, fetch_nearby_rentals
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
