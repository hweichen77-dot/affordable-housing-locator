mod commands;

use commands::housing::fetch_housing;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![fetch_housing])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
