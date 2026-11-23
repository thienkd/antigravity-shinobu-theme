# `agy-theme` — Pure Rust Host/Backend (`rust-anything` Port)

Standalone single-binary Rust rewrite (`agy-theme` / `agy-theme.exe`) of the entire Host/Backend tier of `antigravity-shinobu-theme` v3.0.0 (`scripts/*` + `daemon/*`).

## Subcommands

| Subcommand | Replaces | Description |
| --- | --- | --- |
| `agy-theme build-payload` | `scripts/build_payload.js` | Byte-for-byte SHA-256 identical compiler for `dist/theme_payload.js` (`hybrid` & `--inline-all`) with SVG XSS guard |
| `agy-theme session-start-hook` | `scripts/session_start_hook.js` | `<5ms` native `SessionStart` hook: workspace profile sync, stale state GC & daemon wake |
| `agy-theme pre-invocation-hook` | `scripts/pre_invocation_hook.js` | `<3ms` native `PreInvocation` hook: streaming depth-1 `CHECKPOINT` recovery, subagent filter & closed-enum persona sync |
| `agy-theme verify-cdp` | `scripts/verify_cdp.js` | Non-destructive CDP live verifier across all 11 DOM/R3 invariants |
| `agy-theme uninstall [--purge]` | `scripts/uninstall.js` | Safe verified daemon stop, shortcut unpatching & live CDP DOM cleanup |
| `agy-theme export-clean-edition` | `scripts/export_clean_edition.js` | Pure-MIT procedural OKLCH exporter |
| `agy-theme mcp-server` | `daemon/mcp_theme_server.js` | Dual-framing (`Content-Length` + Newline JSON) stdio MCP controller with 7 tools & `ui://agy-theme/studio.html` |
| `agy-theme daemon` | `daemon/theme_daemon.js` | Multi-threaded `tokio` HTTP/SSE server, anti-DNS-rebinding/Origin/Token guards, CDP WebSocket actor & `O(delta)` transcript tailer |

## Build & Verify

```powershell
cd rust
cargo clippy --all-targets -- -D warnings
cargo test
cargo build --release
```
