use crate::persona_sync::home_dir;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::Message;

pub fn resolve_port_file() -> PathBuf {
    if let Ok(p) = std::env::var("AGY_DEVTOOLS_PORT_FILE") {
        if !p.is_empty() {
            return PathBuf::from(p);
        }
    }
    if let Ok(p) = std::env::var("AGY_PORT_FILE") {
        if !p.is_empty() {
            return PathBuf::from(p);
        }
    }
    let home = home_dir();
    let candidates: Vec<PathBuf> = if cfg!(windows) {
        let app_data = std::env::var("APPDATA")
            .ok()
            .filter(|s| !s.is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join("AppData").join("Roaming"));
        vec![
            app_data.join("antigravity").join("DevToolsActivePort"),
            app_data.join("Antigravity").join("DevToolsActivePort"),
        ]
    } else if cfg!(target_os = "macos") {
        let app_support = home.join("Library").join("Application Support");
        vec![
            app_support.join("antigravity").join("DevToolsActivePort"),
            app_support.join("Antigravity").join("DevToolsActivePort"),
        ]
    } else {
        let xdg = std::env::var("XDG_CONFIG_HOME")
            .ok()
            .filter(|s| !s.is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".config"));
        let mut list = vec![
            xdg.join("antigravity").join("DevToolsActivePort"),
            xdg.join("Antigravity").join("DevToolsActivePort"),
            home.join("snap")
                .join("antigravity")
                .join("current")
                .join(".config")
                .join("Antigravity")
                .join("DevToolsActivePort"),
            home.join("snap")
                .join("antigravity")
                .join("current")
                .join(".config")
                .join("antigravity")
                .join("DevToolsActivePort"),
        ];
        let flatpak_base = home.join(".var").join("app");
        if let Ok(rd) = fs::read_dir(&flatpak_base) {
            for entry in rd.flatten() {
                if let Some(name) = entry.file_name().to_str() {
                    if name.to_ascii_lowercase().contains("antigravity") {
                        list.push(
                            flatpak_base
                                .join(name)
                                .join("config")
                                .join("Antigravity")
                                .join("DevToolsActivePort"),
                        );
                        list.push(
                            flatpak_base
                                .join(name)
                                .join("config")
                                .join("antigravity")
                                .join("DevToolsActivePort"),
                        );
                    }
                }
            }
        }
        list
    };

    candidates
        .iter()
        .find(|p| p.exists())
        .cloned()
        .unwrap_or_else(|| candidates[0].clone())
}

pub fn parse_http_host_and_path(raw_url: &str) -> Option<(String, String)> {
    let rest = raw_url
        .strip_prefix("http://")
        .or_else(|| raw_url.strip_prefix("https://"))?;
    let (authority, path_and_query) = match rest.find('/') {
        Some(idx) => (&rest[..idx], &rest[idx..]),
        None => (rest, "/"),
    };
    let pathname = match path_and_query.find(['?', '#']) {
        Some(idx) => &path_and_query[..idx],
        None => path_and_query,
    };
    let host = if authority.starts_with('[') {
        let end_b = authority.find(']')?;
        authority[..=end_b].to_ascii_lowercase()
    } else {
        authority
            .split(':')
            .next()
            .unwrap_or("")
            .to_ascii_lowercase()
    };
    Some((
        host,
        if pathname.is_empty() {
            "/".to_string()
        } else {
            pathname.to_string()
        },
    ))
}

pub fn extract_url_origin(raw_url: &str) -> Option<String> {
    let lower = raw_url.trim().to_ascii_lowercase();
    if let Some(rest) = lower.strip_prefix("vscode-file://") {
        let host = rest.split('/').next().unwrap_or("vscode-app");
        return Some(format!("vscode-file://{host}"));
    }
    for scheme in ["http://", "https://"] {
        if let Some(rest) = raw_url.trim().strip_prefix(scheme) {
            let auth = rest.split('/').next().unwrap_or("");
            if !auth.is_empty() {
                return Some(format!("{scheme}{auth}"));
            }
        }
    }
    None
}

