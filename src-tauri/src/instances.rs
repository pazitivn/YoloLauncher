// instances.rs - Minecraft instance management
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::Utc;
use std::fs;
use crate::paths::get_yololauncher_dir;
use serde_json::Value;
use std::path::Path;

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

fn get_state_file() -> std::path::PathBuf {
    get_yololauncher_dir().join("state.json")
}

fn load_state() -> std::collections::HashMap<String, String> {
    let path = get_state_file();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(state) = serde_json::from_str(&content) {
                return state;
            }
        }
    }
    std::collections::HashMap::new()
}

fn save_state(state: &std::collections::HashMap<String, String>) {
    let path = get_state_file();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(content) = serde_json::to_string_pretty(state) {
        let _ = fs::write(path, content);
    }
}

#[tauri::command]
pub async fn set_last_selected_instance(instance_id: String) -> Result<(), String> {
    let mut state = load_state();
    state.insert("last_selected_instance_id".to_string(), instance_id);
    save_state(&state);
    Ok(())
}

#[tauri::command]
pub async fn get_last_selected_instance() -> Result<Option<String>, String> {
    let state = load_state();
    Ok(state.get("last_selected_instance_id").cloned())
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionEntry {
    pub id: String,
    pub minecraft_version: String,
    pub loader: Option<String>,
    pub loader_version: Option<String>,
    pub size_bytes: u64,
}

/// Try to determine if a folder looks like a Minecraft version.
/// A valid version JSON must have a non-empty "id" field AND either a non-empty "type" (vanilla) or "inheritsFrom" (loader).
fn looks_like_version(_folder_name: &str, json_path: &std::path::Path) -> bool {
    if !json_path.exists() {
        return false;
    }
    let content = match std::fs::read_to_string(json_path) {
        Ok(c) => c,
        Err(_) => return false,
    };
    let json: Value = match serde_json::from_str(&content) {
        Ok(j) => j,
        Err(_) => return false,
    };
    // Must have a non-empty "id" field
    let _id = match json.get("id").and_then(|v| v.as_str()) {
        Some(s) if !s.is_empty() => s,
        _ => return false,
    };
    // Must have either a non-empty "type" (vanilla/release/snapshot) or "inheritsFrom" (loader)
    let has_type = json.get("type").and_then(|v| v.as_str()).map_or(false, |s| !s.is_empty());
    let has_inherits = json.get("inheritsFrom").and_then(|v| v.as_str()).map_or(false, |s| !s.is_empty());
    has_type || has_inherits
}

/// Helper: Get the path to the loader's library folder (e.g., Fabric/Quilt)
fn get_loader_library_path(loader_name: &str, loader_version: &str) -> Option<std::path::PathBuf> {
    let libs_dir = crate::paths::get_minecraft_dir().join("libraries");
    match loader_name.to_lowercase().as_str() {
        "fabric" => Some(libs_dir.join("net").join("fabricmc").join("fabric-loader").join(loader_version)),
        "quilt" => Some(libs_dir.join("org").join("quiltmc").join("quilt-loader").join(loader_version)),
        _ => None,
    }
}

/// Scan .minecraft/versions/ and return detailed info about each installed version.
#[tauri::command]
pub async fn get_versions_detail() -> Result<Vec<VersionEntry>, String> {
    let versions_dir = crate::paths::get_minecraft_dir().join("versions");
    let mut entries = Vec::new();

    if !versions_dir.exists() {
        return Ok(entries);
    }

    let dir_entries = std::fs::read_dir(&versions_dir)
        .map_err(|e| format!("Failed to read versions directory: {}", e))?;

    for entry in dir_entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let folder_name = match entry.file_name().to_str() {
            Some(name) => name.to_string(),
            None => continue,
        };

        let json_path = path.join(format!("{}.json", folder_name));

        // Skip non-Minecraft folders (no valid version JSON)
        if !looks_like_version(&folder_name, &json_path) {
            continue;
        }

        let mut size_bytes = dir_size(&path);
        let (minecraft_version, loader, loader_version) = parse_version_folder(&folder_name, &json_path);

        // --- NEW: Add the size of the loader's library folder (if it exists) ---
        if let (Some(l_name), Some(l_ver)) = (&loader, &loader_version) {
            if let Some(lib_path) = get_loader_library_path(l_name, l_ver) {
                if lib_path.exists() {
                    size_bytes += dir_size(&lib_path);
                }
            }
        }
        // ------------------------------------------------------------------------

        // Skip entries with empty id or minecraft_version (defensive)
        if folder_name.is_empty() || minecraft_version.is_empty() {
            continue;
        }

        entries.push(VersionEntry {
            id: folder_name,
            minecraft_version,
            loader,
            loader_version,
            size_bytes,
        });
    }

    // Sort: newest MC versions first using a natural version-aware sort
    entries.sort_by(|a, b| {
        let a_parts: Vec<u64> = a.minecraft_version.split('.').filter_map(|s| s.parse().ok()).collect();
        let b_parts: Vec<u64> = b.minecraft_version.split('.').filter_map(|s| s.parse().ok()).collect();
        // Compare component by component (major.minor.patch)
        for i in 0..3.max(a_parts.len()).max(b_parts.len()) {
            let a_val = a_parts.get(i).copied().unwrap_or(0);
            let b_val = b_parts.get(i).copied().unwrap_or(0);
            if a_val != b_val {
                return b_val.cmp(&a_val); // descending
            }
        }
        std::cmp::Ordering::Equal
    });

    Ok(entries)
}

