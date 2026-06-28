use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{Cursor, Read};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::Semaphore;

use crate::paths;
use flate2::read::GzDecoder;
use regex::Regex;

// ── Launcher-persistent server storage (single source of truth) ──────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredServer {
    pub saved_name: String,
    pub ip: String,
    pub port: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub slp_data: Option<SlpData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_seen: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_pinged: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ServerStore {
    pub servers: HashMap<String, StoredServer>,
    pub updated_at: Option<String>,
}

fn server_store_path(instance_dir: &PathBuf) -> PathBuf {
    let sanitized = instance_dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown");
    paths::get_yololauncher_dir()
        .join("servers")
        .join(format!("{}.json", sanitized))
}

fn load_server_store(instance_dir: &PathBuf) -> ServerStore {
    let path = server_store_path(instance_dir);
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(store) = serde_json::from_str(&content) {
                return store;
            }
        }
    }
    ServerStore::default()
}

fn save_server_store(instance_dir: &PathBuf, store: &ServerStore) {
    let path = server_store_path(instance_dir);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(content) = serde_json::to_string_pretty(store) {
        let _ = fs::write(&path, content);
    }
}

// ── ServerEntry (sent to frontend) ───────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedServer {
    pub saved_name: String,
    pub ip: String,
    pub port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlpData {
    pub motd_raw: Option<String>,
    pub motd_clean: Option<String>,
    pub online_players: Option<i32>,
    pub max_players: Option<i32>,
    pub version: Option<String>,
    pub requires_mods: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub favicon: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerEntry {
    pub saved_name: String,
    pub ip: String,
    pub port: u16,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub slp_data: Option<SlpData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_seen: Option<String>,
}

// ── Utils ─────────────────────────────────────────────────────────────────

fn format_last_seen(ts_iso: &str) -> Option<String> {
    let dt = chrono::DateTime::parse_from_rfc3339(ts_iso).ok()?;
    let local = dt.with_timezone(&chrono::Local);
    let now = chrono::Local::now();
    let time_str = local.format("%H:%M").to_string();

    if local.date_naive() == now.date_naive() {
        Some(format!("сегодня в {}", time_str))
    } else {
        let yesterday = now.date_naive() - chrono::Duration::days(1);
        if local.date_naive() == yesterday {
            Some(format!("вчера в {}", time_str))
        } else {
            let diff = (now - local).num_days();
            if diff <= 7 {
                Some(format!("{} дн. назад", diff))
            } else {
                Some(local.format("%d.%m.%Y").to_string())
            }
        }
    }
}

// ── servers.dat reader ────────────────────────────────────────────────────

fn get_servers_dat_path(instance_dir: &PathBuf) -> PathBuf {
    instance_dir.join("servers.dat")
}

#[derive(Debug, Clone)]
enum NbtValue {
    Byte(i8),
    Short(i16),
    Int(i32),
    Long(i64),
    Float(f32),
    Double(f64),
    ByteArray(Vec<i8>),
    String(String),
    List(Vec<NbtValue>),
    Compound(HashMap<String, NbtValue>),
    IntArray(Vec<i32>),
    LongArray(Vec<i64>),
}

struct NbtReader {
    cursor: Cursor<Vec<u8>>,
}

impl NbtReader {
    fn new(data: Vec<u8>) -> Self {
        Self { cursor: Cursor::new(data) }
    }

    fn read_byte(&mut self) -> Result<i8, String> {
        let mut buf = [0u8; 1];
        Read::read_exact(&mut self.cursor, &mut buf).map_err(|e| format!("NBT: {}", e))?;
        Ok(buf[0] as i8)
    }

    fn read_u16_be(&mut self) -> Result<u16, String> {
        let mut buf = [0u8; 2];
        Read::read_exact(&mut self.cursor, &mut buf).map_err(|e| format!("NBT: {}", e))?;
        Ok(u16::from_be_bytes(buf))
    }

    fn read_i32_be(&mut self) -> Result<i32, String> {
        let mut buf = [0u8; 4];
        Read::read_exact(&mut self.cursor, &mut buf).map_err(|e| format!("NBT: {}", e))?;
        Ok(i32::from_be_bytes(buf))
    }

    fn read_string(&mut self) -> Result<String, String> {
        let len = self.read_u16_be()? as usize;
        if len > 65536 {
            return Err(format!("NBT string too long: {}", len));
        }
        let mut buf = vec![0u8; len];
        Read::read_exact(&mut self.cursor, &mut buf).map_err(|e| format!("NBT: {}", e))?;
        String::from_utf8(buf).map_err(|e| format!("NBT UTF-8: {}", e))
    }

    fn read_name(&mut self) -> Result<String, String> {
        self.read_string()
    }

    fn read_tag_payload(&mut self, tag_type: i8) -> Result<NbtValue, String> {
        match tag_type {
            0 => Ok(NbtValue::Byte(0)),
            1 => Ok(NbtValue::Byte(self.read_byte()?)),
            2 => {
                let mut buf = [0u8; 2];
                Read::read_exact(&mut self.cursor, &mut buf).map_err(|e| format!("NBT: {}", e))?;
                Ok(NbtValue::Short(i16::from_be_bytes(buf)))
            }
            3 => Ok(NbtValue::Int(self.read_i32_be()?)),
            4 => {
                let mut buf = [0u8; 8];
                Read::read_exact(&mut self.cursor, &mut buf).map_err(|e| format!("NBT: {}", e))?;
                Ok(NbtValue::Long(i64::from_be_bytes(buf)))
            }
            5 => {
                let mut buf = [0u8; 4];
                Read::read_exact(&mut self.cursor, &mut buf).map_err(|e| format!("NBT: {}", e))?;
                Ok(NbtValue::Float(f32::from_be_bytes(buf)))
            }
            6 => {
                let mut buf = [0u8; 8];
                Read::read_exact(&mut self.cursor, &mut buf).map_err(|e| format!("NBT: {}", e))?;
                Ok(NbtValue::Double(f64::from_be_bytes(buf)))
            }
            7 => {
                let len = self.read_i32_be()?;
                if len < 0 || len > 1_048_576 {
                    return Err(format!("NBT ByteArray length out of bounds: {}", len));
                }
                let mut items = Vec::with_capacity(len as usize);
                for _ in 0..len {
                    items.push(self.read_byte()?);
                }
                Ok(NbtValue::ByteArray(items))
            }
            8 => Ok(NbtValue::String(self.read_string()?)),
            9 => {
                let elem_type = self.read_byte()?;
                let len = self.read_i32_be()?;
                if len < 0 || len > 131072 {
                    return Err(format!("NBT List length out of bounds: {}", len));
                }
                let mut items = Vec::with_capacity(len as usize);
                for _ in 0..len {
                    items.push(self.read_tag_payload(elem_type)?);
                }
                Ok(NbtValue::List(items))
            }
            10 => {
                let mut map = HashMap::new();
                loop {
                    let tag_id = self.read_byte()?;
                    if tag_id == 0 {
                        break;
                    }
                    let name = self.read_name()?;
                    let value = self.read_tag_payload(tag_id)?;
                    map.insert(name, value);
                }
                Ok(NbtValue::Compound(map))
            }
            11 => {
                let len = self.read_i32_be()?;
                if len < 0 || len > 524_288 {
                    return Err(format!("NBT IntArray length out of bounds: {}", len));
                }
                let mut items = Vec::with_capacity(len as usize);
                for _ in 0..len {
                    items.push(self.read_i32_be()?);
                }
                Ok(NbtValue::IntArray(items))
            }
            12 => {
                let len = self.read_i32_be()?;
                if len < 0 || len > 262_144 {
                    return Err(format!("NBT LongArray length out of bounds: {}", len));
                }
                let mut items = Vec::with_capacity(len as usize);
                for _ in 0..len {
                    let mut buf = [0u8; 8];
                    Read::read_exact(&mut self.cursor, &mut buf).map_err(|e| format!("NBT: {}", e))?;
                    items.push(i64::from_be_bytes(buf));
                }
                Ok(NbtValue::LongArray(items))
            }
            _ => Err(format!("Unknown NBT tag type: {}", tag_type)),
        }
    }

    fn read_root(&mut self) -> Result<HashMap<String, NbtValue>, String> {
        let tag_id = self.read_byte()?;
        if tag_id != 10 {
            return Err(format!("Expected root Compound tag, got {}", tag_id));
        }
        let _root_name = self.read_name()?;
        let mut map = HashMap::new();
        loop {
            let inner_tag_id = self.read_byte()?;
            if inner_tag_id == 0 {
                break;
            }
            let name = self.read_name()?;
            let value = self.read_tag_payload(inner_tag_id)?;
            map.insert(name, value);
        }
        Ok(map)
    }
}

fn parse_ip_port(input: &str, default_port: u16) -> (String, u16) {
    if input.starts_with('[') {
        if let Some(end) = input.find(']') {
            let ip = input[1..end].to_string();
            let rest = &input[end + 1..];
            if let Some(port_str) = rest.strip_prefix(':') {
                if let Ok(port) = port_str.parse::<u16>() {
                    return (format!("[{}]", ip), port);
                }
            }
            return (format!("[{}]", ip), default_port);
        }
    }
    if let Some(colon) = input.rfind(':') {
        let after = &input[colon + 1..];
        if let Ok(port) = after.parse::<u16>() {
            let ip = &input[..colon];
            if !ip.contains(':') {
                return (ip.to_string(), port);
            }
        }
    }
    (input.to_string(), default_port)
}

fn try_decompress_gzip(data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() > 50_000_000 {
        return Err("Gzip input too large".to_string());
    }
    let decoder = GzDecoder::new(data);
    let mut decompressed = Vec::new();
    let mut limited = decoder.take(200_000_000);
    match limited.read_to_end(&mut decompressed) {
        Ok(_) => Ok(decompressed),
        Err(e) => Err(format!("{}", e)),
    }
}

fn read_servers_dat_raw(instance_dir: &PathBuf) -> Result<Vec<SavedServer>, String> {
    let path = get_servers_dat_path(instance_dir);

    if !path.exists() {
        return Ok(Vec::new());
    }

    let file_size = fs::metadata(&path)
        .map(|m| m.len())
        .unwrap_or(0);
    if file_size > 50_000_000 {
        return Err("servers.dat file too large".to_string());
    }

    let raw = fs::read(&path).map_err(|e| format!("Failed to read servers.dat: {}", e))?;

    let decompressed = match try_decompress_gzip(&raw) {
        Ok(d) => d,
        Err(_) => raw,
    };

    let mut reader = NbtReader::new(decompressed);
    let root = reader.read_root()?;

    let mut servers = Vec::new();

    if let Some(NbtValue::List(list)) = root.get("servers") {
        for item in list.iter() {
            if let NbtValue::Compound(entry) = item {
                let name = match entry.get("name") {
                    Some(NbtValue::String(s)) => s.clone(),
                    _ => String::new(),
                };
                let ip_raw = match entry.get("ip") {
                    Some(NbtValue::String(s)) => s.clone(),
                    _ => continue,
                };
                let (ip, port) = parse_ip_port(&ip_raw, 25565);
                servers.push(SavedServer {
                    saved_name: name,
                    ip,
                    port,
                });
            }
        }
    }

    Ok(servers)
}

// ── SLP (Server List Ping) Protocol ───────────────────────────────────────

fn write_varint(buf: &mut Vec<u8>, value: i32) {
    let mut v = value as u32;
    loop {
        let mut temp = (v & 0x7F) as u8;
        v >>= 7;
        if v != 0 {
            temp |= 0x80;
        }
        buf.push(temp);
        if v == 0 {
            break;
        }
    }
}

fn write_string(buf: &mut Vec<u8>, s: &str) {
    write_varint(buf, s.len() as i32);
    buf.extend_from_slice(s.as_bytes());
}

async fn read_varint_async(stream: &mut TcpStream) -> Result<i32, String> {
    let mut result: u32 = 0;
    let mut shift = 0;
    loop {
        let mut buf = [0u8; 1];
        stream.read_exact(&mut buf).await.map_err(|e| format!("SLP read error: {}", e))?;
        let byte = buf[0];
        let value = (byte & 0x7F) as u32;
        if shift < 28 {
            result |= value << shift;
        } else {
            let remaining = value << shift;
            if remaining > (i32::MAX as u32).wrapping_sub(result) {
                return Err("VarInt exceeds i32 range".to_string());
            }
            let final_val = result.wrapping_add(remaining);
            if final_val > i32::MAX as u32 {
                return Err("VarInt exceeds i32 range".to_string());
            }
            return Ok(final_val as i32);
        }
        if byte & 0x80 == 0 {
            if result > i32::MAX as u32 {
                return Err("VarInt exceeds i32 range".to_string());
            }
            return Ok(result as i32);
        }
        shift += 7;
        if shift >= 35 {
            return Err("VarInt too big".to_string());
        }
    }
}

async fn read_string_async(stream: &mut TcpStream) -> Result<String, String> {
    let len = read_varint_async(stream).await?;
    if len < 0 || len > 262144 {
        return Err(format!("SLP string length out of bounds: {}", len));
    }
    let len = len as usize;
    let mut buf = vec![0u8; len];
    stream.read_exact(&mut buf).await.map_err(|e| format!("SLP read string: {}", e))?;
    String::from_utf8(buf).map_err(|e| format!("SLP UTF-8: {}", e))
}

fn strip_minecraft_color_codes(text: &str) -> String {
    let mut result = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '§' {
            let _ = chars.next();
            continue;
        }
        result.push(ch);
    }
    result
}