pub fn is_candidate_antigravity_url(raw_url: &str) -> bool {
    let trimmed = raw_url.trim();
    if trimmed.is_empty() {
        return false;
    }
    let lower = trimmed.to_ascii_lowercase();
    if lower.starts_with("devtools://")
        || lower.starts_with("chrome-extension://")
        || lower.starts_with("about:")
        || lower.starts_with("data:")
        || lower.starts_with("blob:")
    {
        return false;
    }
    if lower.starts_with("vscode-file:") || lower.starts_with("file:") {
        return lower.contains("workbench") || lower.contains("antigravity");
    }
    let Some((hostname, p)) = parse_http_host_and_path(trimmed) else {
        return false;
    };
    if hostname != "127.0.0.1" && hostname != "localhost" && hostname != "[::1]" {
        return false;
    }
    p == "/"
        || p == "/launchpad"
        || p.starts_with("/launchpad/")
        || p == "/workbench"
        || p.starts_with("/workbench/")
        || p.starts_with("/c/")
        || p.starts_with("/p/")
        || p == "/projects"
        || p.starts_with("/projects/")
        || p == "/settings"
        || p.starts_with("/settings/")
        || p == "/manager"
        || p.starts_with("/manager/")
        || p == "/workspace"
        || p.starts_with("/workspace/")
        || p.starts_with("/w/")
        || p == "/chat"
        || p.starts_with("/chat/")
}

fn decode_chunked_http_body(raw: &[u8]) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity(raw.len());
    let mut pos = 0usize;
    while pos < raw.len() {
        let Some(rel_crlf) = raw[pos..].windows(2).position(|w| w == b"\r\n") else {
            break;
        };
        let size_line = std::str::from_utf8(&raw[pos..pos + rel_crlf])
            .map_err(|_| "Invalid chunked size header".to_string())?;
        let hex_part = size_line.split(';').next().unwrap_or("").trim();
        let chunk_len = usize::from_str_radix(hex_part, 16)
            .map_err(|_| format!("Invalid chunk hex length: {hex_part}"))?;
        pos += rel_crlf + 2;
        if chunk_len == 0 {
            break;
        }
        if pos + chunk_len > raw.len() {
            return Err("Truncated HTTP chunked body".to_string());
        }
        out.extend_from_slice(&raw[pos..pos + chunk_len]);
        pos += chunk_len;
        if raw[pos..].starts_with(b"\r\n") {
            pos += 2;
        }
    }
    Ok(out)
}

