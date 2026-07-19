// tray.rs - System tray icon and menu
//
// Manages the tray icon lifecycle, context menu (localized),
// and tracks how many games are hidden in tray.

use std::sync::{Arc, Mutex};
use tauri::{
    AppHandle, Emitter, Manager, Runtime,
    menu::{Menu, MenuBuilder, MenuItemBuilder, MenuEvent},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent, TrayIcon},
};

lazy_static::lazy_static! {
    /// Number of games that are running with launch_behavior="hide".
    /// Used to decide when to auto-restore the window after all games exit.
    pub static ref TRAY_STATE: Arc<Mutex<TrayState>> = Arc::new(Mutex::new(TrayState {
        hide_game_count: 0,
    }));
}

pub struct TrayState {
    pub hide_game_count: u32,
}

/// Build a tray menu with localized text.
fn build_tray_menu<R: Runtime>(app: &AppHandle<R>, lang: &str) -> Result<Menu<R>, tauri::Error> {
    let (restore_text, updates_text, logs_text, close_text) = match lang {
        "ru" => (
            "Восстановить YoloLauncher",
            "Проверить обновления",
            "Открыть окно логов",
            "Закрыть лаунчер (выход)",
        ),
        _ => (
            "Restore YoloLauncher",
            "Check for updates",
            "Open log window",
            "Close launcher (exit)",
        ),
    };

    let restore = MenuItemBuilder::with_id("restore", restore_text).build(app)?;
    let check_updates = MenuItemBuilder::with_id("check_updates", updates_text).build(app)?;
    let open_logs = MenuItemBuilder::with_id("open_logs", logs_text).build(app)?;
    let close = MenuItemBuilder::with_id("close", close_text).build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&restore)
        .item(&check_updates)
        .item(&open_logs)
        .item(&close)
        .build()?;

    Ok(menu)
}

/// Setup system tray icon and menu.
pub fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();

    // Load icon (from default window icon configured in tauri.conf.json)
    let icon = app
        .default_window_icon()
        .cloned()
        .expect("default window icon must be configured for tray");

    // Build initial menu (English default)
    let menu = build_tray_menu(&handle, "en")?;

    TrayIconBuilder::with_id("main")
        .icon(icon)
        .menu(&menu)
        .tooltip("YoloLauncher")
        .on_menu_event(|app: &AppHandle, event: MenuEvent| {
            match event.id().as_ref() {
                "restore" => {
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
                "check_updates" => {
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                    let _ = app.emit("check-for-updates", ());
                }
                "open_logs" => {
                    let _ = app.emit("open-console", ());
                }
                "close" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray: &TrayIcon, event: TrayIconEvent| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

/// Update the tray context menu language.
/// Called from the frontend when the user changes the UI language.
#[tauri::command]
pub fn set_tray_language<R: Runtime>(app: AppHandle<R>, lang: String) -> Result<(), String> {
    let menu = build_tray_menu(&app, &lang).map_err(|e| e.to_string())?;
    if let Some(tray) = app.tray_by_id("main") {
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    }
    Ok(())
}
