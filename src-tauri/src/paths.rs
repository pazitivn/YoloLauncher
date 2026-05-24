// paths.rs - Centralized path management
use std::path::PathBuf;

pub fn get_minecraft_dir() -> PathBuf {
    let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join(".minecraft")
}

pub fn get_yololauncher_dir() -> PathBuf {
    get_minecraft_dir().join(".yololauncher")
}

pub fn sanitize_instance_name(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect::<String>()
        .to_lowercase()
}

pub fn get_instance_dir(name: &str, custom_path: Option<&str>) -> PathBuf {
    if let Some(path) = custom_path {
        if !path.trim().is_empty() {
            return PathBuf::from(path.trim());
        }
    }
    get_minecraft_dir().join("instances").join(sanitize_instance_name(name))
}