fn json_chat_to_legacy(value: &serde_json::Value) -> String {
    let mut result = String::new();
    append_chat_component(value, &mut result, true);
    result
}

fn append_chat_component(value: &serde_json::Value, out: &mut String, is_root: bool) {
    match value {
        serde_json::Value::String(s) => {
            out.push_str(s);
        }
        serde_json::Value::Object(obj) => {
            let color_code = obj.get("color").and_then(|c| c.as_str()).and_then(|c| match c {
                "black" => Some("§0"),
                "dark_blue" => Some("§1"),
                "dark_green" => Some("§2"),
                "dark_aqua" => Some("§3"),
                "dark_red" => Some("§4"),
                "dark_purple" => Some("§5"),
                "gold" => Some("§6"),
                "gray" => Some("§7"),
                "dark_gray" => Some("§8"),
                "blue" => Some("§9"),
                "green" => Some("§a"),
                "aqua" => Some("§b"),
                "red" => Some("§c"),
                "light_purple" => Some("§d"),
                "yellow" => Some("§e"),
                "white" => Some("§f"),
                _ => None,
            });

            // Root component: always start with §r to reset
            if is_root {
                out.push_str("§r");
            }

            if let Some(cc) = color_code {
                out.push_str(cc);
            }

            if obj.get("bold").and_then(|b| b.as_bool()).unwrap_or(false) {
                out.push_str("§l");
            }
            if obj.get("italic").and_then(|b| b.as_bool()).unwrap_or(false) {
                out.push_str("§o");
            }
            if obj.get("underlined").and_then(|b| b.as_bool()).unwrap_or(false) {
                out.push_str("§n");
            }
            if obj.get("strikethrough").and_then(|b| b.as_bool()).unwrap_or(false) {
                out.push_str("§m");
            }
            if obj.get("obfuscated").and_then(|b| b.as_bool()).unwrap_or(false) {
                out.push_str("§k");
            }

            if let Some(text) = obj.get("text").and_then(|t| t.as_str()) {
                out.push_str(text);
            }

            if let Some(extra) = obj.get("extra").and_then(|e| e.as_array()) {
                for elem in extra {
                    append_chat_component(elem, out, false);
                }
            }
        }
        _ => {}
    }
}

