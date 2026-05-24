// content.rs — Commands for listing & managing per-instance content:
// mods, resource packs, shader packs, worlds, screenshots.

use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use base64::{Engine, engine::general_purpose::STANDARD};
use zip::ZipArchive;

use crate::paths::get_instance_dir;

// ─── Shared helpers ──────────────────────────────────────────────────────────

fn instance_dir(instance_name: &str, custom_path: Option<&str>) -> PathBuf {
    get_instance_dir(instance_name, custom_path)
}

fn dir_size(path: &Path) -> u64 {
    let mut total = 0u64;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() { total += dir_size(&p); }
            else if let Ok(m) = fs::metadata(&p) { total += m.len(); }
        }
    }
    total
}

fn fmt_bytes(b: u64) -> String {
    if b < 1024 { format!("{} B", b) }
    else if b < 1024 * 1024 { format!("{:.1} KB", b as f64 / 1024.0) }
    else if b < 1024 * 1024 * 1024 { format!("{:.1} MB", b as f64 / 1024.0 / 1024.0) }
    else { format!("{:.2} GB", b as f64 / 1024.0 / 1024.0 / 1024.0) }
}

fn timestamp_to_iso(ts: std::time::SystemTime) -> String {
    let dur = ts.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
    let secs = dur.as_secs();
    // Simple ISO-like format
    let dt = chrono::DateTime::from_timestamp(secs as i64, 0)
        .unwrap_or_else(chrono::Utc::now);
    dt.format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

/// Extract a file from a zip/jar as base64 PNG.
fn zip_extract_b64(zip_path: &Path, inner_path: &str) -> Option<String> {
    let f = File::open(zip_path).ok()?;
    let mut archive = ZipArchive::new(f).ok()?;
    let mut entry = archive.by_name(inner_path).ok()?;
    let mut buf = Vec::new();
    entry.read_to_end(&mut buf).ok()?;
    Some(format!("data:image/png;base64,{}", STANDARD.encode(&buf)))
}

/// Read a raw file from disk as base64 PNG.
fn file_to_b64_png(path: &Path) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    // Detect if it's a JPEG (screenshots can be either)
    let mime = if bytes.starts_with(&[0xFF, 0xD8]) { "image/jpeg" } else { "image/png" };
    Some(format!("data:{};base64,{}", mime, STANDARD.encode(&bytes)))
}

// ─── MOD metadata extraction ─────────────────────────────────────────────────

struct ModMeta {
    name: Option<String>,
    version: Option<String>,
    description: Option<String>,
    icon_path: Option<String>, // inner path inside jar
}

