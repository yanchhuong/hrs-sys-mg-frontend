// The Tauri v2 idiomatic entry point — `main.rs` is a thin
// wrapper so the app compiles as both a library (which the mobile
// targets consume) and a Windows binary. Extend `run()` with
// plugins, tray icons, or `#[tauri::command]`s over time.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