/// Recursively calculate directory size in bytes.
fn dir_size(path: &std::path::Path) -> u64 {
    let mut total = 0u64;
    if let Ok(dir) = std::fs::read_dir(path) {
        for entry in dir.flatten() {
            let p = entry.path();
            if p.is_file() {
                total += std::fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
            } else if p.is_dir() {
                total += dir_size(&p);
            }
        }
    }
    total
}

/// Helper function to copy directories recursively
fn copy_dir_all(src: impl AsRef<Path>, dst: impl AsRef<Path>) -> std::io::Result<()> {
    fs::create_dir_all(&dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(entry.path(), dst.as_ref().join(entry.file_name()))?;
        } else {
            fs::copy(entry.path(), dst.as_ref().join(entry.file_name()))?;
        }
    }
    Ok(())
}

/// Parse version folder name and its JSON to extract MC version, loader type and version.
fn parse_version_folder(
    folder_name: &str,
    json_path: &std::path::Path,
) -> (String, Option<String>, Option<String>) {
    let name_lower = folder_name.to_lowercase();

    // Detect loader from folder name prefix
    // More specific prefixes must come first (e.g. "fabric-loader" before "fabric")
    let loader_patterns: [(&str, &str); 6] = [
        ("fabric-loader", "Fabric"),
        ("fabric", "Fabric"),
        ("quilt-loader", "Quilt"),
        ("quilt", "Quilt"),
        ("forge", "Forge"),
        ("neoforge", "NeoForge"),
    ];

    let detected = loader_patterns
        .iter()
        .find(|(prefix, _)| name_lower.starts_with(prefix));

    // Try reading version JSON first (most reliable)
    if let Ok(content) = std::fs::read_to_string(json_path) {
        if let Ok(json) = serde_json::from_str::<Value>(&content) {
            // If inheritsFrom exists and is non-empty, this is a loader-modified version
            if let Some(inherits_from) = json.get("inheritsFrom").and_then(|v| v.as_str()) {
                if !inherits_from.is_empty() {
                    let mc_ver = inherits_from.to_string();
                    let loader_ver = extract_loader_version(folder_name, detected.map(|d| d.0), &mc_ver);
                    return (mc_ver, detected.map(|d| d.1.to_string()), loader_ver);
                }
            }

            // Plain vanilla version (use id if non-empty, fallback to folder_name)
            let id = json
                .get("id")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .unwrap_or(folder_name);
            return (id.to_string(), None, None);
        }
    }

    // Fallback: parse folder name heuristically
    if let Some((prefix, display)) = detected {
        let rest = folder_name[prefix.len()..].trim_start_matches('-');
        let parts: Vec<&str> = rest.split('-').collect();

        if (*prefix == "fabric-loader" || *prefix == "quilt-loader") && parts.len() >= 2 {
            // fabric-loader-X.Y.Z-A.B.C  or  quilt-loader-X.Y.Z-A.B.C
            let lv = parts[0].to_string();
            let mc = parts[1..].join("-");
            return (mc, Some(display.to_string()), Some(lv));
        } else if parts.len() >= 2 {
            // fabric-A.B.C-X.Y.Z  or  fabric-A.B.C
            let mc = parts[0].to_string();
            let lv = parts[parts.len() - 1].to_string();
            return (mc, Some(display.to_string()), Some(lv));
        } else if parts.len() == 1 {
            let mc = parts[0].to_string();
            return (mc, Some(display.to_string()), None);
        }
    }

    (folder_name.to_string(), None, None)
}

