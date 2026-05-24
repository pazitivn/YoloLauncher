use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;
use serde_json::Value;

#[derive(Serialize, Deserialize, Clone)]
pub struct MigrationItem {
    pub id: String,
    pub name: String,
    pub r#type: String, // "account" or "instance"
    pub source: String, // "tlauncher" or "sklauncher"
    pub payload: Option<Value>, // Additional data for migration
}

#[derive(Serialize, Deserialize, Clone)]
pub struct FoundLauncher {
    pub id: String,
    pub name: String,
    pub items: Vec<MigrationItem>,
}

fn get_appdata() -> PathBuf {
    std::env::var("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

fn get_minecraft_dir() -> PathBuf {
    get_appdata().join(".minecraft")
}

#[tauri::command]
pub async fn scan_old_launchers() -> Result<Vec<FoundLauncher>, String> {
    let mut launchers = Vec::new();
    let mc_dir = get_minecraft_dir();

    // -- SCAN TLAUNCHER --
    let tlauncher_dir = get_appdata().join(".tlauncher");
    let tlauncher_profiles_file = mc_dir.join("TlauncherProfiles.json");
    
    let mut tl_items = Vec::new();

    if tlauncher_dir.exists() || tlauncher_profiles_file.exists() {
        // Accounts
        if let Ok(content) = fs::read_to_string(&tlauncher_profiles_file) {
            if let Ok(json) = serde_json::from_str::<Value>(&content) {
                if let Some(accounts) = json.get("accounts").and_then(|a| a.as_object()) {
                    for (id, acc) in accounts {
                        if let Some(username) = acc.get("username").and_then(|u| u.as_str()) {
                            tl_items.push(MigrationItem {
                                id: format!("tl_acc_{}", id),
                                name: username.to_string(),
                                r#type: "account".to_string(),
                                source: "tlauncher".to_string(),
                                payload: Some(acc.clone()),
                            });
                        }
                    }
                }
            }
        }
        
        launchers.push(FoundLauncher {
            id: "tlauncher".to_string(),
            name: "TLauncher".to_string(),
            items: tl_items,
        });
    }

    // -- SCAN SKLAUNCHER --
    let sklauncher_dir = mc_dir.join("sklauncher");
    let sk_items = Vec::new();

    if sklauncher_dir.exists() {
        launchers.push(FoundLauncher {
            id: "sklauncher".to_string(),
            name: "SKLauncher".to_string(),
            items: sk_items,
        });
    }

    // -- SCAN INSTANCES (Common launcher_profiles.json) --
    let launcher_profiles = mc_dir.join("launcher_profiles.json");
    if launcher_profiles.exists() {
        if let Ok(content) = fs::read_to_string(&launcher_profiles) {
            if let Ok(json) = serde_json::from_str::<Value>(&content) {
                if let Some(profiles) = json.get("profiles").and_then(|p| p.as_object()) {
                    for (id, profile) in profiles {
                        if let Some(name) = profile.get("name").and_then(|n| n.as_str()) {
                            let instance_item = MigrationItem {
                                id: format!("inst_{}", id),
                                name: name.to_string(),
                                r#type: "instance".to_string(),
                                source: "launcher_profiles".to_string(),
                                payload: Some(profile.clone()),
                            };

                            let mut assigned = false;
                            for l in &mut launchers {
                                l.items.push(instance_item.clone());
                                assigned = true;
                            }
                            
                            // If no launcher detected but launcher_profiles exists
                            if !assigned {
                                launchers.push(FoundLauncher {
                                    id: "minecraft_official".to_string(),
                                    name: "Minecraft (Official)".to_string(),
                                    items: vec![instance_item],
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    // Filter out launchers with 0 items
    launchers.retain(|l| !l.items.is_empty());

    Ok(launchers)
}

#[tauri::command]
pub async fn migrate_data(items: Vec<MigrationItem>) -> Result<(), String> {
    // Actually perform the migration
    let mut accounts = crate::accounts::load_accounts();
    let mut instances = crate::instances::load_instances();
    
    for item in items {
        if item.r#type == "account" {
            if let Some(payload) = item.payload {
                if let Some(username) = payload.get("username").and_then(|u| u.as_str()) {
                    // avoid duplicates
                    if !accounts.accounts.iter().any(|a| a.username == username) {
                        accounts.accounts.push(crate::accounts::Account {
                            id: uuid::Uuid::new_v4().to_string(),
                            username: username.to_string(),
                            uuid: payload.get("uuid").and_then(|u| u.as_str()).unwrap_or("").to_string(),
                            account_type: crate::accounts::AccountType::Offline,
                            skin_url: None,
                            created_at: chrono::Utc::now().to_rfc3339(),
                            skin_services: Vec::new(),
                            main_skin_service: None,
                            custom_skin_url: None,
                            ely_username: None,
                        });
                    }
                }
            }
        } else if item.r#type == "instance" {
            if let Some(payload) = item.payload {
                if let Some(name) = payload.get("name").and_then(|n| n.as_str()) {
                    // avoid duplicates
                    if !instances.instances.iter().any(|i| i.name == name) {
                        // try to extract minecraft_version and loader
                        let last_version_id = payload.get("lastVersionId").and_then(|v| v.as_str()).unwrap_or("1.20.1");
                        let mut mc_version = last_version_id.to_string();
                        let mut loader = crate::instances::ModLoader::Vanilla;
                        let mut loader_version = None;
                        
                        if last_version_id.contains("fabric") {
                            loader = crate::instances::ModLoader::Fabric;
                            let parts: Vec<&str> = last_version_id.split('-').collect();
                            // fabric-loader-0.17.3-1.20.1
                            if parts.len() >= 4 {
                                loader_version = Some(parts[2].to_string());
                                mc_version = parts[3].to_string();
                            }
                        } else if last_version_id.contains("forge") {
                            loader = crate::instances::ModLoader::Forge;
                            let parts: Vec<&str> = last_version_id.split('-').collect();
                            if parts.len() >= 3 {
                                loader_version = Some(parts[1].to_string());
                                mc_version = parts[0].to_string();
                            }
                        } else if last_version_id.contains("quilt") {
                            loader = crate::instances::ModLoader::Quilt;
                        }

                        let custom_path = payload.get("gameDir").and_then(|g| g.as_str()).map(|s| s.to_string());

                        instances.instances.push(crate::instances::Instance {
                            id: uuid::Uuid::new_v4().to_string(),
                            name: name.to_string(),
                            minecraft_version: mc_version,
                            loader,
                            loader_version,
                            icon: payload.get("icon").and_then(|i| i.as_str()).map(|s| s.to_string()).or(Some("Zap".to_string())),
                            created_at: chrono::Utc::now().to_rfc3339(),
                            last_played: payload.get("lastUsed").and_then(|u| u.as_str()).map(|s| s.to_string()),
                            play_time_seconds: 0,
                            custom_path,
                            java_path: payload.get("javaDir").and_then(|j| j.as_str()).map(|s| s.to_string()),
                            jvm_args: payload.get("javaArgs").and_then(|j| j.as_str()).map(|s| s.to_string()),
                            memory_mb: 4096,
                            launch_behavior: "hide".to_string(),
                            open_console: false,
                            description: Some(format!("Migrated from {}", item.source)),
                        });
                    }
                }
            }
        }
    }
    
    crate::accounts::save_accounts(&accounts);
    crate::instances::save_instances(&instances);
    Ok(())
}
