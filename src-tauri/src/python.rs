// python.rs - Embedded Python + PortableMC setup and management
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use crate::paths::get_yololauncher_dir;

#[derive(Debug, Clone, serde::Serialize)]
pub struct PmcSetupProgress {
    pub stage: String,
    pub percent: f32,
    pub done: bool,
    pub error: Option<String>,
}

// Python 3.12 embeddable for Windows x64
const PYTHON_EMBED_URL: &str =
    "https://www.python.org/ftp/python/3.12.9/python-3.12.9-embed-amd64.zip";
const GET_PIP_URL: &str = "https://bootstrap.pypa.io/get-pip.py";

fn get_python_env_dir() -> PathBuf {
    get_yololauncher_dir().join("python_env")
}

pub fn get_bundled_python_exe() -> PathBuf {
    get_python_env_dir().join("python.exe")
}

fn emit(app: &AppHandle, stage: &str, percent: f32, done: bool, error: Option<String>) {
    let _ = app.emit("pmc-setup-progress", PmcSetupProgress {
        stage: stage.to_string(),
        percent,
        done,
        error,
    });
}

/// Returns the python executable to use for portablemc, or None if not available.
pub fn find_python_for_portablemc() -> Option<PathBuf> {
    // 1. Our bundled python (with portablemc installed)
    let bundled = get_bundled_python_exe();
    if bundled.exists() {
        // Quick check that portablemc module is importable
        if std::process::Command::new(&bundled)
            .args(["-c", "import portablemc"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return Some(bundled);
        }
    }

    // 2. System python with portablemc
    for candidate in &["python", "python3", "py"] {
        if std::process::Command::new(candidate)
            .args(["-c", "import portablemc"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return Some(PathBuf::from(candidate));
        }
    }

    None
}

/// Check if portablemc is ready (fast check, no download)
#[tauri::command]
pub async fn check_portablemc() -> Result<bool, String> {
    Ok(find_python_for_portablemc().is_some())
}

/// Download Python embeddable, install pip, install portablemc.
/// Emits "pmc-setup-progress" events throughout.
#[tauri::command]
pub async fn setup_portablemc(app: AppHandle) -> Result<(), String> {
    // Fast path: already installed
    if find_python_for_portablemc().is_some() {
        emit(&app, "PortableMC already ready!", 100.0, true, None);
        return Ok(());
    }

    let env_dir = get_python_env_dir();
    tokio::fs::create_dir_all(&env_dir).await.map_err(|e| e.to_string())?;

    let python_exe = get_bundled_python_exe();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;

    // ── Step 1: Download Python embeddable ────────────────────────────────────
    if !python_exe.exists() {
        emit(&app, "Downloading Python 3.12 embeddable…", 5.0, false, None);

        let resp = client.get(PYTHON_EMBED_URL)
            .send().await.map_err(|e| format!("Download Python failed: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Python download: HTTP {}", resp.status()));
        }

        let zip_bytes = resp.bytes().await.map_err(|e| e.to_string())?;

        emit(&app, "Extracting Python…", 20.0, false, None);

        // Extract zip synchronously (zip::ZipArchive is sync)
        let env_dir_clone = env_dir.clone();
        tokio::task::spawn_blocking(move || {
            let cursor = std::io::Cursor::new(zip_bytes.as_ref());
            let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;
            for i in 0..archive.len() {
                let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
                let name = file.name().to_string();
                if name.contains("..") { continue; }
                let dest = env_dir_clone.join(&name);
                if name.ends_with('/') || name.ends_with('\\') {
                    std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
                } else {
                    if let Some(p) = dest.parent() {
                        std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
                    }
                    let mut out = std::fs::File::create(&dest).map_err(|e| e.to_string())?;
                    std::io::copy(&mut file, &mut out).map_err(|e| e.to_string())?;
                }
            }
            Ok::<(), String>(())
        }).await.map_err(|e| e.to_string())??;

        // ── Fix ._pth file to enable site-packages (required for pip) ─────────
        // The embedded Python has a python312._pth that has `#import site` — we uncomment it.
        emit(&app, "Configuring Python…", 30.0, false, None);
        if let Ok(entries) = std::fs::read_dir(&env_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.ends_with("._pth") {
                    let path = entry.path();
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        let fixed = content
                            .replace("#import site", "import site")
                            .replace("# import site", "import site");
                        let _ = std::fs::write(&path, fixed);
                    }
                    break;
                }
            }
        }
    }

    // ── Step 2: Install pip ───────────────────────────────────────────────────
    let pip_ready = tokio::process::Command::new(&python_exe)
        .args(["-m", "pip", "--version"])
        .output().await
        .map(|o| o.status.success())
        .unwrap_or(false);

    if !pip_ready {
        emit(&app, "Downloading pip…", 40.0, false, None);

        let pip_bytes = client.get(GET_PIP_URL)
            .send().await.map_err(|e| format!("Download pip failed: {}", e))?
            .bytes().await.map_err(|e| e.to_string())?;

        let get_pip_path = env_dir.join("get-pip.py");
        tokio::fs::write(&get_pip_path, &pip_bytes).await.map_err(|e| e.to_string())?;

        emit(&app, "Installing pip…", 50.0, false, None);

        let result = tokio::process::Command::new(&python_exe)
            .arg(&get_pip_path)
            .output().await
            .map_err(|e| format!("pip install failed: {}", e))?;

        if !result.status.success() {
            let err = String::from_utf8_lossy(&result.stderr).to_string();
            return Err(format!("Failed to install pip:\n{}", err));
        }
    }

    // ── Step 3: Install portablemc ────────────────────────────────────────────
    // Check if already installed
    let pmc_ready = tokio::process::Command::new(&python_exe)
        .args(["-c", "import portablemc"])
        .output().await
        .map(|o| o.status.success())
        .unwrap_or(false);

    if !pmc_ready {
        emit(&app, "Installing PortableMC…", 65.0, false, None);

        let result = tokio::process::Command::new(&python_exe)
            .args(["-m", "pip", "install", "--upgrade", "portablemc"])
            .output().await
            .map_err(|e| format!("portablemc install failed: {}", e))?;

        if !result.status.success() {
            let err = String::from_utf8_lossy(&result.stderr).to_string();
            return Err(format!("Failed to install portablemc:\n{}", err));
        }
    }

    emit(&app, "PortableMC is ready!", 100.0, true, None);
    Ok(())
}