pub async fn fetch_json_loopback(port: u16, path: &str, timeout_ms: u64) -> Result<Value, String> {
    let fut = async {
        let mut stream = TcpStream::connect(("127.0.0.1", port))
            .await
            .map_err(|e| format!("TCP connect failed: {e}"))?;
        let req = format!(
            "GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAccept: application/json\r\nConnection: close\r\n\r\n"
        );
        stream
            .write_all(req.as_bytes())
            .await
            .map_err(|e| format!("HTTP write failed: {e}"))?;
        let mut buf = Vec::with_capacity(8192);
        let mut chunk = [0u8; 4096];
        let mut known_hdr_end: Option<usize> = None;
        let mut expected_body_len: Option<usize> = None;
        let mut is_chunked = false;

        loop {
            let n = stream
                .read(&mut chunk)
                .await
                .map_err(|e| format!("HTTP read failed: {e}"))?;
            if n == 0 {
                break;
            }
            buf.extend_from_slice(&chunk[..n]);

            if known_hdr_end.is_none() {
                if let Some(he) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
                    known_hdr_end = Some(he);
                    let hdr_s = String::from_utf8_lossy(&buf[..he]);
                    for line in hdr_s.lines() {
                        let lower = line.to_ascii_lowercase();
                        if let Some(rest) = lower.strip_prefix("content-length:") {
                            if let Ok(cl) = rest.trim().parse::<usize>() {
                                expected_body_len = Some(cl);
                            }
                        } else if lower.starts_with("transfer-encoding:")
                            && lower.contains("chunked")
                        {
                            is_chunked = true;
                        }
                    }
                }
            }

            if let Some(he) = known_hdr_end {
                let body_so_far = &buf[he + 4..];
                if let Some(cl) = expected_body_len {
                    if body_so_far.len() >= cl {
                        break;
                    }
                } else if is_chunked
                    && (body_so_far.ends_with(b"0\r\n\r\n")
                        || body_so_far.windows(5).any(|w| w == b"0\r\n\r\n"))
                {
                    break;
                }
            }

            if buf.len() > 16 * 1024 * 1024 {
                return Err("HTTP response too large".to_string());
            }
        }

        let Some(hdr_end) = known_hdr_end.or_else(|| buf.windows(4).position(|w| w == b"\r\n\r\n"))
        else {
            return Err("Malformed HTTP response headers".to_string());
        };
        let hdr_str = String::from_utf8_lossy(&buf[..hdr_end]);
        let status_ok = hdr_str
            .lines()
            .next()
            .map(|l| l.contains(" 200 "))
            .unwrap_or(false);
        if !status_ok {
            return Err(format!(
                "Non-200 HTTP response from CDP port {port}: {}",
                hdr_str.lines().next().unwrap_or("")
            ));
        }
        let raw_body = &buf[hdr_end + 4..];
        let decoded = if is_chunked {
            decode_chunked_http_body(raw_body)?
        } else if let Some(cl) = expected_body_len {
            raw_body[..cl.min(raw_body.len())].to_vec()
        } else {
            raw_body.to_vec()
        };
        let body_str = String::from_utf8(decoded).map_err(|e| format!("UTF-8 error: {e}"))?;
        let stripped = body_str.strip_prefix('\u{feff}').unwrap_or(&body_str);
        serde_json::from_str::<Value>(stripped).map_err(|e| format!("JSON parse error: {e}"))
    };

    tokio::time::timeout(Duration::from_millis(timeout_ms), fut)
        .await
        .map_err(|_| "HTTP timeout".to_string())?
}

pub async fn evaluate_cdp_page(
    ws_url: &str,
    expression: &str,
    await_promise: bool,
    timeout_ms: u64,
) -> Result<Value, String> {
    let fut = async {
        let (mut ws, _) = tokio_tungstenite::connect_async(ws_url)
            .await
            .map_err(|e| format!("WebSocket connection error: {e}"))?;
        let payload = json!({
            "id": 1,
            "method": "Runtime.evaluate",
            "params": {
                "expression": expression,
                "returnByValue": true,
                "awaitPromise": await_promise
            }
        });
        ws.send(Message::Text(payload.to_string().into()))
            .await
            .map_err(|e| format!("WebSocket send error: {e}"))?;

        while let Some(msg_res) = ws.next().await {
            let msg = msg_res.map_err(|e| format!("WebSocket read error: {e}"))?;
            if let Message::Text(txt) = msg {
                if let Ok(parsed) = serde_json::from_str::<Value>(&txt) {
                    if parsed.get("id").and_then(|v| v.as_i64()) == Some(1) {
                        let _ = ws.close(None).await;
                        if let Some(err_obj) = parsed.get("error") {
                            let m = err_obj
                                .get("message")
                                .and_then(|v| v.as_str())
                                .unwrap_or("CDP error");
                            return Err(m.to_string());
                        }
                        if let Some(exc) =
                            parsed.get("result").and_then(|r| r.get("exceptionDetails"))
                        {
                            let m = exc
                                .get("text")
                                .and_then(|v| v.as_str())
                                .unwrap_or("Runtime exception");
                            return Err(m.to_string());
                        }
                        let val = parsed
                            .get("result")
                            .and_then(|r| r.get("result"))
                            .and_then(|r| r.get("value"))
                            .cloned()
                            .unwrap_or(Value::Null);
                        return Ok(val);
                    }
                }
            }
        }
        Err("WebSocket closed before CDP response".to_string())
    };

    tokio::time::timeout(Duration::from_millis(timeout_ms), fut)
        .await
        .map_err(|_| "CDP evaluation timeout".to_string())?
}
