# Whole-App Migration Map (`antigravity-shinobu-theme`)

Goal: Standalone pure-Rust Host/Backend implementation (`agy-theme`) replacing all Node.js CLI scripts, lifecycle hooks, stdio MCP server, and HTTP/SSE/CDP Theme Daemon while keeping `engine/*.js` as the browser DOM payload (`ADR-001`..`ADR-004`).

## ADR Index
- [ADR-001](DECISIONS.md#adr-001-hostbackend-pure-rust-scope--keep-browser-dom-engine-in-js): Host/Backend Pure Rust Scope & Keep Browser DOM Engine in JS
- [ADR-002](DECISIONS.md#adr-002-windows-toolchain-stable-x86_64-pc-windows-gnullvm--llvm-mingw): Windows Toolchain (`x86_64-pc-windows-gnullvm`)
- [ADR-003](DECISIONS.md#adr-003-strict-behavioral--byte-for-byte-equivalence-bar): Strict Behavioral & Byte-for-Byte Equivalence Bar
- [ADR-004](DECISIONS.md#adr-004-non-destructive-side-by-side-layout--static-r2-invariants): Non-Destructive Side-by-Side Layout & Static R2 Invariants

## Units & Migration State

| Wave | Unit | Original Files | Target Rust Module | State |
| ---: | --- | --- | --- | --- |
| 0 | `engine/` | `engine/*.js` (13 files) | Kept in JS (bundled by `build-payload`) | `keep (ADR-001)` |
| 0 | `persona_sync` | `scripts/persona_hint_sync.js` | `crates/agy-core/src/persona_sync.rs` | `done (clippy 0 warnings, parity_suite ok)` |
| 0 | `build_payload` | `scripts/build_payload.js` | `crates/agy-core/src/build_payload.rs` | `done (100% SHA-256 byte match hybrid & inline-all)` |
| 0 | `hooks` | `scripts/session_start_hook.js`, `scripts/pre_invocation_hook.js` | `crates/agy-core/src/hooks/` | `done (streaming depth-1 CHECKPOINT & 2.3MB EPIPE guard ok)` |
| 0 | `cli_ops` | `scripts/verify_cdp.js`, `scripts/uninstall.js`, `scripts/export_clean_edition.js` | `crates/agy-core/src/cli_ops/` | `done (CDP verify, uninstall --purge, Pure-MIT clean export ok)` |
| 1 | `mcp_server` | `daemon/mcp_theme_server.js` | `crates/agy-theme/src/mcp.rs` | `done (dual-framing stdio + 7 MCP tools + studio UI ok)` |
| 1 | `theme_daemon` | `daemon/theme_daemon.js` | `crates/agy-theme/src/daemon/` | `done (HTTP/SSE + anti-DNS-rebinding + CDP actor + tailer ok)` |

## Out of Scope
- Porting browser-internal DOM/WebAudio/Canvas scripts (`engine/*.js`) to WASM (settled in `ADR-001`).