async fn slp_ping(host: &str, port: u16) -> Result<SlpData, String> {
    let addr = format!("{}:{}", host, port);
    let mut stream = TcpStream::connect(&addr)
        .await
        .map_err(|e| format!("{}", e))?;

    let timeout = Duration::from_secs(5);

    let json_str: String = tokio::time::timeout(timeout, async {
        let mut handshake = Vec::new();
        write_varint(&mut handshake, 0x00);
        write_varint(&mut handshake, -1i32);
        write_string(&mut handshake, host);
        handshake.extend_from_slice(&(port as u16).to_be_bytes());
        write_varint(&mut handshake, 1);

        let mut packet = Vec::new();
        write_varint(&mut packet, handshake.len() as i32);
        packet.extend_from_slice(&handshake);
        stream.write_all(&packet).await.map_err(|e| format!("{}", e))?;

        let mut request = Vec::new();
        write_varint(&mut request, 0x00);
        let mut req_packet = Vec::new();
        write_varint(&mut req_packet, request.len() as i32);
        req_packet.extend_from_slice(&request);
        stream.write_all(&req_packet).await.map_err(|e| format!("{}", e))?;

        let _packet_len = read_varint_async(&mut stream).await?;
        let _packet_id = read_varint_async(&mut stream).await?;
        read_string_async(&mut stream).await
    })
    .await
    .map_err(|_| format!("SLP timeout: {}", addr))??;

    let json: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("SLP JSON parse: {}", e))?;

    let motd_raw = json.get("description").map(|d| json_chat_to_legacy(d));
    let motd_clean = motd_raw.as_deref().map(strip_minecraft_color_codes);

    let (online_players, max_players) = json.get("players").map(|p| {
        let online = p.get("online").and_then(|v| v.as_i64()).map(|v| v as i32);
        let max = p.get("max").and_then(|v| v.as_i64()).map(|v| v as i32);
        (online, max)
    }).unwrap_or((None, None));

    let version = json.get("version")
        .and_then(|v| v.get("name"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let requires_mods = json.get("modinfo").is_some() || json.get("forgeData").is_some();

    let favicon = json.get("favicon")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    Ok(SlpData {
        motd_raw,
        motd_clean,
        online_players,
        max_players,
        version,
        requires_mods,
        favicon,
    })
}

// ── Log file search for "Connecting to" lines ─────────────────────────────

/// Search a single log file's text content for the last "Connecting to <ip>" line.
/// Returns the time string "HH:MM:SS" if found.
fn search_log_content(content: &str, re: &Regex) -> Option<String> {
    let mut last_time: Option<String> = None;
    for line in content.lines() {
        if let Some(caps) = re.captures(line) {
            last_time = Some(caps[1].to_string());
        }
    }
    last_time
}

/// Read a log file that may be gzipped, returning its text content.
fn read_log_file(path: &std::path::Path) -> Option<String> {
    let raw = fs::read(path).ok()?;
    let data = if path.extension().map(|e| e == "gz").unwrap_or(false)
        || path.extension().map(|e| e == "gzip").unwrap_or(false)
        || path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.ends_with(".gz"))
            .unwrap_or(false)
    {
        try_decompress_gzip(&raw).ok()?
    } else {
        raw
    };
    String::from_utf8(data).ok()
}

