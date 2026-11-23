use base64::Engine as _;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio_tungstenite::tungstenite::Message;

fn repo_root() -> PathBuf {
    // CARGO_MANIFEST_DIR is `<repo>/rust/crates/agy-theme`
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .expect("repo root")
        .to_path_buf()
}

fn agy_bin() -> PathBuf {
    PathBuf::from(env!("CARGO_BIN_EXE_agy-theme"))
}

fn make_sandbox(prefix: &str) -> PathBuf {
    let unique = format!(
        "{}-{}-{}",
        prefix,
        std::process::id(),
        agy_core::security::random_hex_4()
    );
    let dir = std::env::temp_dir().join(unique);
    fs::create_dir_all(&dir).expect("create sandbox");
    dir
}

fn sha256_file(p: &Path) -> String {
    let bytes = fs::read(p).expect("read file for sha256");
    hex::encode(Sha256::digest(&bytes))
}

#[test]
fn test_01_build_payload_sha256_parity_and_svg_xss_guard() {
    let root = repo_root();
    let sandbox = make_sandbox("agy-rust-parity-build");

    // 1. Hybrid mode byte-for-byte parity vs Node.js
    let node_hybrid = sandbox.join("node_hybrid.js");
    let rust_hybrid = sandbox.join("rust_hybrid.js");

    let st_node = Command::new("node")
        .arg(root.join("scripts").join("build_payload.js"))
        .arg("--out")
        .arg(&node_hybrid)
        .current_dir(&root)
        .status()
        .expect("run node build_payload.js");
    assert!(st_node.success(), "node build_payload.js hybrid failed");

    let st_rust = Command::new(agy_bin())
        .arg("build-payload")
        .arg("--out")
        .arg(&rust_hybrid)
        .current_dir(&root)
        .status()
        .expect("run rust build-payload");
    assert!(st_rust.success(), "rust build-payload hybrid failed");

    assert_eq!(
        sha256_file(&node_hybrid),
        sha256_file(&rust_hybrid),
        "Hybrid payload must match 100% byte-for-byte with Node.js"
    );

    // 2. --inline-all mode byte-for-byte parity vs Node.js
    let node_inline = sandbox.join("node_inline.js");
    let rust_inline = sandbox.join("rust_inline.js");

    let st_node_in = Command::new("node")
        .arg(root.join("scripts").join("build_payload.js"))
        .arg("--inline-all")
        .arg("--out")
        .arg(&node_inline)
        .current_dir(&root)
        .status()
        .expect("run node build_payload.js --inline-all");
    assert!(st_node_in.success());

    let st_rust_in = Command::new(agy_bin())
        .arg("build-payload")
        .arg("--inline-all")
        .arg("--out")
        .arg(&rust_inline)
        .current_dir(&root)
        .status()
        .expect("run rust build-payload --inline-all");
    assert!(st_rust_in.success());

    assert_eq!(
        sha256_file(&node_inline),
        sha256_file(&rust_inline),
        "Inline-all payload must match 100% byte-for-byte with Node.js"
    );

    // 3. SVG XSS Guard must exit with code 2
    let xss_dir = sandbox.join("xss_themes");
    fs::create_dir_all(&xss_dir).unwrap();
    let evil_svg = xss_dir.join("evil.svg");
    fs::write(
        &evil_svg,
        "<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>",
    )
    .unwrap();
    let evil_themes = xss_dir.join("themes.json");
    fs::write(
        &evil_themes,
        json!({
            "Evil": {
                "cornerSvg": "evil.svg"
            }
        })
        .to_string(),
    )
    .unwrap();

    let out_xss = Command::new(agy_bin())
        .args([
            "build-payload",
            "--themes",
            &evil_themes.to_string_lossy(),
            "--out",
            &sandbox.join("evil_out.js").to_string_lossy(),
        ])
        .current_dir(&root)
        .output()
        .expect("run build-payload on XSS svg");

    assert_eq!(out_xss.status.code(), Some(2));
    let stderr = String::from_utf8_lossy(&out_xss.stderr);
    assert!(stderr.contains("Security violation"));

    let _ = fs::remove_dir_all(&sandbox);
}

