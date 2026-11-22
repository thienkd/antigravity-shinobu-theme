# Security Policy & Architecture (`SECURITY.md`)

## Supported Versions

| Version | Supported | Runtime Requirement |
| :--- | :---: | :--- |
| `2.x` (`main`) | ✅ Yes | Node.js `>= 22.0.0` (Zero NPM Dependencies) |
| `< 2.0` | ❌ No | Upgrade to latest `main` |

---

## Security Architecture (Defense-in-Depth)

Because **Antigravity Custom Theme Engine** integrates with the desktop IDE via the Chrome DevTools Protocol (CDP) and runs a local companion daemon, it enforces commercial-grade security controls across five layers:

### 1. Zero External Network & Zero Supply-Chain Surface
- **Zero `node_modules`**: Both the daemon and build toolchain use **100% built-in Node.js modules** (`fs`, `http`, `crypto`, `path`, `os`, `child_process`), eliminating third-party NPM supply-chain attacks.
- **Strictly Offline**: Neither the daemon nor the injected renderer payload ever makes outbound HTTP/WebSocket connections to the public internet.

### 2. Loopback HTTP Server Hardening (`daemon/theme_daemon.js`)
- **Loopback & Host Pinning (Anti-DNS Rebinding)**: Bound exclusively to `127.0.0.1` on an ephemeral OS port. Every incoming request must match `Host: 127.0.0.1:<port>` and originate from a loopback socket (`127.0.0.1` / `::ffff:127.0.0.1`); mismatched hosts receive an immediate `403 Forbidden`.
- **256-Bit Ephemeral Closure Authentication**: At startup, the daemon generates a cryptographically random `crypto.randomBytes(32)` token in memory. The token is injected into an isolated JavaScript closure (never left exposed on `window`) and is required via the `X-Agy-Token` header for `/__telemetry` and `/__events` streaming, as well as inside `agySaveThemeConfig` payloads.
- **No Wildcard CORS on Telemetry**: API endpoints never emit `Access-Control-Allow-Origin: *`. Cross-origin requests from untrusted browser tabs fail preflight (`403 Forbidden`).
- **Symlink-Safe Static Assets & Sandboxed SVGs**: Only `themes/assets/` is served, verified via `fs.realpath` containment with a strict image extension allowlist, `X-Content-Type-Options: nosniff`, and `Content-Security-Policy: default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox`.

### 3. Strict CDP Target Verification
- Before injecting theme scripts or registering `Runtime.addBinding`, the daemon validates the target URL protocol/origin and verifies via DOM probe that the page is a genuine Antigravity Workbench/Launchpad frame — never an untrusted web app opened inside the Split Browser (`http://127.0.0.1:3000`, etc.).

### 4. Renderer XSS, CSS & Indirect-Prompt-Injection Prevention
- **Untrusted Telemetry Isolation**: Conversation titles, user echoes, and subagent `Role` / `toolSummary` fields parsed from `transcript.jsonl` are rendered strictly via `.textContent` (never `.innerHTML`), neutralizing indirect prompt injection payloads.
- **Theme & `.agytheme` Sanitizer**: Imported JSON/`.agytheme` packages block prototype-pollution keys (`__proto__`, `constructor`, `prototype`), enforce strict CSS URL/value allowlists, and strip executable elements/handlers (`<script>`, `<foreignObject>`, `on*=`, `javascript:`) from custom SVGs both at build time and import time.

### 5. Privacy, Log Redaction & Local Trust Boundary
- **Automatic PII Redaction**: `daemon.log` automatically masks the OS home directory (`~`) and redacts conversation/project UUIDs, written with `0600` user-only permissions on POSIX systems.
- **1-Click Privacy Shield (`Cinema Mode`)**: Built-in instant masking of workspace names, file paths, and chat history before screen recording or streaming.
- **Local User Trust Boundary Disclosure**: On Windows/macOS/Linux, launching Antigravity with `--remote-debugging-port=0` binds CDP to `127.0.0.1` without `--remote-allow-origins=*` (blocking browser-based WebSocket attacks) and writes `DevToolsActivePort` under the current OS user profile. As standard for Chromium local debugging, processes running under the *same OS user account* share this trust boundary. To completely disable CDP and remove all daemon artifacts, run `node scripts/uninstall.js --purge` and remove `--remote-debugging-port=0` from your application shortcut.

---

## Reporting a Vulnerability (Báo cáo Lỗ hổng Bảo mật)

Please **do not** report security vulnerabilities through public GitHub issues.
Instead, use **[GitHub Private Vulnerability Reporting](https://github.com/thienkd/antigravity-shinobu-theme/security/advisories/new)** on this repository. We acknowledge reports within **48 hours** and aim to ship verified fixes within **7 days**.
