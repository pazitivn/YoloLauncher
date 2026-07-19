// download.rs - Minecraft asset & jar downloading (supports loaders: Fabric, Quilt, Forge, NeoForge)
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use sha1::{Sha1, Digest};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub instance_id: String,
    pub instance_name: String,
    pub stage: String,
    pub current: u64,
    pub total: u64,
    pub percent: f32,
    pub speed_kb: f64,
    pub done: bool,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct VersionMeta {
    downloads: VersionDownloads,
    libraries: Vec<Library>,
    #[serde(rename = "assetIndex")]
    asset_index: AssetIndex,
    #[serde(rename = "javaVersion")]
    java_version: Option<JavaVersion>,
    #[serde(rename = "mainClass")]
    main_class: String,
    #[serde(rename = "minecraftArguments")]
    minecraft_arguments: Option<String>,
    arguments: Option<Arguments>,
}

#[derive(Debug, Deserialize)]
struct VersionDownloads {
    client: Download,
}

#[derive(Debug, Deserialize)]
struct Download {
    url: String,
    sha1: String,
    size: u64,
}

#[derive(Debug, Deserialize)]
struct Library {
    name: String,
    downloads: Option<LibraryDownloads>,
    rules: Option<Vec<Rule>>,
    url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LibraryDownloads {
    artifact: Option<Artifact>,
}

#[derive(Debug, Deserialize)]
struct Artifact {
    url: String,
    sha1: String,
    size: u64,
    path: String,
}

#[derive(Debug, Deserialize)]
struct Rule {
    action: String,
    os: Option<OsRule>,
}

#[derive(Debug, Deserialize)]
struct OsRule {
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AssetIndex {
    url: String,
    id: String,
}

#[derive(Debug, Deserialize)]
struct JavaVersion {
    #[serde(rename = "majorVersion")]
    major_version: u32,
}

#[derive(Debug, Deserialize)]
struct Arguments {
    game: Option<Vec<serde_json::Value>>,
    jvm: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Deserialize)]
struct AssetIndexFile {
    objects: HashMap<String, AssetObject>,
}

#[derive(Debug, Deserialize)]
struct AssetObject {
    hash: String,
    size: u64,
}

// ─── Loader-specific JSON (Fabric/Quilt/etc.) ─────────────────────────────────
#[derive(Debug, Deserialize)]
struct LoaderVersionJson {
    #[serde(rename = "mainClass")]
    main_class: String,
    libraries: Vec<LoaderLibrary>,
    #[serde(rename = "inheritsFrom")]
    inherits_from: Option<String>,
    arguments: Option<Arguments>,
}

#[derive(Debug, Deserialize)]
struct LoaderLibrary {
    name: String,
    url: Option<String>,
}

lazy_static::lazy_static! {
    static ref DOWNLOAD_PROGRESS: Arc<Mutex<HashMap<String, DownloadProgress>>> =
        Arc::new(Mutex::new(HashMap::new()));
    static ref CANCEL_FLAGS: Arc<Mutex<HashSet<String>>> =
        Arc::new(Mutex::new(HashSet::new()));
}

fn is_cancelled(instance_id: &str) -> bool {
    CANCEL_FLAGS.lock().unwrap().contains(instance_id)
}

fn cleanup_cancel(instance_id: &str) {
    CANCEL_FLAGS.lock().unwrap().remove(instance_id);
}

use crate::paths::{get_minecraft_dir, get_instance_dir};

fn get_versions_dir() -> PathBuf {
    get_minecraft_dir().join("versions")
}

fn get_libraries_dir() -> PathBuf {
    get_minecraft_dir().join("libraries")
}

fn get_assets_dir() -> PathBuf {
    get_minecraft_dir().join("assets")
}

fn is_library_allowed_on_windows(rules: &[Rule]) -> bool {
    let mut allowed = true;
    for rule in rules {
        let os_match = rule.os.as_ref().map_or(true, |os| {
            os.name.as_deref().map_or(true, |name| name == "windows")
        });
        if os_match {
            allowed = rule.action == "allow";
        }
    }
    allowed
}

/// Convert Maven coordinate to relative path  
/// e.g. `net.fabricmc:fabric-loader:0.16.5` → `net/fabricmc/fabric-loader/0.16.5/fabric-loader-0.16.5.jar`
fn maven_to_path(coordinate: &str) -> Option<String> {
    let parts: Vec<&str> = coordinate.split(':').collect();
    if parts.len() < 3 { return None; }
    let group = parts[0].replace('.', "/");
    let artifact = parts[1];
    let version = parts[2];
    Some(format!("{}/{}/{}/{}-{}.jar", group, artifact, version, artifact, version))
}

/// Build download URL for a Maven coordinate using the repo URL  
fn maven_to_url(coordinate: &str, repo_url: &str) -> Option<String> {
    let rel = maven_to_path(coordinate)?;
    let base = repo_url.trim_end_matches('/');
    Some(format!("{}/{}", base, rel))
}

async fn download_file(
    client: &reqwest::Client,
    url: &str,
    dest: &PathBuf,
    expected_sha1: Option<&str>,
) -> Result<(), anyhow::Error> {
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    if dest.exists() {
        if let Some(sha1) = expected_sha1 {
            let bytes = tokio::fs::read(dest).await?;
            let hash = hex::encode(Sha1::digest(&bytes));
            if hash == sha1 {
                return Ok(());
            }
        } else {
            return Ok(());
        }
    }

    let response = client.get(url).send().await?;
    if !response.status().is_success() {
        return Err(anyhow::anyhow!("HTTP {} for {}", response.status(), url));
    }
    let bytes = response.bytes().await?;

    if let Some(sha1) = expected_sha1 {
        let hash = hex::encode(Sha1::digest(&bytes));
        if hash != sha1 {
            return Err(anyhow::anyhow!("SHA1 mismatch for {}", url));
        }
    }

    tokio::fs::write(dest, &bytes).await?;
    Ok(())
}

/// Download a file without SHA1 validation (for loader JARs from Maven)
async fn download_file_no_check(
    client: &reqwest::Client,
    url: &str,
    dest: &PathBuf,
) -> Result<(), anyhow::Error> {
    if dest.exists() {
        return Ok(());
    }
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    let response = client.get(url).send().await?;
    if !response.status().is_success() {
        return Err(anyhow::anyhow!("HTTP {} for {}", response.status(), url));
    }
    let bytes = response.bytes().await?;
    tokio::fs::write(dest, &bytes).await?;
    Ok(())
}

#[tauri::command]
pub async fn get_download_progress(instance_id: String) -> Result<Option<DownloadProgress>, String> {
    let map = DOWNLOAD_PROGRESS.lock().unwrap();
    Ok(map.get(&instance_id).cloned())
}

#[tauri::command]
pub async fn download_instance(
    app: AppHandle,
    instance_id: String,
    instance_name: String,
    custom_path: Option<String>,
    version_id: String,
    version_url: String,
    loader: Option<String>,
    loader_version: Option<String>,
) -> Result<(), String> {
    let app_clone = app.clone();
    let instance_id_clone = instance_id.clone();
    let instance_name_clone = instance_name.clone();

    tokio::spawn(async move {
        let result = do_download(
            &app_clone, &instance_id_clone, &instance_name_clone,
            custom_path.as_deref(), &version_id, &version_url,
            loader.as_deref(), loader_version.as_deref(),
        ).await;
        match result {
            Ok(()) => {
                cleanup_cancel(&instance_id_clone);
            }
            Err(e) => {
                cleanup_cancel(&instance_id_clone);
                let mut map = DOWNLOAD_PROGRESS.lock().unwrap();
                let progress = map.entry(instance_id_clone.clone()).or_insert_with(|| DownloadProgress {
                    instance_id: instance_id_clone.clone(),
                    instance_name: instance_name_clone.clone(),
                    stage: "Error".to_string(),
                    current: 0, total: 0, percent: 0.0, speed_kb: 0.0,
                    done: true, error: None,
                });
                progress.error = Some(e.to_string());
                progress.done = true;
                let _ = app_clone.emit("download-progress", progress.clone());
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn cancel_download(instance_id: String) -> Result<(), String> {
    CANCEL_FLAGS.lock().unwrap().insert(instance_id.clone());
    // Emit a cancelled progress event so the frontend updates immediately
    let progress = DownloadProgress {
        instance_id: instance_id.clone(),
        instance_name: String::new(),
        stage: "Cancelled".to_string(),
        current: 0, total: 0, percent: 0.0, speed_kb: 0.0,
        done: true, error: Some("Cancelled by user".to_string()),
    };
    {
        let mut map = DOWNLOAD_PROGRESS.lock().unwrap();
        map.insert(instance_id.clone(), progress.clone());
    }
    Ok(())
}

async fn do_download(
    app: &AppHandle,
    instance_id: &str,
    instance_name: &str,
    custom_path: Option<&str>,
    version_id: &str,
    version_url: &str,
    loader: Option<&str>,
    loader_version: Option<&str>,
) -> Result<(), anyhow::Error> {
    let client = reqwest::Client::new();

    let emit_progress = |stage: &str, current: u64, total: u64, done: bool| {
        let percent = if total > 0 { (current as f32 / total as f32) * 100.0 } else { 0.0 };
        let progress = DownloadProgress {
            instance_id: instance_id.to_string(),
            instance_name: instance_name.to_string(),
            stage: stage.to_string(),
            current, total, percent, speed_kb: 0.0, done, error: None,
        };
        {
            let mut map = DOWNLOAD_PROGRESS.lock().unwrap();
            map.insert(instance_id.to_string(), progress.clone());
        }
        let _ = app.emit("download-progress", progress);
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 1: Download vanilla Minecraft
    // ═══════════════════════════════════════════════════════════════════════════
    if is_cancelled(instance_id) { cleanup_cancel(instance_id); return Ok(()); }
    emit_progress("Fetching version metadata...", 0, 1, false);
    let version_meta: VersionMeta = client.get(version_url).send().await?.json().await?;

    if is_cancelled(instance_id) { cleanup_cancel(instance_id); return Ok(()); }
    // Download client jar
    emit_progress("Downloading Minecraft client...", 0, 1, false);
    let version_dir = get_versions_dir().join(version_id);
    tokio::fs::create_dir_all(&version_dir).await?;

    let client_jar = version_dir.join(format!("{}.jar", version_id));
    download_file(&client, &version_meta.downloads.client.url, &client_jar, Some(&version_meta.downloads.client.sha1)).await?;

    // Save vanilla version JSON
    let version_json_path = version_dir.join(format!("{}.json", version_id));
    if !version_json_path.exists() {
        let raw: serde_json::Value = client.get(version_url).send().await?.json().await?;
        tokio::fs::write(&version_json_path, serde_json::to_string_pretty(&raw)?).await?;
    }

    if is_cancelled(instance_id) { cleanup_cancel(instance_id); return Ok(()); }
    // Download vanilla libraries
    let valid_libs: Vec<&Artifact> = version_meta.libraries.iter()
        .filter(|lib| lib.rules.as_deref().map_or(true, |rules| is_library_allowed_on_windows(rules)))
        .filter_map(|lib| lib.downloads.as_ref()?.artifact.as_ref())
        .collect();

    let total_libs = valid_libs.len() as u64;
    for (i, artifact) in valid_libs.iter().enumerate() {
        if is_cancelled(instance_id) { cleanup_cancel(instance_id); return Ok(()); }
        emit_progress(
            &format!("Downloading libraries... ({}/{})", i + 1, total_libs),
            i as u64 + 1, total_libs, false,
        );
        let lib_path = get_libraries_dir().join(&artifact.path);
        download_file(&client, &artifact.url, &lib_path, Some(&artifact.sha1)).await?;
    }

    if is_cancelled(instance_id) { cleanup_cancel(instance_id); return Ok(()); }
    // Download assets
    emit_progress("Fetching asset index...", 0, 1, false);
    let asset_index_path = get_assets_dir().join("indexes").join(format!("{}.json", version_meta.asset_index.id));
    download_file(&client, &version_meta.asset_index.url, &asset_index_path, None).await?;

    let asset_index_data = tokio::fs::read_to_string(&asset_index_path).await?;
    let asset_index: AssetIndexFile = serde_json::from_str(&asset_index_data)?;
    let objects: Vec<(String, AssetObject)> = asset_index.objects.into_iter().collect();
    let total_assets = objects.len() as u64;

    for (i, (_, obj)) in objects.iter().enumerate() {
        if is_cancelled(instance_id) { cleanup_cancel(instance_id); return Ok(()); }
        if i % 50 == 0 {
            emit_progress(
                &format!("Downloading assets... ({}/{})", i, total_assets),
                i as u64, total_assets, false,
            );
        }
        let hash = &obj.hash;
        let prefix = &hash[..2];
        let asset_path = get_assets_dir().join("objects").join(prefix).join(hash);
        let url = format!("https://resources.download.minecraft.net/{}/{}", prefix, hash);
        download_file(&client, &url, &asset_path, Some(hash)).await?;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 2: Download loader (Fabric / Quilt / NeoForge / Forge)
    // ═══════════════════════════════════════════════════════════════════════════
    if is_cancelled(instance_id) { cleanup_cancel(instance_id); return Ok(()); }
    let loader_name = loader.unwrap_or("vanilla");
    let is_modded = loader_name != "vanilla" && loader_version.is_some();

    if is_modded {
        let lv = loader_version.unwrap();
        emit_progress(&format!("Installing {} {}...", loader_name, lv), 0, 1, false);

        // Fetch loader profile JSON
        let profile_url = match loader_name {
            "fabric" => format!(
                "https://meta.fabricmc.net/v2/versions/loader/{}/{}/profile/json",
                version_id, lv
            ),
            "quilt" => format!(
                "https://meta.quiltmc.org/v3/versions/loader/{}/{}/profile/json",
                version_id, lv
            ),
            _ => String::new(),
        };

        if !profile_url.is_empty() {
            let profile_res = client.get(&profile_url).send().await?;
            if profile_res.status().is_success() {
                let profile_text = profile_res.text().await?;
                let loader_json: LoaderVersionJson = serde_json::from_str(&profile_text)?;

                // Determine the version directory name
                let loader_version_id = match loader_name {
                    "fabric" => format!("fabric-loader-{}-{}", lv, version_id),
                    "quilt" => format!("quilt-loader-{}-{}", lv, version_id),
                    _ => format!("{}-{}", loader_name, lv),
                };

                // Save the loader version JSON
                let loader_version_dir = get_versions_dir().join(&loader_version_id);
                tokio::fs::create_dir_all(&loader_version_dir).await?;
                let loader_json_path = loader_version_dir.join(format!("{}.json", loader_version_id));
                tokio::fs::write(&loader_json_path, &profile_text).await?;

                // Download loader libraries
                let total_loader_libs = loader_json.libraries.len();
                for (i, lib) in loader_json.libraries.iter().enumerate() {
                    if is_cancelled(instance_id) { cleanup_cancel(instance_id); return Ok(()); }
                    emit_progress(
                        &format!("Downloading {} libraries... ({}/{})", loader_name, i + 1, total_loader_libs),
                        i as u64 + 1, total_loader_libs as u64, false,
                    );

                    if let Some(rel_path) = maven_to_path(&lib.name) {
                        let dest = get_libraries_dir().join(&rel_path);
                        if dest.exists() {
                            continue;
                        }

                        // Determine Maven repo URL
                        let repo = lib.url.as_deref().unwrap_or(match loader_name {
                            "fabric" => "https://maven.fabricmc.net/",
                            "quilt" => "https://maven.quiltmc.org/repository/release/",
                            _ => "https://repo1.maven.org/maven2/",
                        });

                        if let Some(download_url) = maven_to_url(&lib.name, repo) {
                            // Try primary repo, fallback to Maven Central
                            if let Err(_) = download_file_no_check(&client, &download_url, &dest).await {
                                let central_url = maven_to_url(&lib.name, "https://repo1.maven.org/maven2/");
                                if let Some(cu) = central_url {
                                    let _ = download_file_no_check(&client, &cu, &dest).await;
                                }
                            }
                        }
                    }
                }
            } else {
                return Err(anyhow::anyhow!(
                    "Failed to fetch {} profile: HTTP {}",
                    loader_name, profile_res.status()
                ));
            }
        }
        // TODO: Forge/NeoForge have different installation processes (installer JARs)
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 3: Setup instance directory
    // ═══════════════════════════════════════════════════════════════════════════
    if is_cancelled(instance_id) { cleanup_cancel(instance_id); return Ok(()); }
    let instance_dir = get_instance_dir(instance_name, custom_path);
    tokio::fs::create_dir_all(&instance_dir).await?;
    // Create mods directory for modded instances
    if is_modded {
        tokio::fs::create_dir_all(instance_dir.join("mods")).await?;
    }

    cleanup_cancel(instance_id);
    emit_progress("Installation complete!", 1, 1, true);
    Ok(())
}
