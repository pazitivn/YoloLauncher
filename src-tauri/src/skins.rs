// skins.rs - Local skin server and authlib-injector manager
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tokio::net::TcpListener;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use serde::{Serialize, Deserialize};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use rsa::{RsaPrivateKey, RsaPublicKey, pkcs8::{EncodePrivateKey, DecodePrivateKey, EncodePublicKey, DecodePublicKey}};
use sha1::{Sha1, Digest};

use crate::paths::get_yololauncher_dir;

static PRIVATE_KEY: OnceLock<RsaPrivateKey> = OnceLock::new();
static PUBLIC_KEY_PEM: OnceLock<String> = OnceLock::new();
static SERVER_PORT: OnceLock<u16> = OnceLock::new();

/// Download authlib-injector.jar from Ely.by or GitHub.
pub async fn download_authlib_injector() -> Result<PathBuf, String> {
    let dir = get_yololauncher_dir();
    let jar_path = dir.join("authlib-injector.jar");
    
    if jar_path.exists() {
        return Ok(jar_path);
    }
    
    let urls = [
        "https://authlib-injector.ely.by/download/authlib-injector.jar",
        "https://github.com/yushijinhun/authlib-injector/releases/download/v1.2.5/authlib-injector-1.2.5.jar"
    ];
    
    let client = reqwest::Client::builder()
        .user_agent("YoloLauncher/1.0")
        .build()
        .map_err(|e| e.to_string())?;
        
    let mut last_err = String::new();
    for url in &urls {
        eprintln!("[skins] Attempting to download authlib-injector from {}", url);
        match client.get(*url).send().await {
            Ok(res) => {
                if res.status().is_success() {
                    match res.bytes().await {
                        Ok(bytes) => {
                            let _ = fs::create_dir_all(&dir);
                            if let Ok(_) = fs::write(&jar_path, bytes) {
                                eprintln!("[skins] Successfully downloaded authlib-injector.jar");
                                return Ok(jar_path);
                            }
                        }
                        Err(e) => last_err = e.to_string(),
                    }
                } else {
                    last_err = format!("HTTP {}", res.status());
                }
            }
            Err(e) => last_err = e.to_string(),
        }
    }
    
    Err(format!("Failed to download authlib-injector.jar: {}", last_err))
}

/// Get or create the local RSA keypair.
pub fn get_or_init_keypair() -> Result<(&'static RsaPrivateKey, &'static str), String> {
    if let (Some(priv_key), Some(pub_pem)) = (PRIVATE_KEY.get(), PUBLIC_KEY_PEM.get()) {
        return Ok((priv_key, pub_pem));
    }
    
    let dir = get_yololauncher_dir();
    let priv_path = dir.join("yoloskins_key.pem");
    
    let (priv_key, pub_pem) = if priv_path.exists() {
        let pem_str = fs::read_to_string(&priv_path).map_err(|e| e.to_string())?;
        let priv_key = RsaPrivateKey::from_pkcs8_pem(&pem_str).map_err(|e| e.to_string())?;
        let pub_key: RsaPublicKey = RsaPublicKey::from(&priv_key);
        let pub_pem = pub_key.to_public_key_pem(rsa::pkcs8::LineEnding::LF).map_err(|e| e.to_string())?;
        (priv_key, pub_pem)
    } else {
        eprintln!("[skins] Generating new 2048-bit RSA key pair...");
        let mut rng = rand::thread_rng();
        let priv_key = RsaPrivateKey::new(&mut rng, 2048).map_err(|e| e.to_string())?;
        let priv_pem = priv_key.to_pkcs8_pem(rsa::pkcs8::LineEnding::LF).map_err(|e| e.to_string())?;
        
        let _ = fs::create_dir_all(&dir);
        let _ = fs::write(&priv_path, priv_pem.as_str());
        
        let pub_key: RsaPublicKey = RsaPublicKey::from(&priv_key);
        let pub_pem = pub_key.to_public_key_pem(rsa::pkcs8::LineEnding::LF).map_err(|e| e.to_string())?;
        (priv_key, pub_pem)
    };
    
    let _ = PRIVATE_KEY.set(priv_key);
    let _ = PUBLIC_KEY_PEM.set(pub_pem);
    
    Ok((PRIVATE_KEY.get().unwrap(), PUBLIC_KEY_PEM.get().unwrap()))
}

/// Get the host/domain from a URL.
fn extract_domain(url: &str) -> Option<String> {
    if let Ok(parsed) = reqwest::Url::parse(url) {
        parsed.host_str().map(|s| s.to_string())
    } else {
        None
    }
}

/// Retrieve the active local skin port.
pub fn get_server_port() -> Option<u16> {
    SERVER_PORT.get().copied()
}

