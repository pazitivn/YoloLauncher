// launch.rs - Minecraft launcher via PortableMC
//
// How it works:
//   1. find_python_for_portablemc() finds Python with portablemc installed
//   2. Build `portablemc start` command with correct version spec + auth
//   3. Spawn process, pipe stdout/stderr → emit game-log events to frontend
//   4. On exit: restore window visibility based on launch_behavior
//      On crash (non-zero exit): emit instance-crashed so frontend opens logs

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
#[cfg(target_os = "windows")]
use std::process::Stdio;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

use crate::accounts::Account;
use crate::paths::{get_minecraft_dir, get_instance_dir};
use crate::python::find_python_for_portablemc;
use crate::tray;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunningInstance {
    pub launch_id: String,
    pub instance_id: String,
    pub instance_name: String,
    pub pid: u32,
    pub started_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstanceStartedPayload {
    pub launch_id: String,
    pub instance_id: String,
    pub instance_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameLogEntry {
    pub launch_id: String,
    pub instance_id: String,
    pub instance_name: String,
    pub level: String,
    pub message: String,
    pub timestamp: String,
}

lazy_static::lazy_static! {
    static ref RUNNING_INSTANCES: Arc<Mutex<HashMap<String, RunningInstance>>> =
        Arc::new(Mutex::new(HashMap::new()));
    /// Log buffer: launch_id → list of log entries.
    /// Always populated alongside `game-log` events so the console window
    /// can fetch historical logs when it opens after launch.
    static ref LOG_BUFFER: Arc<Mutex<HashMap<String, Vec<GameLogEntry>>>> =
        Arc::new(Mutex::new(HashMap::new()));
}

/// Emit a game-log event to the frontend AND buffer it for late-opening console.
fn emit_buffered_log(app: &AppHandle, entry: GameLogEntry) {
    let _ = app.emit("game-log", &entry);
    let mut buf = LOG_BUFFER.lock().unwrap();
    buf.entry(entry.launch_id.clone()).or_default().push(entry);
}

/// Return all buffered game logs, grouped by launch_id.
/// Called by the console window on mount to receive logs emitted before it opened.
#[tauri::command]
pub async fn get_buffered_logs() -> Result<HashMap<String, Vec<GameLogEntry>>, String> {
    let buf = LOG_BUFFER.lock().unwrap();
    Ok(buf.clone())
}

/// Remove buffered logs for a given launch_id.
/// Called when the user closes a console tab.
#[tauri::command]
pub async fn clear_buffered_logs(launch_id: String) -> Result<(), String> {
    let mut buf = LOG_BUFFER.lock().unwrap();
    buf.remove(&launch_id);
    Ok(())
}

/// Build the version spec for portablemc:
///   vanilla  → "1.21.5"
///   fabric   → "fabric:1.21.5"  or "fabric:0.16.5:1.21.5" if loader_version given
///   quilt    → "quilt:1.21.5"
///   forge    → "forge:1.21.5"
///   neoforge → "neoforge:1.21.5"
fn build_version_spec(mc_version: &str, loader: &str, loader_version: Option<&str>) -> String {
    match loader {
        "vanilla" | "" => mc_version.to_string(),
        "fabric" => {
            if let Some(lv) = loader_version.filter(|v| !v.is_empty() && *v != "latest") {
                format!("fabric:{}:{}", mc_version, lv)
            } else {
                format!("fabric:{}", mc_version)
            }
        }
        "quilt" => {
            if let Some(lv) = loader_version.filter(|v| !v.is_empty() && *v != "latest") {
                format!("quilt:{}:{}", mc_version, lv)
            } else {
                format!("quilt:{}", mc_version)
            }
        }
        "forge" => format!("forge:{}", mc_version),
        "neoforge" => format!("neoforge:{}", mc_version),
        other => {
            eprintln!("[launch] Unknown loader '{}', treating as vanilla", other);
            mc_version.to_string()
        }
    }
}

#[tauri::command]
pub async fn get_running_instances() -> Result<Vec<RunningInstance>, String> {
    let map = RUNNING_INSTANCES.lock().unwrap();
    Ok(map.values().cloned().collect())
}

#[tauri::command]
pub async fn stop_instance(instance_id: String) -> Result<(), String> {
    let mut map = RUNNING_INSTANCES.lock().unwrap();
    map.remove(&instance_id);
    Ok(())
}

/// Returns the number of currently running game instances (across all behaviors).
pub fn running_instance_count() -> usize {
    RUNNING_INSTANCES.lock().unwrap().len()
}

#[tauri::command]
pub async fn launch_instance(
    app: AppHandle,
    instance_id: String,
    instance_name: String,
    custom_path: Option<String>,
    minecraft_version: String,
    loader: Option<String>,
    loader_version: Option<String>,
    memory_mb: u32,
    account: Account,
    java_path: Option<String>,
    // "keep_open" | "hide" | "close"
    launch_behavior: Option<String>,
    // Whether to open the console log window after launch
    open_console: Option<bool>,
) -> Result<(), String> {
    // Update last_played date
    {
        let mut data = crate::instances::load_instances();
        if let Some(inst) = data.instances.iter_mut().find(|i| i.id == instance_id) {
            inst.last_played = Some(chrono::Utc::now().to_rfc3339());
            crate::instances::save_instances(&data);
        }
    }

    // Find Python with portablemc
    let python = find_python_for_portablemc().ok_or_else(|| {
        "PortableMC is not installed. Go to Settings → Install PortableMC first.".to_string()
    })?;

    // Normalise loader name (Rust enum serialises as lowercase)
    let loader_name = loader.as_deref().unwrap_or("vanilla").to_lowercase();
    let loader_name = loader_name.trim();

    let version_spec = build_version_spec(
        &minecraft_version,
        loader_name,
        loader_version.as_deref(),
    );

    let mc_dir = get_minecraft_dir();
    let game_dir = get_instance_dir(&instance_name, custom_path.as_deref());

    // Create instance directory (and mods/ for modded)
    tokio::fs::create_dir_all(&game_dir).await.map_err(|e| e.to_string())?;
    if loader_name != "vanilla" {
        let _ = tokio::fs::create_dir_all(game_dir.join("mods")).await;
    }

    // Build JVM args
    let mut jvm_args = format!(
        "-Xmx{mem}m -Xms{half}m -XX:+UseG1GC -XX:+UnlockExperimentalVMOptions \
         -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=50 \
         -XX:G1HeapRegionSize=32M -Dfml.ignoreInvalidMinecraftCertificates=true",
        mem = memory_mb,
        half = memory_mb / 2,
    );

    if let Some(ref main_service) = account.main_skin_service {
        if !main_service.is_empty() {
            match crate::skins::download_authlib_injector().await {
                Ok(jar_path) => {
                    if let Ok(port) = crate::skins::start_skin_server().await {
                        let jar_path_str = jar_path.to_string_lossy().replace("\\", "/");
                        // Do not quote the argument; PortableMC's parsing leaves literal quotes, causing Java to mistake it for a main class
                        let agent_arg = format!(
                            "-javaagent:{}={}",
                            jar_path_str,
                            format!("http://127.0.0.1:{}/", port)
                        );
                        jvm_args = format!("{} {}", jvm_args, agent_arg);
                        eprintln!("[launch] Configured skin javaagent: {}", agent_arg);
                    }
                }
                Err(e) => {
                    eprintln!("[launch] Failed to download authlib-injector: {}", e);
                }
            }
        }
    }


    // Assemble portablemc arguments
    // Global flags (--main-dir, --work-dir) MUST come before the subcommand `start`.
    // Offline auth uses -u (username) and -i (uuid) — there is no --auth-offline flag.
    let mut args: Vec<String> = vec![
        "-m".into(),
        "portablemc".into(),
        "--main-dir".into(),
        mc_dir.to_string_lossy().into_owned(),
        "--work-dir".into(),
        game_dir.to_string_lossy().into_owned(),
        "start".into(),
        "-u".into(),
        account.username.clone(),
        "-i".into(),
        account.uuid.clone(),
        "--jvm-args".into(),
        jvm_args,
    ];

    // Custom JVM executable
    if let Some(ref java) = java_path {
        if !java.is_empty() {
            args.push("--jvm".into());
            args.push(java.clone());
        }
    }

    let behavior = launch_behavior.unwrap_or_else(|| "hide".to_string());
    let should_open_console = open_console.unwrap_or(false);

    args.push(version_spec.clone());

    eprintln!(
        "[launch] python={} args={:?}",
        python.display(), &args
    );
    eprintln!(
        "[launch] account='{}' uuid='{}' version='{}'",
        account.username, account.uuid, version_spec
    );

    // Notify frontend: open console if requested
    if should_open_console {
        let _ = app.emit("open-console", &instance_id);
    }

    // Apply launch behavior to window
    if let Some(win) = app.get_webview_window("main") {
        match behavior.as_str() {
            "hide" => {
                tray::TRAY_STATE.lock().unwrap().hide_game_count += 1;
                let _ = win.hide();
            }
            "close" => {
                let _ = win.close();
                // Don't wait for child — just spawn and return
                tokio::spawn(async move {
                    let mut cmd = Command::new(&python);
                    cmd.args(&args)
                        .current_dir(&game_dir)
                        .stdout(Stdio::null())
                        .stderr(Stdio::null());
                    #[cfg(target_os = "windows")]
                    cmd.creation_flags(CREATE_NO_WINDOW);
                    let _ = cmd.spawn();
                });
                return Ok(());
            }
            _ => {} // keep_open: do nothing
        }
    }

    // Spawn the process (with pipes for logging)
    let launch_id = uuid::Uuid::new_v4().to_string();
    let launch_id_clone = launch_id.clone();
    let app_clone = app.clone();
    let instance_id_clone = instance_id.clone();
    let instance_name_clone = instance_name.clone();
    let behavior_clone = behavior.clone();

    tokio::spawn(async move {
        let mut cmd = Command::new(&python);
        cmd.args(&args)
            .current_dir(&game_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                emit_buffered_log(&app_clone, GameLogEntry {
                    launch_id: launch_id_clone.clone(),
                    instance_id: instance_id_clone.clone(),
                    instance_name: instance_name_clone.clone(),
                    level: "error".into(),
                    message: format!("Failed to spawn process: {}", e),
                    timestamp: chrono::Utc::now().to_rfc3339(),
                });
                // Restore window on error
                if let Some(win) = app_clone.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
                return;
            }
        };

        let pid = child.id().unwrap_or(0);
        {
            let mut map = RUNNING_INSTANCES.lock().unwrap();
            map.insert(launch_id_clone.clone(), RunningInstance {
                launch_id: launch_id_clone.clone(),
                instance_id: instance_id_clone.clone(),
                instance_name: instance_name_clone.clone(),
                pid,
                started_at: chrono::Utc::now().to_rfc3339(),
            });
        }
        let payload = InstanceStartedPayload {
            launch_id: launch_id_clone.clone(),
            instance_id: instance_id_clone.clone(),
            instance_name: instance_name_clone.clone(),
        };
        let _ = app_clone.emit("instance-started", &payload);

        // Pipe stdout
        if let Some(stdout) = child.stdout.take() {
            let app2 = app_clone.clone();
            let lid2 = launch_id_clone.clone();
            let id2 = instance_id_clone.clone();
            let name2 = instance_name_clone.clone();
            let mut reader = BufReader::new(stdout).lines();
            tokio::spawn(async move {
                while let Ok(Some(line)) = reader.next_line().await {
                    eprintln!("[MC stdout] {}", line);
                    emit_buffered_log(&app2, GameLogEntry {
                        launch_id: lid2.clone(),
                        instance_id: id2.clone(),
                        instance_name: name2.clone(),
                        level: "info".into(),
                        message: line,
                        timestamp: chrono::Utc::now().to_rfc3339(),
                    });
                }
            });
        }

        // Track if a crash-worthy error is detected
        let crashed = Arc::new(Mutex::new(false));
        let crashed_clone = crashed.clone();

        // Pipe stderr
        if let Some(stderr) = child.stderr.take() {
            let app3 = app_clone.clone();
            let lid3 = launch_id_clone.clone();
            let id3 = instance_id_clone.clone();
            let name3 = instance_name_clone.clone();
            let mut reader = BufReader::new(stderr).lines();
            tokio::spawn(async move {
                while let Ok(Some(line)) = reader.next_line().await {
                    eprintln!("[MC stderr] {}", line);
                    let is_error = line.contains("ERROR") || line.contains("Exception")
                        || line.contains("FATAL") || line.contains("Traceback")
                        || line.contains("crash-reports");
                    let level = if is_error {
                        if let Ok(mut c) = crashed_clone.lock() { *c = true; }
                        "error"
                    } else if line.contains("WARN") {
                        "warn"
                    } else {
                        "info"
                    };
                    emit_buffered_log(&app3, GameLogEntry {
                        launch_id: lid3.clone(),
                        instance_id: id3.clone(),
                        instance_name: name3.clone(),
                        level: level.into(),
                        message: line,
                        timestamp: chrono::Utc::now().to_rfc3339(),
                    });
                }
            });
        }

        let status = child.wait().await;
        let exit_code = status.map(|s| s.code().unwrap_or(-1)).unwrap_or(-1);
        let did_crash = *crashed.lock().unwrap() || exit_code != 0;

        {
            let mut map = RUNNING_INSTANCES.lock().unwrap();
            map.remove(&launch_id_clone);
        }

        let payload = InstanceStartedPayload {
            launch_id: launch_id_clone.clone(),
            instance_id: instance_id_clone.clone(),
            instance_name: instance_name_clone.clone(),
        };

        let _ = app_clone.emit("instance-stopped", &payload);

        // On crash, always open console and show window
        if did_crash {
            let _ = app_clone.emit("instance-crashed", &payload);
        }

        // Restore window after game exits (if we hid it)
        if behavior_clone == "hide" {
            let mut state = tray::TRAY_STATE.lock().unwrap();
            state.hide_game_count = state.hide_game_count.saturating_sub(1);
            if state.hide_game_count == 0 {
                if let Some(win) = app_clone.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
        }
    });

    Ok(())
}