/// Search latest.log first, then archived logs (newest first by mtime)
/// for a line matching "[HH:MM:SS] [Thread/INFO]: Connecting to <ip>, <port>"
/// Returns ISO8601 timestamp of the found connection.
fn get_last_seen_from_logs(instance_dir: &PathBuf, ip: &str) -> Option<String> {
    let logs_dir = instance_dir.join("logs");
    if !logs_dir.exists() {
        return None;
    }

    let escaped_ip = regex::escape(ip);
    let pattern = format!(
        r"\[(\d{{2}}:\d{{2}}:\d{{2}})\]\s*\[[^\]]*\]:\s*Connecting to\s+{}(?:,\s*\d+)?",
        escaped_ip
    );
    let re = Regex::new(&pattern).ok()?;

    // 1. Try latest.log first
    let latest = logs_dir.join("latest.log");
    if latest.exists() {
        if let Some(content) = read_log_file(&latest) {
            if let Some(time_str) = search_log_content(&content, &re) {
                if let Some(ts) = timestamp_from_log_time(&latest, &time_str) {
                    return Some(ts);
                }
            }
        }
    }

    // 2. Try archived logs (newest first by modification time)
    let mut archive_files: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(entries) = fs::read_dir(&logs_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("");
            if name == "latest.log" || name == "latest.log.gz" {
                continue;
            }
            // Match log archive patterns: 2026-06-27-1.log, 2026-06-27-1.log.gz, etc.
            if name.ends_with(".log") || name.ends_with(".log.gz") || name.ends_with(".gz")
            {
                archive_files.push(path);
            }
        }
    }

    // Sort by modification time, newest first
    archive_files.sort_by(|a, b| {
        let ta = std::fs::metadata(a).ok().and_then(|m| m.modified().ok());
        let tb = std::fs::metadata(b).ok().and_then(|m| m.modified().ok());
        tb.cmp(&ta)
    });

    for path in &archive_files {
        if let Some(content) = read_log_file(path) {
            if let Some(time_str) = search_log_content(&content, &re) {
                if let Some(ts) = timestamp_from_log_time(path, &time_str) {
                    return Some(ts);
                }
            }
        }
    }

    None
}