fn parse_mod_meta(jar_path: &Path) -> ModMeta {
    let f = match File::open(jar_path) {
        Ok(f) => f,
        Err(_) => return ModMeta { name: None, version: None, description: None, icon_path: None },
    };
    let mut archive = match ZipArchive::new(f) {
        Ok(a) => a,
        Err(_) => return ModMeta { name: None, version: None, description: None, icon_path: None },
    };

    // ── Try fabric.mod.json ──────────────────────────────────────────────────
    if let Ok(mut entry) = archive.by_name("fabric.mod.json") {
        let mut s = String::new();
        if entry.read_to_string(&mut s).is_ok() {
            if let Ok(j) = serde_json::from_str::<serde_json::Value>(&s) {
                return ModMeta {
                    name:        j.get("name").and_then(|v| v.as_str()).map(String::from),
                    version:     j.get("version").and_then(|v| v.as_str()).map(String::from),
                    description: j.get("description").and_then(|v| v.as_str()).map(String::from),
                    icon_path:   j.get("icon").and_then(|v| v.as_str()).map(String::from),
                };
            }
        }
    }

    // ── Try quilt.mod.json ───────────────────────────────────────────────────
    if let Ok(mut entry) = archive.by_name("quilt.mod.json") {
        let mut s = String::new();
        if entry.read_to_string(&mut s).is_ok() {
            if let Ok(j) = serde_json::from_str::<serde_json::Value>(&s) {
                let meta = j.get("quilt_loader").unwrap_or(&j);
                return ModMeta {
                    name:        meta.get("name").and_then(|v| v.as_str()).map(String::from),
                    version:     meta.get("version").and_then(|v| v.as_str()).map(String::from),
                    description: meta.get("description").and_then(|v| v.as_str()).map(String::from),
                    icon_path:   j.get("icon").and_then(|v| v.as_str())
                        .or_else(|| meta.get("icon").and_then(|v| v.as_str()))
                        .map(String::from),
                };
            }
        }
    }

    // ── Try neoforge mods.toml / forge mods.toml (simple string extraction) ─
    for toml_file in &["META-INF/mods.toml", "META-INF/neoforge.mods.toml"] {
        if let Ok(mut entry) = archive.by_name(toml_file) {
            let mut s = String::new();
            if entry.read_to_string(&mut s).is_ok() {
                let name    = extract_toml_field(&s, "displayName");
                let version = extract_toml_field(&s, "version");
                let desc    = extract_toml_field(&s, "description");
                let logo    = extract_toml_field(&s, "logoFile");
                if name.is_some() || version.is_some() {
                    return ModMeta { name, version, description: desc, icon_path: logo };
                }
            }
        }
    }

    // ── Try mcmod.info (old Forge) ───────────────────────────────────────────
    if let Ok(mut entry) = archive.by_name("mcmod.info") {
        let mut s = String::new();
        if entry.read_to_string(&mut s).is_ok() {
            // mcmod.info is a JSON array
            if let Ok(serde_json::Value::Array(arr)) = serde_json::from_str::<serde_json::Value>(&s) {
                if let Some(j) = arr.first() {
                    return ModMeta {
                        name:        j.get("name").and_then(|v| v.as_str()).map(String::from),
                        version:     j.get("version").and_then(|v| v.as_str()).map(String::from),
                        description: j.get("description").and_then(|v| v.as_str()).map(String::from),
                        icon_path:   j.get("logoFile").and_then(|v| v.as_str()).map(String::from),
                    };
                }
            }
        }
    }

    // ── Fallback: try pack.png ───────────────────────────────────────────────
    let file_names: Vec<String> = (0..archive.len())
        .filter_map(|i| archive.by_index(i).ok().map(|f| f.name().to_string()))
        .collect();

    let icon_path = if file_names.iter().any(|n| n == "pack.png") {
        Some("pack.png".to_string())
    } else {
        None
    };

    ModMeta { name: None, version: None, description: None, icon_path }
}

/// Extract a TOML value for a simple `key = "value"` pattern.
fn extract_toml_field(toml: &str, key: &str) -> Option<String> {
    for line in toml.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with(key) {
            if let Some(eq_pos) = trimmed.find('=') {
                let raw = trimmed[eq_pos + 1..].trim();
                let val = raw.trim_matches('"').trim_matches('\'').to_string();
                if !val.is_empty() && val != "${file.jarVersion}" {
                    return Some(val);
                }
            }
        }
    }
    None
}

fn get_mod_icon_inner(jar_path: &Path, icon_inner: &str) -> Option<String> {
    zip_extract_b64(jar_path, icon_inner)
}

// ─── MOD STRUCTS & COMMANDS ───────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct ModInfo {
    pub name: String,
    pub file_name: String,
    pub path: String,
    pub size: u64,
    pub size_fmt: String,
    pub enabled: bool,
    pub icon: Option<String>,
    pub version: Option<String>,
    pub description: Option<String>,
    pub modified_at: Option<String>,
}

#[tauri::command]
pub async fn list_mods(
    instance_name: String,
    custom_path: Option<String>,
) -> Result<Vec<ModInfo>, String> {
    let mods_dir = instance_dir(&instance_name, custom_path.as_deref()).join("mods");
    if !mods_dir.exists() { return Ok(vec![]); }

    let mut mods = Vec::new();
    for entry in fs::read_dir(&mods_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();

        let (enabled, is_mod) = if file_name.ends_with(".jar") {
            (true, true)
        } else if file_name.ends_with(".jar.disabled") {
            (false, true)
        } else {
            (false, false)
        };
        if !is_mod { continue; }

        let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);

        // For disabled mods, find the actual .jar to read metadata
        let jar_path_for_meta = if enabled {
            path.clone()
        } else {
            // The actual jar content is still valid, just renamed
            path.clone()
        };

        let meta = parse_mod_meta(&jar_path_for_meta);

        // Extract icon from jar
        let icon = meta.icon_path.as_deref()
            .and_then(|ip| get_mod_icon_inner(&jar_path_for_meta, ip));

        // Display name: metadata name > filename stem
        let display_name = meta.name.unwrap_or_else(|| {
            file_name.trim_end_matches(".disabled")
                .trim_end_matches(".jar")
                .to_string()
        });

        mods.push(ModInfo {
            name: display_name,
            file_name,
            path: path.to_string_lossy().to_string(),
            size,
            size_fmt: fmt_bytes(size),
            enabled,
            icon,
            version: meta.version,
            description: meta.description,
            modified_at: fs::metadata(&path).ok().and_then(|m| m.modified().ok()).map(timestamp_to_iso),
        });
    }

    mods.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(mods)
}

