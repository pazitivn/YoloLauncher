// lib.rs - YoloLauncher core Tauri library
pub mod accounts;
pub mod instances;
pub mod download;
pub mod launch;
pub mod java;
pub mod paths;
pub mod python;
pub mod content;
pub mod migration;
pub mod skins;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            window.show().unwrap();
            
            // Start local skin server on startup
            tauri::async_runtime::spawn(async {
                if let Err(e) = skins::start_skin_server().await {
                    eprintln!("[skins] Failed to start skin server: {}", e);
                }
            });
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Account commands
            accounts::get_accounts,
            accounts::add_offline_account,
            accounts::remove_account,
            accounts::set_active_account,
            accounts::get_active_account,
            accounts::fetch_skin_bytes,
            accounts::update_account_skin_settings,

            // Instance commands
            instances::get_instances,
            instances::create_instance,
            instances::edit_instance,
            instances::delete_instance,
            instances::get_minecraft_versions,
            instances::get_loader_versions,
            instances::get_default_instances_dir,
            instances::get_downloaded_versions,
            instances::get_instance_screenshot,
            // Download commands
            download::download_instance,
            download::get_download_progress,
            // Launch commands
            launch::launch_instance,
            launch::stop_instance,
            launch::get_running_instances,
            // Java commands
            java::get_java_installations,
            java::check_java,
            // Python / PortableMC commands
            python::check_portablemc,
            python::setup_portablemc,
            // Content commands
            content::list_mods,
            content::toggle_mod,
            content::delete_content_file,
            content::copy_files_to_folder,
            content::open_instance_folder,
            content::list_resourcepacks,
            content::list_shaders,
            content::list_worlds,
            content::list_screenshots,
            // Migration
            migration::scan_old_launchers,
            migration::migrate_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running YoloLauncher")
}