/// Start the local Yggdrasil skin proxy server.
pub async fn start_skin_server() -> Result<u16, String> {
    if let Some(port) = SERVER_PORT.get() {
        return Ok(*port);
    }
    
    // Initialize key pair
    let _ = get_or_init_keypair()?;
    
    let listener = TcpListener::bind("127.0.0.1:0").await.map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let _ = SERVER_PORT.set(port);
    
    eprintln!("[skins] Skin server started on 127.0.0.1:{}", port);
    
    tokio::spawn(async move {
        loop {
            match listener.accept().await {
                Ok((mut stream, _)) => {
                    tokio::spawn(async move {
                        let mut buf = [0u8; 4096];
                        let mut read_bytes = 0;
                        while read_bytes < buf.len() {
                            match stream.read(&mut buf[read_bytes..]).await {
                                Ok(0) => break,
                                Ok(n) => {
                                    read_bytes += n;
                                    if buf[..read_bytes].windows(4).any(|w| w == b"\r\n\r\n") {
                                        break;
                                    }
                                }
                                Err(_) => return,
                            }
                        }
                        
                        let req_str = String::from_utf8_lossy(&buf[..read_bytes]);
                        let first_line = req_str.lines().next().unwrap_or("");
                        let parts: Vec<&str> = first_line.split_whitespace().collect();
                        if parts.len() < 2 {
                            return;
                        }
                        let method = parts[0];
                        let path = parts[1];
                        
                        let (status, content_type, body) = handle_http_request(method, path).await;
                        let response = format!(
                            "HTTP/1.1 {}\r\n\
                             Content-Type: {}\r\n\
                             Content-Length: {}\r\n\
                             Connection: close\r\n\r\n{}",
                            status,
                            content_type,
                            body.len(),
                            body
                        );
                        let _ = stream.write_all(response.as_bytes()).await;
                        let _ = stream.flush().await;
                    });
                }
                Err(e) => {
                    eprintln!("[skins] Accept error: {}", e);
                }
            }
        }
    });
    
    Ok(port)
}

/// Handle a single HTTP request from authlib-injector/Minecraft.
async fn handle_http_request(method: &str, path: &str) -> (String, String, String) {
    if method != "GET" {
        return ("405 Method Not Allowed".to_string(), "text/plain".to_string(), "Method Not Allowed".to_string());
    }
    
    // 1. Root / Metadata API
    if path == "/" || path == "/api" || path == "/api/" {
        let (_, pub_pem) = match get_or_init_keypair() {
            Ok(keys) => keys,
            Err(e) => return ("500 Internal Server Error".to_string(), "text/plain".to_string(), e),
        };
        
        let mut skin_domains = vec![
            "tlauncher.org".to_string(),
            "ely.by".to_string(),
            "minecraft.net".to_string(),
            "mojang.com".to_string(),
            "textures.minecraft.net".to_string(),
            "localhost".to_string(),
            "127.0.0.1".to_string(),
            "mc-heads.net".to_string(),
            "minotar.net".to_string(),
        ];
        
        // Dynamically add domain of custom skin URL if configured
        let accounts_store = crate::accounts::load_accounts();
        if let Some(active_id) = &accounts_store.active_account_id {
            if let Some(acc) = accounts_store.accounts.iter().find(|a| &a.id == active_id) {
                if let Some(custom_url) = &acc.custom_skin_url {
                    if let Some(domain) = extract_domain(custom_url) {
                        if !skin_domains.contains(&domain) {
                            skin_domains.push(domain);
                        }
                    }
                }
            }
        }
        
        let metadata = serde_json::json!({
            "meta": {
                "serverName": "YoloLauncher Skins",
                "implementationName": "yoloskins",
                "implementationVersion": "1.0.0"
            },
            "skinDomains": skin_domains,
            "signaturePublickey": pub_pem
        });
        
        return ("200 OK".to_string(), "application/json".to_string(), metadata.to_string());
    }
    
    // 2. Profile request
    // e.g. /sessionserver/session/minecraft/profile/{uuid} or /api/sessionserver/...
    if path.contains("/profile/") {
        let clean_path = path.trim_end_matches('/');
        let uuid_part = match clean_path.rfind('/') {
            Some(pos) => &clean_path[pos + 1..],
            None => "",
        };
        
        let clean_uuid = uuid_part.replace("-", "");
        if clean_uuid.len() != 32 || !clean_uuid.chars().all(|c| c.is_ascii_hexdigit()) {
            return ("400 Bad Request".to_string(), "text/plain".to_string(), "Invalid UUID format".to_string());
        }
        
        // Let's resolve the player name and skin URL
        let (priv_key, _) = match get_or_init_keypair() {
            Ok(keys) => keys,
            Err(e) => return ("500 Internal Server Error".to_string(), "text/plain".to_string(), e),
        };
        
        let accounts_store = crate::accounts::load_accounts();
        let mut active_match = None;
        if let Some(active_id) = &accounts_store.active_account_id {
            if let Some(acc) = accounts_store.accounts.iter().find(|a| &a.id == active_id) {
                let acc_uuid = acc.uuid.replace("-", "");
                if acc_uuid.to_lowercase() == clean_uuid.to_lowercase() {
                    active_match = Some(acc.clone());
                }
            }
        }
        
        if let Some(acc) = active_match {
            // It is the active player!
            let skin_url = match acc.main_skin_service.as_deref().unwrap_or("") {
                "custom" => acc.custom_skin_url.clone().unwrap_or_default(),
                "ely" => {
                    let name = acc.ely_username.filter(|n| !n.trim().is_empty()).unwrap_or(acc.username.clone());
                    format!("https://skinsystem.ely.by/skins/{}.png", urlencoding::encode(&name))
                }
                "microsoft" => {
                    format!("https://mc-heads.net/skin/{}", urlencoding::encode(&acc.username))
                }
                "tls" | _ => {
                    format!("https://tlauncher.org/catalog/nickname/download/tlauncher_{}.png", urlencoding::encode(&acc.username))
                }
            };
            
            if skin_url.is_empty() {
                return ("204 No Content".to_string(), "text/plain".to_string(), "".to_string());
            }
            
            let textures_json = serde_json::json!({
                "timestamp": chrono::Utc::now().timestamp_millis(),
                "profileId": clean_uuid,
                "profileName": acc.username,
                "textures": {
                    "SKIN": {
                        "url": skin_url
                    }
                }
            });
            
            let value_str = serde_json::to_string(&textures_json).unwrap();
            let value_b64 = BASE64.encode(value_str.as_bytes());
            
            let mut hasher = Sha1::new();
            hasher.update(value_b64.as_bytes());
            let hash = hasher.finalize();
            
            let sig_bytes = match priv_key.sign(rsa::Pkcs1v15Sign::new::<Sha1>(), &hash) {
                Ok(sig) => sig,
                Err(e) => return ("500 Internal Server Error".to_string(), "text/plain".to_string(), e.to_string()),
            };
            let sig_b64 = BASE64.encode(&sig_bytes);
            
            let profile_response = serde_json::json!({
                "id": clean_uuid,
                "name": acc.username,
                "properties": [
                    {
                        "name": "textures",
                        "value": value_b64,
                        "signature": sig_b64
                    }
                ]
            });
            
            return ("200 OK".to_string(), "application/json".to_string(), profile_response.to_string());
        } else {
            // It is another player on a server.
            // Let's attempt to fetch their textures from Mojang or Ely.by and re-sign with our key.
            if let Some(prof) = fetch_and_resign_other_profile(&clean_uuid, priv_key).await {
                return ("200 OK".to_string(), "application/json".to_string(), prof.to_string());
            } else {
                return ("204 No Content".to_string(), "text/plain".to_string(), "".to_string());
            }
        }
    }
    
    ("404 Not Found".to_string(), "text/plain".to_string(), "Not Found".to_string())
}