/// Try to extract loader version from a loader folder name, given the known MC version.
fn extract_loader_version(name: &str, prefix: Option<&str>, mc_ver: &str) -> Option<String> {
    let prefix = prefix?;
    let rest = name[prefix.len()..].trim_start_matches('-');
    if rest.is_empty() {
        return None;
    }

    // Try to strip the MC version from the end of the rest (e.g. "0.16.5-1.21.4" -> strip "-1.21.4" -> "0.16.5")
    if let Some(idx) = rest.rfind(mc_ver) {
        let before = rest[..idx].trim_end_matches('-');
        if !before.is_empty() {
            return Some(before.to_string());
        }
    }

    // For fabric-loader, first part is loader version
    if prefix == "fabric-loader" {
        return rest.split('-').next().map(String::from);
    }

    // For other loaders, last part is loader version
    let parts: Vec<&str> = rest.split('-').collect();
    if parts.len() >= 2 {
        Some(parts[parts.len() - 1].to_string())
    } else {
        None
    }
}

/// Delete a version folder from .minecraft/versions/.
#[tauri::command]
pub async fn delete_version_folder(version_id: String) -> Result<(), String> {
    let versions_dir = crate::paths::get_minecraft_dir().join("versions");
    let target = versions_dir.join(&version_id);

    if !target.exists() {
        return Err(format!("Version '{}' not found", version_id));
    }
    if !target.is_dir() {
        return Err(format!("'{}' is not a directory", version_id));
    }

    // --- NEW: Получаем данные о версии перед её удалением ---
    let json_path = target.join(format!("{}.json", version_id));
    let (_, loader_opt, loader_ver_opt) = parse_version_folder(&version_id, &json_path);
    // --------------------------------------------------------

    // Удаляем саму папку из versions
    std::fs::remove_dir_all(&target)
        .map_err(|e| format!("Failed to delete '{}': {}", version_id, e))?;

    // --- NEW: Проверяем, нужно ли очистить библиотеку загрузчика ---
    if let (Some(loader), Some(loader_ver)) = (loader_opt, loader_ver_opt) {
        let mut is_still_used = false;

        // Сканируем оставшиеся папки в versions
        if let Ok(entries) = std::fs::read_dir(&versions_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_dir() { continue; }

                let name = entry.file_name().to_string_lossy().into_owned();
                let j_path = path.join(format!("{}.json", name));
                
                let (_, other_loader, other_loader_ver) = parse_version_folder(&name, &j_path);
                
                // Если мы нашли другую версию, которая использует этот же загрузчик
                if other_loader == Some(loader.clone()) && other_loader_ver == Some(loader_ver.clone()) {
                    is_still_used = true;
                    break;
                }
            }
        }

        // Если загрузчик больше никем не используется, удаляем его из libraries
        if !is_still_used {
            if let Some(lib_path) = get_loader_library_path(&loader, &loader_ver) {
                if lib_path.exists() {
                    let _ = std::fs::remove_dir_all(lib_path);
                }
            }
        }
    }
    // ---------------------------------------------------------------

    Ok(())
}

// ==========================================
// Логика миграции сборок из папки versions
// ==========================================

#[derive(Serialize, Deserialize)]
pub struct ScanResult {
    pub modpacks: Vec<String>,
    pub empty_folders: Vec<String>,
    pub duplicate_loaders: Vec<String>, // Дубликаты загрузчиков TLauncher
}

#[derive(Serialize)]
pub struct MigrateResult {
    pub status: String,
    pub error: Option<String>,
}

fn path_has_jar(base: &Path, folder: &str) -> bool {
    base.join(folder).join(format!("{}.jar", folder)).exists()
}