#[tauri::command]
pub async fn toggle_mod(mod_path: String) -> Result<bool, String> {
    let path = PathBuf::from(&mod_path);
    let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();

    if file_name.ends_with(".jar.disabled") {
        // Enable: rename to .jar
        let new_name = file_name.trim_end_matches(".disabled");
        let new_path = path.parent().unwrap().join(new_name);
        fs::rename(&path, &new_path).map_err(|e| e.to_string())?;
        Ok(true)
    } else if file_name.ends_with(".jar") {
        // Disable: rename to .jar.disabled
        let new_path = PathBuf::from(format!("{}.disabled", mod_path));
        fs::rename(&path, &new_path).map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        Err("Not a .jar or .jar.disabled file".to_string())
    }
}

#[tauri::command]
pub async fn delete_content_file(file_path: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    if path.is_dir() {
        fs::remove_dir_all(&path).map_err(|e| e.to_string())
    } else {
        fs::remove_file(&path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn copy_files_to_folder(
    source_paths: Vec<String>,
    instance_name: String,
    custom_path: Option<String>,
    sub_folder: String, // "mods", "resourcepacks", "shaderpacks"
) -> Result<(), String> {
    let dest_dir = instance_dir(&instance_name, custom_path.as_deref()).join(&sub_folder);
    fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;

    for src in source_paths {
        let src_path = PathBuf::from(&src);
        if let Some(file_name) = src_path.file_name() {
            let dest = dest_dir.join(file_name);
            let mut attempts = 0;
            loop {
                match fs::copy(&src_path, &dest) {
                    Ok(_) => break,
                    Err(e) => {
                        attempts += 1;
                        if attempts >= 5 {
                            return Err(format!("Файл занят или недоступен (возможно, игра уже запущена?): {}", e));
                        }
                        std::thread::sleep(std::time::Duration::from_millis(250));
                    }
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn open_instance_folder(
    instance_name: String,
    custom_path: Option<String>,
    sub_folder: Option<String>,
) -> Result<(), String> {
    let mut path = instance_dir(&instance_name, custom_path.as_deref());
    if let Some(sub) = sub_folder {
        path = path.join(sub);
    }
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(path.to_string_lossy().as_ref())
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ─── RESOURCE PACKS ──────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct ResourcePackInfo {
    pub name: String,
    pub file_name: String,
    pub path: String,
    pub size: u64,
    pub size_fmt: String,
    pub icon: Option<String>,
    pub description: Option<String>,
}

#[tauri::command]
pub async fn list_resourcepacks(
    instance_name: String,
    custom_path: Option<String>,
) -> Result<Vec<ResourcePackInfo>, String> {
    let rp_dir = instance_dir(&instance_name, custom_path.as_deref()).join("resourcepacks");
    if !rp_dir.exists() { return Ok(vec![]); }

    let mut packs = Vec::new();
    for entry in fs::read_dir(&rp_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
        if !file_name.ends_with(".zip") && !path.is_dir() { continue; }

        let size = if path.is_dir() { dir_size(&path) } else {
            fs::metadata(&path).map(|m| m.len()).unwrap_or(0)
        };

        let icon = if path.is_dir() {
            file_to_b64_png(&path.join("pack.png"))
        } else {
            zip_extract_b64(&path, "pack.png")
        };

        let description = if path.is_dir() {
            read_pack_description_dir(&path)
        } else {
            read_pack_description_zip(&path)
        };

        let name = file_name.trim_end_matches(".zip").to_string();
        packs.push(ResourcePackInfo {
            name,
            file_name,
            path: path.to_string_lossy().to_string(),
            size, size_fmt: fmt_bytes(size),
            icon,
            description,
        });
    }

    packs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(packs)
}

fn read_pack_description_dir(pack_dir: &Path) -> Option<String> {
    let mcmeta = fs::read_to_string(pack_dir.join("pack.mcmeta")).ok()?;
    let j: serde_json::Value = serde_json::from_str(&mcmeta).ok()?;
    j.get("pack")?.get("description")?.as_str().map(String::from)
}

fn read_pack_description_zip(zip_path: &Path) -> Option<String> {
    let f = File::open(zip_path).ok()?;
    let mut archive = ZipArchive::new(f).ok()?;
    let mut entry = archive.by_name("pack.mcmeta").ok()?;
    let mut s = String::new();
    entry.read_to_string(&mut s).ok()?;
    let j: serde_json::Value = serde_json::from_str(&s).ok()?;
    j.get("pack")?.get("description")?.as_str().map(String::from)
}

// ─── SHADERS ─────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct ShaderInfo {
    pub name: String,
    pub file_name: String,
    pub path: String,
    pub size: u64,
    pub size_fmt: String,
}

#[tauri::command]
pub async fn list_shaders(
    instance_name: String,
    custom_path: Option<String>,
) -> Result<Vec<ShaderInfo>, String> {
    let sh_dir = instance_dir(&instance_name, custom_path.as_deref()).join("shaderpacks");
    if !sh_dir.exists() { return Ok(vec![]); }

    let mut shaders = Vec::new();
    for entry in fs::read_dir(&sh_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
        if !file_name.ends_with(".zip") && !file_name.ends_with(".glsl") && !path.is_dir() { continue; }

        let size = if path.is_dir() { dir_size(&path) } else {
            fs::metadata(&path).map(|m| m.len()).unwrap_or(0)
        };
        let name = file_name.trim_end_matches(".zip").to_string();

        shaders.push(ShaderInfo {
            name,
            file_name,
            path: path.to_string_lossy().to_string(),
            size, size_fmt: fmt_bytes(size),
        });
    }

    shaders.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(shaders)
}

// ─── WORLDS ──────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct WorldInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub size_fmt: String,
    pub icon: Option<String>,
    pub last_played: Option<String>,
    pub created_at: Option<String>,
}

#[tauri::command]
pub async fn list_worlds(
    instance_name: String,
    custom_path: Option<String>,
) -> Result<Vec<WorldInfo>, String> {
    let saves_dir = instance_dir(&instance_name, custom_path.as_deref()).join("saves");
    if !saves_dir.exists() { return Ok(vec![]); }

    let mut worlds = Vec::new();
    for entry in fs::read_dir(&saves_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_dir() { continue; }

        let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
        let size = dir_size(&path);

        // Icon: icon.png inside world folder
        let icon = file_to_b64_png(&path.join("icon.png"));

        // Dates from level.dat metadata
        let level_dat = path.join("level.dat");
        let last_played = fs::metadata(&level_dat)
            .ok()
            .and_then(|m| m.modified().ok())
            .map(timestamp_to_iso);

        // Created: use folder metadata
        let created_at = fs::metadata(&path)
            .ok()
            .and_then(|m| m.created().ok())
            .map(timestamp_to_iso);

        worlds.push(WorldInfo {
            name,
            path: path.to_string_lossy().to_string(),
            size, size_fmt: fmt_bytes(size),
            icon,
            last_played,
            created_at,
        });
    }

    // Sort by last played desc
    worlds.sort_by(|a, b| b.last_played.cmp(&a.last_played));
    Ok(worlds)
}

// ─── SCREENSHOTS ─────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct ScreenshotInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub size_fmt: String,
    pub taken_at: Option<String>,
    pub data: Option<String>, // base64 encoded
}

#[tauri::command]
pub async fn list_screenshots(
    instance_name: String,
    custom_path: Option<String>,
) -> Result<Vec<ScreenshotInfo>, String> {
    let sc_dir = instance_dir(&instance_name, custom_path.as_deref()).join("screenshots");
    if !sc_dir.exists() { return Ok(vec![]); }

    let mut shots = Vec::new();
    for entry in fs::read_dir(&sc_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
        if !file_name.ends_with(".png") && !file_name.ends_with(".jpg") { continue; }

        let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        let taken_at = fs::metadata(&path)
            .ok()
            .and_then(|m| m.modified().ok())
            .map(timestamp_to_iso);

        // For the list view we load the actual image data
        let data = file_to_b64_png(&path);

        shots.push(ScreenshotInfo {
            name: file_name,
            path: path.to_string_lossy().to_string(),
            size, size_fmt: fmt_bytes(size),
            taken_at,
            data,
        });
    }

    shots.sort_by(|a, b| b.taken_at.cmp(&a.taken_at));
    Ok(shots)
}
