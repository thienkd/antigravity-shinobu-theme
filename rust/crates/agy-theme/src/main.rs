pub mod daemon;
pub mod mcp;

use agy_core::build_payload::run_build_payload_cli;
use agy_core::cli_ops::clean_export::run_export_clean_edition_cli;
use agy_core::cli_ops::uninstall::run_uninstall_async;
use agy_core::cli_ops::verify_cdp::run_verify_cdp_async;
use agy_core::hooks::pre_invocation::run_pre_invocation_cli;
use agy_core::hooks::session_start::run_session_start_cli;
use agy_core::persona_sync::resolve_abs_path;
use std::path::{Path, PathBuf};

fn detect_repo_root() -> PathBuf {
    if let Ok(pr) = std::env::var("PLUGIN_ROOT") {
        if !pr.trim().is_empty() {
            return resolve_abs_path(Path::new(&pr));
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        if cwd.join("themes").is_dir() && cwd.join("engine").join("core.js").is_file() {
            return resolve_abs_path(&cwd);
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        let mut cur = exe.parent();
        for _ in 0..5 {
            let Some(dir) = cur else {
                break;
            };
            if dir.join("themes").is_dir() && dir.join("engine").join("core.js").is_file() {
                return resolve_abs_path(dir);
            }
            cur = dir.parent();
        }
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn print_main_help() {
    println!(
        concat!(
            "agy-theme v3.0.0 — Pure Rust Host/Backend for Antigravity Custom Theme\n\n",
            "Usage: agy-theme <COMMAND> [OPTIONS]\n\n",
            "Commands:\n",
            "  build-payload          Compile themes + engine into dist/theme_payload.js (byte-exact)\n",
            "  session-start-hook     Run Antigravity SessionStart lifecycle hook\n",
            "  pre-invocation-hook    Run Antigravity PreInvocation persona sync hook\n",
            "  verify-cdp             Verify live Antigravity CDP targets & R3 DOM invariants\n",
            "  uninstall              Cleanly stop daemon, remove runtime files & clear open windows\n",
            "  export-clean-edition   Export pure-MIT procedural OKLCH Clean Edition\n",
            "  mcp-server             Start dual-framing JSON-RPC 2.0 MCP stdio controller\n",
            "  daemon                 Start background HTTP/SSE asset server, CDP injector & tailer\n"
        )
    );
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let repo_root = detect_repo_root();

    let Some(subcmd) = args.first().map(|s| s.as_str()) else {
        print_main_help();
        return;
    };
    let rest = &args[1..];

    let exit_code = match subcmd {
        "build-payload" | "build_payload" => run_build_payload_cli(rest, &repo_root),
        "session-start-hook" | "session_start_hook" => run_session_start_cli(&repo_root),
        "pre-invocation-hook" | "pre_invocation_hook" => run_pre_invocation_cli(&repo_root),
        "verify-cdp" | "verify_cdp" => {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("tokio runtime");
            rt.block_on(run_verify_cdp_async(&repo_root))
        }
        "uninstall" => {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("tokio runtime");
            rt.block_on(run_uninstall_async(rest, &repo_root))
        }
        "export-clean-edition" | "export_clean_edition" => {
            run_export_clean_edition_cli(rest, &repo_root)
        }
        "mcp-server" | "mcp_server" | "mcp" => {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("tokio runtime");
            rt.block_on(mcp::run_mcp_server_async(&repo_root))
        }
        "daemon" | "theme-daemon" | "theme_daemon" => {
            let rt = tokio::runtime::Builder::new_multi_thread()
                .worker_threads(2)
                .enable_all()
                .build()
                .expect("tokio runtime");
            rt.block_on(daemon::run_daemon_async(&repo_root))
        }
        "-h" | "--help" | "help" => {
            print_main_help();
            0
        }
        "-V" | "--version" | "version" => {
            println!("agy-theme 3.0.0");
            0
        }
        other => {
            eprintln!("[agy-theme] Unknown command: '{other}'. Run with --help for usage.");
            2
        }
    };

    std::process::exit(exit_code);
}