#[tauri::command]
pub async fn scan_malformed_versions() -> Result<ScanResult, String> {
    let versions_dir = crate::paths::get_minecraft_dir().join("versions");
    let mut modpacks = Vec::new();
    let mut empty_folders = Vec::new();
    let mut duplicate_loaders = Vec::new();
    
    // Временный список для поиска дубликатов загрузчиков
    // Структура: (название_папки, minecraft_version, loader_name, loader_version)
    let mut valid_loaders: Vec<(String, String, String, String)> = Vec::new();

    if !versions_dir.exists() {
        return Ok(ScanResult { modpacks, empty_folders, duplicate_loaders });
    }

    let entries = match fs::read_dir(&versions_dir) {
        Ok(e) => e,
        Err(_) => return Ok(ScanResult { modpacks, empty_folders, duplicate_loaders })
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() { continue; }
        
        let name = entry.file_name().to_string_lossy().into_owned();
        let json_path = path.join(format!("{}.json", name));

        // Сначала проверяем, есть ли признаки отдельной сборки (изолированной папки).
        let is_modpack = path.join("mods").exists() 
            || path.join("saves").exists() 
            || path.join("options.txt").exists();

        if is_modpack {
            modpacks.push(name);
        } else if !looks_like_version(&name, &json_path) {
            // Если это не сборка и не похоже на обычную версию, проверяем, не пустая ли папка
            if let Ok(mut sub_entries) = fs::read_dir(&path) {
                if sub_entries.next().is_none() {
                    empty_folders.push(name);
                }
            }
        } else {
            // Это валидная версия. Парсим её, чтобы позже найти дубликаты TL.
            let (mc_ver, loader_opt, loader_ver_opt) = parse_version_folder(&name, &json_path);
            if let (Some(loader), Some(loader_ver)) = (loader_opt, loader_ver_opt) {
                valid_loaders.push((name.clone(), mc_ver, loader, loader_ver));
            }
        }
    }
    
    // Ищем дубликаты загрузчиков
    for i in 0..valid_loaders.len() {
        for j in (i + 1)..valid_loaders.len() {
            let a = &valid_loaders[i];
            let b = &valid_loaders[j];
            
            // Если версия майнкрафта, тип лоадера и версия лоадера совпадают - это дубликат
            if a.1 == b.1 && a.2 == b.2 && a.3 == b.3 {
                let a_has_jar = path_has_jar(&versions_dir, &a.0);
                let b_has_jar = path_has_jar(&versions_dir, &b.0);
                
                // TL всегда кладет .jar в папку, официальный Fabric/Quilt/NeoForge - нет.
                let to_delete = if a_has_jar && !b_has_jar {
                    a.0.clone()
                } else if b_has_jar && !a_has_jar {
                    b.0.clone()
                } else {
                    // Если по наличию .jar определить не удалось, удаляем ту, чье название короче
                    // (Обычно это именно TL, т.к. "fabric-1.21.1" короче чем "fabric-loader-...")
                    if a.0.len() < b.0.len() { a.0.clone() } else { b.0.clone() }
                };
                
                if !duplicate_loaders.contains(&to_delete) {
                    duplicate_loaders.push(to_delete);
                }
            }
        }
    }
    
    Ok(ScanResult { modpacks, empty_folders, duplicate_loaders })
}

#[tauri::command]
pub async fn migrate_modpack(name: String) -> Result<MigrateResult, String> {
    let versions_dir = crate::paths::get_minecraft_dir().join("versions");
    let instances_dir = crate::paths::get_minecraft_dir().join("instances");
    let src = versions_dir.join(&name);
    let dst = instances_dir.join(&name);

    if !src.exists() { 
        return Err("Source not found".into()); 
    }

    // Attempt to copy recursively
    if let Err(e) = copy_dir_all(&src, &dst) {
        return Ok(MigrateResult { 
            status: "CopyFailed".into(), 
            error: Some(e.to_string()) 
        });
    }

    // Verify copy by size
    let src_size = dir_size(&src);
    let dst_size = dir_size(&dst);
    if src_size != dst_size {
        return Ok(MigrateResult { 
            status: "CopyFailed".into(), 
            error: Some("Размер папок не совпадает после копирования".into()) 
        });
    }

    // Try deleting the original directory (might fail if a file is locked by the game)
    if let Err(e) = fs::remove_dir_all(&src) {
        return Ok(MigrateResult { 
            status: "CopiedButNotDeleted".into(), 
            error: Some(e.to_string()) 
        });
    }

    Ok(MigrateResult { status: "Success".into(), error: None })
}

#[tauri::command]
pub async fn delete_empty_folder(name: String) -> Result<MigrateResult, String> {
    let versions_dir = crate::paths::get_minecraft_dir().join("versions");
    let src = versions_dir.join(&name);
    
    if !src.exists() { 
        return Ok(MigrateResult { status: "Success".into(), error: None }); 
    }
    
    if let Err(e) = fs::remove_dir_all(&src) {
        return Ok(MigrateResult { 
            status: "DeleteFailed".into(), 
            error: Some(e.to_string()) 
        });
    }
    
    Ok(MigrateResult { status: "Success".into(), error: None })
}

#[tauri::command]
pub async fn fix_instance_paths() -> Result<(), String> {
    let mut data = load_instances();
    let versions_dir = crate::paths::get_minecraft_dir().join("versions");
    let instances_dir = crate::paths::get_minecraft_dir().join("instances");

    let mut changed = false;
    for inst in data.instances.iter_mut() {
        if let Some(cp) = &inst.custom_path {
            let cp_path = std::path::PathBuf::from(cp);
            if cp_path.starts_with(&versions_dir) {
                if let Ok(rel) = cp_path.strip_prefix(&versions_dir) {
                    let new_path = instances_dir.join(rel);
                    inst.custom_path = Some(new_path.to_string_lossy().into_owned());
                    changed = true;
                }
            }
        }
    }
    
    if changed {
        save_instances(&data);
    }
    
    Ok(())
}