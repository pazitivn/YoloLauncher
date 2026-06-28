use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

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
        stream.read_exact(&mut buf).await.map_err(|e| format!("read error: {}", e))?;
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
    stream.read_exact(&mut buf).await.map_err(|e| format!("read string: {}", e))?;
    String::from_utf8(buf).map_err(|e| format!("UTF-8: {}", e))
}

async fn slp_ping(host: &str, port: u16) -> Result<String, String> {
    let addr = format!("{}:{}", host, port);
    let mut stream = TcpStream::connect(&addr)
        .await
        .map_err(|e| format!("connect: {}", e))?;

    let timeout = Duration::from_secs(10);

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
        stream.write_all(&packet).await.map_err(|e| format!("write HS: {}", e))?;

        let mut request = Vec::new();
        write_varint(&mut request, 0x00);
        let mut req_packet = Vec::new();
        write_varint(&mut req_packet, request.len() as i32);
        req_packet.extend_from_slice(&request);
        stream.write_all(&req_packet).await.map_err(|e| format!("write req: {}", e))?;

        let packet_len = read_varint_async(&mut stream).await?;
        println!("[SLP] Packet length: {}", packet_len);
        let packet_id = read_varint_async(&mut stream).await?;
        println!("[SLP] Packet ID: {}", packet_id);

        if packet_id != 0 {
            return Err(format!("Expected status response (0x00), got 0x{:02X}", packet_id));
        }

        let response = read_string_async(&mut stream).await?;
        Ok(response)
    })
    .await
    .map_err(|_| format!("SLP timeout: {}", addr))??;

    Ok(json_str)
}

#[tokio::main]
async fn main() {
    println!("=== SLP Ping Test: mc.funtime.su:25565 ===\n");

    match slp_ping("mc.funtime.su", 25565).await {
        Ok(json) => {
            println!("--- RAW JSON RESPONSE ---");
            // Pretty print
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&json) {
                println!("{}", serde_json::to_string_pretty(&v).unwrap());
            } else {
                println!("{}", json);
            }

            println!("\n--- PARSED FIELDS ---");
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&json) {
                // description
                println!("description field:");
                if let Some(d) = v.get("description") {
                    println!("  {:#?}", d);
                }
                // players
                println!("players field:");
                if let Some(p) = v.get("players") {
                    println!("  {:#?}", p);
                }
                // version
                println!("version field:");
                if let Some(ver) = v.get("version") {
                    println!("  {:#?}", ver);
                }
                // modinfo / forgeData
                println!("modinfo: {:?}", v.get("modinfo"));
                println!("forgeData: {:?}", v.get("forgeData"));
            }
        }
        Err(e) => {
            eprintln!("SLP ping FAILED: {}", e);
        }
    }
}