/// Convert a log file's mtime date + a "HH:MM:SS" time from the log line
/// into an ISO8601 string.
fn timestamp_from_log_time(log_path: &std::path::Path, time_str: &str) -> Option<String> {
    let time = chrono::NaiveTime::parse_from_str(time_str, "%H:%M:%S").ok()?;
    let file_modified = std::fs::metadata(log_path).ok()?.modified().ok()?;
    let file_utc: chrono::DateTime<chrono::Utc> = chrono::DateTime::from(file_modified);
    let file_local = file_utc.with_timezone(&chrono::Local);

    let log_date = file_local.date_naive();
    let log_naive_dt = chrono::NaiveDateTime::new(log_date, time);
    let log_dt = chrono::TimeZone::from_local_datetime(&chrono::Local, &log_naive_dt)
        .latest()
        .unwrap_or(file_local);

    Some(log_dt.to_rfc3339())
}

// ── Tauri commands ────────────────────────────────────────────────────────

/// Load servers from servers.dat, update launcher store, ping all concurrently.
/// Saves to launcher store as soon as servers are read from servers.dat.
#[tauri::command]
pub async fn load_servers_with_ping(
    instance_name: String,
    custom_path: Option<String>,
) -> Result<Vec<ServerEntry>, String> {
    let instance_dir = paths::get_instance_dir(&instance_name, custom_path.as_deref());
    let saved = read_servers_dat_raw(&instance_dir)?;

    if saved.is_empty() {
        return Ok(Vec::new());
    }

    // Load existing launcher store
    let mut store = load_server_store(&instance_dir);
    let now_ts = chrono::Local::now().to_rfc3339();

    // Step 1: Immediately store all servers from servers.dat into launcher file,
    // preserving known SLP data and last_seen from existing store.
    for server in &saved {
        let key = format!("{}:{}", server.ip, server.port);
        let entry = store.servers.entry(key.clone()).or_insert_with(|| {
            StoredServer {
                saved_name: server.saved_name.clone(),
                ip: server.ip.clone(),
                port: server.port,
                slp_data: None,
                last_seen: None,
                last_pinged: None,
            }
        });
        entry.saved_name = server.saved_name.clone();
    }

    // Step 2: For each server, try to find last_seen from logs if not already cached
    let mut found_any = false;
    for server in &saved {
        let key = format!("{}:{}", server.ip, server.port);
        let has_last_seen = store.servers.get(&key)
            .and_then(|s| s.last_seen.as_ref())
            .is_some();

        if !has_last_seen {
            if let Some(ts) = get_last_seen_from_logs(&instance_dir, &server.ip) {
                if let Some(entry) = store.servers.get_mut(&key) {
                    entry.last_seen = Some(ts);
                    found_any = true;
                }
            }
        }
    }

    // Save immediately if any last_seen data was found
    if found_any {
        store.updated_at = Some(now_ts.clone());
        save_server_store(&instance_dir, &store);
    }

    // Save initial store with all servers
    store.updated_at = Some(now_ts);
    save_server_store(&instance_dir, &store);

    // Step 3: Ping all servers concurrently (max 12 at a time)
    let semaphore = Arc::new(Semaphore::new(12));
    let mut handles = Vec::with_capacity(saved.len());
    for server in &saved {
        let ip = server.ip.clone();
        let port = server.port;
        let saved_name = server.saved_name.clone();
        let key = format!("{}:{}", ip, port);
        let cached_slp = store.servers.get(&key)
            .and_then(|s| s.slp_data.clone());
        let cached_last_seen = store.servers.get(&key)
            .and_then(|s| s.last_seen.clone());
        let sem = semaphore.clone();

        handles.push(tokio::spawn(async move {
            let _permit = sem.acquire().await;
            let result = tokio::time::timeout(Duration::from_secs(6), slp_ping(&ip, port)).await;
            let last_seen_raw = cached_last_seen;
            match result {
                Ok(Ok(data)) => ServerEntry {
                    saved_name,
                    ip,
                    port,
                    status: "online".to_string(),
                    slp_data: Some(data),
                    last_seen: last_seen_raw,
                },
                _ => ServerEntry {
                    saved_name,
                    ip,
                    port,
                    status: "timeout".to_string(),
                    slp_data: cached_slp,
                    last_seen: last_seen_raw,
                },
            }
        }));
    }

    let mut results = Vec::with_capacity(handles.len());
    for handle in handles {
        if let Ok(entry) = handle.await {
            results.push(entry);
        }
    }

    // Step 4: Update store with ping results
    let mut final_store = load_server_store(&instance_dir);
    let final_ts = chrono::Local::now().to_rfc3339();
    for entry in &results {
        let key = format!("{}:{}", entry.ip, entry.port);
        let stored = final_store.servers.entry(key).or_insert_with(|| {
            StoredServer {
                saved_name: entry.saved_name.clone(),
                ip: entry.ip.clone(),
                port: entry.port,
                slp_data: None,
                last_seen: None,
                last_pinged: None,
            }
        });
        stored.saved_name = entry.saved_name.clone();
        stored.last_pinged = Some(final_ts.clone());
        stored.slp_data = entry.slp_data.clone();
    }
    final_store.updated_at = Some(final_ts);
    save_server_store(&instance_dir, &final_store);

    Ok(results)
}

