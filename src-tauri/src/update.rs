// update.rs - Zero-Friction Auto-Update via GitHub Releases
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use futures::StreamExt;

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    prerelease: bool,
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct UpdateInfo {
    pub available: bool,
    pub current_version: String,
    pub latest_version: String,
    pub download_url: Option<String>,
}

/// Clean a version string: strip leading "v" and cut off anything after "-"
/// e.g. "v0.7.0-beta" -> "0.7.0", "0.9.0" -> "0.9.0"
fn clean_version(version: &str) -> String {
    let v = version.strip_prefix('v').unwrap_or(version);
    if let Some(pos) = v.find('-') {
        v[..pos].to_string()
    } else {
        v.to_string()
    }
}

/// Parse a cleaned version string into a tuple of three u32 numbers (major, minor, patch).
/// Returns None if parsing fails.
fn parse_version(version: &str) -> Option<(u32, u32, u32)> {
    let parts: Vec<&str> = version.split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    let major = parts[0].parse::<u32>().ok()?;
    let minor = parts[1].parse::<u32>().ok()?;
    let patch = parts[2].parse::<u32>().ok()?;
    Some((major, minor, patch))
}

/// Compare two version tuples numerically.
/// Returns true if `latest` is strictly greater than `current`.
fn is_newer(current: (u32, u32, u32), latest: (u32, u32, u32)) -> bool {
    latest.0 > current.0
        || (latest.0 == current.0 && latest.1 > current.1)
        || (latest.0 == current.0 && latest.1 == current.1 && latest.2 > current.2)
}

#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<UpdateInfo, String> {
    // Get current version from app config
    let current_version = app.package_info().version.to_string();
    let clean_current = clean_version(&current_version);

    let current_tuple = parse_version(&clean_current).ok_or_else(|| {
        format!("Failed to parse current version: {}", current_version)
    })?;

    // Fetch releases from GitHub API
    let client = reqwest::Client::new();
    let response = client
        .get("https://api.github.com/repos/pazitivn/YoloLauncher/releases")
        .header("User-Agent", "YoloLauncher-Update-Checker")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch releases: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        return Err(format!("GitHub API returned HTTP {}", status));
    }

    let releases: Vec<GithubRelease> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse releases JSON: {}", e))?;

    // Take the first (latest) release
    let latest = match releases.first() {
        Some(r) => r,
        None => {
            return Ok(UpdateInfo {
                available: false,
                current_version: current_version.clone(),
                latest_version: String::new(),
                download_url: None,
            });
        }
    };

    let clean_latest = clean_version(&latest.tag_name);
    let latest_tuple = parse_version(&clean_latest).ok_or_else(|| {
        format!("Failed to parse latest version: {}", latest.tag_name)
    })?;

    if !is_newer(current_tuple, latest_tuple) {
        return Ok(UpdateInfo {
            available: false,
            current_version: current_version.clone(),
            latest_version: latest.tag_name.clone(),
            download_url: None,
        });
    }

    // Find the update asset named "file.update"
    let update_asset = latest.assets.iter().find(|a| a.name == "file.update");
    let download_url = update_asset.map(|a| a.browser_download_url.clone());

    Ok(UpdateInfo {
        available: true,
        current_version: current_version.clone(),
        latest_version: latest.tag_name.clone(),
        download_url,
    })
}

/// Download the update file with progress events emitted to the frontend.
#[tauri::command]
pub async fn download_update(app: AppHandle, download_url: String) -> Result<String, String> {
    let temp_path = std::env::current_exe()
        .map_err(|e| format!("Failed to get exe path: {}", e))?
        .parent()
        .ok_or_else(|| "Failed to get exe parent dir".to_string())?
        .join("update.tmp");

    let client = reqwest::Client::new();
    let response = client
        .get(&download_url)
        .header("User-Agent", "YoloLauncher-Update-Downloader")
        .send()
        .await
        .map_err(|e| format!("Failed to download update: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        return Err(format!("Download returned HTTP {}", status));
    }

    let total_size = response.content_length().unwrap_or(0);

    // Emit initial event
    let _ = app.emit("update-download-progress", UpdateProgress {
        percent: 0u32,
        downloaded: 0u64,
        total: total_size,
    });

    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    let mut file = tokio::fs::File::create(&temp_path)
        .await
        .map_err(|e| format!("Failed to create temp file: {}", e))?;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download chunk error: {}", e))?;
        tokio::io::AsyncWriteExt::write_all(&mut file, &chunk)
            .await
            .map_err(|e| format!("Failed to write chunk: {}", e))?;

        downloaded += chunk.len() as u64;
        let percent = if total_size > 0 {
            ((downloaded as f64 / total_size as f64) * 100.0) as u32
        } else {
            0
        };

        let _ = app.emit("update-download-progress", UpdateProgress {
            percent,
            downloaded,
            total: total_size,
        });
    }

    let _ = app.emit("update-download-progress", UpdateProgress {
        percent: 100u32,
        downloaded,
        total: total_size,
    });

    Ok(temp_path.to_string_lossy().to_string())
}

/// Replace current exe with the downloaded update and restart.
#[tauri::command]
pub async fn apply_update(temp_file: String) -> Result<(), String> {
    let current_exe = std::env::current_exe()
        .map_err(|e| format!("Failed to get exe path: {}", e))?;

    let exe_dir = current_exe.parent()
        .ok_or_else(|| "Failed to get exe parent dir".to_string())?;

    let old_exe = exe_dir.join("YoloLauncher.old");
    let new_exe = exe_dir.join("YoloLauncher.exe");

    // 1. Rename current exe to .old
    std::fs::rename(&current_exe, &old_exe)
        .map_err(|e| format!("Failed to rename current exe to .old: {}", e))?;

    // 2. Rename downloaded update.tmp to YoloLauncher.exe
    let temp_path = std::path::PathBuf::from(&temp_file);
    std::fs::rename(&temp_path, &new_exe)
        .map_err(|e| format!("Failed to rename update file: {}", e))?;

    // 3. Launch new exe as detached process
    std::process::Command::new(&new_exe)
        .spawn()
        .map_err(|e| format!("Failed to launch new version: {}", e))?;

    // 4. Exit current process
    std::process::exit(0);
}

#[derive(Debug, Clone, Serialize)]
pub struct UpdateProgress {
    pub percent: u32,
    pub downloaded: u64,
    pub total: u64,
}

/// Clean up old YoloLauncher.old file on startup (called from setup).
pub fn cleanup_old_version() {
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            let old_exe = exe_dir.join("YoloLauncher.old");
            if old_exe.exists() {
                // Ignore errors — file might be locked or already gone
                let _ = std::fs::remove_file(&old_exe);
            }
        }
    }
}
