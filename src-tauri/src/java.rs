// java.rs - Java detection and management
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JavaInstallation {
    pub path: String,
    pub version: String,
    pub major_version: u32,
    pub is_valid: bool,
}

#[tauri::command]
pub async fn check_java(java_path: Option<String>) -> Result<JavaInstallation, String> {
    let path = java_path.unwrap_or_else(|| "java".to_string());
    probe_java(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_java_installations() -> Result<Vec<JavaInstallation>, String> {
    let mut installations = Vec::new();

    // Common Java locations on Windows
    let search_paths: Vec<PathBuf> = vec![
        PathBuf::from("java"),
        PathBuf::from(r"C:\Program Files\Java"),
        PathBuf::from(r"C:\Program Files\Eclipse Adoptium"),
        PathBuf::from(r"C:\Program Files\Microsoft"),
        PathBuf::from(r"C:\Program Files\Zulu"),
        {
            let mut p = dirs::data_local_dir().unwrap_or_default();
            p.push("YoloLauncher");
            p.push("java");
            p
        },
    ];

    // Try system java first
    if let Ok(install) = probe_java("java") {
        installations.push(install);
    }

    // Try scanning Program Files
    for base_path in &search_paths[1..] {
        if base_path.is_dir() {
            if let Ok(entries) = std::fs::read_dir(base_path) {
                for entry in entries.flatten() {
                    let java_exe = entry.path().join("bin").join("java.exe");
                    if java_exe.exists() {
                        if let Ok(install) = probe_java(java_exe.to_str().unwrap_or("java")) {
                            if !installations.iter().any(|i: &JavaInstallation| i.version == install.version) {
                                installations.push(install);
                            }
                        }
                    }

                    // Check one level deeper (e.g. jdk-17.0.1/bin/java.exe)
                    if let Ok(sub_entries) = std::fs::read_dir(entry.path()) {
                        for sub_entry in sub_entries.flatten() {
                            let java_exe = sub_entry.path().join("bin").join("java.exe");
                            if java_exe.exists() {
                                if let Ok(install) = probe_java(java_exe.to_str().unwrap_or("java")) {
                                    if !installations.iter().any(|i: &JavaInstallation| i.version == install.version) {
                                        installations.push(install);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(installations)
}

fn probe_java(path: &str) -> Result<JavaInstallation, anyhow::Error> {
    let output = Command::new(path)
        .arg("-version")
        .output()?;

    // java -version outputs to stderr
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let version_output = if stderr.is_empty() { stdout } else { stderr };

    // Parse version string: 'openjdk version "17.0.9" ...' or 'java version "1.8.0_xxx"'
    let version_str = version_output
        .lines()
        .next()
        .unwrap_or("")
        .trim()
        .to_string();

    let major_version = parse_major_version(&version_str);

    Ok(JavaInstallation {
        path: path.to_string(),
        version: version_str,
        major_version,
        is_valid: true,
    })
}

fn parse_major_version(version_str: &str) -> u32 {
    // Handles both "1.8.0_xxx" and "17.0.9" formats
    if let Some(quoted) = version_str.split('"').nth(1) {
        let first_part = quoted.split('.').next().unwrap_or("0");
        if first_part == "1" {
            // Java 8 and below: "1.8" => major 8
            return quoted.split('.').nth(1)
                .and_then(|s| s.parse().ok())
                .unwrap_or(8);
        }
        return first_part.parse().unwrap_or(0);
    }
    0
}

pub fn pick_java_for_version(mc_version: &str) -> String {
    // Determine minimum Java version based on MC version
    let parts: Vec<u32> = mc_version
        .split('.')
        .filter_map(|p| p.parse().ok())
        .collect();

    let minor = parts.get(1).copied().unwrap_or(0);

    let _required_java = if minor >= 21 {
        21u32
    } else if minor >= 17 {
        17
    } else if minor >= 12 {
        11
    } else {
        8
    };

    "java".to_string()
}
