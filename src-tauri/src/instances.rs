// instances.rs - Minecraft instance management
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::Utc;
use std::fs;
use crate::paths::get_yololauncher_dir;
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Instance {
    pub id: String,
    pub name: String,
    pub minecraft_version: String,
    pub loader: ModLoader,
    pub loader_version: Option<String>,
    pub icon: Option<String>, // emoji or custom icon path
    pub created_at: String,
    pub last_played: Option<String>,
    pub play_time_seconds: u64,
    pub custom_path: Option<String>, // User configured custom instance directory
    pub java_path: Option<String>,
    pub jvm_args: Option<String>,
    pub memory_mb: u32,
    /// What to do with the launcher after starting the game.
    /// Values: "keep_open" | "hide" (hide to tray, reopen after game) | "close"
    #[serde(default = "default_launch_behavior")]
    pub launch_behavior: String,
    /// Whether to open console log window when launching
    #[serde(default)]
    pub open_console: bool,
    /// User-written description / notes for this instance
    #[serde(default)]
    pub description: Option<String>,
}

fn default_launch_behavior() -> String {
    "hide".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ModLoader {
    Vanilla,
    Fabric,
    Forge,
    Quilt,
    NeoForge,
}

impl std::fmt::Display for ModLoader {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ModLoader::Vanilla => write!(f, "Vanilla"),
            ModLoader::Fabric => write!(f, "Fabric"),
            ModLoader::Forge => write!(f, "Forge"),
            ModLoader::Quilt => write!(f, "Quilt"),
            ModLoader::NeoForge => write!(f, "NeoForge"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MinecraftVersion {
    pub id: String,
    #[serde(rename = "type")]
    pub version_type: String, // "release", "snapshot", "old_beta", "old_alpha"
    pub url: String,
    #[serde(rename = "releaseTime")]
    pub release_time: String,
}

#[derive(Debug, Deserialize)]
struct VersionManifest {
    versions: Vec<MinecraftVersion>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct InstanceStore {
    pub instances: Vec<Instance>,
}

const MOJANG_MANIFEST_URL: &str =
    "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

fn get_instances_file() -> std::path::PathBuf {
    get_yololauncher_dir().join("instances.json")
}

pub fn load_instances() -> InstanceStore {
    let path = get_instances_file();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(store) = serde_json::from_str(&content) {
                return store;
            }
        }
    }
    InstanceStore::default()
}

pub fn save_instances(data: &InstanceStore) {
    let path = get_instances_file();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(content) = serde_json::to_string_pretty(data) {
        let _ = fs::write(path, content);
    }
}

#[tauri::command]
pub async fn get_instances() -> Result<Vec<Instance>, String> {
    Ok(load_instances().instances)
}

#[tauri::command]
pub async fn create_instance(
    name: String,
    minecraft_version: String,
    loader: ModLoader,
    loader_version: Option<String>,
    memory_mb: u32,
    icon: Option<String>,
    custom_path: Option<String>,
    jvm_args: Option<String>,
    launch_behavior: Option<String>,
    open_console: Option<bool>,
    description: Option<String>,
) -> Result<Instance, String> {
    if name.trim().is_empty() {
        return Err("Instance name cannot be empty".to_string());
    }

    let mut data = load_instances();

    if data.instances.iter().any(|i| i.name.to_lowercase() == name.to_lowercase()) {
        return Err(format!("Instance '{}' already exists", name));
    }

    let memory = if memory_mb < 512 {
        512
    } else if memory_mb > 16384 {
        16384
    } else {
        memory_mb
    };

    let instance = Instance {
        id: Uuid::new_v4().to_string(),
        name,
        minecraft_version,
        loader,
        loader_version,
        icon: icon.or(Some("Zap".to_string())),
        created_at: Utc::now().to_rfc3339(),
        last_played: None,
        play_time_seconds: 0,
        custom_path,
        java_path: None,
        jvm_args,
        memory_mb: memory,
        launch_behavior: launch_behavior.unwrap_or_else(default_launch_behavior),
        open_console: open_console.unwrap_or(false),
        description: description.filter(|s| !s.is_empty()),
    };

    data.instances.push(instance.clone());
    save_instances(&data);

    Ok(instance)
}

#[tauri::command]
pub async fn delete_instance(instance_id: String) -> Result<(), String> {
    let mut data = load_instances();
    let original_len = data.instances.len();
    data.instances.retain(|i| i.id != instance_id);

    if data.instances.len() == original_len {
        return Err("Instance not found".to_string());
    }

    save_instances(&data);
    Ok(())
}

#[tauri::command]
pub async fn edit_instance(
    instance_id: String,
    name: String,
    minecraft_version: String,
    loader: ModLoader,
    loader_version: Option<String>,
    memory_mb: u32,
    icon: Option<String>,
    custom_path: Option<String>,
    jvm_args: Option<String>,
    launch_behavior: Option<String>,
    open_console: Option<bool>,
    description: Option<String>,
) -> Result<Instance, String> {
    if name.trim().is_empty() {
        return Err("Instance name cannot be empty".to_string());
    }

    let mut data = load_instances();

    // Check name collision with OTHER instances
    if data.instances.iter().any(|i| i.id != instance_id && i.name.to_lowercase() == name.to_lowercase()) {
        return Err(format!("Instance '{}' already exists", name));
    }

    if let Some(instance) = data.instances.iter_mut().find(|i| i.id == instance_id) {
        instance.name = name;
        instance.minecraft_version = minecraft_version;
        instance.loader = loader;
        instance.loader_version = loader_version;
        instance.memory_mb = if memory_mb < 512 { 512 } else if memory_mb > 16384 { 16384 } else { memory_mb };
        if icon.is_some() {
            instance.icon = icon;
        }
        instance.custom_path = custom_path;
        instance.jvm_args = jvm_args;
        if let Some(lb) = launch_behavior {
            instance.launch_behavior = lb;
        }
        if let Some(oc) = open_console {
            instance.open_console = oc;
        }
        instance.description = description;

        let updated = instance.clone();
        save_instances(&data);
        Ok(updated)
    } else {
        Err("Instance not found".to_string())
    }
}

#[tauri::command]
pub fn get_default_instances_dir() -> Result<String, String> {
    let dir = crate::paths::get_instance_dir("", None);
    // remove the trailing instances\ part to just give the instances folder
    let parent = dir.parent().unwrap_or(&dir);
    Ok(parent.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn get_minecraft_versions(
    include_snapshots: bool,
) -> Result<Vec<MinecraftVersion>, String> {
    let client = reqwest::Client::new();
    let manifest: VersionManifest = client
        .get(MOJANG_MANIFEST_URL)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch version manifest: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse version manifest: {}", e))?;

    let versions: Vec<MinecraftVersion> = manifest
        .versions
        .into_iter()
        .filter(|v| {
            if include_snapshots {
                v.version_type == "release" || v.version_type == "snapshot"
            } else {
                v.version_type == "release"
            }
        })
        .take(50)
        .collect();

    Ok(versions)
}

#[tauri::command]
pub async fn get_loader_versions(
    loader: ModLoader,
    game_version: String,
) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let mut versions = Vec::new();

    match loader {
        ModLoader::Vanilla => {}
        ModLoader::Fabric => {
            let url = format!("https://meta.fabricmc.net/v2/versions/loader/{}", game_version);
            if let Ok(res) = client.get(&url).send().await {
                if let Ok(json) = res.json::<Vec<Value>>().await {
                    for item in json {
                        if let Some(loader_obj) = item.get("loader") {
                            if let Some(version) = loader_obj.get("version").and_then(|v| v.as_str()) {
                                versions.push(version.to_string());
                            }
                        }
                    }
                }
            }
        }
        ModLoader::Quilt => {
            let url = format!("https://meta.quiltmc.org/v3/versions/loader/{}", game_version);
            if let Ok(res) = client.get(&url).send().await {
                if let Ok(json) = res.json::<Vec<Value>>().await {
                    for item in json {
                        if let Some(loader_obj) = item.get("loader") {
                            if let Some(version) = loader_obj.get("version").and_then(|v| v.as_str()) {
                                versions.push(version.to_string());
                            }
                        }
                    }
                }
            }
        }
        ModLoader::Forge => {
            let url = format!("https://bmclapi2.bangbang93.com/forge/minecraft/{}", game_version);
            if let Ok(res) = client.get(&url).send().await {
                if let Ok(json) = res.json::<Vec<Value>>().await {
                    for item in json {
                        if let Some(version) = item.get("version").and_then(|v| v.as_str()) {
                            versions.push(version.to_string());
                        }
                    }
                }
            }
        }
        ModLoader::NeoForge => {
            // NeoForge Maven API — filter versions matching the game version prefix
            // e.g. game_version="1.21.1" -> neoforge versions start with "21.1."
            let url = "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml";
            if let Ok(res) = client.get(url).send().await {
                if let Ok(xml) = res.text().await {
                    // Parse <version> tags from XML
                    let mut found: Vec<String> = xml
                        .split("<version>")
                        .skip(1)
                        .filter_map(|s| s.split("</version>").next())
                        .map(|s| s.trim().to_string())
                        .collect();
                    // Filter: NeoForge version for MC 1.21.1 starts with "21.1."
                    // Strip leading "1." from game_version to get neoforge prefix
                    let prefix = game_version.trim_start_matches("1.");
                    found.retain(|v| v.starts_with(prefix));
                    found.reverse(); // newest first
                    versions = found.into_iter().take(30).collect();
                }
            }
        }
    }

    Ok(versions)
}

/// Returns the path to the latest screenshot in an instance's screenshots folder.
/// Checks subfolders newest-first. Returns base64-encoded image or null.
#[tauri::command]
pub async fn get_instance_screenshot(
    instance_name: String,
    custom_path: Option<String>,
) -> Result<Option<String>, String> {
    let instance_dir = crate::paths::get_instance_dir(&instance_name, custom_path.as_deref());
    let screenshots_dir = instance_dir.join("screenshots");

    if !screenshots_dir.exists() {
        return Ok(None);
    }

    // Collect all png/jpg files with their modification times
    let mut files: Vec<(std::time::SystemTime, std::path::PathBuf)> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&screenshots_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(ext) = path.extension() {
                let ext = ext.to_string_lossy().to_lowercase();
                if ext == "png" || ext == "jpg" || ext == "jpeg" {
                    if let Ok(meta) = std::fs::metadata(&path) {
                        if let Ok(modified) = meta.modified() {
                            files.push((modified, path));
                        }
                    }
                }
            }
        }
    }

    if files.is_empty() {
        return Ok(None);
    }

    // Sort newest first
    files.sort_by(|a, b| b.0.cmp(&a.0));
    let latest_path = &files[0].1;

    // Read and base64-encode
    match std::fs::read(latest_path) {
        Ok(bytes) => {
            use base64::Engine;
            let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            let ext = latest_path.extension().and_then(|e| e.to_str()).unwrap_or("png");
            Ok(Some(format!("data:image/{};base64,{}", ext, b64)))
        }
        Err(e) => Err(format!("Failed to read screenshot: {}", e)),
    }
}

#[tauri::command]
pub async fn get_downloaded_versions() -> Result<Vec<String>, String> {
    let versions_dir = crate::paths::get_minecraft_dir().join("versions");
    let mut versions = Vec::new();

    if let Ok(entries) = std::fs::read_dir(versions_dir) {
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                if let Some(name) = entry.file_name().to_str() {
                    let json_path = entry.path().join(format!("{}.json", name));
                    if json_path.exists() {
                        versions.push(name.to_string());
                    }
                }
            }
        }
    }

    Ok(versions)
}