#[test]
fn test_02_session_start_and_pre_invocation_hooks_parity() {
    let root = repo_root();
    let sandbox = make_sandbox("agy-rust-parity-hooks");
    let cfg_path = sandbox.join("theme_config.json");
    let bak_path = sandbox.join("backup.json");
    let pid_path = sandbox.join("daemon.pid");
    let state_dir = sandbox.join("persona_state");
    fs::create_dir_all(&state_dir).unwrap();

    // Seed overnight privacyShieldActive=true + workspace profile
    fs::write(
        &cfg_path,
        serde_json::to_string_pretty(&json!({
            "themeName": "🦋 Trùng Trụ — Shinobu Kocho",
            "masterPersona": "yoriichi",
            "privacyShieldActive": true,
            "workspaceProfiles": {
                "acme-billing-api": {
                    "themeName": "📿 Nham Trụ — Gyomei Himejima",
                    "bubbleName": "📿 Nham Trụ — Gyomei Himejima",
                    "masterPersona": "gyomei",
                    "aiPersonaMode": "subtle",
                    "dimming": 44,
                    "fxDensity": 60,
                    "chibiEnabled": false
                }
            }
        }))
        .unwrap(),
    )
    .unwrap();

    // 1. SessionStart hook clears privacyShieldActive & applies workspace profile
    let mut ss_child = Command::new(agy_bin())
        .arg("session-start-hook")
        .current_dir(&root)
        .env("PLUGIN_ROOT", &root)
        .env("AGY_CONFIG_PATH", &cfg_path)
        .env("AGY_BACKUP_CONFIG_PATH", &bak_path)
        .env("AGY_PID_FILE", &pid_path)
        .env("AGY_SKIP_DAEMON_SPAWN", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();

    ss_child
        .stdin
        .take()
        .unwrap()
        .write_all(
            json!({
                "conversationId": "00000000-0000-4000-8000-000000000001",
                "workspacePaths": ["file:///workspace/acme-billing-api"],
                "hookEventName": "SessionStart"
            })
            .to_string()
            .as_bytes(),
        )
        .unwrap();

    let ss_out = ss_child.wait_with_output().unwrap();
    assert!(ss_out.status.success());
    assert_eq!(String::from_utf8_lossy(&ss_out.stdout), "{}\n");

    let updated_cfg: Value = serde_json::from_str(&fs::read_to_string(&cfg_path).unwrap()).unwrap();
    assert_eq!(updated_cfg["privacyShieldActive"], Value::Bool(false));
    assert_eq!(updated_cfg["masterPersona"], "gyomei");
    assert_eq!(updated_cfg["dimming"], 44);

    // 2. PreInvocation Turn 0: silent injection (no metadata.user_markdown)
    let tr_dir = sandbox.join("conv1").join(".system_generated").join("logs");
    fs::create_dir_all(&tr_dir).unwrap();
    let tr_path = tr_dir.join("transcript.jsonl");
    fs::write(
        &tr_path,
        "{\"step_index\":0,\"source\":\"USER_EXPLICIT\",\"type\":\"USER_INPUT\",\"content\":\"hello\"}\n",
    )
    .unwrap();

    let run_pre = |inv_num: i64, last_input: &str| -> Value {
        let mut child = Command::new(agy_bin())
            .arg("pre-invocation-hook")
            .current_dir(&root)
            .env("PLUGIN_ROOT", &root)
            .env("AGY_CONFIG_PATH", &cfg_path)
            .env("AGY_PERSONA_STATE_DIR", &state_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        child
            .stdin
            .take()
            .unwrap()
            .write_all(
                json!({
                    "conversationId": "00000000-0000-4000-8000-000000000001",
                    "invocationNum": inv_num,
                    "lastUserInput": last_input,
                    "transcriptPath": tr_path.to_string_lossy(),
                    "workspacePaths": ["file:///workspace/acme-billing-api"]
                })
                .to_string()
                .as_bytes(),
            )
            .unwrap();
        let out = child.wait_with_output().unwrap();
        assert!(out.status.success());
        serde_json::from_str(&String::from_utf8_lossy(&out.stdout)).unwrap()
    };

    let t0 = run_pre(0, "hello");
    let sys_msg_0 = t0["injectSteps"][0]["systemMessage"]["systemMessage"]
        .as_str()
        .expect("Turn 0 must inject persona");
    assert!(sys_msg_0.contains("[AGY_PERSONA_SHIFT id=\"gyomei\" mode=\"subtle\"]"));
    assert!(
        t0["injectSteps"][0]["systemMessage"]
            .get("metadata")
            .is_none(),
        "Turn 0 silent init must NOT include visible metadata"
    );

    // 3. Turn 1 Fast-Path: returns {}
    let t1 = run_pre(1, "next step");
    assert_eq!(t1, json!({}));

    // 4. False-positive CHECKPOINT inside tool_calls must NOT trigger reinject
    let mut f = fs::OpenOptions::new().append(true).open(&tr_path).unwrap();
    writeln!(
        f,
        "{{\"step_index\":1,\"type\":\"PLANNER_RESPONSE\",\"tool_calls\":[{{\"name\":\"save_memory\",\"args\":{{\"type\":\"CHECKPOINT\"}}}}]}}"
    )
    .unwrap();
    drop(f);
    let t2 = run_pre(2, "");
    assert_eq!(t2, json!({}));

    // 5. Real top-level CHECKPOINT (> 70KB line) MUST silently recover persona
    let big_summary = "x".repeat(75_000);
    let mut f = fs::OpenOptions::new().append(true).open(&tr_path).unwrap();
    writeln!(
        f,
        "{{\"step_index\":2,\"content\":\"{big_summary}\",\"type\":\"CHECKPOINT\",\"status\":\"DONE\"}}"
    )
    .unwrap();
    drop(f);
    let t3 = run_pre(3, "");
    assert!(
        t3["injectSteps"][0]["systemMessage"]["systemMessage"]
            .as_str()
            .unwrap_or("")
            .contains("id=\"gyomei\""),
        "Must recover persona after >70KB top-level CHECKPOINT"
    );

    // 6. Oversize > 2.2MB stdin stream must NOT cause EPIPE
    let huge_prompt = "A".repeat(2_300_000);
    let mut huge_child = Command::new(agy_bin())
        .arg("pre-invocation-hook")
        .current_dir(&root)
        .env("PLUGIN_ROOT", &root)
        .env("AGY_CONFIG_PATH", &cfg_path)
        .env("AGY_PERSONA_STATE_DIR", &state_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let payload_2mb = format!(
        "{{\"conversationId\":\"00000000-0000-4000-8000-000000000099\",\"invocationNum\":0,\"lastUserInput\":\"{huge_prompt}\"}}"
    );
    huge_child
        .stdin
        .take()
        .unwrap()
        .write_all(payload_2mb.as_bytes())
        .expect("Writing 2.3MB to stdin must not fail with EPIPE");
    let huge_out = huge_child.wait_with_output().unwrap();
    assert!(huge_out.status.success());
    let huge_json: Value =
        serde_json::from_str(&String::from_utf8_lossy(&huge_out.stdout)).unwrap();
    assert!(huge_json.get("injectSteps").is_some());

    let _ = fs::remove_dir_all(&sandbox);
}

#[test]
fn test_03_mcp_server_dual_framing_and_forge_parity() {
    let root = repo_root();
    let sandbox = make_sandbox("agy-rust-parity-mcp");
    let cfg_path = sandbox.join("theme_config.json");
    let bak_path = sandbox.join("backup.json");
    let pid_path = sandbox.join("daemon.pid");

    // Prepare valid 1x1 PNG & fake text file
    let valid_png = sandbox.join("sample.png");
    let png_bytes = base64::engine::general_purpose::STANDARD
        .decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
        .unwrap();
    fs::write(&valid_png, &png_bytes).unwrap();

    let fake_img = sandbox.join("fake.png");
    fs::write(&fake_img, b"not_an_image_at_all_123456").unwrap();

    // Test 1: Newline-delimited JSON framing across all core tools
    let mut child = Command::new(agy_bin())
        .arg("mcp-server")
        .current_dir(&root)
        .env("PLUGIN_ROOT", &root)
        .env("AGY_CONFIG_PATH", &cfg_path)
        .env("AGY_BACKUP_CONFIG_PATH", &bak_path)
        .env("AGY_PID_FILE", &pid_path)
        .env("AGY_SKIP_DAEMON_SPAWN", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();

    let mut stdin = child.stdin.take().unwrap();
    let requests = vec![
        json!({ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": { "protocolVersion": "2025-06-18" } }),
        json!({ "jsonrpc": "2.0", "method": "notifications/initialized", "params": {} }),
        json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {} }),
        json!({ "jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": { "name": "switch_theme", "arguments": { "themeQuery": "Nham Tru", "dimming": 48 } } }),
        json!({ "jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": { "name": "forge_theme_from_image", "arguments": { "imagePath": fake_img.to_string_lossy() } } }),
        json!({ "jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": { "name": "forge_theme_from_image", "arguments": { "imagePath": "\\\\evil\\share\\a.png" } } }),
        json!({ "jsonrpc": "2.0", "id": 6, "method": "tools/call", "params": { "name": "forge_theme_from_image", "arguments": { "imagePath": valid_png.to_string_lossy(), "themeName": "Crystal Forge" } } }),
        json!({ "jsonrpc": "2.0", "id": 7, "method": "resources/read", "params": { "uri": "ui://agy-theme/studio.html" } }),
    ];
    for r in &requests {
        writeln!(stdin, "{r}").unwrap();
    }
    drop(stdin);

    let out = child.wait_with_output().unwrap();
    assert!(out.status.success());
    let lines: Vec<Value> = String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| serde_json::from_str(l).unwrap())
        .collect();
    assert_eq!(lines.len(), 7);
    assert_eq!(lines[0]["result"]["protocolVersion"], "2025-06-18");
    assert_eq!(lines[1]["result"]["tools"].as_array().unwrap().len(), 7);
    assert!(
        lines[2]["result"]["structuredContent"]["activeConfig"]["themeName"]
            .as_str()
            .unwrap()
            .contains("Gyomei")
    );
    assert_eq!(lines[3]["result"]["isError"], true); // fake magic bytes blocked
    assert_eq!(lines[4]["result"]["isError"], true); // UNC path blocked
    assert_eq!(
        lines[5]["result"]["structuredContent"]["activeConfig"]["themeName"],
        "Crystal Forge"
    );
    assert!(lines[6]["result"]["contents"][0]["text"]
        .as_str()
        .unwrap()
        .contains("<!DOCTYPE html>"));

    // Test 2: Content-Length header framing
    let mut cl_child = Command::new(agy_bin())
        .arg("mcp-server")
        .current_dir(&root)
        .env("PLUGIN_ROOT", &root)
        .env("AGY_CONFIG_PATH", &cfg_path)
        .env("AGY_SKIP_DAEMON_SPAWN", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let mut cl_in = cl_child.stdin.take().unwrap();
    let ping_msg = json!({ "jsonrpc": "2.0", "id": 42, "method": "ping" }).to_string();
    write!(
        cl_in,
        "Content-Length: {}\r\n\r\n{}",
        ping_msg.len(),
        ping_msg
    )
    .unwrap();
    drop(cl_in);
    let cl_out = cl_child.wait_with_output().unwrap();
    let cl_str = String::from_utf8_lossy(&cl_out.stdout);
    assert!(cl_str.starts_with("Content-Length: "));
    assert!(cl_str.contains("\"id\":42"));

    let _ = fs::remove_dir_all(&sandbox);
}

#[test]
fn test_04_daemon_http_sse_cdp_verify_and_uninstall_e2e() {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .unwrap();

    rt.block_on(async {
        let root = repo_root();
        let sandbox = make_sandbox("agy-rust-parity-daemon");
        let cfg_path = sandbox.join("theme_config.json");
        let bak_path = sandbox.join("backup.json");
        let pid_path = sandbox.join("daemon.pid");
        let port_file = sandbox.join("DevToolsActivePort");
        let brain_dir = sandbox.join("brain");
        let cid = "11111111-2222-4333-8444-555555555555";
        let tr_dir = brain_dir.join(cid).join(".system_generated").join("logs");
        fs::create_dir_all(&tr_dir).unwrap();
        let tr_file = tr_dir.join("transcript.jsonl");
        fs::write(
            &tr_file,
            "{\"step_index\":0,\"type\":\"USER_INPUT\",\"status\":\"DONE\",\"content\":\"hi\"}\n",
        )
        .unwrap();

        // Ensure payload exists in repo dist/
        let _ = Command::new(agy_bin())
            .arg("build-payload")
            .current_dir(&root)
            .status();

        // Start Mock CDP HTTP + WS server
        let cdp_listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let cdp_port = cdp_listener.local_addr().unwrap().port();
        fs::write(&port_file, format!("{cdp_port}\n/devtools/browser/mock\n")).unwrap();

        let captured_token: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
        let cleaned_via_uninstall: Arc<Mutex<bool>> = Arc::new(Mutex::new(false));

        let cap_tok_clone = captured_token.clone();
        let cleaned_clone = cleaned_via_uninstall.clone();

        let mock_cdp_task = tokio::spawn(async move {
            while let Ok((mut sock, _)) = cdp_listener.accept().await {
                let cap_tok = cap_tok_clone.clone();
                let cl_flag = cleaned_clone.clone();
                tokio::spawn(async move {
                    let mut peek_buf = [0u8; 1024];
                    let Ok(n) = sock.peek(&mut peek_buf).await else {
                        return;
                    };
                    let head = String::from_utf8_lossy(&peek_buf[..n]);
                    if head.to_ascii_lowercase().contains("upgrade: websocket") {
                        let Ok(mut ws) = tokio_tungstenite::accept_async(sock).await else {
                            return;
                        };
                        while let Some(Ok(Message::Text(txt))) = ws.next().await {
                            let Ok(req) = serde_json::from_str::<Value>(&txt) else {
                                continue;
                            };
                            let id = req.get("id").and_then(|v| v.as_u64()).unwrap_or(0);
                            let method = req.get("method").and_then(|v| v.as_str()).unwrap_or("");
                            let expr = req
                                .get("params")
                                .and_then(|p| p.get("expression"))
                                .and_then(|s| s.as_str())
                                .unwrap_or("");

                            if method == "Page.addScriptToEvaluateOnNewDocument" {
                                let _ = ws
                                    .send(Message::Text(
                                        json!({ "id": id, "result": { "identifier": "doc-1" } })
                                            .to_string()
                                            .into(),
                                    ))
                                    .await;
                            } else if method == "Runtime.evaluate" {
                                if expr.contains("const __AGY_INJECT_BOOT__") {
                                    if let Some(pos) = expr.find("\"token\":\"") {
                                        let rest = &expr[pos + 9..];
                                        if rest.len() >= 64 {
                                            *cap_tok.lock().unwrap() = Some(rest[..64].to_string());
                                        }
                                    }
                                    let _ = ws
                                        .send(Message::Text(
                                            json!({ "id": id, "result": { "result": { "type": "undefined" } } })
                                                .to_string()
                                                .into(),
                                        ))
                                        .await;
                                } else if expr.contains("payloadReady") {
                                    // DOM_VERIFICATION_PROBE_EXPR
                                    let _ = ws
                                        .send(Message::Text(
                                            json!({
                                                "id": id,
                                                "result": {
                                                    "result": {
                                                        "type": "object",
                                                        "value": {
                                                            "matched": true,
                                                            "hasBody": true,
                                                            "payloadReady": false,
                                                            "readyState": "complete",
                                                            "origin": "http://127.0.0.1:4321"
                                                        }
                                                    }
                                                }
                                            })
                                            .to_string()
                                            .into(),
                                        ))
                                        .await;
                                } else if expr.contains("purgeStorage") {
                                    // uninstall cleanupPage
                                    *cl_flag.lock().unwrap() = true;
                                    let _ = ws
                                        .send(Message::Text(
                                            json!({ "id": id, "result": { "result": { "value": true } } })
                                                .to_string()
                                                .into(),
                                        ))
                                        .await;
                                } else if expr.contains("userBubbleEmptyChildCount") {
                                    // verify_cdp INSPECT_EXPR
                                    let _ = ws
                                        .send(Message::Text(
                                            json!({
                                                "id": id,
                                                "result": {
                                                    "result": {
                                                        "value": {
                                                            "isAntigravityDom": true,
                                                            "themeActive": true,
                                                            "hasLiveBlurRule": false,
                                                            "leakedWindowToken": false,
                                                            "composerPresent": true,
                                                            "hudBarPresent": true,
                                                            "cinemaBtnPresent": true,
                                                            "kaguraBtnPresent": true,
                                                            "cinemaDirectorAlive": true,
                                                            "bioAudioAlive": true,
                                                            "tokenHudStyleAlive": true,
                                                            "shellFound": true,
                                                            "shellHoleActive": null,
                                                            "wpEnabled": true,
                                                            "shellAfterBgPresent": true,
                                                            "chibiSkillBarPresent": false,
                                                            "userBubbleEmptyChildCount": 0,
                                                            "userBubbleMissingGuardCount": 0,
                                                            "masterPersona": "yoriichi",
                                                            "yoriichiIdentityValid": true,
                                                            "moduleChecks": {
                                                                "sec": true,
                                                                "themeCore": true,
                                                                "themeForge": true,
                                                                "fxModes": true,
                                                                "chibiAura": true,
                                                                "breathingSkills": true,
                                                                "semanticIcons": true,
                                                                "squadRaid": true,
                                                                "tokenHud": true,
                                                                "cinemaDirector": true,
                                                                "bioAudio": true
                                                            }
                                                        }
                                                    }
                                                }
                                            })
                                            .to_string()
                                            .into(),
                                        ))
                                        .await;
                                } else {
                                    let _ = ws
                                        .send(Message::Text(
                                            json!({ "id": id, "result": { "result": { "value": true } } })
                                                .to_string()
                                                .into(),
                                        ))
                                        .await;
                                }
                            } else {
                                let _ = ws
                                    .send(Message::Text(
                                        json!({ "id": id, "result": {} }).to_string().into(),
                                    ))
                                    .await;
                            }
                        }
                    } else {
                        let mut dummy = [0u8; 2048];
                        let _ = sock.read(&mut dummy).await;
                        let body = json!([{
                            "id": "page-agy-1",
                            "type": "page",
                            "title": "Antigravity",
                            "url": "http://127.0.0.1:4321/workbench",
                            "webSocketDebuggerUrl": format!("ws://127.0.0.1:{cdp_port}/devtools/page/page-agy-1")
                        }])
                        .to_string();
                        let resp = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            body.len(),
                            body
                        );
                        let _ = sock.write_all(resp.as_bytes()).await;
                    }
                });
            }
        });

        // Spawn Rust daemon
        let mut daemon_child = Command::new(agy_bin())
            .arg("daemon")
            .current_dir(&root)
            .env("PLUGIN_ROOT", &root)
            .env("AGY_CONFIG_PATH", &cfg_path)
            .env("AGY_BACKUP_CONFIG_PATH", &bak_path)
            .env("AGY_PID_FILE", &pid_path)
            .env("AGY_DEVTOOLS_PORT_FILE", &port_file)
            .env("AGY_BRAIN_DIR", &brain_dir)
            .env("AGY_DAEMON_STDOUT", "1")
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn rust daemon");

        let stdout = daemon_child.stdout.take().unwrap();
        let (port_tx, port_rx) = tokio::sync::oneshot::channel::<u16>();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            let mut tx_opt = Some(port_tx);
            for line in reader.lines().map_while(Result::ok) {
                if let Some(idx) = line.find("http://127.0.0.1:") {
                    let after = &line[idx + "http://127.0.0.1:".len()..];
                    let p_str: String = after.chars().take_while(|c| c.is_ascii_digit()).collect();
                    if let Ok(p) = p_str.parse::<u16>() {
                        if let Some(tx) = tx_opt.take() {
                            let _ = tx.send(p);
                        }
                    }
                }
            }
        });

        let asset_port = tokio::time::timeout(Duration::from_secs(5), port_rx)
            .await
            .expect("daemon port timeout")
            .expect("daemon port");

        // Wait for CDP injection to capture EPHEMERAL_TOKEN
        let start = Instant::now();
        let token = loop {
            if let Some(tok) = captured_token.lock().unwrap().clone() {
                break tok;
            }
            assert!(
                start.elapsed() < Duration::from_secs(6),
                "Timed out waiting for daemon CDP injection"
            );
            tokio::time::sleep(Duration::from_millis(80)).await;
        };
        assert_eq!(token.len(), 64);

        // Check anti-DNS-rebinding (Host: evil.com -> 403)
        let send_raw_http = |req_raw: String| async move {
            let mut s = tokio::net::TcpStream::connect(("127.0.0.1", asset_port))
                .await
                .unwrap();
            s.write_all(req_raw.as_bytes()).await.unwrap();
            let mut b = Vec::new();
            s.read_to_end(&mut b).await.unwrap();
            String::from_utf8_lossy(&b).into_owned()
        };

        let dns_resp = send_raw_http(format!(
            "GET /assets/shinobu_ornament.svg HTTP/1.1\r\nHost: localhost:{asset_port}\r\n\r\n"
        ))
        .await;
        assert!(dns_resp.starts_with("HTTP/1.1 403"));

        // Check valid asset serving -> 200 OK
        let asset_resp = send_raw_http(format!(
            "HEAD /assets/shinobu_ornament.svg HTTP/1.1\r\nHost: 127.0.0.1:{asset_port}\r\n\r\n"
        ))
        .await;
        assert!(asset_resp.starts_with("HTTP/1.1 200"));

        // Check telemetry without token -> 403, with token -> 200 OK
        let unauth_resp = send_raw_http(format!(
            "GET /__telemetry?cid={cid} HTTP/1.1\r\nHost: 127.0.0.1:{asset_port}\r\n\r\n"
        ))
        .await;
        assert!(unauth_resp.starts_with("HTTP/1.1 403"));

        let auth_resp = send_raw_http(format!(
            "GET /__telemetry?cid={cid} HTTP/1.1\r\nHost: 127.0.0.1:{asset_port}\r\nX-Agy-Token: {token}\r\n\r\n"
        ))
        .await;
        assert!(auth_resp.starts_with("HTTP/1.1 200"));
        let body_part = auth_resp.split("\r\n\r\n").nth(1).unwrap_or("{}");
        let snap: Value = serde_json::from_str(body_part).unwrap();
        assert_eq!(snap["ok"], true);
        assert_eq!(snap["turnCount"], 1);

        // Run verify-cdp against live daemon + mock CDP!
        let verify_out = Command::new(agy_bin())
            .arg("verify-cdp")
            .current_dir(&root)
            .env("AGY_DAEMON_PID_FILE", &pid_path)
            .env("AGY_DEVTOOLS_PORT_FILE", &port_file)
            .output()
            .expect("run verify-cdp");
        assert!(
            verify_out.status.success(),
            "verify-cdp failed: {}",
            String::from_utf8_lossy(&verify_out.stderr)
        );
        assert!(String::from_utf8_lossy(&verify_out.stdout).contains("[verify-cdp] PASS:"));

        // Run uninstall against live daemon + mock CDP!
        let _ = daemon_child.kill();
        let _ = daemon_child.wait();
        let uninst_out = Command::new(agy_bin())
            .args(["uninstall", "--purge"])
            .current_dir(&sandbox)
            .env("AGY_CONFIG_PATH", &cfg_path)
            .env("AGY_BACKUP_CONFIG_PATH", &bak_path)
            .env("AGY_PID_FILE", &pid_path)
            .env("AGY_DEVTOOLS_PORT_FILE", &port_file)
            .env("AGY_UNINSTALL_SHORTCUT_DIRS", "")
            .output()
            .expect("run uninstall");
        assert!(uninst_out.status.success());
        assert!(*cleaned_via_uninstall.lock().unwrap());

        mock_cdp_task.abort();
        let _ = fs::remove_dir_all(&sandbox);
    });
}

#[test]
fn test_05_clean_edition_exporter_pure_mit() {
    let root = repo_root();
    let sandbox = make_sandbox("agy-rust-parity-clean");
    let out_clean = sandbox.join("clean-edition");

    let out = Command::new(agy_bin())
        .args([
            "export-clean-edition",
            "--out",
            &out_clean.to_string_lossy(),
        ])
        .current_dir(&root)
        .output()
        .expect("run export-clean-edition");
    assert!(
        out.status.success(),
        "export-clean-edition failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );

    let p_json: Value =
        serde_json::from_str(&fs::read_to_string(out_clean.join("plugin.json")).unwrap()).unwrap();
    assert_eq!(p_json["name"], "antigravity-clean-theme");

    let jpg = fs::read(
        out_clean
            .join("themes")
            .join("assets")
            .join("yoriichi_avatar.jpg"),
    )
    .unwrap();
    assert_eq!(&jpg[0..3], &[0xff, 0xd8, 0xff]);
    assert!(out_clean.join("dist").join("theme_payload.js").is_file());

    let _ = fs::remove_dir_all(&sandbox);
}

#[test]
fn test_06_multi_session_subagent_and_token_isolation() {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .unwrap();

    rt.block_on(async {
        let root = repo_root();
        let sandbox = make_sandbox("agy-rust-session-isolation");
        let cfg_path = sandbox.join("theme_config.json");
        let bak_path = sandbox.join("backup.json");
        let pid_path = sandbox.join("daemon.pid");
        let port_file = sandbox.join("DevToolsActivePort");
        let brain_dir = sandbox.join("brain");

        let cid_a = "aaaa1111-1111-4111-8111-111111111111";
        let cid_b = "bbbb2222-2222-4222-8222-222222222222";
        let cid_sub_a1 = "cccc3333-3333-4333-8333-333333333333";
        let cid_sub_a2 = "dddd4444-4444-4444-8444-444444444444";

        let write_transcript = |cid: &str, lines: &[Value]| -> PathBuf {
            let dir = brain_dir.join(cid).join(".system_generated").join("logs");
            fs::create_dir_all(&dir).unwrap();
            let fp = dir.join("transcript.jsonl");
            let mut raw = String::new();
            for l in lines {
                raw.push_str(&l.to_string());
                raw.push('\n');
            }
            fs::write(&fp, raw).unwrap();
            fp
        };

        // 1. Write Session B first (older Main Conversation)
        let _fp_b = write_transcript(
            cid_b,
            &[
                json!({ "step_index": 1, "type": "USER_INPUT", "source": "USER_EXPLICIT", "status": "DONE", "content": "Hello B" }),
                json!({
                    "step_index": 2,
                    "type": "PLANNER_RESPONSE",
                    "status": "DONE",
                    "input_tokens": 500,
                    "cache_read_tokens": 1500,
                    "output_tokens": 80,
                    "content": "Short reply in B"
                }),
            ],
        );

        std::thread::sleep(Duration::from_millis(50));

        // 2. Write Session A second (newest Main Conversation: 134k context tokens, 2 parallel direct subagents + 2 JSON-encoded swarm workers + 1 work_state_write)
        let _fp_a = write_transcript(
            cid_a,
            &[
                json!({ "step_index": 1, "type": "USER_INPUT", "source": "USER_EXPLICIT", "status": "DONE", "content": "Run Session A" }),
                json!({
                    "step_index": 2,
                    "type": "PLANNER_RESPONSE",
                    "status": "DONE",
                    "input_tokens": 14000,
                    "cache_read_tokens": 120000,
                    "output_tokens": 950,
                    "tool_calls": [
                        { "name": "invoke_subagent", "args": { "Role": "\"Researcher A1\"", "TypeName": "\"research\"" } },
                        { "name": "invoke_subagent", "args": { "Role": "\"Browser A2\"", "TypeName": "\"browser\"" } },
                        { "name": "swarm", "args": { "action": "\"add\"", "name": "\"worker-a\"", "brief": "\"Slice A\"", "n": "2" } },
                        {
                            "name": "call_mcp_tool",
                            "args": {
                                "ServerName": "\"agy-mem_agy-mem\"",
                                "ToolName": "\"work_state_write\"",
                                "Arguments": "{\"list\":\"tien-do\",\"fields\":{\"task\":\"Task Session A\",\"status\":\"doing\"}}"
                            }
                        }
                    ]
                }),
                json!({
                    "step_index": 3,
                    "type": "GENERIC",
                    "status": "DONE",
                    "content": format!("Created At: 2026-11-23T18:00:00Z\nCreated the following subagent: {{\"conversationId\": \"{cid_sub_a1}\"}}\nCreated At: 2026-11-23T18:00:01Z\nCreated the following subagent: {{\"conversationId\": \"{cid_sub_a2}\"}}")
                }),
            ],
        );

        std::thread::sleep(Duration::from_millis(50));

        // Subagent of A has the newest mtime in brain/
        let _fp_sub = write_transcript(
            cid_sub_a1,
            &[
                json!({ "step_index": 0, "type": "SYSTEM_MESSAGE", "source": "SYSTEM", "status": "DONE", "content": "Subagent prompt" }),
                json!({
                    "step_index": 1,
                    "type": "PLANNER_RESPONSE",
                    "status": "DONE",
                    "input_tokens": 44000,
                    "output_tokens": 1200,
                    "tool_calls": [{ "name": "read_file", "args": { "toolSummary": "\"Inspecting repo\"" } }]
                }),
            ],
        );

        // Mock CDP to capture token
        let cdp_listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let cdp_port = cdp_listener.local_addr().unwrap().port();
        fs::write(&port_file, format!("{cdp_port}\n/devtools/browser/mock\n")).unwrap();
        let captured_token: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
        let cap_clone = captured_token.clone();

        let mock_cdp = tokio::spawn(async move {
            while let Ok((mut sock, _)) = cdp_listener.accept().await {
                let cap_tok = cap_clone.clone();
                tokio::spawn(async move {
                    let mut peek_buf = [0u8; 1024];
                    let Ok(n) = sock.peek(&mut peek_buf).await else { return };
                    if String::from_utf8_lossy(&peek_buf[..n])
                        .to_ascii_lowercase()
                        .contains("upgrade: websocket")
                    {
                        let Ok(mut ws) = tokio_tungstenite::accept_async(sock).await else { return };
                        while let Some(Ok(Message::Text(txt))) = ws.next().await {
                            let Ok(req) = serde_json::from_str::<Value>(&txt) else { continue };
                            let id = req["id"].as_u64().unwrap_or(0);
                            let method = req["method"].as_str().unwrap_or("");
                            let expr = req["params"]["expression"].as_str().unwrap_or("");
                            if method == "Page.addScriptToEvaluateOnNewDocument" {
                                let _ = ws.send(Message::Text(json!({ "id": id, "result": { "identifier": "d1" } }).to_string().into())).await;
                            } else if method == "Runtime.evaluate" && expr.contains("const __AGY_INJECT_BOOT__") {
                                if let Some(pos) = expr.find("\"token\":\"") {
                                    let rest = &expr[pos + 9..];
                                    if rest.len() >= 64 {
                                        *cap_tok.lock().unwrap() = Some(rest[..64].to_string());
                                    }
                                }
                                let _ = ws.send(Message::Text(json!({ "id": id, "result": { "result": { "type": "undefined" } } }).to_string().into())).await;
                            } else if method == "Runtime.evaluate" && expr.contains("payloadReady") {
                                let _ = ws.send(Message::Text(json!({
                                    "id": id,
                                    "result": { "result": { "type": "object", "value": { "matched": true, "hasBody": true, "payloadReady": false, "readyState": "complete", "origin": "http://127.0.0.1:4321" } } }
                                }).to_string().into())).await;
                            } else {
                                let _ = ws.send(Message::Text(json!({ "id": id, "result": {} }).to_string().into())).await;
                            }
                        }
                    } else {
                        let mut dummy = [0u8; 2048];
                        let _ = sock.read(&mut dummy).await;
                        let body = json!([{
                            "id": "p1",
                            "type": "page",
                            "title": "Antigravity",
                            "url": "http://127.0.0.1:4321/workbench",
                            "webSocketDebuggerUrl": format!("ws://127.0.0.1:{cdp_port}/devtools/page/p1")
                        }]).to_string();
                        let resp = format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
                        let _ = sock.write_all(resp.as_bytes()).await;
                    }
                });
            }
        });

        let mut daemon_child = Command::new(agy_bin())
            .arg("daemon")
            .current_dir(&root)
            .env("PLUGIN_ROOT", &root)
            .env("AGY_CONFIG_PATH", &cfg_path)
            .env("AGY_BACKUP_CONFIG_PATH", &bak_path)
            .env("AGY_PID_FILE", &pid_path)
            .env("AGY_DEVTOOLS_PORT_FILE", &port_file)
            .env("AGY_BRAIN_DIR", &brain_dir)
            .env("AGY_DAEMON_STDOUT", "1")
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();

        let stdout = daemon_child.stdout.take().unwrap();
        let (port_tx, port_rx) = tokio::sync::oneshot::channel::<u16>();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            let mut tx_opt = Some(port_tx);
            for line in reader.lines().map_while(Result::ok) {
                if let Some(idx) = line.find("http://127.0.0.1:") {
                    let after = &line[idx + "http://127.0.0.1:".len()..];
                    let p_str: String = after.chars().take_while(|c| c.is_ascii_digit()).collect();
                    if let Ok(p) = p_str.parse::<u16>() {
                        if let Some(tx) = tx_opt.take() {
                            let _ = tx.send(p);
                        }
                    }
                }
            }
        });

        let asset_port = tokio::time::timeout(Duration::from_secs(5), port_rx)
            .await
            .unwrap()
            .unwrap();

        let start = Instant::now();
        let token = loop {
            if let Some(tok) = captured_token.lock().unwrap().clone() {
                break tok;
            }
            assert!(start.elapsed() < Duration::from_secs(6));
            tokio::time::sleep(Duration::from_millis(60)).await;
        };

        let fetch_telemetry = |q_cid: &str| {
            let tok = token.clone();
            let q = q_cid.to_string();
            async move {
                let mut s = tokio::net::TcpStream::connect(("127.0.0.1", asset_port))
                    .await
                    .unwrap();
                let req = format!(
                    "GET /__telemetry?cid={q} HTTP/1.1\r\nHost: 127.0.0.1:{asset_port}\r\nX-Agy-Token: {tok}\r\nConnection: close\r\n\r\n"
                );
                s.write_all(req.as_bytes()).await.unwrap();
                let mut b = Vec::new();
                s.read_to_end(&mut b).await.unwrap();
                let txt = String::from_utf8_lossy(&b);
                let body = txt.split("\r\n\r\n").nth(1).unwrap_or("{}");
                serde_json::from_str::<Value>(body).unwrap()
            }
        };

        // 1. cid=latest MUST pick cid_a and skip subagent cid_sub_a1!
        let snap_latest = fetch_telemetry("latest").await;
        assert_eq!(snap_latest["ok"], true);
        assert_eq!(snap_latest["cid"], cid_a);
        assert_eq!(snap_latest["contextTokens"], 134000);
        assert_eq!(snap_latest["activeSubagents"].as_array().unwrap().len(), 4);
        assert_eq!(snap_latest["workStateItems"][0]["task"], "Task Session A");

        // 2. Session B MUST have zero leakage from Session A!
        let snap_b = fetch_telemetry(cid_b).await;
        assert_eq!(snap_b["ok"], true);
        assert_eq!(snap_b["cid"], cid_b);
        assert_eq!(snap_b["contextTokens"], 2000);
        assert_eq!(snap_b["outputTokens"], 80);
        assert_eq!(snap_b["activeSubagents"].as_array().unwrap().len(), 0);
        assert_eq!(snap_b["workStateItems"].as_array().unwrap().len(), 0);

        let _ = daemon_child.kill();
        let _ = daemon_child.wait();
        mock_cdp.abort();
        let _ = fs::remove_dir_all(&sandbox);
    });
}

