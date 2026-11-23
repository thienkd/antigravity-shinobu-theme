# Architecture Decision Records (rust-anything Whole-App Port)

## ADR-001: Host/Backend Pure Rust Scope & Keep Browser DOM Engine in JS
Status: accepted (2026-11-23)
Context: `antigravity-shinobu-theme` consists of two distinct execution tiers:
1. Host/Backend tier (`scripts/*.js`, `daemon/*.js` — 8,499 lines): executes on the host OS as CLI utilities, lifecycle hooks (`SessionStart`, `PreInvocation`), MCP stdio controller, and the background HTTP/SSE/CDP daemon.
2. Browser Renderer tier (`engine/*.js` — 25,402 lines): bundled into `dist/theme_payload.js` and injected via Chrome DevTools Protocol (`Runtime.evaluate`) directly into the Antigravity Chromium DOM to manipulate CSS, SVG, Canvas/WebGL, and WebAudio.
Decision: Rewrite the entire Host/Backend tier (`scripts/` + `daemon/` + MCP + hooks) into pure standalone Rust inside `rust/`. Classify `engine/*.js` as a `keep` unit (browser DOM payload compiled byte-for-byte by the Rust `build-payload` command).
Consequences: Eliminates Node.js runtime overhead on host processes (<5ms hook startup, ~4MB daemon memory footprint) while preserving 100% live visual/audio behavior inside the IDE WebView.

## ADR-002: Windows Toolchain (`stable-x86_64-pc-windows-gnullvm` + `llvm-mingw`)
Status: accepted (2026-11-23)
Context: The target Windows host did not have Visual Studio C++ Build Tools installed, and the user selected the lightweight ~200MB non-Admin toolchain option.
Decision: Build and verify standalone native `.exe` binaries using `rustc 1.100+` (`stable-x86_64-pc-windows-gnullvm`) paired with UCRT `llvm-mingw`, verified end-to-end via `rust-anything app record` / `app replay` and a dedicated Rust parity test harness.
Consequences: Fast local compilation with zero Admin/UAC installer requirements and self-contained UCRT Windows executables.

## ADR-003: Strict Behavioral & Byte-for-Byte Equivalence Bar
Status: accepted (2026-11-23)
Context: Existing test suites (`tests/run_all.js`, 11 suites) enforce strict contracts: SHA-256 byte-for-byte parity on `dist/theme_payload.js`, dual framing (`Content-Length` + newline JSON) on MCP stdio, anti-DNS-rebinding/Origin/Bearer guards on HTTP/SSE, prototype-pollution stripping, atomic writes, and Red-Team persona transcript scanning.
Decision: Require 100% behavioral parity across all CLI flags, environment variables, exit codes, JSON schemas, SVG/PII security guards, and byte-exact output on `build-payload`.
Consequences: Every Rust subcommand/binary must pass recorded `rust-anything` cases (`rust/app-cases/`), `cargo clippy --all-targets -- -D warnings`, `cargo test`, and parity integration tests before cutover.

## ADR-004: Non-Destructive Side-by-Side Layout & Static R2 Invariants
Status: accepted (2026-11-23)
Context: `tests/test_static_r2.js` asserts exact preservation of the 22 original `.js` files, zero npm dependencies in `package.json`, LF line endings, and zero local OS user paths or PII across all tracked files.
Decision: Author the entire Rust workspace under `rust/` as a unified Cargo workspace (`agy-theme-core` library + `agy-theme` multi-command binary + standalone entrypoint binaries), keeping all 22 original `.js` files intact as reference until explicit cutover. Never include machine-local paths or PII in any source, test, or markdown file.
Consequences: Both the original 11/11 test suite and the new Rust verification suite remain 100% green simultaneously.
