// accounts.rs - Offline account management
use serde::{Deserialize, Serialize};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use uuid::Uuid;
use chrono::Utc;
use std::fs;
use crate::paths::get_yololauncher_dir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub id: String,
    pub username: String,
    pub account_type: AccountType,
    pub uuid: String,
    pub created_at: String,
    pub skin_url: Option<String>,
    #[serde(default)]
    pub skin_services: Vec<String>,
    #[serde(default)]
    pub main_skin_service: Option<String>,
    #[serde(default)]
    pub custom_skin_url: Option<String>,
    #[serde(default)]
    pub ely_username: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AccountType {
    Offline,
    Microsoft,
}


#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AccountStore {
    pub accounts: Vec<Account>,
    pub active_account_id: Option<String>,
}

fn get_accounts_file() -> std::path::PathBuf {
    get_yololauncher_dir().join("accounts.json")
}

pub fn load_accounts() -> AccountStore {
    let path = get_accounts_file();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(store) = serde_json::from_str(&content) {
                return store;
            }
        }
    }
    AccountStore::default()
}

pub fn save_accounts(data: &AccountStore) {
    let path = get_accounts_file();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(content) = serde_json::to_string_pretty(data) {
        let _ = fs::write(path, content);
    }
}

#[tauri::command]
pub async fn get_accounts() -> Result<Vec<Account>, String> {
    Ok(load_accounts().accounts)
}

#[tauri::command]
pub async fn get_active_account() -> Result<Option<Account>, String> {
    let data = load_accounts();
    if let Some(active_id) = &data.active_account_id {
        Ok(data.accounts.into_iter().find(|a| &a.id == active_id))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn add_offline_account(
    username: String,
) -> Result<Account, String> {
    if username.trim().is_empty() {
        return Err("Username cannot be empty".to_string());
    }
    if username.len() < 3 || username.len() > 16 {
        return Err("Username must be between 3 and 16 characters".to_string());
    }
    if !username.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return Err("Username can only contain letters, numbers, and underscores".to_string());
    }

    let mut data = load_accounts();

    if data.accounts.iter().any(|a| a.username.to_lowercase() == username.to_lowercase()) {
        return Err(format!("Account '{}' already exists", username));
    }

    let offline_uuid = generate_offline_uuid(&username);

    let account = Account {
        id: Uuid::new_v4().to_string(),
        username: username.clone(),
        account_type: AccountType::Offline,
        uuid: offline_uuid,
        created_at: Utc::now().to_rfc3339(),
        skin_url: None,
        skin_services: Vec::new(),
        main_skin_service: None,
        custom_skin_url: None,
        ely_username: None,
    };

    if data.accounts.is_empty() {
        data.active_account_id = Some(account.id.clone());
    }

    data.accounts.push(account.clone());
    save_accounts(&data);

    Ok(account)
}

#[tauri::command]
pub async fn remove_account(account_id: String) -> Result<(), String> {
    let mut data = load_accounts();
    let original_len = data.accounts.len();
    data.accounts.retain(|a| a.id != account_id);

    if data.accounts.len() == original_len {
        return Err("Account not found".to_string());
    }

    if data.active_account_id.as_deref() == Some(&account_id) {
        data.active_account_id = data.accounts.first().map(|a| a.id.clone());
    }

    save_accounts(&data);
    Ok(())
}

#[tauri::command]
pub async fn set_active_account(account_id: String) -> Result<(), String> {
    let mut data = load_accounts();
    if !data.accounts.iter().any(|a| a.id == account_id) {
        return Err("Account not found".to_string());
    }
    data.active_account_id = Some(account_id);
    save_accounts(&data);
    Ok(())
}

fn generate_offline_uuid(username: &str) -> String {
    use sha1::{Sha1, Digest};

    let input = format!("OfflinePlayer:{}", username);
    let mut hasher = Sha1::new();
    hasher.update(input.as_bytes());
    let result = hasher.finalize();

    let mut bytes = [0u8; 16];
    bytes.copy_from_slice(&result[..16]);
    bytes[6] = (bytes[6] & 0x0f) | 0x30;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3],
        bytes[4], bytes[5],
        bytes[6], bytes[7],
        bytes[8], bytes[9],
        bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
    )
}

/// Download a skin PNG from TLSkins (or any URL) via reqwest,
/// bypassing WebView CORS restrictions.
/// Returns a data URI: "data:image/png;base64,..."
#[tauri::command]
pub async fn fetch_skin_bytes(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("YoloLauncher/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP {}: skin not found", response.status()));
    }

    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/png")
        .to_string();

    // Accept image/* or application/octet-stream (download links)
    let mime = if content_type.contains("image") || content_type.contains("octet-stream") {
        "image/png"
    } else {
        return Err(format!("Unexpected content type: {}", content_type));
    };

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    if bytes.len() < 8 {
        return Err("Response too small to be a valid skin".to_string());
    }

    let b64 = BASE64.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, b64))
}

#[tauri::command]
pub async fn update_account_skin_settings(
    account_id: String,
    skin_services: Vec<String>,
    main_skin_service: Option<String>,
    custom_skin_url: Option<String>,
    ely_username: Option<String>,
) -> Result<(), String> {
    let mut data = load_accounts();
    if let Some(acc) = data.accounts.iter_mut().find(|a| a.id == account_id) {
        acc.skin_services = skin_services;
        acc.main_skin_service = main_skin_service;
        acc.custom_skin_url = custom_skin_url;
        acc.ely_username = ely_username;
        save_accounts(&data);
        Ok(())
    } else {
        Err("Account not found".to_string())
    }
}