#[test]
fn test_07_mcp_studio_prehydration_and_xss_safety() {
    let root = repo_root();
    let sandbox = make_sandbox("agy-rust-parity-studio-xss");
    let cfg_path = sandbox.join("theme_config.json");
    let bak_path = sandbox.join("backup.json");
    let pid_path = sandbox.join("daemon.pid");
    let port_path = sandbox.join("no_devtools_port");

    let xss_name = "</script><script>window.__RUST_XSS__=1;</script>";
    fs::write(
        &cfg_path,
        serde_json::to_string_pretty(&json!({
            "themeName": xss_name,
            "activeForgedTheme": { "name": xss_name, "primary": "#f472b6" },
            "masterPersona": "nezuko",
            "dimming": 33,
            "fxDensity": 80,
            "uiLang": "vi"
        }))
        .unwrap(),
    )
    .unwrap();

    let mut child = Command::new(agy_bin())
        .arg("mcp-server")
        .current_dir(&root)
        .env("PLUGIN_ROOT", &root)
        .env("AGY_CONFIG_PATH", &cfg_path)
        .env("AGY_BACKUP_CONFIG_PATH", &bak_path)
        .env("AGY_PID_FILE", &pid_path)
        .env("AGY_DEVTOOLS_PORT_FILE", &port_path)
        .env("AGY_SKIP_DAEMON_SPAWN", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();

    {
        let mut stdin = child.stdin.take().unwrap();
        for req in [
            json!({ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": { "protocolVersion": "2026-01-26" } }),
            json!({ "jsonrpc": "2.0", "id": 2, "method": "resources/read", "params": { "uri": "ui://agy-theme/studio.html" } }),
        ] {
            writeln!(stdin, "{}", serde_json::to_string(&req).unwrap()).unwrap();
        }
    }

    let out = child.wait_with_output().unwrap();
    assert!(out.status.success());
    let lines: Vec<Value> = String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| serde_json::from_str(l).unwrap())
        .collect();
    assert_eq!(lines.len(), 2);
    assert_eq!(lines[0]["result"]["protocolVersion"], "2026-01-26");

    let html = lines[1]["result"]["contents"][0]["text"].as_str().unwrap();
    assert!(!html.contains("__AGY_STUDIO_INITIAL_STATE__"));
    assert!(!html.contains("</script><script>"));
    assert!(html.contains("\\u003c/script\\u003e"));
    assert!(html.contains("dimming-range"));
    assert!(html.contains("ws-bind-btn"));

    let _ = fs::remove_dir_all(&sandbox);
}