/// Ping a single server and cross-reference with current servers.dat.
/// Returns the updated entry, or None if the server was removed from servers.dat.
#[tauri::command]
pub async fn refresh_single_server(
    instance_name: String,
    custom_path: Option<String>,
    ip: String,
    port: u16,
) -> Result<Option<ServerEntry>, String> {
    let instance_dir = paths::get_instance_dir(&instance_name, custom_path.as_deref());
    let saved = read_servers_dat_raw(&instance_dir)?;

    let found = saved.iter().find(|s| s.ip == ip && s.port == port);

    match found {
        None => {
            eprintln!("[servers] Server {}:{} no longer in servers.dat", ip, port);
            // Remove from store as well
            let mut store = load_server_store(&instance_dir);
            store.servers.remove(&format!("{}:{}", ip, port));
            store.updated_at = Some(chrono::Local::now().to_rfc3339());
            save_server_store(&instance_dir, &store);
            Ok(None)
        }
        Some(s) => {
            // Check logs for last_seen
            let key = format!("{}:{}", ip, port);
            let mut store = load_server_store(&instance_dir);
            let has_last_seen = store.servers.get(&key)
                .and_then(|s| s.last_seen.as_ref())
                .is_some();

            if !has_last_seen {
                if let Some(ts) = get_last_seen_from_logs(&instance_dir, &ip) {
                    let entry = store.servers.entry(key.clone()).or_insert_with(|| {
                        StoredServer {
                            saved_name: s.saved_name.clone(),
                            ip: ip.clone(),
                            port,
                            slp_data: None,
                            last_seen: None,
                            last_pinged: None,
                        }
                    });
                    entry.last_seen = Some(ts);
                    store.updated_at = Some(chrono::Local::now().to_rfc3339());
                    save_server_store(&instance_dir, &store);
                }
            }

            let cached_last_seen = store.servers.get(&key)
                .and_then(|s| s.last_seen.clone());
            let last_seen_raw = cached_last_seen;

            let result = tokio::time::timeout(Duration::from_secs(6), slp_ping(&ip, port)).await;
            match result {
                Ok(Ok(data)) => {
                    // Update store with fresh SLP data
                    let mut store = load_server_store(&instance_dir);
                    let entry = store.servers.entry(key).or_insert_with(|| {
                        StoredServer {
                            saved_name: s.saved_name.clone(),
                            ip: ip.clone(),
                            port,
                            slp_data: None,
                            last_seen: None,
                            last_pinged: None,
                        }
                    });
                    entry.slp_data = Some(data.clone());
                    entry.last_pinged = Some(chrono::Local::now().to_rfc3339());
                    entry.saved_name = s.saved_name.clone();
                    store.updated_at = Some(chrono::Local::now().to_rfc3339());
                    save_server_store(&instance_dir, &store);

                    Ok(Some(ServerEntry {
                        saved_name: s.saved_name.clone(),
                        ip: s.ip.clone(),
                        port: s.port,
                        status: "online".to_string(),
                        slp_data: Some(data),
                        last_seen: last_seen_raw,
                    }))
                }
                _ => {
                    let mut store = load_server_store(&instance_dir);
                    let entry = store.servers.entry(key).or_insert_with(|| {
                        StoredServer {
                            saved_name: s.saved_name.clone(),
                            ip: ip.clone(),
                            port,
                            slp_data: None,
                            last_seen: None,
                            last_pinged: None,
                        }
                    });
                    let cached_slp = entry.slp_data.clone();
                    entry.last_pinged = Some(chrono::Local::now().to_rfc3339());
                    entry.saved_name = s.saved_name.clone();
                    store.updated_at = Some(chrono::Local::now().to_rfc3339());
                    save_server_store(&instance_dir, &store);

                    Ok(Some(ServerEntry {
                        saved_name: s.saved_name.clone(),
                        ip: s.ip.clone(),
                        port: s.port,
                        status: "timeout".to_string(),
                        slp_data: cached_slp,
                        last_seen: last_seen_raw,
                    }))
                }
            }
        }
    }
}