/// Fetch another player's profile and re-sign it with our local private key.
async fn fetch_and_resign_other_profile(uuid: &str, priv_key: &RsaPrivateKey) -> Option<serde_json::Value> {
    let client = match reqwest::Client::builder().user_agent("YoloLauncher/1.0").build() {
        Ok(c) => c,
        Err(_) => return None,
    };
    
    // First, try Mojang
    let mojang_url = format!("https://sessionserver.mojang.com/session/minecraft/profile/{}", uuid);
    if let Ok(res) = client.get(&mojang_url).send().await {
        if res.status().is_success() {
            if let Ok(mut profile) = res.json::<serde_json::Value>().await {
                if resign_profile_value(&mut profile, priv_key) {
                    return Some(profile);
                }
            }
        }
    }
    
    // Second, try Ely.by
    let ely_url = format!("https://auth.ely.by/sessionserver/session/minecraft/profile/{}", uuid);
    if let Ok(res) = client.get(&ely_url).send().await {
        if res.status().is_success() {
            if let Ok(mut profile) = res.json::<serde_json::Value>().await {
                if resign_profile_value(&mut profile, priv_key) {
                    return Some(profile);
                }
            }
        }
    }
    
    None
}

/// Recalculate textures signature for a profile JSON using our local private key.
fn resign_profile_value(profile: &mut serde_json::Value, priv_key: &RsaPrivateKey) -> bool {
    if let Some(properties) = profile.get_mut("properties").and_then(|p| p.as_array_mut()) {
        for prop in properties {
            if prop.get("name").and_then(|n| n.as_str()) == Some("textures") {
                if let Some(value_b64) = prop.get("value").and_then(|v| v.as_str()) {
                    let mut hasher = Sha1::new();
                    hasher.update(value_b64.as_bytes());
                    let hash = hasher.finalize();
                    
                    if let Ok(sig_bytes) = priv_key.sign(rsa::Pkcs1v15Sign::new::<Sha1>(), &hash) {
                        let sig_b64 = BASE64.encode(&sig_bytes);
                        prop["signature"] = serde_json::json!(sig_b64);
                        return true;
                    }
                }
            }
        }
    }
    false
}
