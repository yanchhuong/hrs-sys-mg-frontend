// The Tauri v2 idiomatic entry point — `main.rs` is a thin
// wrapper so the app compiles as both a library (which the mobile
// targets consume) and a Windows binary. Extend `run()` with
// plugins, tray icons, or `#[tauri::command]`s over time.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        // V-fcm-3-tauri — surface HRMS notifications as Windows
        // Action-Center toasts. The FE calls this from the FCM
        // foreground handler and the notification poller.
        .plugin(tauri_plugin_notification::init())
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
